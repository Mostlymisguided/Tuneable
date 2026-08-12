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
 * Pass --upgrade-mapbox to geocode existing text/coords locations that lack placeId
 *   (includes manual edits made before Mapbox autocomplete).
 *
 * Usage:
 *   node scripts/backfillMediaLocations.js --dry-run
 *   node scripts/backfillMediaLocations.js --dry-run --stats-only
 *   node scripts/backfillMediaLocations.js --execute --limit 50
 *   node scripts/backfillMediaLocations.js --execute --artist-home-only
 *   node scripts/backfillMediaLocations.js --execute --musicbrainz-only
 *   node scripts/backfillMediaLocations.js --execute --name-search
 *   node scripts/backfillMediaLocations.js --dry-run --upgrade-mapbox
 *   node scripts/backfillMediaLocations.js --execute --upgrade-mapbox
 *   node scripts/backfillMediaLocations.js --execute --production
 *
 * Requires: MONGO_URI (or MONGODB_URI)
 * Optional: MAPBOX_ACCESS_TOKEN (improves city/country resolution; required for --upgrade-mapbox)
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
const { runMediaLocationBackfill } = require('../services/mediaLocationBackfillService');

function getMongoUri() {
  return process.env.MONGO_URI || process.env.MONGODB_URI;
}

function argValue(flag) {
  const idx = args.indexOf(flag);
  return idx >= 0 ? parseInt(args[idx + 1], 10) : null;
}

async function main() {
  const uri = getMongoUri();
  if (!uri) {
    console.error('MONGO_URI / MONGODB_URI required');
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log('   connected');

  await runMediaLocationBackfill({
    dryRun: !args.includes('--execute'),
    statsOnly: args.includes('--stats-only'),
    artistHomeOnly: args.includes('--artist-home-only'),
    musicbrainzOnly: args.includes('--musicbrainz-only'),
    nameSearch: args.includes('--name-search'),
    forceManual: args.includes('--force-manual'),
    upgradeInferred: args.includes('--upgrade-inferred'),
    upgradeMapbox: args.includes('--upgrade-mapbox'),
    skipMapbox: args.includes('--skip-mapbox'),
    limit: argValue('--limit'),
    delayMs: argValue('--delay-ms') ?? 150,
    mbDelayMs: argValue('--mb-delay-ms') ?? 1200,
    includeStats: true,
  });

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
