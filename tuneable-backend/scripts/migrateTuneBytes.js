#!/usr/bin/env node

/**
 * Recalculate TuneBytes for every media item that has tips or existing awards.
 *
 * Uses the current formula (later growth only) and applies deltas, so:
 *   - sole tippers are clawed back to 0
 *   - missing awards for tracks that did grow are filled in
 *   - earlier tippers catch up when later tips already exist
 *
 * Usage: node scripts/migrateTuneBytes.js [--dry-run] [--batch-size=50]
 */

const mongoose = require('mongoose');
require('dotenv').config();

const Bid = require('../models/Bid');
const TuneBytesTransaction = require('../models/TuneBytesTransaction');
const tuneBytesService = require('../services/tuneBytesService');
const { computeTuneBytesFromBids } = require('../services/tuneBytesCalculator');

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const batchSizeArg = args.find((arg) => arg.startsWith('--batch-size='));
const batchSize = batchSizeArg ? parseInt(batchSizeArg.split('=')[1], 10) : 50;

console.log('🚀 TuneBytes Recalculation');
console.log('==========================');
console.log(`Mode: ${isDryRun ? 'DRY RUN (no changes)' : 'LIVE RUN'}`);
console.log(`Batch Size: ${batchSize}`);
console.log('');

async function connectToDatabase() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/tuneable', {
    serverSelectionTimeoutMS: 5000,
  });
  console.log('✅ Connected to MongoDB');
}

async function getMediaIds() {
  const [fromBids, fromTx] = await Promise.all([
    Bid.distinct('mediaId', { status: 'active' }),
    TuneBytesTransaction.distinct('mediaId'),
  ]);
  const ids = new Map();
  for (const id of fromBids) {
    if (id) ids.set(id.toString(), id);
  }
  for (const id of fromTx) {
    if (id) ids.set(id.toString(), id);
  }
  return [...ids.values()];
}

async function previewMedia(mediaId) {
  const activeBids = await Bid.find({ mediaId, status: 'active' })
    .sort({ createdAt: 1, _id: 1 })
    .populate('userId', 'username')
    .populate('mediaId', 'title');
  const transactions = await TuneBytesTransaction.find({ mediaId });
  const txByBid = new Map(transactions.map((tx) => [tx.bidId.toString(), tx]));

  const rows = [];
  for (const bid of activeBids) {
    const next = computeTuneBytesFromBids(bid._id, activeBids).tuneBytesEarned;
    const current = txByBid.get(bid._id.toString())?.tuneBytesEarned || 0;
    const delta = next - current;
    if (Math.abs(delta) >= 0.0001 || next > 0) {
      rows.push({
        username: bid.userId?.username || 'unknown',
        title: bid.mediaId?.title || String(mediaId),
        current,
        next,
        delta,
      });
    }
    txByBid.delete(bid._id.toString());
  }
  for (const tx of txByBid.values()) {
    if ((tx.tuneBytesEarned || 0) > 0) {
      rows.push({
        username: tx.username || 'unknown',
        title: tx.mediaTitle || String(mediaId),
        current: tx.tuneBytesEarned,
        next: 0,
        delta: -tx.tuneBytesEarned,
      });
    }
  }
  return rows;
}

async function main() {
  try {
    await connectToDatabase();
    const mediaIds = await getMediaIds();
    console.log(`Found ${mediaIds.length} media items to settle\n`);

    if (mediaIds.length === 0) {
      console.log('ℹ️  Nothing to do.');
      return;
    }

    let processed = 0;
    let errors = 0;
    let balancesChanged = 0;
    let netTuneBytes = 0;

    for (let i = 0; i < mediaIds.length; i += batchSize) {
      const batch = mediaIds.slice(i, i + batchSize);
      console.log(
        `📦 Batch ${Math.floor(i / batchSize) + 1} (media ${i + 1}-${i + batch.length})`
      );

      for (const mediaId of batch) {
        try {
          if (isDryRun) {
            const rows = await previewMedia(mediaId);
            for (const row of rows) {
              if (Math.abs(row.delta) < 0.0001) continue;
              netTuneBytes += row.delta;
              const sign = row.delta > 0 ? '+' : '';
              console.log(
                `  [DRY RUN] ${row.username} on "${row.title}": ${row.current.toFixed(2)} → ${row.next.toFixed(2)} (${sign}${row.delta.toFixed(2)})`
              );
            }
          } else {
            const result = await tuneBytesService.recalculateTuneBytesForMedia(mediaId, {
              skipLedgerEntry: true,
              notify: false,
              updateRankings: false,
            });
            balancesChanged += result.balancesChanged || 0;
            for (const bid of result.bids || []) {
              if (Math.abs(bid.delta || 0) < 0.0001) continue;
              netTuneBytes += bid.delta;
            }
          }
          processed += 1;
        } catch (error) {
          errors += 1;
          console.error(`  ❌ ${mediaId}: ${error.message}`);
        }
      }

      if (i + batchSize < mediaIds.length) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    }

    console.log('\n📊 Summary');
    console.log(`  Media processed: ${processed}`);
    console.log(`  Errors: ${errors}`);
    console.log(
      `  Net TuneBytes ${isDryRun ? 'that would change' : 'changed'}: ${netTuneBytes.toFixed(2)}`
    );
    if (!isDryRun) {
      console.log(`  Bid balances updated: ${balancesChanged}`);
      console.log('\n✅ Recalculation complete.');
    } else {
      console.log('\n🔍 Dry run complete. Re-run without --dry-run to apply.');
    }
  } catch (error) {
    console.error('❌ Recalculation failed:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('\n👋 Disconnected from MongoDB');
  }
}

process.on('SIGINT', async () => {
  console.log('\n⚠️  Interrupted');
  await mongoose.disconnect();
  process.exit(0);
});

main().catch((error) => {
  console.error('❌ Unexpected error:', error);
  process.exit(1);
});
