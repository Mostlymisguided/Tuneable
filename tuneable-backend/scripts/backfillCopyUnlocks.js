/**
 * Replay every tip on each work and store who earned a copy.
 * Early tippers who were in the most generous half at the time keep it
 * even if later tips raised the line.
 *
 * Dry run by default. Pass --execute to write CopyUnlock documents.
 *
 *   node scripts/backfillCopyUnlocks.js
 *   node scripts/backfillCopyUnlocks.js --execute
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Bid = require('../models/Bid');
const { replayCopyUnlocks } = require('../utils/generousHalf');
const { replayMediaUnlocks } = require('../services/copyAccessService');

async function main() {
  const execute = process.argv.includes('--execute');
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) {
    console.error('MONGODB_URI is not set');
    process.exit(1);
  }

  await mongoose.connect(uri);
  const mediaIds = await Bid.distinct('mediaId');
  console.log(`${mediaIds.length} works with tips. ${execute ? 'Writing' : 'Dry run'}.`);

  let unlocked = 0;
  for (const mediaId of mediaIds) {
    if (execute) {
      unlocked += await replayMediaUnlocks(mediaId);
      continue;
    }
    const bids = await Bid.find({ mediaId })
      .select('userId amount status createdAt refundedAt vetoedAt')
      .lean();
    const events = [];
    for (const bid of bids) {
      const userId = String(bid.userId);
      events.push({
        at: new Date(bid.createdAt).getTime(),
        type: 'tip',
        userId,
        amount: bid.amount,
      });
      if (bid.status !== 'active') {
        events.push({
          at: new Date(bid.refundedAt || bid.vetoedAt || bid.createdAt).getTime(),
          type: 'reverse',
          userId,
          amount: bid.amount,
        });
      }
    }
    unlocked += replayCopyUnlocks(events).length;
  }

  console.log(`${execute ? 'Stored' : 'Would store'} ${unlocked} copy unlocks.`);
  await mongoose.disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
