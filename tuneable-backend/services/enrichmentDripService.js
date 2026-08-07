/**
 * Ongoing drip for media tags (MusicBrainz enrichment queue) + primaryLocation backfill.
 *
 * Designed for small, rate-limited batches so it can run on a schedule without
 * exhausting MusicBrainz / Mapbox quotas. Reuses existing services; does not
 * invent a parallel enrichment pipeline.
 */

const Media = require('../models/Media');
const metadataEnrichmentService = require('./metadataEnrichmentService');
const {
  runMediaLocationBackfill,
  getLocationCoverageStats,
} = require('./mediaLocationBackfillService');

let dripRunning = false;

function clamp(n, min, max) {
  const num = Number(n);
  if (!Number.isFinite(num)) return min;
  return Math.min(Math.max(num, min), max);
}

function normalizeDripOpts(opts = {}) {
  return {
    dryRun: Boolean(opts.dryRun),
    skipTags: Boolean(opts.skipTags),
    skipLocations: Boolean(opts.skipLocations),
    tagLimit: clamp(opts.tagLimit ?? 25, 1, 100),
    locationLimit: clamp(opts.locationLimit ?? 25, 1, 100),
    tagMode: opts.tagMode === 'supplement' ? 'supplement' : 'untagged',
    tagLinkage: ['linked', 'unlinked', 'any'].includes(opts.tagLinkage)
      ? opts.tagLinkage
      : 'linked',
    includeUnlinkedFallback: opts.includeUnlinkedFallback !== false,
    unlinkedTagLimit: clamp(opts.unlinkedTagLimit ?? 10, 0, 50),
    processTagsImmediately: opts.processTagsImmediately !== false,
    nameSearch: Boolean(opts.nameSearch),
    upgradeInferred: Boolean(opts.upgradeInferred),
    delayMs: opts.delayMs != null ? Number(opts.delayMs) : 150,
    mbDelayMs: opts.mbDelayMs != null ? Number(opts.mbDelayMs) : 1200,
    quiet: Boolean(opts.quiet),
    includeCoverage: opts.includeCoverage !== false,
  };
}

async function getTagCoverageStats() {
  const musicFilter = {
    $and: [
      {
        $or: [
          { status: { $exists: false } },
          { status: { $ne: 'deleted' } },
        ],
      },
      {
        $or: [
          { deletedAt: null },
          { deletedAt: { $exists: false } },
        ],
      },
      {
        $or: [
          { contentType: 'music' },
          { contentType: { $in: ['music'] } },
          { contentForm: 'tune' },
          { contentForm: { $in: ['tune'] } },
          { contentType: { $exists: false } },
        ],
      },
      {
        $nor: [
          { contentForm: { $in: ['podcast-series', 'podcast-episode', 'episode', 'series'] } },
        ],
      },
    ],
  };

  const [total, withTags, untagged, linked, linkedUntagged] = await Promise.all([
    Media.countDocuments(musicFilter),
    Media.countDocuments({
      ...musicFilter,
      tags: { $exists: true, $type: 'array', $ne: [] },
    }),
    Media.countDocuments({
      ...musicFilter,
      $or: [
        { tags: { $exists: false } },
        { tags: { $size: 0 } },
        { tags: null },
      ],
    }),
    Media.countDocuments({
      ...musicFilter,
      'externalIds.musicbrainz': { $exists: true, $nin: [null, ''] },
    }),
    Media.countDocuments({
      ...musicFilter,
      'externalIds.musicbrainz': { $exists: true, $nin: [null, ''] },
      $or: [
        { tags: { $exists: false } },
        { tags: { $size: 0 } },
        { tags: null },
      ],
    }),
  ]);

  return { total, withTags, untagged, linked, linkedUntagged };
}

async function dripTags(opts) {
  if (opts.dryRun) {
    const coverage = await getTagCoverageStats();
    return {
      dryRun: true,
      enqueued: 0,
      skippedOpen: 0,
      scanned: 0,
      mode: opts.tagMode,
      linkage: opts.tagLinkage,
      coverage,
      note: 'dry-run: no enrichment rows enqueued',
    };
  }

  // Always enqueue without fire-and-forget kick so CLI can disconnect safely
  // and cron ticks finish their own queue work before unlocking.
  const primary = await metadataEnrichmentService.enqueueUntaggedBackfill({
    limit: opts.tagLimit,
    mode: opts.tagMode,
    linkage: opts.tagLinkage,
    processImmediately: false,
  });

  let fallback = null;
  if (
    opts.includeUnlinkedFallback &&
    opts.tagLinkage === 'linked' &&
    opts.tagMode === 'untagged' &&
    primary.enqueued === 0 &&
    opts.unlinkedTagLimit > 0
  ) {
    fallback = await metadataEnrichmentService.enqueueUntaggedBackfill({
      limit: opts.unlinkedTagLimit,
      mode: 'untagged',
      linkage: 'unlinked',
      processImmediately: false,
    });
  }

  const enqueued = primary.enqueued + (fallback?.enqueued || 0);
  let processed = null;
  if (opts.processTagsImmediately && enqueued > 0) {
    processed = await metadataEnrichmentService.processQueue({
      limit: Math.min(Math.max(enqueued, 1), 50),
    });
  } else if (opts.processTagsImmediately && enqueued === 0) {
    // Drain any leftover pending from a previous interrupted run
    processed = await metadataEnrichmentService.processQueue({
      limit: Math.min(opts.tagLimit, 50),
    });
  }

  return {
    dryRun: false,
    primary,
    fallback,
    enqueued,
    processed,
  };
}

async function dripLocations(opts) {
  return runMediaLocationBackfill({
    dryRun: opts.dryRun,
    limit: opts.locationLimit,
    nameSearch: opts.nameSearch,
    upgradeInferred: opts.upgradeInferred,
    delayMs: opts.delayMs,
    mbDelayMs: opts.mbDelayMs,
    quiet: opts.quiet,
    includeStats: false,
  });
}

/**
 * Run one drip tick for tags and/or locations.
 * Concurrent calls are skipped (in-process lock).
 *
 * @param {object} [rawOpts]
 * @returns {Promise<object>}
 */
async function runEnrichmentDrip(rawOpts = {}) {
  if (dripRunning) {
    return { skipped: true, reason: 'already_running' };
  }

  dripRunning = true;
  const startedAt = new Date();
  const opts = normalizeDripOpts(rawOpts);
  const log = opts.quiet ? () => {} : (...args) => console.log(...args);

  try {
    log(
      `\n💧 enrichment drip (${opts.dryRun ? 'DRY RUN' : 'EXECUTE'}) ` +
        `@ ${startedAt.toISOString()}`
    );
    log(
      `   tags: ${opts.skipTags ? 'off' : `on (limit ${opts.tagLimit}, ${opts.tagMode}/${opts.tagLinkage})`}`
    );
    log(
      `   locations: ${opts.skipLocations ? 'off' : `on (limit ${opts.locationLimit})`}`
    );

    const result = {
      startedAt: startedAt.toISOString(),
      dryRun: opts.dryRun,
      tags: null,
      locations: null,
      coverage: null,
    };

    if (opts.includeCoverage) {
      const [tags, locations] = await Promise.all([
        getTagCoverageStats(),
        getLocationCoverageStats(),
      ]);
      result.coverage = { tags, locations };
      log('\n📊 Coverage snapshot');
      log(
        `   tags: ${tags.withTags}/${tags.total} tagged` +
          ` (${tags.untagged} untagged, ${tags.linkedUntagged} linked+untagged)`
      );
      log(
        `   locations: ${locations.withLoc}/${locations.total} with location` +
          ` (${locations.missing} missing)`
      );
    }

    if (!opts.skipTags) {
      log('\n🏷  Tag drip…');
      result.tags = await dripTags(opts);
      if (result.tags.dryRun) {
        log(`   ${result.tags.note}`);
      } else {
        log(`   enqueued: ${result.tags.enqueued}`);
        if (result.tags.fallback) {
          log(
            `   unlinked fallback enqueued: ${result.tags.fallback.enqueued}`
          );
        }
        if (result.tags.processed) {
          const p = result.tags.processed;
          if (p.skipped) {
            log(`   process: skipped (${p.reason || 'busy'})`);
          } else {
            log(
              `   process: ${p.processed} done` +
                ` (auto=${p.autoApplied}, review=${p.needsReview},` +
                ` skip=${p.skipped}, fail=${p.failed})`
            );
          }
        }
      }
    }

    if (!opts.skipLocations) {
      log('\n📍 Location drip…');
      result.locations = await dripLocations(opts);
    }

    result.finishedAt = new Date().toISOString();
    result.durationMs = Date.now() - startedAt.getTime();
    log(`\n✅ drip complete in ${result.durationMs}ms`);
    return result;
  } finally {
    dripRunning = false;
  }
}

function isDripRunning() {
  return dripRunning;
}

/**
 * Start a node-cron schedule for the enrichment drip.
 * Env defaults:
 *   ENRICHMENT_DRIP_CRON — every 15 minutes (six-field cron with seconds)
 *   ENRICHMENT_DRIP_TAG_LIMIT=25
 *   ENRICHMENT_DRIP_LOCATION_LIMIT=25
 *
 * @param {object} [overrides]
 * @returns {{ task: import('node-cron').ScheduledTask, stop: () => void } | null}
 */
function startEnrichmentDripCron(overrides = {}) {
  const enabled =
    overrides.enabled ??
    String(process.env.ENRICHMENT_DRIP_ENABLED || '').toLowerCase() === 'true';

  if (!enabled) {
    return null;
  }

  const cron = require('node-cron');
  const expression =
    overrides.cron ||
    process.env.ENRICHMENT_DRIP_CRON ||
    '0 */15 * * * *';

  if (!cron.validate(expression)) {
    console.error(`Invalid ENRICHMENT_DRIP_CRON expression: ${expression}`);
    return null;
  }

  const dripOpts = {
    dryRun: false,
    quiet: false,
    tagLimit: Number(process.env.ENRICHMENT_DRIP_TAG_LIMIT) || 25,
    locationLimit: Number(process.env.ENRICHMENT_DRIP_LOCATION_LIMIT) || 25,
    unlinkedTagLimit: Number(process.env.ENRICHMENT_DRIP_UNLINKED_TAG_LIMIT) || 10,
    skipTags: String(process.env.ENRICHMENT_DRIP_SKIP_TAGS || '').toLowerCase() === 'true',
    skipLocations:
      String(process.env.ENRICHMENT_DRIP_SKIP_LOCATIONS || '').toLowerCase() === 'true',
    nameSearch:
      String(process.env.ENRICHMENT_DRIP_NAME_SEARCH || '').toLowerCase() === 'true',
    ...overrides.dripOpts,
  };

  console.log(`💧 Enrichment drip cron enabled (${expression})`);

  const task = cron.schedule(expression, () => {
    runEnrichmentDrip(dripOpts).catch((err) => {
      console.error('Enrichment drip cron failed:', err);
    });
  });

  return {
    task,
    stop: () => task.stop(),
  };
}

module.exports = {
  runEnrichmentDrip,
  startEnrichmentDripCron,
  isDripRunning,
  getTagCoverageStats,
};
