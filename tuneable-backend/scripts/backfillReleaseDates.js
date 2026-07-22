/**
 * Backfill Media.releaseDate / releaseYear from catalog sources.
 *
 * Cascade (highest confidence first):
 *   1. Spotify track id  → album.release_date (+ precision)
 *   2. MusicBrainz recording id → first-release-date
 *   3. ISRC → Spotify search, then MusicBrainz ISRC search
 *
 * Never overwrites manual edits (releaseDateSource === 'manual') unless --force-manual.
 * Upgrades year-only / suspicious Jan-1 placeholders when a better date is found.
 *
 * Usage:
 *   node scripts/backfillReleaseDates.js --dry-run
 *   node scripts/backfillReleaseDates.js --dry-run --stats-only
 *   node scripts/backfillReleaseDates.js --execute --limit 100
 *   node scripts/backfillReleaseDates.js --execute --spotify-only
 *   node scripts/backfillReleaseDates.js --execute --musicbrainz-only
 *   node scripts/backfillReleaseDates.js --execute --isrc-only
 *   node scripts/backfillReleaseDates.js --execute --missing-only
 *   node scripts/backfillReleaseDates.js --execute --production
 *
 * Requires: MONGO_URI (or MONGODB_URI)
 *           SPOTIFY_CLIENT_ID + SPOTIFY_CLIENT_SECRET (for Spotify / ISRC→Spotify steps)
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
const spotifyService = require('../services/spotifyService');
const musicbrainzService = require('../services/musicbrainzService');
const {
  parseReleaseDate,
  applyReleaseToMedia,
  looksLikeYearOnlyJan1,
  extractSpotifyTrackId,
  extractMusicBrainzId,
} = require('../utils/releaseDateUtils');

const DRY_RUN = !args.includes('--execute');
const STATS_ONLY = args.includes('--stats-only');
const SPOTIFY_ONLY = args.includes('--spotify-only');
const MUSICBRAINZ_ONLY = args.includes('--musicbrainz-only');
const ISRC_ONLY = args.includes('--isrc-only');
const MISSING_ONLY = args.includes('--missing-only');
const FORCE_MANUAL = args.includes('--force-manual');
const LIMIT = (() => {
  const idx = args.indexOf('--limit');
  return idx >= 0 ? parseInt(args[idx + 1], 10) : null;
})();
const DELAY_MS = (() => {
  const idx = args.indexOf('--delay-ms');
  return idx >= 0 ? parseInt(args[idx + 1], 10) : 200;
})();
const MB_DELAY_MS = (() => {
  const idx = args.indexOf('--mb-delay-ms');
  return idx >= 0 ? parseInt(args[idx + 1], 10) : 1100;
})();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getMongoUri() {
  return process.env.MONGO_URI || process.env.MONGODB_URI;
}

function isMusicTune(media) {
  const forms = Array.isArray(media.contentForm) ? media.contentForm : [media.contentForm];
  const types = Array.isArray(media.contentType) ? media.contentType : [media.contentType];
  const podcastForms = new Set(['podcast-series', 'podcast-episode', 'episode', 'series']);
  if (forms.some((f) => podcastForms.has(f))) return false;
  if (types.some((t) => t === 'music') || forms.some((f) => f === 'tune')) return true;
  // Legacy rows without contentType
  return !media.contentType;
}

function needsReleaseBackfill(media) {
  if (media.releaseDateSource === 'manual' && !FORCE_MANUAL) return false;

  if (MISSING_ONLY) {
    return !media.releaseDate && !media.releaseYear;
  }

  if (!media.releaseDate && !media.releaseYear) return true;
  if (media.releaseDatePrecision === 'year') return true;
  if (!media.releaseDate && media.releaseYear) return true;
  if (looksLikeYearOnlyJan1(media.releaseDate, media.releaseYear, media.releaseDatePrecision)) return true;
  // Upgrade month → day when possible; leave day-precision alone
  if (media.releaseDatePrecision === 'day') return false;
  if (media.releaseDate && !media.releaseDatePrecision) return false;
  return media.releaseDatePrecision === 'month';
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
        { releaseDateSource: { $exists: false } },
        { releaseDateSource: null },
        { releaseDateSource: { $ne: 'manual' } },
      ],
    });
  }

  if (MISSING_ONLY) {
    and.push({
      $and: [
        { $or: [{ releaseDate: null }, { releaseDate: { $exists: false } }] },
        { $or: [{ releaseYear: null }, { releaseYear: { $exists: false } }] },
      ],
    });
  } else {
    and.push({
      $or: [
        { releaseDate: null },
        { releaseDate: { $exists: false } },
        { releaseYear: null },
        { releaseYear: { $exists: false } },
        { releaseDatePrecision: { $in: [null, 'year', 'month'] } },
        {
          $expr: {
            $and: [
              { $ne: ['$releaseDate', null] },
              { $eq: [{ $month: '$releaseDate' }, 1] },
              { $eq: [{ $dayOfMonth: '$releaseDate' }, 1] },
            ],
          },
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

  const [total, withDate, withYearOnly, missing, withSpotify, withMb, withIsrc, manual] = await Promise.all([
    Media.countDocuments(musicFilter),
    Media.countDocuments({ ...musicFilter, releaseDate: { $ne: null } }),
    Media.countDocuments({
      ...musicFilter,
      releaseDate: null,
      releaseYear: { $ne: null },
    }),
    Media.countDocuments({
      ...musicFilter,
      $and: [
        { $or: [{ releaseDate: null }, { releaseDate: { $exists: false } }] },
        { $or: [{ releaseYear: null }, { releaseYear: { $exists: false } }] },
      ],
    }),
    Media.countDocuments({
      ...musicFilter,
      $or: [
        { 'externalIds.spotify': { $exists: true, $ne: null } },
        { 'sources.spotify': { $exists: true, $ne: null } },
      ],
    }),
    Media.countDocuments({
      ...musicFilter,
      'externalIds.musicbrainz': { $exists: true, $ne: null },
    }),
    Media.countDocuments({
      ...musicFilter,
      isrc: { $exists: true, $nin: [null, ''] },
    }),
    Media.countDocuments({ ...musicFilter, releaseDateSource: 'manual' }),
  ]);

  console.log('\n📊 Music release-date coverage');
  console.log(`   total music-ish:     ${total}`);
  console.log(`   with releaseDate:    ${withDate}`);
  console.log(`   year-only:           ${withYearOnly}`);
  console.log(`   missing both:        ${missing}`);
  console.log(`   have Spotify id/url: ${withSpotify}`);
  console.log(`   have MusicBrainz id: ${withMb}`);
  console.log(`   have ISRC:           ${withIsrc}`);
  console.log(`   manual source:       ${manual}`);
}

function parsedFromSpotifyFields(fields) {
  if (!fields) return null;
  return parseReleaseDate(fields.releaseDate, fields.releaseDatePrecision);
}

async function backfillFromSpotify(candidates) {
  if (MUSICBRAINZ_ONLY || ISRC_ONLY) return { updated: 0, checked: 0, errors: 0 };

  const withIds = candidates
    .map((media) => ({ media, spotifyId: extractSpotifyTrackId(media) }))
    .filter((row) => row.spotifyId);

  console.log(`\n🎧 Spotify cascade: ${withIds.length} media with track ids`);
  if (withIds.length === 0) return { updated: 0, checked: 0, errors: 0 };

  let updated = 0;
  let checked = 0;
  let errors = 0;

  for (let i = 0; i < withIds.length; i += 50) {
    const chunk = withIds.slice(i, i + 50);
    let tracks;
    try {
      tracks = await spotifyService.getTracksByIds(chunk.map((c) => c.spotifyId));
    } catch (err) {
      console.error(`   Spotify batch failed: ${err.message}`);
      errors += chunk.length;
      continue;
    }

    for (const { media, spotifyId } of chunk) {
      checked += 1;
      const track = tracks.get(spotifyId);
      const fields = spotifyService.releaseFieldsFromTrack(track);
      const parsed = parsedFromSpotifyFields(fields);
      if (!parsed?.releaseYear && !parsed?.releaseDate) continue;

      const changed = applyReleaseToMedia(media, parsed, 'spotify', { forceManual: FORCE_MANUAL });
      if (!changed) continue;

      if (DRY_RUN) {
        console.log(`   [dry-run] ${media.title} ← Spotify ${parsed.precision} ${parsed.releaseDate?.toISOString().slice(0, 10) || parsed.releaseYear}`);
        updated += 1;
      } else {
        await media.save();
        updated += 1;
        console.log(`   ✓ ${media.title} ← Spotify ${media.releaseDatePrecision} ${media.releaseDate?.toISOString?.().slice(0, 10) || media.releaseYear}`);
      }
    }

    if (DELAY_MS > 0) await sleep(DELAY_MS);
  }

  return { updated, checked, errors };
}

async function backfillFromMusicBrainz(candidates) {
  if (SPOTIFY_ONLY || ISRC_ONLY) return { updated: 0, checked: 0, errors: 0 };

  const withIds = candidates
    .map((media) => ({ media, mbid: extractMusicBrainzId(media) }))
    .filter((row) => row.mbid)
    // Skip if already day-precision from a prior step this run
    .filter((row) => needsReleaseBackfill(row.media));

  console.log(`\n🧠 MusicBrainz cascade: ${withIds.length} media with recording ids`);
  let updated = 0;
  let checked = 0;
  let errors = 0;

  for (const { media, mbid } of withIds) {
    checked += 1;
    try {
      const details = await musicbrainzService.getRecording(mbid);
      await sleep(MB_DELAY_MS);
      if (!details) continue;

      const parsed = parseReleaseDate(details.releaseDate, details.releaseDatePrecision);
      const changed = applyReleaseToMedia(media, parsed, 'musicbrainz', { forceManual: FORCE_MANUAL });
      if (!changed) continue;

      if (DRY_RUN) {
        console.log(`   [dry-run] ${media.title} ← MB ${parsed.precision} ${parsed.releaseDate?.toISOString().slice(0, 10) || parsed.releaseYear}`);
        updated += 1;
      } else {
        await media.save();
        updated += 1;
        console.log(`   ✓ ${media.title} ← MB ${media.releaseDatePrecision} ${media.releaseDate?.toISOString?.().slice(0, 10) || media.releaseYear}`);
      }
    } catch (err) {
      errors += 1;
      console.warn(`   MB failed for ${media.title}: ${err.message}`);
      await sleep(MB_DELAY_MS);
    }
  }

  return { updated, checked, errors };
}

async function backfillFromIsrc(candidates) {
  if (SPOTIFY_ONLY || MUSICBRAINZ_ONLY) return { updated: 0, checked: 0, errors: 0 };

  const withIsrc = candidates
    .filter((media) => media.isrc)
    .filter((media) => needsReleaseBackfill(media));

  console.log(`\n🔢 ISRC cascade: ${withIsrc.length} media with ISRC still needing dates`);
  let updated = 0;
  let checked = 0;
  let errors = 0;

  for (const media of withIsrc) {
    checked += 1;
    try {
      // Prefer Spotify ISRC search (faster, day precision common)
      let parsed = null;
      let source = null;

      try {
        const track = await spotifyService.searchTrackByIsrc(media.isrc);
        const fields = spotifyService.releaseFieldsFromTrack(track);
        parsed = parsedFromSpotifyFields(fields);
        if (parsed?.releaseYear || parsed?.releaseDate) source = 'spotify';
        if (DELAY_MS > 0) await sleep(DELAY_MS);
      } catch (err) {
        // Spotify optional if credentials missing
        if (!String(err.message || '').includes('SPOTIFY_CLIENT')) {
          console.warn(`   Spotify ISRC search failed (${media.isrc}): ${err.message}`);
        }
      }

      if (!parsed?.releaseYear && !parsed?.releaseDate) {
        const tracks = await musicbrainzService.searchByIsrc(media.isrc, 3);
        await sleep(MB_DELAY_MS);
        const best = tracks[0];
        if (best) {
          parsed = parseReleaseDate(best.releaseDate, best.releaseDatePrecision);
          source = 'musicbrainz';
          // Store MBID for future enrichment
          if (best.id && media.externalIds) {
            if (!(media.externalIds instanceof Map)) {
              media.externalIds = new Map(Object.entries(media.externalIds || {}));
            }
            if (!media.externalIds.get('musicbrainz')) {
              media.externalIds.set('musicbrainz', best.id);
            }
          }
        }
      }

      if (!parsed?.releaseYear && !parsed?.releaseDate) continue;

      const changed = applyReleaseToMedia(media, parsed, source, { forceManual: FORCE_MANUAL });
      if (!changed) continue;

      if (DRY_RUN) {
        console.log(`   [dry-run] ${media.title} ← ISRC/${source} ${parsed.precision} ${parsed.releaseDate?.toISOString().slice(0, 10) || parsed.releaseYear}`);
        updated += 1;
      } else {
        await media.save();
        updated += 1;
        console.log(`   ✓ ${media.title} ← ISRC/${source} ${media.releaseDatePrecision} ${media.releaseDate?.toISOString?.().slice(0, 10) || media.releaseYear}`);
      }
    } catch (err) {
      errors += 1;
      console.warn(`   ISRC failed for ${media.title}: ${err.message}`);
      await sleep(MB_DELAY_MS);
    }
  }

  return { updated, checked, errors };
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

  await printCoverageStats();
  if (STATS_ONLY) {
    await mongoose.disconnect();
    return;
  }

  const query = buildQuery();
  let cursor = Media.find(query)
    .select('title artist releaseDate releaseYear releaseDatePrecision releaseDateSource isrc externalIds sources contentType contentForm status deletedAt')
    .sort({ updatedAt: -1 });

  if (LIMIT) cursor = cursor.limit(LIMIT);

  const docs = await cursor;
  const candidates = docs.filter(isMusicTune).filter(needsReleaseBackfill);

  console.log(`\n🎯 Candidates after filters: ${candidates.length} (loaded ${docs.length})`);

  const spotify = await backfillFromSpotify(candidates);
  const mb = await backfillFromMusicBrainz(candidates);
  const isrc = await backfillFromIsrc(candidates);

  console.log('\n✅ Done');
  console.log(`   Spotify:     updated=${spotify.updated} checked=${spotify.checked} errors=${spotify.errors}`);
  console.log(`   MusicBrainz: updated=${mb.updated} checked=${mb.checked} errors=${mb.errors}`);
  console.log(`   ISRC:        updated=${isrc.updated} checked=${isrc.checked} errors=${isrc.errors}`);

  await printCoverageStats();
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  try { await mongoose.disconnect(); } catch (_) { /* ignore */ }
  process.exit(1);
});
