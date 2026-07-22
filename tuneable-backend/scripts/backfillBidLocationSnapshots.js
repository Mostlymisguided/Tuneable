/**
 * Backfill Mapbox location data on users and bid location snapshots for Tunefeed filtering.
 *
 * Phase 1 — Users: geocode text-only homeLocation (city/region/country) via Mapbox permanent geocoding.
 * Phase 2 — Bids: copy each user's homeLocation onto active bids missing bidderLocationAncestorIds.
 *
 * Usage:
 *   node scripts/backfillBidLocationSnapshots.js --dry-run
 *   node scripts/backfillBidLocationSnapshots.js --execute
 *   node scripts/backfillBidLocationSnapshots.js --execute --users-only
 *   node scripts/backfillBidLocationSnapshots.js --execute --bids-only --podcasts-only
 *   node scripts/backfillBidLocationSnapshots.js --execute --limit 20 --delay-ms 200
 *
 *   node scripts/backfillBidLocationSnapshots.js --execute --production
 *
 * Requires: MONGO_URI (or MONGODB_URI), MAPBOX_ACCESS_TOKEN
 *           Use --production to load tuneable-backend/.env.production
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
const User = require('../models/User');
const Bid = require('../models/Bid');
const Media = require('../models/Media');
const { geocodeQuery } = require('../services/mapboxGeocodingService');
const { applyResolvedLocation, getBidLocationSnapshot, getUserBidLocation } = require('../utils/locationUtils');

const DRY_RUN = !args.includes('--execute');
const USERS_ONLY = args.includes('--users-only');
const BIDS_ONLY = args.includes('--bids-only');
const PODCASTS_ONLY = args.includes('--podcasts-only');
const LIMIT = (() => {
  const idx = args.indexOf('--limit');
  return idx >= 0 ? parseInt(args[idx + 1], 10) : null;
})();
const DELAY_MS = (() => {
  const idx = args.indexOf('--delay-ms');
  return idx >= 0 ? parseInt(args[idx + 1], 10) : 150;
})();

const geocodeCache = new Map();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getMongoUri() {
  return process.env.MONGO_URI || process.env.MONGODB_URI;
}

function hasResolvableHomeText(homeLocation) {
  if (!homeLocation) return false;
  return !!(homeLocation.city || homeLocation.region || homeLocation.country);
}

function needsMapboxResolve(homeLocation) {
  if (!hasResolvableHomeText(homeLocation)) return false;
  return !homeLocation.placeId;
}

function buildGeocodeQuery(homeLocation) {
  return [homeLocation.city, homeLocation.region, homeLocation.country].filter(Boolean).join(', ');
}

function countryHint(homeLocation) {
  if (homeLocation.countryCode) {
    return String(homeLocation.countryCode).toLowerCase();
  }
  return undefined;
}

function bidMissingLocationQuery() {
  return {
    status: 'active',
    $or: [
      { bidderLocationAncestorIds: { $exists: false } },
      { bidderLocationAncestorIds: { $size: 0 } },
      // Re-stamp older snapshots that lack country/place chip fields
      { bidderCountryPlaceId: { $exists: false } },
      { bidderCountryPlaceId: null },
    ],
  };
}


async function resolveHomeLocation(homeLocation) {
  const query = buildGeocodeQuery(homeLocation);
  if (!query) return null;

  if (geocodeCache.has(query)) {
    return geocodeCache.get(query);
  }

  await sleep(DELAY_MS);
  const resolved = await geocodeQuery(query, { country: countryHint(homeLocation) });
  geocodeCache.set(query, resolved);
  return resolved;
}

function snapshotFromUser(user) {
  const snapshot = getBidLocationSnapshot(getUserBidLocation(user));
  if (!snapshot.bidderLocationAncestorIds?.length) {
    return null;
  }
  return snapshot;
}

async function getPodcastEpisodeMediaIds() {
  return Media.find({
    contentType: { $in: ['spoken'] },
    contentForm: { $in: ['podcastepisode'] },
  }).distinct('_id');
}

async function backfillUsers() {
  let userQuery = User.find({
    $and: [
      {
        $or: [
          { 'homeLocation.city': { $exists: true, $nin: [null, ''] } },
          { 'homeLocation.country': { $exists: true, $nin: [null, ''] } },
          { 'secondaryLocation.city': { $exists: true, $nin: [null, ''] } },
          { 'secondaryLocation.country': { $exists: true, $nin: [null, ''] } },
        ],
      },
      {
        $or: [
          {
            $and: [
              {
                $or: [
                  { 'homeLocation.city': { $exists: true, $nin: [null, ''] } },
                  { 'homeLocation.country': { $exists: true, $nin: [null, ''] } },
                ],
              },
              {
                $or: [
                  { 'homeLocation.placeId': { $exists: false } },
                  { 'homeLocation.placeId': null },
                  { 'homeLocation.placeId': '' },
                ],
              },
            ],
          },
          {
            $and: [
              {
                $or: [
                  { 'secondaryLocation.city': { $exists: true, $nin: [null, ''] } },
                  { 'secondaryLocation.country': { $exists: true, $nin: [null, ''] } },
                ],
              },
              {
                $or: [
                  { 'secondaryLocation.placeId': { $exists: false } },
                  { 'secondaryLocation.placeId': null },
                  { 'secondaryLocation.placeId': '' },
                ],
              },
            ],
          },
        ],
      },
    ],
  }).select('username homeLocation secondaryLocation');

  if (LIMIT) {
    userQuery = userQuery.limit(LIMIT);
  }

  const toProcess = await userQuery;

  console.log(`\n👤 Phase 1: ${toProcess.length} user(s) with text homeLocation need Mapbox resolve`);

  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const user of toProcess) {
    let updatedUser = false;

    for (const field of ['homeLocation', 'secondaryLocation']) {
      const location = user[field];
      if (!needsMapboxResolve(location)) continue;

      const query = buildGeocodeQuery(location);
      try {
        const resolved = await resolveHomeLocation(location);
        if (!resolved?.placeId) {
          console.log(`  ⚠️  No Mapbox match for @${user.username} ${field}: "${query}"`);
          continue;
        }

        const merged = applyResolvedLocation(resolved, location);
        console.log(`  ✓ @${user.username} ${field}: "${query}" → ${merged.display || merged.placeId}`);

        if (!DRY_RUN) {
          user[field] = merged;
          updatedUser = true;
        }
        updated += 1;
      } catch (error) {
        console.error(`  ✗ @${user.username} ${field}: "${query}" — ${error.message}`);
        failed += 1;
      }
    }

    if (!DRY_RUN && updatedUser) {
      await user.save();
    }
  }

  console.log(`👤 Users: ${updated} updated, ${skipped} skipped, ${failed} failed/unmatched`);
  return { updated, skipped, failed };
}

async function backfillBids() {
  let bidScopeQuery = { ...bidMissingLocationQuery() };

  if (PODCASTS_ONLY) {
    const podcastMediaIds = await getPodcastEpisodeMediaIds();
    bidScopeQuery.mediaId = { $in: podcastMediaIds };
    console.log(`\n🎙️  Scoping to ${podcastMediaIds.length} podcast episode(s)`);
  }

  const userIds = await Bid.distinct('userId', bidScopeQuery);
  let ids = userIds;

  if (LIMIT) {
    ids = userIds.slice(0, LIMIT);
  }

  console.log(`\n💰 Phase 2: ${ids.length} user(s) have active bids missing location snapshots`);

  let bidsUpdated = 0;
  let usersSkipped = 0;
  let usersProcessed = 0;

  for (const userId of ids) {
    const user = await User.findById(userId).select('username homeLocation secondaryLocation');
    if (!user) {
      usersSkipped += 1;
      continue;
    }

    for (const field of ['homeLocation', 'secondaryLocation']) {
      const location = user[field];
      if (!needsMapboxResolve(location)) continue;

      try {
        const resolved = await resolveHomeLocation(location);
        if (resolved?.placeId) {
          user[field] = applyResolvedLocation(resolved, location);
          if (!DRY_RUN) {
            await user.save();
          }
          console.log(`  ↳ Geocoded @${user.username} ${field} for bid snapshot`);
        }
      } catch (error) {
        console.error(`  ✗ Geocode failed for @${user.username} ${field}: ${error.message}`);
      }
    }

    const snapshot = snapshotFromUser(user);
    if (!snapshot) {
      console.log(`  ⚠️  No snapshot for @${user.username} — missing resolved home/secondary location`);
      usersSkipped += 1;
      continue;
    }

    const matchQuery = { ...bidScopeQuery, userId: user._id };
    const count = await Bid.countDocuments(matchQuery);

    if (count === 0) {
      usersSkipped += 1;
      continue;
    }

    console.log(`  ✓ @${user.username}: ${count} bid(s) → ${snapshot.bidderLocationDisplay}`);

    if (!DRY_RUN) {
      const result = await Bid.updateMany(matchQuery, { $set: snapshot });
      bidsUpdated += result.modifiedCount;
    } else {
      bidsUpdated += count;
    }

    usersProcessed += 1;
  }

  console.log(`💰 Bids: ${bidsUpdated} would update / updated, ${usersProcessed} users processed, ${usersSkipped} users skipped`);
  return { bidsUpdated, usersProcessed, usersSkipped };
}

async function main() {
  const mongoUri = getMongoUri();
  if (!mongoUri) {
    console.error('❌ Set MONGO_URI or MONGODB_URI');
    process.exit(1);
  }
  if (!process.env.MAPBOX_ACCESS_TOKEN) {
    console.error('❌ Set MAPBOX_ACCESS_TOKEN');
    process.exit(1);
  }

  console.log(DRY_RUN ? '🔍 DRY RUN (pass --execute to apply)' : '🚀 EXECUTE MODE');
  if (useProductionEnv) console.log('   Environment: .env.production');
  if (LIMIT) console.log(`   Limit: ${LIMIT}`);
  if (PODCASTS_ONLY) console.log('   Scope: podcast episode bids only');
  console.log(`   Mapbox delay: ${DELAY_MS}ms between geocode calls`);

  await mongoose.connect(mongoUri);
  console.log('✅ Connected to MongoDB');

  const stats = { users: null, bids: null };

  if (!BIDS_ONLY) {
    stats.users = await backfillUsers();
  }

  if (!USERS_ONLY) {
    stats.bids = await backfillBids();
  }

  console.log('\n📊 Summary:', JSON.stringify(stats, null, 2));
  await mongoose.disconnect();
  console.log('Done.');
}

main().catch((error) => {
  console.error('Fatal:', error);
  mongoose.disconnect().finally(() => process.exit(1));
});
