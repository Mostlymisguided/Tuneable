/**
 * Backfill Media.primaryLocation from linked artist homes and MusicBrainz artist areas.
 *
 * Cascade (highest confidence first):
 *   1. Linked artist.userId → User.homeLocation (non-IP)
 *   2. MusicBrainz recording id → primary artist → begin-area / area
 *   3. ISRC → MusicBrainz recording → artist area
 *   4. (optional) nameSearch: MusicBrainz artist search by primary artist name
 */

const Media = require('../models/Media');
const User = require('../models/User');
const musicbrainzService = require('./musicbrainzService');
const { geocodeQuery } = require('./mapboxGeocodingService');
const { extractMusicBrainzId } = require('../utils/releaseDateUtils');
const {
  hasUsableLocation,
  isStrongArtistHomeLocation,
  applyLocationToMedia,
  applyResolvedLocation,
  countryNameFromCode,
  formatLocationDisplay,
  needsMapboxEnrichment,
  ensureMapboxResolvedLocation,
} = require('../utils/locationUtils');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeOpts(opts = {}) {
  return {
    dryRun: opts.dryRun !== false,
    artistHomeOnly: Boolean(opts.artistHomeOnly),
    musicbrainzOnly: Boolean(opts.musicbrainzOnly),
    nameSearch: Boolean(opts.nameSearch),
    forceManual: Boolean(opts.forceManual),
    upgradeInferred: Boolean(opts.upgradeInferred),
    /** Geocode existing text/coords locations that lack placeId (incl. manual). */
    upgradeMapbox: Boolean(opts.upgradeMapbox),
    skipMapbox: Boolean(opts.skipMapbox),
    limit: opts.limit != null ? Number(opts.limit) : null,
    delayMs: opts.delayMs != null ? Number(opts.delayMs) : 150,
    mbDelayMs: opts.mbDelayMs != null ? Number(opts.mbDelayMs) : 1200,
    quiet: Boolean(opts.quiet),
  };
}

function hasMapbox(opts) {
  return !opts.skipMapbox && !!process.env.MAPBOX_ACCESS_TOKEN;
}

function isMusicTune(media) {
  const forms = Array.isArray(media.contentForm) ? media.contentForm : [media.contentForm];
  const types = Array.isArray(media.contentType) ? media.contentType : [media.contentType];
  const podcastForms = new Set([
    'podcast-series',
    'podcast-episode',
    'podcastepisode',
    'podcastseries',
    'episode',
    'series',
  ]);
  if (forms.some((f) => podcastForms.has(f))) return false;
  if (types.some((t) => t === 'music') || forms.some((f) => f === 'tune')) return true;
  return !media.contentType;
}

function needsLocationBackfill(media, opts) {
  if (opts.upgradeMapbox) {
    return needsMapboxEnrichment(media.primaryLocation);
  }
  if (media.locationSource === 'manual' && !opts.forceManual) return false;
  if (!hasUsableLocation(media.primaryLocation)) return true;
  if (opts.upgradeInferred) {
    const src = media.locationSource;
    return !src || src === 'uploader';
  }
  return false;
}

function musicFilter() {
  return {
    $or: [
      { contentType: 'music' },
      { contentType: { $in: ['music'] } },
      { contentForm: 'tune' },
      { contentForm: { $in: ['tune'] } },
      { contentType: { $exists: false } },
    ],
    deletedAt: { $in: [null, undefined] },
  };
}

function buildQuery(opts) {
  const and = [
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
  ];

  // Upgrade text/coords locations that predate Mapbox placeIds (includes manual).
  if (opts.upgradeMapbox) {
    and.push({
      $and: [
        {
          $or: [
            { 'primaryLocation.placeId': { $exists: false } },
            { 'primaryLocation.placeId': null },
            { 'primaryLocation.placeId': '' },
          ],
        },
        {
          $or: [
            { 'primaryLocation.city': { $exists: true, $nin: [null, ''] } },
            { 'primaryLocation.country': { $exists: true, $nin: [null, ''] } },
            { 'primaryLocation.countryCode': { $exists: true, $nin: [null, ''] } },
            { 'primaryLocation.coordinates.lat': { $exists: true, $ne: null } },
          ],
        },
      ],
    });
    return { $and: and };
  }

  if (!opts.forceManual) {
    and.push({
      $or: [
        { locationSource: { $exists: false } },
        { locationSource: null },
        { locationSource: { $ne: 'manual' } },
      ],
    });
  }

  if (!opts.upgradeInferred) {
    and.push({
      $and: [
        {
          $or: [
            { primaryLocation: null },
            { primaryLocation: { $exists: false } },
            { 'primaryLocation.city': { $in: [null, ''] } },
          ],
        },
        {
          $or: [
            { primaryLocation: null },
            { primaryLocation: { $exists: false } },
            { 'primaryLocation.country': { $in: [null, ''] } },
          ],
        },
        {
          $or: [
            { primaryLocation: null },
            { primaryLocation: { $exists: false } },
            { 'primaryLocation.countryCode': { $in: [null, ''] } },
          ],
        },
        {
          $or: [
            { primaryLocation: null },
            { primaryLocation: { $exists: false } },
            { 'primaryLocation.placeId': { $in: [null, ''] } },
          ],
        },
      ],
    });
  }

  return { $and: and };
}

async function getLocationCoverageStats() {
  const filter = musicFilter();
  const [
    total,
    withLoc,
    missing,
    withArtistUser,
    withMb,
    withIsrc,
    manual,
    uploader,
    artistHome,
    musicbrainz,
  ] = await Promise.all([
    Media.countDocuments(filter),
    Media.countDocuments({
      ...filter,
      $or: [
        { 'primaryLocation.city': { $exists: true, $nin: [null, ''] } },
        { 'primaryLocation.country': { $exists: true, $nin: [null, ''] } },
        { 'primaryLocation.countryCode': { $exists: true, $nin: [null, ''] } },
        { 'primaryLocation.placeId': { $exists: true, $nin: [null, ''] } },
      ],
    }),
    Media.countDocuments({
      ...filter,
      $and: [
        {
          $or: [
            { primaryLocation: null },
            { primaryLocation: { $exists: false } },
            { 'primaryLocation.city': { $in: [null, ''] } },
          ],
        },
        {
          $or: [
            { primaryLocation: null },
            { primaryLocation: { $exists: false } },
            { 'primaryLocation.country': { $in: [null, ''] } },
          ],
        },
        {
          $or: [
            { primaryLocation: null },
            { primaryLocation: { $exists: false } },
            { 'primaryLocation.countryCode': { $in: [null, ''] } },
          ],
        },
        {
          $or: [
            { primaryLocation: null },
            { primaryLocation: { $exists: false } },
            { 'primaryLocation.placeId': { $in: [null, ''] } },
          ],
        },
      ],
    }),
    Media.countDocuments({
      ...filter,
      'artist.userId': { $exists: true, $ne: null },
    }),
    Media.countDocuments({
      ...filter,
      'externalIds.musicbrainz': { $exists: true, $ne: null },
    }),
    Media.countDocuments({
      ...filter,
      isrc: { $exists: true, $nin: [null, ''] },
    }),
    Media.countDocuments({ ...filter, locationSource: 'manual' }),
    Media.countDocuments({ ...filter, locationSource: 'uploader' }),
    Media.countDocuments({ ...filter, locationSource: 'artist_home' }),
    Media.countDocuments({ ...filter, locationSource: 'musicbrainz' }),
  ]);

  return {
    total,
    withLoc,
    missing,
    withArtistUser,
    withMb,
    withIsrc,
    manual,
    uploader,
    artistHome,
    musicbrainz,
    mapboxEnabled: !!process.env.MAPBOX_ACCESS_TOKEN,
  };
}

function createBackfillContext(opts) {
  const geocodeCache = new Map();
  const artistOriginCache = new Map();
  const userHomeCache = new Map();

  async function loadUserHome(userId) {
    const key = String(userId);
    if (userHomeCache.has(key)) return userHomeCache.get(key);

    const user = await User.findById(userId).select('homeLocation secondaryLocation username');
    const home = user?.homeLocation && isStrongArtistHomeLocation(user.homeLocation)
      ? user.homeLocation
      : (user?.secondaryLocation && isStrongArtistHomeLocation(user.secondaryLocation)
        ? user.secondaryLocation
        : null);

    userHomeCache.set(key, home);
    return home;
  }

  function originToLocationDraft(origin) {
    if (!origin) return null;
    const countryCode = origin.countryCode || null;
    const country = origin.country || countryNameFromCode(countryCode) || null;
    return {
      city: origin.city || null,
      region: origin.region || null,
      country,
      countryCode,
      detectedFromIP: false,
    };
  }

  async function resolveWithMapbox(draft) {
    if (!draft || !hasUsableLocation(draft)) return draft;
    if (draft.placeId || !hasMapbox(opts)) return draft;

    const query = [draft.city, draft.region, draft.country || draft.countryCode]
      .filter(Boolean)
      .join(', ');
    if (!query) return draft;

    if (geocodeCache.has(query)) {
      const cached = geocodeCache.get(query);
      return cached ? applyResolvedLocation(cached, draft) : draft;
    }

    if (opts.delayMs > 0) await sleep(opts.delayMs);

    try {
      const countryHint = draft.countryCode
        ? String(draft.countryCode).toLowerCase()
        : undefined;
      const resolved = await geocodeQuery(query, { country: countryHint });
      geocodeCache.set(query, resolved);
      if (!resolved?.placeId) return draft;
      return applyResolvedLocation(resolved, draft);
    } catch (err) {
      console.error(`   Mapbox geocode failed for "${query}": ${err.message}`);
      geocodeCache.set(query, null);
      return draft;
    }
  }

  async function tryUpgradeExistingMapbox(media) {
    if (!opts.upgradeMapbox || !hasMapbox(opts)) return false;
    if (!needsMapboxEnrichment(media.primaryLocation)) return false;

    const cacheKey = [
      media.primaryLocation.city,
      media.primaryLocation.region,
      media.primaryLocation.country,
      media.primaryLocation.countryCode,
      media.primaryLocation.coordinates?.lat,
      media.primaryLocation.coordinates?.lng,
    ]
      .filter((v) => v != null && v !== '')
      .join('|');

    let enriched;
    if (cacheKey && geocodeCache.has(cacheKey)) {
      const cached = geocodeCache.get(cacheKey);
      enriched = cached
        ? applyResolvedLocation(cached, media.primaryLocation)
        : media.primaryLocation;
    } else {
      if (opts.delayMs > 0) await sleep(opts.delayMs);
      try {
        enriched = await ensureMapboxResolvedLocation(media.primaryLocation);
        geocodeCache.set(
          cacheKey,
          enriched?.placeId ? enriched : null
        );
      } catch (err) {
        console.error(
          `   Mapbox upgrade failed for "${media.title}": ${err.message}`
        );
        geocodeCache.set(cacheKey, null);
        return false;
      }
    }

    if (!enriched?.placeId) return false;

    const before = media.primaryLocation?.placeId || null;
    media.primaryLocation = enriched;
    // Keep original locationSource (manual / musicbrainz / …)
    if (before === enriched.placeId) return false;

    return {
      source: 'mapbox_upgrade',
      display: formatLocationDisplay(media.primaryLocation),
    };
  }

  async function getCachedArtistOrigin(artistMbid) {
    if (artistOriginCache.has(artistMbid)) {
      return artistOriginCache.get(artistMbid);
    }
    if (opts.mbDelayMs > 0) await sleep(opts.mbDelayMs);
    const artist = await musicbrainzService.getArtist(artistMbid);
    const origin = musicbrainzService.mapArtistOrigin(artist);
    artistOriginCache.set(artistMbid, origin);
    return origin;
  }

  async function originFromRecordingMbid(mbid) {
    if (opts.mbDelayMs > 0) await sleep(opts.mbDelayMs);
    const recording = await musicbrainzService.getRecordingRaw(mbid);
    if (!recording) return null;

    const artistMbids = musicbrainzService.extractPrimaryArtistMbids(recording);
    for (const artistMbid of artistMbids) {
      const origin = await getCachedArtistOrigin(artistMbid);
      if (origin) {
        return { ...origin, recordingMbid: recording.id };
      }
    }
    return null;
  }

  async function tryArtistHome(media) {
    if (opts.musicbrainzOnly) return false;

    const artists = Array.isArray(media.artist) ? media.artist : [];
    const ordered = [
      ...artists.filter((a) => a?.userId && a.verified),
      ...artists.filter((a) => a?.userId && !a.verified),
    ];

    for (const artist of ordered) {
      const home = await loadUserHome(artist.userId);
      if (!home) continue;

      const location = await resolveWithMapbox({ ...home, detectedFromIP: false });
      const changed = applyLocationToMedia(media, location, 'artist_home', {
        forceManual: opts.forceManual,
      });
      if (changed) {
        return { source: 'artist_home', display: formatLocationDisplay(media.primaryLocation) };
      }
    }
    return false;
  }

  async function tryMusicBrainzRecording(media) {
    if (opts.artistHomeOnly) return false;

    const mbid = extractMusicBrainzId(media);
    if (!mbid) return false;

    try {
      const origin = await originFromRecordingMbid(mbid);
      if (!origin) return false;

      const draft = originToLocationDraft(origin);
      const location = await resolveWithMapbox(draft);
      const changed = applyLocationToMedia(media, location, 'musicbrainz', {
        forceManual: opts.forceManual,
      });
      if (changed) {
        return {
          source: 'musicbrainz',
          via: `recording:${mbid}`,
          artist: origin.artistName,
          display: formatLocationDisplay(media.primaryLocation),
        };
      }
    } catch (err) {
      console.error(`   MB recording ${mbid} failed: ${err.message}`);
    }
    return false;
  }

  async function tryMusicBrainzIsrc(media) {
    if (opts.artistHomeOnly) return false;
    if (extractMusicBrainzId(media)) return false;
    if (!media.isrc) return false;

    try {
      if (opts.mbDelayMs > 0) await sleep(opts.mbDelayMs);
      const recordings = await musicbrainzService.searchByIsrcRaw(media.isrc, 3);
      for (const recording of recordings) {
        const artistMbids = musicbrainzService.extractPrimaryArtistMbids(recording);
        let origin = null;
        if (artistMbids.length > 0) {
          for (const artistMbid of artistMbids) {
            origin = await getCachedArtistOrigin(artistMbid);
            if (origin) break;
          }
        } else if (recording.id) {
          origin = await originFromRecordingMbid(recording.id);
        }
        if (!origin) continue;

        if (!media.externalIds) media.externalIds = new Map();
        if (media.externalIds instanceof Map) {
          if (!media.externalIds.get('musicbrainz')) {
            media.externalIds.set('musicbrainz', recording.id);
          }
        } else if (!media.externalIds.musicbrainz) {
          media.externalIds.musicbrainz = recording.id;
        }

        const draft = originToLocationDraft(origin);
        const location = await resolveWithMapbox(draft);
        const changed = applyLocationToMedia(media, location, 'musicbrainz', {
          forceManual: opts.forceManual,
        });
        if (changed) {
          return {
            source: 'musicbrainz',
            via: `isrc:${media.isrc}`,
            artist: origin.artistName,
            display: formatLocationDisplay(media.primaryLocation),
          };
        }
      }
    } catch (err) {
      console.error(`   MB ISRC ${media.isrc} failed: ${err.message}`);
    }
    return false;
  }

  async function tryMusicBrainzNameSearch(media) {
    if (opts.artistHomeOnly || !opts.nameSearch) return false;

    const primaryName = media.artist?.[0]?.name;
    if (!primaryName) return false;

    try {
      if (opts.mbDelayMs > 0) await sleep(opts.mbDelayMs);
      const artists = await musicbrainzService.searchArtists(primaryName, 5);
      const exact = artists.find((a) => {
        const score = Number(a.score) || 0;
        return score >= 95 && String(a.name || '').toLowerCase() === primaryName.toLowerCase();
      }) || artists.find((a) => (Number(a.score) || 0) >= 100);

      if (!exact?.id) return false;

      let origin = musicbrainzService.mapArtistOrigin(exact);
      if (!origin) {
        origin = await getCachedArtistOrigin(exact.id);
      }
      if (!origin) return false;

      const draft = originToLocationDraft(origin);
      const location = await resolveWithMapbox(draft);
      const changed = applyLocationToMedia(media, location, 'musicbrainz', {
        forceManual: opts.forceManual,
      });
      if (changed) {
        return {
          source: 'musicbrainz',
          via: `name:${primaryName}`,
          artist: origin.artistName,
          display: formatLocationDisplay(media.primaryLocation),
        };
      }
    } catch (err) {
      console.error(`   MB name search "${primaryName}" failed: ${err.message}`);
    }
    return false;
  }

  async function processMedia(media) {
    if (!needsLocationBackfill(media, opts)) {
      return { status: 'skip' };
    }

    if (opts.upgradeMapbox) {
      const upgraded = await tryUpgradeExistingMapbox(media);
      if (upgraded) {
        if (!opts.dryRun) {
          await media.save();
        }
        return { status: 'updated', ...upgraded };
      }
      return { status: 'unmatched' };
    }

    const steps = [
      tryArtistHome,
      tryMusicBrainzRecording,
      tryMusicBrainzIsrc,
      tryMusicBrainzNameSearch,
    ];

    for (const step of steps) {
      const result = await step(media);
      if (result) {
        if (!opts.dryRun) {
          await media.save();
        }
        return { status: 'updated', ...result };
      }
    }

    return { status: 'unmatched' };
  }

  return { processMedia };
}

let locationBackfillRunning = false;

function isLocationBackfillRunning() {
  return locationBackfillRunning;
}

/**
 * Run a bounded media location backfill pass.
 * @param {object} [opts]
 * @param {boolean} [opts.dryRun=true]
 * @param {number|null} [opts.limit]
 * @param {boolean} [opts.artistHomeOnly]
 * @param {boolean} [opts.musicbrainzOnly]
 * @param {boolean} [opts.nameSearch]
 * @param {boolean} [opts.forceManual]
 * @param {boolean} [opts.upgradeInferred]
 * @param {boolean} [opts.upgradeMapbox] Geocode existing locations missing placeId
 * @param {boolean} [opts.skipMapbox]
 * @param {number} [opts.delayMs=150]
 * @param {number} [opts.mbDelayMs=1200]
 * @param {boolean} [opts.quiet]
 * @param {boolean} [opts.includeStats]
 */
async function runMediaLocationBackfill(rawOpts = {}) {
  if (locationBackfillRunning) {
    return { skipped: true, reason: 'already_running' };
  }

  locationBackfillRunning = true;
  try {
    return await runMediaLocationBackfillUnlocked(rawOpts);
  } finally {
    locationBackfillRunning = false;
  }
}

async function runMediaLocationBackfillUnlocked(rawOpts = {}) {
  const opts = normalizeOpts(rawOpts);
  const log = opts.quiet ? () => {} : (...args) => console.log(...args);

  log(`\n📍 mediaLocationBackfill (${opts.dryRun ? 'DRY RUN' : 'EXECUTE'})`);
  if (opts.upgradeMapbox) log('   mode: upgrade-mapbox (enrich placeId on existing locations)');
  if (opts.artistHomeOnly) log('   mode: artist-home-only');
  if (opts.musicbrainzOnly) log('   mode: musicbrainz-only');
  if (opts.nameSearch) log('   name-search: on');
  if (opts.upgradeInferred) log('   upgrade-inferred: on');
  if (opts.forceManual) log('   force-manual: on');

  if (opts.upgradeMapbox && !hasMapbox(opts)) {
    log('   ✗ MAPBOX_ACCESS_TOKEN required for --upgrade-mapbox');
    return {
      dryRun: opts.dryRun,
      coverage: null,
      scanned: 0,
      updated: 0,
      unmatched: 0,
      skipped: 0,
      errors: 1,
      bySource: {},
      error: 'MAPBOX_ACCESS_TOKEN required',
    };
  }
  let coverage = null;
  if (rawOpts.includeStats !== false) {
    coverage = await getLocationCoverageStats();
    log('\n📊 Music primaryLocation coverage');
    log(`   total music-ish:       ${coverage.total}`);
    log(`   with usable location:  ${coverage.withLoc}`);
    log(`   missing location:      ${coverage.missing}`);
    log(`   linked artist.userId:  ${coverage.withArtistUser}`);
    log(`   have MusicBrainz id:   ${coverage.withMb}`);
    log(`   have ISRC:             ${coverage.withIsrc}`);
    log(`   source manual:         ${coverage.manual}`);
    log(`   source uploader:       ${coverage.uploader}`);
    log(`   source artist_home:    ${coverage.artistHome}`);
    log(`   source musicbrainz:    ${coverage.musicbrainz}`);
    log(`   Mapbox geocode:        ${coverage.mapboxEnabled && !opts.skipMapbox ? 'enabled' : 'disabled'}`);
  }

  if (rawOpts.statsOnly) {
    return {
      dryRun: opts.dryRun,
      coverage,
      scanned: 0,
      updated: 0,
      unmatched: 0,
      skipped: 0,
      errors: 0,
      bySource: {},
    };
  }

  const { processMedia } = createBackfillContext(opts);

  let query = Media.find(buildQuery(opts))
    .select(
      'title artist primaryLocation locationSource externalIds isrc contentType contentForm status deletedAt'
    )
    .sort({ updatedAt: -1 });

  if (opts.limit) query = query.limit(opts.limit);

  const candidates = (await query).filter(isMusicTune).filter((m) => needsLocationBackfill(m, opts));
  log(`\n🎯 Candidates: ${candidates.length}${opts.limit ? ` (limit ${opts.limit})` : ''}`);

  let updated = 0;
  let unmatched = 0;
  let skipped = 0;
  let errors = 0;
  const bySource = {};

  for (let i = 0; i < candidates.length; i += 1) {
    const media = candidates[i];
    try {
      const result = await processMedia(media);
      if (result.status === 'updated') {
        updated += 1;
        bySource[result.source] = (bySource[result.source] || 0) + 1;
        const prefix = opts.dryRun ? '[dry-run]' : '✓';
        log(
          `   ${prefix} ${media.title} ← ${result.source}` +
            `${result.via ? ` (${result.via})` : ''}` +
            `${result.display ? ` → ${result.display}` : ''}`
        );
      } else if (result.status === 'unmatched') {
        unmatched += 1;
      } else {
        skipped += 1;
      }
    } catch (err) {
      errors += 1;
      console.error(`   ✗ ${media.title}: ${err.message}`);
    }
  }

  log('\n📈 Location summary');
  log(`   updated:   ${updated}${opts.dryRun ? ' (dry-run)' : ''}`);
  log(`   unmatched: ${unmatched}`);
  log(`   skipped:   ${skipped}`);
  log(`   errors:    ${errors}`);
  log(`   by source: ${JSON.stringify(bySource)}`);

  return {
    dryRun: opts.dryRun,
    coverage,
    scanned: candidates.length,
    updated,
    unmatched,
    skipped,
    errors,
    bySource,
  };
}

module.exports = {
  runMediaLocationBackfill,
  getLocationCoverageStats,
  isLocationBackfillRunning,
  isMusicTune,
  needsLocationBackfill,
};
