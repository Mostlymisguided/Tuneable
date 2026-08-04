/**
 * Backfill Media.primaryLocation from linked artist homes and MusicBrainz artist areas.
 *
 * Cascade (highest confidence first):
 *   1. Linked artist.userId → User.homeLocation (non-IP)
 *   2. MusicBrainz recording id → primary artist → begin-area / area
 *   3. ISRC → MusicBrainz recording → artist area
 *   4. (optional) --name-search: MusicBrainz artist search by primary artist name
 *
 * Mapbox permanent geocode is used when MAPBOX_ACCESS_TOKEN is set and the draft
 * location lacks placeId (same pattern as backfillBidLocationSnapshots.js).
 *
 * Never overwrites locationSource === 'manual' unless --force-manual.
 * By default only fills media missing a usable primaryLocation (--missing-only default).
 * Pass --upgrade-inferred to also replace locationSource in (uploader, null) with better sources.
 *
 * Usage:
 *   node scripts/backfillMediaLocations.js --dry-run
 *   node scripts/backfillMediaLocations.js --dry-run --stats-only
 *   node scripts/backfillMediaLocations.js --execute --limit 50
 *   node scripts/backfillMediaLocations.js --execute --artist-home-only
 *   node scripts/backfillMediaLocations.js --execute --musicbrainz-only
 *   node scripts/backfillMediaLocations.js --execute --name-search
 *   node scripts/backfillMediaLocations.js --execute --production
 *
 * Requires: MONGO_URI (or MONGODB_URI)
 * Optional: MAPBOX_ACCESS_TOKEN (improves city/country resolution)
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
const User = require('../models/User');
const musicbrainzService = require('../services/musicbrainzService');
const { geocodeQuery } = require('../services/mapboxGeocodingService');
const { extractMusicBrainzId } = require('../utils/releaseDateUtils');
const {
  hasUsableLocation,
  isStrongArtistHomeLocation,
  applyLocationToMedia,
  applyResolvedLocation,
  countryNameFromCode,
  formatLocationDisplay,
} = require('../utils/locationUtils');

const DRY_RUN = !args.includes('--execute');
const STATS_ONLY = args.includes('--stats-only');
const ARTIST_HOME_ONLY = args.includes('--artist-home-only');
const MUSICBRAINZ_ONLY = args.includes('--musicbrainz-only');
const NAME_SEARCH = args.includes('--name-search');
const FORCE_MANUAL = args.includes('--force-manual');
const UPGRADE_INFERRED = args.includes('--upgrade-inferred');
const SKIP_MAPBOX = args.includes('--skip-mapbox');
const LIMIT = (() => {
  const idx = args.indexOf('--limit');
  return idx >= 0 ? parseInt(args[idx + 1], 10) : null;
})();
const DELAY_MS = (() => {
  const idx = args.indexOf('--delay-ms');
  return idx >= 0 ? parseInt(args[idx + 1], 10) : 150;
})();
const MB_DELAY_MS = (() => {
  const idx = args.indexOf('--mb-delay-ms');
  return idx >= 0 ? parseInt(args[idx + 1], 10) : 1200;
})();

const geocodeCache = new Map();
const artistOriginCache = new Map(); // artistMbid → origin|null
const userHomeCache = new Map();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getMongoUri() {
  return process.env.MONGO_URI || process.env.MONGODB_URI;
}

function hasMapbox() {
  return !SKIP_MAPBOX && !!process.env.MAPBOX_ACCESS_TOKEN;
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

function needsLocationBackfill(media) {
  if (media.locationSource === 'manual' && !FORCE_MANUAL) return false;

  if (!hasUsableLocation(media.primaryLocation)) return true;

  if (UPGRADE_INFERRED) {
    const src = media.locationSource;
    return !src || src === 'uploader';
  }

  return false;
}

function buildQuery() {
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

  if (!FORCE_MANUAL) {
    and.push({
      $or: [
        { locationSource: { $exists: false } },
        { locationSource: null },
        { locationSource: { $ne: 'manual' } },
      ],
    });
  }

  if (!UPGRADE_INFERRED) {
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

async function printCoverageStats() {
  const musicFilter = {
    $or: [
      { contentType: 'music' },
      { contentType: { $in: ['music'] } },
      { contentForm: 'tune' },
      { contentForm: { $in: ['tune'] } },
      { contentType: { $exists: false } },
    ],
    deletedAt: { $in: [null, undefined] },
  };

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
    Media.countDocuments(musicFilter),
    Media.countDocuments({
      ...musicFilter,
      $or: [
        { 'primaryLocation.city': { $exists: true, $nin: [null, ''] } },
        { 'primaryLocation.country': { $exists: true, $nin: [null, ''] } },
        { 'primaryLocation.countryCode': { $exists: true, $nin: [null, ''] } },
        { 'primaryLocation.placeId': { $exists: true, $nin: [null, ''] } },
      ],
    }),
    Media.countDocuments({
      ...musicFilter,
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
      ...musicFilter,
      'artist.userId': { $exists: true, $ne: null },
    }),
    Media.countDocuments({
      ...musicFilter,
      'externalIds.musicbrainz': { $exists: true, $ne: null },
    }),
    Media.countDocuments({
      ...musicFilter,
      isrc: { $exists: true, $nin: [null, ''] },
    }),
    Media.countDocuments({ ...musicFilter, locationSource: 'manual' }),
    Media.countDocuments({ ...musicFilter, locationSource: 'uploader' }),
    Media.countDocuments({ ...musicFilter, locationSource: 'artist_home' }),
    Media.countDocuments({ ...musicFilter, locationSource: 'musicbrainz' }),
  ]);

  console.log('\n📊 Music primaryLocation coverage');
  console.log(`   total music-ish:       ${total}`);
  console.log(`   with usable location:  ${withLoc}`);
  console.log(`   missing location:      ${missing}`);
  console.log(`   linked artist.userId:  ${withArtistUser}`);
  console.log(`   have MusicBrainz id:   ${withMb}`);
  console.log(`   have ISRC:             ${withIsrc}`);
  console.log(`   source manual:         ${manual}`);
  console.log(`   source uploader:       ${uploader}`);
  console.log(`   source artist_home:    ${artistHome}`);
  console.log(`   source musicbrainz:    ${musicbrainz}`);
  console.log(`   Mapbox geocode:        ${hasMapbox() ? 'enabled' : 'disabled'}`);
}

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
  if (draft.placeId || !hasMapbox()) return draft;

  const query = [draft.city, draft.region, draft.country || draft.countryCode]
    .filter(Boolean)
    .join(', ');
  if (!query) return draft;

  if (geocodeCache.has(query)) {
    const cached = geocodeCache.get(query);
    return cached ? applyResolvedLocation(cached, draft) : draft;
  }

  if (DELAY_MS > 0) await sleep(DELAY_MS);

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

async function getCachedArtistOrigin(artistMbid) {
  if (artistOriginCache.has(artistMbid)) {
    return artistOriginCache.get(artistMbid);
  }
  if (MB_DELAY_MS > 0) await sleep(MB_DELAY_MS);
  const artist = await musicbrainzService.getArtist(artistMbid);
  const origin = musicbrainzService.mapArtistOrigin(artist);
  artistOriginCache.set(artistMbid, origin);
  return origin;
}

async function originFromRecordingMbid(mbid) {
  if (MB_DELAY_MS > 0) await sleep(MB_DELAY_MS);
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
  if (MUSICBRAINZ_ONLY) return false;

  const artists = Array.isArray(media.artist) ? media.artist : [];
  // Prefer verified linked artists, then first linked
  const ordered = [
    ...artists.filter((a) => a?.userId && a.verified),
    ...artists.filter((a) => a?.userId && !a.verified),
  ];

  for (const artist of ordered) {
    const home = await loadUserHome(artist.userId);
    if (!home) continue;

    const location = await resolveWithMapbox({ ...home, detectedFromIP: false });
    const changed = applyLocationToMedia(media, location, 'artist_home', {
      forceManual: FORCE_MANUAL,
    });
    if (changed) {
      return { source: 'artist_home', display: formatLocationDisplay(media.primaryLocation) };
    }
  }
  return false;
}

async function tryMusicBrainzRecording(media) {
  if (ARTIST_HOME_ONLY) return false;

  const mbid = extractMusicBrainzId(media);
  if (!mbid) return false;

  try {
    const origin = await originFromRecordingMbid(mbid);
    if (!origin) return false;

    const draft = originToLocationDraft(origin);
    const location = await resolveWithMapbox(draft);
    const changed = applyLocationToMedia(media, location, 'musicbrainz', {
      forceManual: FORCE_MANUAL,
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
  if (ARTIST_HOME_ONLY) return false;
  if (extractMusicBrainzId(media)) return false; // already tried recording path
  if (!media.isrc) return false;

  try {
    if (MB_DELAY_MS > 0) await sleep(MB_DELAY_MS);
    const recordings = await musicbrainzService.searchByIsrcRaw(media.isrc, 3);
    for (const recording of recordings) {
      const artistMbids = musicbrainzService.extractPrimaryArtistMbids(recording);
      // Search results often omit nested artist ids — fetch full recording when needed
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
        forceManual: FORCE_MANUAL,
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
  if (ARTIST_HOME_ONLY || !NAME_SEARCH) return false;

  const primaryName = media.artist?.[0]?.name;
  if (!primaryName) return false;

  try {
    if (MB_DELAY_MS > 0) await sleep(MB_DELAY_MS);
    const artists = await musicbrainzService.searchArtists(primaryName, 5);
    const exact = artists.find((a) => {
      const score = Number(a.score) || 0;
      return score >= 95 && String(a.name || '').toLowerCase() === primaryName.toLowerCase();
    }) || artists.find((a) => (Number(a.score) || 0) >= 100);

    if (!exact?.id) return false;

    // Search hits may include area/country inline; otherwise fetch full artist
    let origin = musicbrainzService.mapArtistOrigin(exact);
    if (!origin) {
      origin = await getCachedArtistOrigin(exact.id);
    }
    if (!origin) return false;

    const draft = originToLocationDraft(origin);
    const location = await resolveWithMapbox(draft);
    const changed = applyLocationToMedia(media, location, 'musicbrainz', {
      forceManual: FORCE_MANUAL,
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
  if (!needsLocationBackfill(media)) {
    return { status: 'skip' };
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
      if (!DRY_RUN) {
        await media.save();
      }
      return { status: 'updated', ...result };
    }
  }

  return { status: 'unmatched' };
}

async function main() {
  const uri = getMongoUri();
  if (!uri) {
    console.error('MONGO_URI / MONGODB_URI required');
    process.exit(1);
  }

  console.log(`\n📍 backfillMediaLocations (${DRY_RUN ? 'DRY RUN' : 'EXECUTE'})`);
  if (ARTIST_HOME_ONLY) console.log('   mode: artist-home-only');
  if (MUSICBRAINZ_ONLY) console.log('   mode: musicbrainz-only');
  if (NAME_SEARCH) console.log('   name-search: on');
  if (UPGRADE_INFERRED) console.log('   upgrade-inferred: on');
  if (FORCE_MANUAL) console.log('   force-manual: on');

  await mongoose.connect(uri);
  console.log('   connected');

  await printCoverageStats();
  if (STATS_ONLY) {
    await mongoose.disconnect();
    return;
  }

  let query = Media.find(buildQuery())
    .select(
      'title artist primaryLocation locationSource externalIds isrc contentType contentForm status deletedAt'
    )
    .sort({ updatedAt: -1 });

  if (LIMIT) query = query.limit(LIMIT);

  const candidates = (await query).filter(isMusicTune).filter(needsLocationBackfill);
  console.log(`\n🎯 Candidates: ${candidates.length}${LIMIT ? ` (limit ${LIMIT})` : ''}`);

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
        const prefix = DRY_RUN ? '[dry-run]' : '✓';
        console.log(
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

  console.log('\n📈 Summary');
  console.log(`   updated:   ${updated}${DRY_RUN ? ' (dry-run)' : ''}`);
  console.log(`   unmatched: ${unmatched}`);
  console.log(`   skipped:   ${skipped}`);
  console.log(`   errors:    ${errors}`);
  console.log(`   by source: ${JSON.stringify(bySource)}`);

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  try {
    await mongoose.disconnect();
  } catch (_) {
    /* ignore */
  }
  process.exit(1);
});
