const mongoose = require('mongoose');
const {
  founderTipWindows,
  founderTipTotal,
  collectiveRankingAggregate,
  freezeFounderTipScope,
} = require('../utils/collectiveFounderTips');

let backfillPromise = null;

function toObjectId(id) {
  if (!mongoose.Types.ObjectId.isValid(id)) return null;
  return new mongoose.Types.ObjectId(String(id));
}

async function loadActiveTips(userIds) {
  if (!userIds.length) return [];
  const Bid = require('../models/Bid');
  const oids = userIds.map(toObjectId).filter(Boolean);
  if (!oids.length) return [];
  return Bid.find({ status: 'active', userId: { $in: oids } })
    .select('userId amount createdAt status')
    .lean();
}

async function computeFounderTipTotals(collectives) {
  const windowsByCollective = new Map();
  const userIds = new Set();

  for (const collective of collectives) {
    const windows = founderTipWindows(collective);
    windowsByCollective.set(String(collective._id), windows);
    for (const window of windows) userIds.add(window.userId);
  }

  const tips = await loadActiveTips([...userIds]);
  const totals = new Map();
  for (const collective of collectives) {
    const id = String(collective._id);
    totals.set(id, founderTipTotal(windowsByCollective.get(id), tips));
  }
  return totals;
}

async function persistFounderTipAggregates(collectives) {
  if (!collectives.length) return;
  const Collective = require('../models/Collective');
  for (const collective of collectives) {
    let changed = false;
    for (const member of collective.members || []) {
      if (freezeFounderTipScope(collective, member)) changed = true;
    }
    if (changed && typeof collective.save === 'function') {
      await collective.save();
    }
  }
  const totals = await computeFounderTipTotals(collectives);
  const ops = collectives.map((collective) => {
    const founderTipAggregate = totals.get(String(collective._id)) || 0;
    return {
      updateOne: {
        filter: { _id: collective._id },
        update: {
          $set: {
            'stats.founderTipAggregate': founderTipAggregate,
            'stats.rankingAggregate': collectiveRankingAggregate(
              collective.stats?.globalCollectiveAggregate,
              founderTipAggregate
            ),
            'stats.founderTipsCalculatedAt': new Date(),
          },
        },
      },
    };
  });
  await Collective.bulkWrite(ops);
}

async function recomputeCollectiveGlobalRanks() {
  const Collective = require('../models/Collective');
  const collectives = await Collective.find({ isActive: { $ne: false } })
    .select('_id stats.rankingAggregate stats.globalRank stats.percentile')
    .sort({ 'stats.rankingAggregate': -1, _id: 1 })
    .lean();

  const total = collectives.length;
  const ops = [];
  collectives.forEach((collective, index) => {
    const globalRank = index + 1;
    const percentile = total > 0
      ? Math.round(((total - index) / total) * 1000) / 10
      : 0;
    if (collective.stats?.globalRank === globalRank && collective.stats?.percentile === percentile) {
      return;
    }
    ops.push({
      updateOne: {
        filter: { _id: collective._id },
        update: { $set: { 'stats.globalRank': globalRank, 'stats.percentile': percentile } },
      },
    });
  });

  if (ops.length) await Collective.bulkWrite(ops);
}

async function refreshCollectiveFounderRanking(collectiveId) {
  const Collective = require('../models/Collective');
  const collective = await Collective.findOne({
    _id: collectiveId,
    isActive: { $ne: false },
  }).select('_id createdAt members stats.globalCollectiveAggregate');

  if (!collective) return;
  await persistFounderTipAggregates([collective]);
  await recomputeCollectiveGlobalRanks();
}

async function refreshFounderRankingsForUser(userId) {
  if (!userId) return;
  const Collective = require('../models/Collective');
  const collectives = await Collective.find({
    isActive: { $ne: false },
    members: { $elemMatch: { userId, role: 'founder' } },
  }).select('_id createdAt members stats.globalCollectiveAggregate');

  if (!collectives.length) return;
  await persistFounderTipAggregates(collectives);
  await recomputeCollectiveGlobalRanks();
}

async function refreshAllCollectiveFounderRankings() {
  const Collective = require('../models/Collective');
  const collectives = await Collective.find({ isActive: { $ne: false } })
    .select('_id createdAt members stats.globalCollectiveAggregate');
  await persistFounderTipAggregates(collectives);
  await recomputeCollectiveGlobalRanks();
}

async function ensureCollectiveFounderRankings() {
  const Collective = require('../models/Collective');
  const missing = await Collective.exists({
    isActive: { $ne: false },
    'stats.founderTipsCalculatedAt': { $exists: false },
  });
  if (!missing) return;
  if (!backfillPromise) {
    backfillPromise = refreshAllCollectiveFounderRankings().finally(() => {
      backfillPromise = null;
    });
  }
  await backfillPromise;
}

module.exports = {
  refreshCollectiveFounderRanking,
  refreshFounderRankingsForUser,
  refreshAllCollectiveFounderRankings,
  ensureCollectiveFounderRankings,
};
