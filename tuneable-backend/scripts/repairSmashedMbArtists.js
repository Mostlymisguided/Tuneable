/**
 * Repair MusicBrainz artist credits that were stored as smashed strings
 * (e.g. "LogicAlessia CaraKhalid") before joinphrase parsing existed.
 *
 * Usage:
 *   node scripts/repairSmashedMbArtists.js --dry-run
 *   node scripts/repairSmashedMbArtists.js --execute
 *   node scripts/repairSmashedMbArtists.js --execute --enrichments-only
 *   node scripts/repairSmashedMbArtists.js --execute --media-only
 *   node scripts/repairSmashedMbArtists.js --execute --limit 50
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
  hydrateSuggestionArtists,
  suggestionHasStructuredArtists,
  applySuggestionToMedia,
} = require('../services/metadataEnrichmentService');
const { formatCreatorDisplay } = require('../utils/artistParser');
const musicbrainzService = require('../services/musicbrainzService');

const dryRun = !args.includes('--execute');
const enrichmentsOnly = args.includes('--enrichments-only');
const mediaOnly = args.includes('--media-only');

function argValue(flag) {
  const idx = args.indexOf(flag);
  if (idx < 0) return null;
  const raw = args[idx + 1];
  if (raw == null || raw.startsWith('--')) return null;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : null;
}

function getMongoUri() {
  return process.env.MONGO_URI || process.env.MONGODB_URI;
}

function mapToObject(value) {
  if (!value) return {};
  if (value instanceof Map) return Object.fromEntries(value);
  return { ...value };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function repairEnrichments(limit) {
  const query = {
    'suggestion.musicbrainzId': { $exists: true, $nin: [null, ''] },
    $or: [
      { 'suggestion.artists': { $exists: false } },
      { 'suggestion.artists': { $size: 0 } },
      { 'suggestion.artists': null },
    ],
  };

  const items = await MetadataEnrichment.find(query)
    .sort({ status: -1, updatedAt: -1 }) // needs_review before older terminal statuses when tied
    .limit(limit);

  const stats = { scanned: items.length, updated: 0, skipped: 0, failed: 0 };

  for (const item of items) {
    try {
      const plain = item.suggestion && typeof item.suggestion.toObject === 'function'
        ? item.suggestion.toObject()
        : (item.suggestion || {});
      const hydrated = await hydrateSuggestionArtists(plain);
      if (!suggestionHasStructuredArtists(hydrated)) {
        stats.skipped += 1;
        continue;
      }

      console.log(
        `${dryRun ? '[dry-run] ' : ''}enrichment ${item._id}: `
        + `"${plain.artist}" → "${hydrated.artist}"`
      );

      if (!dryRun) {
        item.suggestion.artist = hydrated.artist;
        item.suggestion.artists = hydrated.artists || [];
        item.suggestion.featuring = hydrated.featuring || [];
        item.markModified('suggestion');
        await item.save();
      }
      stats.updated += 1;
    } catch (err) {
      stats.failed += 1;
      console.warn('enrichment repair failed:', item._id, err.message);
    }
  }

  return stats;
}

async function repairMedia(limit) {
  // Prefer media that still look like a smashed blob, or a single artist with an MBID
  // that may need featuring split.
  const candidates = await Media.find({
    'externalIds.musicbrainz': { $exists: true, $nin: [null, ''] },
    $or: [
      { 'artist.1': { $exists: false } },
      { creatorDisplay: { $regex: /[a-z][A-Z]/ } },
      { 'artist.0.name': { $regex: /[a-z][A-Z]/ } },
    ],
  })
    .select('_id title artist featuring creatorDisplay externalIds')
    .limit(Math.max(limit * 5, limit))
    .lean();

  const stats = { scanned: 0, updated: 0, skipped: 0, failed: 0 };

  for (const doc of candidates) {
    if (stats.updated + stats.skipped + stats.failed >= limit) break;
    stats.scanned += 1;

    const mbid = mapToObject(doc.externalIds).musicbrainz;
    const currentDisplay = doc.creatorDisplay
      || formatCreatorDisplay(doc.artist || [], doc.featuring || [])
      || doc.artist?.[0]?.name
      || '';
    if (!mbid) {
      stats.skipped += 1;
      continue;
    }

    try {
      await sleep(1100);
      const details = await musicbrainzService.getRecording(mbid);
      if (!details?.artists?.length) {
        stats.skipped += 1;
        continue;
      }

      const display = details.artist
        || formatCreatorDisplay(details.artists, details.featuring || []);
      if (!display || display === currentDisplay) {
        stats.skipped += 1;
        continue;
      }

      const creditCount = (details.artists?.length || 0) + (details.featuring?.length || 0);
      const currentCount = (doc.artist?.length || 0) + (doc.featuring?.length || 0);
      // Only rewrite when MB has multi-credit info or current display is clearly wrong
      if (creditCount <= 1 && currentCount <= 1) {
        stats.skipped += 1;
        continue;
      }

      console.log(
        `${dryRun ? '[dry-run] ' : ''}media ${doc._id} "${doc.title}": `
        + `"${currentDisplay}" → "${display}"`
      );

      if (!dryRun) {
        const media = await Media.findById(doc._id);
        if (!media) {
          stats.skipped += 1;
          continue;
        }
        await applySuggestionToMedia(media, {
          title: media.title,
          artist: display,
          artists: details.artists,
          featuring: details.featuring || [],
          musicbrainzId: mbid,
          musicbrainzReleaseId: details.externalIds?.musicbrainzRelease || null,
        }, {
          applyIdentity: true,
          applyTags: false,
          preserveOriginal: true,
        });
      }
      stats.updated += 1;
    } catch (err) {
      stats.failed += 1;
      console.warn('media repair failed:', doc._id, err.message);
    }
  }

  return stats;
}

async function main() {
  const uri = getMongoUri();
  if (!uri) {
    console.error('Missing MONGO_URI / MONGODB_URI');
    process.exit(1);
  }

  const limit = argValue('--limit') || 200;
  console.log(dryRun ? 'DRY RUN (pass --execute to write)' : 'EXECUTE mode');
  await mongoose.connect(uri);

  const results = {};
  if (!mediaOnly) {
    results.enrichments = await repairEnrichments(limit);
    console.log('enrichments:', results.enrichments);
  }
  if (!enrichmentsOnly) {
    results.media = await repairMedia(limit);
    console.log('media:', results.media);
  }

  await mongoose.disconnect();
  console.log('done', results);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
