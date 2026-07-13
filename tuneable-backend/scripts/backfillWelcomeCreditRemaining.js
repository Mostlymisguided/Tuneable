/**
 * Backfill welcomeCreditRemainingPence for users who received beta/welcome credit
 * before remaining-credit tracking existed.
 *
 * Reconstructs remaining with promo-first accounting:
 *   - Grants (WalletTransaction type beta_credit) increase remaining
 *   - Tips/pledges consume remaining first
 *   - Tip/pledge refunds restore the welcome portion that funded them
 *   - Revokes (beta_credit_revoke) clear remaining
 *
 * Also backfills welcomeCreditAppliedPence on historical bids/pledges when missing,
 * so future refunds restore welcome credit correctly.
 *
 * Usage (from repo root or tuneable-backend):
 *   node tuneable-backend/scripts/backfillWelcomeCreditRemaining.js
 *   node tuneable-backend/scripts/backfillWelcomeCreditRemaining.js --execute
 *   node tuneable-backend/scripts/backfillWelcomeCreditRemaining.js --execute --force
 *   node tuneable-backend/scripts/backfillWelcomeCreditRemaining.js --execute --production
 *   node tuneable-backend/scripts/backfillWelcomeCreditRemaining.js --execute --limit 20
 *
 * Requires: MONGO_URI or MONGODB_URI
 * Default is dry-run (no writes). Pass --execute to persist.
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
const WalletTransaction = require('../models/WalletTransaction');
const Conversation = require('../models/Conversation');

const DRY_RUN = !args.includes('--execute');
const FORCE = args.includes('--force');
const LIMIT = (() => {
  const idx = args.indexOf('--limit');
  return idx >= 0 ? parseInt(args[idx + 1], 10) : null;
})();

function getMongoUri() {
  return process.env.MONGO_URI || process.env.MONGODB_URI;
}

function eventTime(dateLike, fallback = 0) {
  if (!dateLike) return fallback;
  const t = new Date(dateLike).getTime();
  return Number.isFinite(t) ? t : fallback;
}

/**
 * Replay promo-first welcome credit for one user.
 * @returns {{ remaining: number, grantTotal: number, bidUpdates: Map, pledgeUpdates: Array }}
 */
function replayWelcomeCredit({ grants, revokes, bids, pledges }) {
  const events = [];

  for (const g of grants) {
    events.push({
      kind: 'grant',
      at: eventTime(g.createdAt),
      amount: g.amount || 0,
      id: g._id?.toString(),
    });
  }

  for (const r of revokes) {
    events.push({
      kind: 'revoke',
      at: eventTime(r.createdAt),
      amount: r.amount || 0,
      id: r._id?.toString(),
    });
  }

  for (const bid of bids) {
    const bidId = bid._id.toString();
    const createdAt = eventTime(bid.createdAt);
    events.push({
      kind: 'bid_spend',
      at: createdAt,
      amount: bid.amount || 0,
      bidId,
      existingApplied: bid.welcomeCreditAppliedPence,
    });

    if (bid.status === 'refunded' || bid.status === 'vetoed') {
      const refundAt = eventTime(
        bid.refundedAt || bid.vetoedAt || bid.updatedAt,
        createdAt + 1
      );
      events.push({
        kind: 'bid_refund',
        at: Math.max(refundAt, createdAt + 1),
        bidId,
      });
    }
  }

  for (const p of pledges) {
    const pledgeKey = `${p.conversationId}:${p.pledgeId}`;
    const createdAt = eventTime(p.createdAt);
    events.push({
      kind: 'pledge_spend',
      at: createdAt,
      amount: p.amount || 0,
      pledgeKey,
      conversationId: p.conversationId,
      pledgeId: p.pledgeId,
      existingApplied: p.welcomeCreditAppliedPence,
    });

    if (p.status === 'refunded') {
      const refundAt = eventTime(p.refundedAt || p.updatedAt, createdAt + 1);
      events.push({
        kind: 'pledge_refund',
        at: Math.max(refundAt, createdAt + 1),
        pledgeKey,
      });
    }
  }

  events.sort((a, b) => {
    if (a.at !== b.at) return a.at - b.at;
    // Stable-ish ordering when timestamps collide: grants before spends before refunds
    const order = { grant: 0, revoke: 1, bid_spend: 2, pledge_spend: 3, bid_refund: 4, pledge_refund: 5 };
    return (order[a.kind] ?? 9) - (order[b.kind] ?? 9);
  });

  let remaining = 0;
  let grantTotal = 0;
  const appliedByBid = new Map(); // bidId -> applied pence from replay
  const appliedByPledge = new Map();
  const bidUpdates = new Map(); // bidId -> applied to write
  const pledgeUpdates = [];

  for (const ev of events) {
    if (ev.kind === 'grant') {
      remaining += ev.amount;
      grantTotal += ev.amount;
      continue;
    }

    if (ev.kind === 'revoke') {
      remaining = 0;
      continue;
    }

    if (ev.kind === 'bid_spend') {
      const applied = Math.min(remaining, ev.amount);
      remaining -= applied;
      appliedByBid.set(ev.bidId, applied);
      // Backfill applied when missing/zero but replay found a welcome portion,
      // or when FORCE and value differs.
      const existing = ev.existingApplied || 0;
      if (existing === 0 && applied > 0) {
        bidUpdates.set(ev.bidId, applied);
      } else if (FORCE && existing !== applied) {
        bidUpdates.set(ev.bidId, applied);
      }
      continue;
    }

    if (ev.kind === 'bid_refund') {
      const applied = appliedByBid.get(ev.bidId) || 0;
      remaining += applied;
      continue;
    }

    if (ev.kind === 'pledge_spend') {
      const applied = Math.min(remaining, ev.amount);
      remaining -= applied;
      appliedByPledge.set(ev.pledgeKey, applied);
      const existing = ev.existingApplied || 0;
      if (existing === 0 && applied > 0) {
        pledgeUpdates.push({
          conversationId: ev.conversationId,
          pledgeId: ev.pledgeId,
          applied,
        });
      } else if (FORCE && existing !== applied) {
        pledgeUpdates.push({
          conversationId: ev.conversationId,
          pledgeId: ev.pledgeId,
          applied,
        });
      }
      continue;
    }

    if (ev.kind === 'pledge_refund') {
      const applied = appliedByPledge.get(ev.pledgeKey) || 0;
      remaining += applied;
    }
  }

  return {
    remaining: Math.max(0, remaining),
    grantTotal,
    bidUpdates,
    pledgeUpdates,
  };
}

async function loadPledgesForUser(userId) {
  const conversations = await Conversation.find({
    'pledges.userId': userId,
  })
    .select('pledges')
    .lean();

  const pledges = [];
  for (const conversation of conversations) {
    for (const pledge of conversation.pledges || []) {
      if (!pledge.userId || pledge.userId.toString() !== userId.toString()) continue;
      pledges.push({
        conversationId: conversation._id.toString(),
        pledgeId: pledge._id.toString(),
        amount: pledge.amount || 0,
        status: pledge.status,
        createdAt: pledge.createdAt,
        refundedAt: pledge.refundedAt,
        welcomeCreditAppliedPence: pledge.welcomeCreditAppliedPence || 0,
      });
    }
  }
  return pledges;
}

async function backfillWelcomeCreditRemaining() {
  const mongoUri = getMongoUri();
  if (!mongoUri) {
    console.error('❌ MONGO_URI or MONGODB_URI is required');
    process.exit(1);
  }

  console.log(DRY_RUN ? '🔍 DRY RUN (pass --execute to write)' : '✍️  EXECUTE mode — will write changes');
  if (FORCE) console.log('⚠️  --force: will overwrite existing remaining / applied values');
  if (useProductionEnv) console.log('🌐 Using .env.production');

  console.log('🔌 Connecting to MongoDB...');
  await mongoose.connect(mongoUri);
  console.log('✅ Connected');

  const grantUserIds = await WalletTransaction.distinct('userId', {
    type: 'beta_credit',
    status: 'completed',
  });

  console.log(`📊 Found ${grantUserIds.length} users with completed welcome credit grants`);

  let userIds = grantUserIds;
  if (!FORCE) {
    const alreadyTracked = await User.find({
      _id: { $in: grantUserIds },
      welcomeCreditRemainingPence: { $gt: 0 },
    })
      .select('_id')
      .lean();
    const skipSet = new Set(alreadyTracked.map((u) => u._id.toString()));
    userIds = grantUserIds.filter((id) => !skipSet.has(id.toString()));
    console.log(`⏭️  Skipping ${skipSet.size} users who already have remaining > 0 (use --force to include)`);
  }

  if (LIMIT && LIMIT > 0) {
    userIds = userIds.slice(0, LIMIT);
    console.log(`🔢 Limiting to first ${userIds.length} users`);
  }

  let updatedUsers = 0;
  let unchangedUsers = 0;
  let updatedBids = 0;
  let updatedPledges = 0;
  let totalRemainingSet = 0;

  for (const userId of userIds) {
    const user = await User.findById(userId);
    if (!user) continue;

    const [grants, revokes, bids, pledges] = await Promise.all([
      WalletTransaction.find({
        userId,
        type: 'beta_credit',
        status: 'completed',
      })
        .select('amount createdAt')
        .lean(),
      WalletTransaction.find({
        userId,
        type: 'beta_credit_revoke',
        status: 'completed',
      })
        .select('amount createdAt')
        .lean(),
      Bid.find({ userId })
        .select('amount status createdAt updatedAt refundedAt vetoedAt welcomeCreditAppliedPence')
        .lean(),
      loadPledgesForUser(userId),
    ]);

    if (grants.length === 0) {
      unchangedUsers++;
      continue;
    }

    const { remaining, grantTotal, bidUpdates, pledgeUpdates } = replayWelcomeCredit({
      grants,
      revokes,
      bids,
      pledges,
    });

    const clampedRemaining = Math.min(remaining, Math.max(0, user.balance || 0));
    const previousRemaining = user.welcomeCreditRemainingPence || 0;

    // First backfill: only touch users with remaining still at default 0 (unless --force)
    const writeUser = FORCE || previousRemaining === 0;
    const userValueChanges = previousRemaining !== clampedRemaining;

    console.log(
      `👤 ${user.username}: grant £${(grantTotal / 100).toFixed(2)} → ` +
        `remaining £${(clampedRemaining / 100).toFixed(2)}` +
        (clampedRemaining !== remaining ? ` (clamped from £${(remaining / 100).toFixed(2)})` : '') +
        ` | was £${(previousRemaining / 100).toFixed(2)}` +
        ` | bid applied updates: ${bidUpdates.size}, pledge updates: ${pledgeUpdates.length}`
    );

    if (!writeUser) {
      unchangedUsers++;
      continue;
    }

    if (!DRY_RUN) {
      if (userValueChanges) {
        await User.updateOne(
          { _id: user._id },
          { $set: { welcomeCreditRemainingPence: clampedRemaining } }
        );
        updatedUsers++;
        totalRemainingSet += clampedRemaining;
      } else {
        unchangedUsers++;
      }

      for (const [bidId, applied] of bidUpdates.entries()) {
        await Bid.updateOne(
          { _id: bidId },
          { $set: { welcomeCreditAppliedPence: applied } }
        );
        updatedBids++;
      }

      for (const upd of pledgeUpdates) {
        await Conversation.updateOne(
          { _id: upd.conversationId, 'pledges._id': upd.pledgeId },
          { $set: { 'pledges.$.welcomeCreditAppliedPence': upd.applied } }
        );
        updatedPledges++;
      }
    } else {
      if (userValueChanges) {
        updatedUsers++;
        totalRemainingSet += clampedRemaining;
      } else {
        unchangedUsers++;
      }
      updatedBids += bidUpdates.size;
      updatedPledges += pledgeUpdates.length;
    }
  }

  console.log('\n======= Summary =======');
  console.log(`Users processed: ${userIds.length}`);
  console.log(`Users ${DRY_RUN ? 'would update' : 'updated'}: ${updatedUsers}`);
  console.log(`Users unchanged: ${unchangedUsers}`);
  console.log(`Bids ${DRY_RUN ? 'would update' : 'updated'} (welcomeCreditAppliedPence): ${updatedBids}`);
  console.log(`Pledges ${DRY_RUN ? 'would update' : 'updated'} (welcomeCreditAppliedPence): ${updatedPledges}`);
  console.log(`Total remaining credit ${DRY_RUN ? 'to set' : 'set'}: £${(totalRemainingSet / 100).toFixed(2)}`);
  if (DRY_RUN) {
    console.log('\nRe-run with --execute to apply changes.');
  }

  await mongoose.connection.close();
  console.log('✅ Done');
}

backfillWelcomeCreditRemaining().catch(async (err) => {
  console.error('❌ Backfill failed:', err);
  try {
    await mongoose.connection.close();
  } catch (_) {
    // ignore
  }
  process.exit(1);
});
