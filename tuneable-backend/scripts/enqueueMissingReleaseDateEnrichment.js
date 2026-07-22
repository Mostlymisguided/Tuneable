/**
 * Enqueue + process MusicBrainz enrichment for music media missing release dates.
 * High-confidence matches auto-apply releaseDate/year (+ MBID/ISRC); medium/low go to admin review.
 *
 * Usage:
 *   node scripts/enqueueMissingReleaseDateEnrichment.js --dry-run
 *   node scripts/enqueueMissingReleaseDateEnrichment.js --execute --limit 50
 *   node scripts/enqueueMissingReleaseDateEnrichment.js --execute
 *   node scripts/enqueueMissingReleaseDateEnrichment.js --execute --production
 *   node scripts/enqueueMissingReleaseDateEnrichment.js --execute --process-only
 */

const path = require('path');
const args = process.argv.slice(2);
const useProductionEnv = args.includes('--production');

require('dotenv').config({
  path: useProductionEnv
    ? path.join(__dirname, '../.env.production')
    : path.join(__dirname, '../.env'),
});

const mongoose = require('mongoose');
const Media = require('../models/Media');
const MetadataEnrichment = require('../models/MetadataEnrichment');
const {
  enqueueEnrichment,
  processQueue,
} = require('../services/metadataEnrichmentService');

const DRY_RUN = !args.includes('--execute');
const PROCESS_ONLY = args.includes('--process-only');
const LIMIT = (() => {
  const idx = args.indexOf('--limit');
  return idx >= 0 ? parseInt(args[idx + 1], 10) : null;
})();
const BATCH = (() => {
  const idx = args.indexOf('--batch');
  return idx >= 0 ? parseInt(args[idx + 1], 10) : 40;
})();

function getMongoUri() {
  return process.env.MONGO_URI || process.env.MONGODB_URI;
}

function missingReleaseQuery() {
  return {
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
        $or: [{ releaseDate: null }, { releaseDate: { $exists: false } }],
      },
      {
        $or: [{ releaseYear: null }, { releaseYear: { $exists: false } }],
      },
      // Skip podcasts
      {
        $nor: [
          { contentForm: { $in: ['podcast-series', 'podcast-episode', 'episode', 'series'] } },
        ],
      },
    ],
  };
}

async function printCoverage() {
  const base = missingReleaseQuery();
  const missing = await Media.countDocuments(base);
  const withDate = await Media.countDocuments({
    $and: [
      base.$and[0],
      base.$and[1],
      base.$and[2],
      { releaseDate: { $ne: null } },
    ],
  });
  const queue = await MetadataEnrichment.aggregate([
    { $group: { _id: '$status', n: { $sum: 1 } } },
    { $sort: { _id: 1 } },
  ]);
  console.log(`\n📊 Missing releaseDate+year: ${missing}`);
  console.log(`   With releaseDate (music filter approx): ${withDate}`);
  console.log('   Enrichment queue:', Object.fromEntries(queue.map((r) => [r._id, r.n])));
}

async function findCandidates(limit) {
  const openIds = await MetadataEnrichment.distinct('mediaId', {
    status: { $in: ['pending', 'processing', 'needs_review'] },
  });

  return Media.find({
    ...missingReleaseQuery(),
    ...(openIds.length ? { _id: { $nin: openIds } } : {}),
  })
    .select('_id title uuid externalIds')
    .sort({ updatedAt: -1 })
    .limit(limit)
    .lean();
}

async function drainPendingQueue(maxItems) {
  let remaining = maxItems;
  const totals = {
    processed: 0,
    autoApplied: 0,
    needsReview: 0,
    skipped: 0,
    failed: 0,
  };

  while (remaining > 0) {
    const batch = Math.min(BATCH, remaining, 50);
    const pendingCount = await MetadataEnrichment.countDocuments({
      status: { $in: ['pending', 'failed'] },
    });
    if (pendingCount === 0) break;

    console.log(`\n⚙️  Processing up to ${batch} (pending/failed: ${pendingCount})…`);
    const result = await processQueue({ limit: batch });
    if (result.skipped) {
      console.log('   Queue busy — waiting…');
      await new Promise((r) => setTimeout(r, 2000));
      continue;
    }

    totals.processed += result.processed || 0;
    totals.autoApplied += result.autoApplied || 0;
    totals.needsReview += result.needsReview || 0;
    totals.skipped += result.skipped || 0;
    totals.failed += result.failed || 0;
    remaining -= result.processed || 0;

    console.log(
      `   batch: processed=${result.processed} auto=${result.autoApplied} review=${result.needsReview} skipped=${result.skipped} failed=${result.failed}`
    );
  }

  return totals;
}

async function main() {
  const uri = getMongoUri();
  if (!uri) {
    console.error('Missing MONGO_URI / MONGODB_URI');
    process.exit(1);
  }

  console.log(DRY_RUN ? '🔍 DRY RUN (pass --execute to write)' : '✍️  EXECUTE mode');
  if (useProductionEnv) console.log('🚨 Using .env.production');

  await mongoose.connect(uri);
  console.log('Connected to MongoDB');
  await printCoverage();

  if (PROCESS_ONLY) {
    if (DRY_RUN) {
      const n = await MetadataEnrichment.countDocuments({ status: { $in: ['pending', 'failed'] } });
      console.log(`\nWould process ${n} pending/failed items`);
      await mongoose.disconnect();
      return;
    }
    const totals = await drainPendingQueue(LIMIT || 10_000);
    console.log('\n✅ Process-only done', totals);
    await printCoverage();
    await mongoose.disconnect();
    return;
  }

  const target = LIMIT || 10_000;
  const candidates = await findCandidates(Math.min(target, 2000));
  console.log(`\n🎯 Candidates to enqueue: ${candidates.length}`);

  if (DRY_RUN) {
    candidates.slice(0, 15).forEach((m) => {
      console.log(`   - ${m.title} (${m._id})`);
    });
    if (candidates.length > 15) console.log(`   … +${candidates.length - 15} more`);
    await mongoose.disconnect();
    return;
  }

  let enqueued = 0;
  for (let i = 0; i < candidates.length; i += BATCH) {
    const chunk = candidates.slice(i, i + BATCH);
    for (const media of chunk) {
      const externalIds = media.externalIds instanceof Map
        ? Object.fromEntries(media.externalIds)
        : (media.externalIds || {});
      const hasMb = Boolean(externalIds.musicbrainz);
      const item = await enqueueEnrichment(media._id, {
        importSource: 'backfill',
        force: hasMb, // re-run linked tracks that still lack a release date
        enrichTagsOnly: hasMb,
      });
      if (item) enqueued += 1;
    }
    console.log(`   Enqueued chunk ${i + 1}–${i + chunk.length} (running total ~${enqueued})`);

    // Process this chunk before enqueueing more (keeps queue bounded + respects MB rate limit)
    const processCap = Math.min(chunk.length + 5, 50);
    const result = await processQueue({ limit: processCap });
    console.log(
      `   processed=${result.processed} auto=${result.autoApplied} review=${result.needsReview} skipped=${result.skipped} failed=${result.failed}`
    );
  }

  // Drain anything left
  await drainPendingQueue(200);

  console.log(`\n✅ Enqueued ~${enqueued} items`);
  await printCoverage();
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  try { await mongoose.disconnect(); } catch (_) { /* ignore */ }
  process.exit(1);
});
