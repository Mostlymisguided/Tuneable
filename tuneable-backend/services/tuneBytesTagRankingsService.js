const mongoose = require('mongoose');

const RANKINGS_FRESH_MS = 60 * 60 * 1000;

/** userId string -> in-flight recalculation promise, so concurrent views share one run. */
const recalculationsInFlight = new Map();

function recalculateDeduped(actualUserId, limit) {
  const key = actualUserId.toString();
  const existing = recalculationsInFlight.get(key);
  if (existing) return existing;

  const run = recalculateUserTuneBytesTagRankings(actualUserId, limit).finally(() => {
    recalculationsInFlight.delete(key);
  });
  recalculationsInFlight.set(key, run);
  return run;
}

async function recalculateUserTuneBytesTagRankings(actualUserId, limit) {
  const User = require('../models/User');
  const TuneBytesTransaction = require('../models/TuneBytesTransaction');
  const Media = require('../models/Media');

  console.log(`🎁 Calculating TuneBytes tag rankings for user ${actualUserId}`);

  const tagAggregates = await TuneBytesTransaction.aggregate([
    { $match: { userId: actualUserId, status: 'confirmed' } },
    { $lookup: { from: 'media', localField: 'mediaId', foreignField: '_id', as: 'media' } },
    { $unwind: '$media' },
    { $match: { 'media.tags': { $exists: true, $ne: [] } } },
    { $unwind: '$media.tags' },
    {
      $group: {
        _id: '$media.tags',
        tuneBytesEarned: { $sum: '$tuneBytesEarned' }
      }
    },
    { $sort: { tuneBytesEarned: -1 } }
  ]);

  const tagRankings = [];

  for (const { _id: tag, tuneBytesEarned } of tagAggregates) {
    if (tuneBytesEarned <= 0) continue;

    const mediaWithTag = await Media.find({ tags: tag }).select('_id').lean();
    const mediaIds = mediaWithTag.map((m) => m._id);
    if (mediaIds.length === 0) continue;

    const userTotals = await TuneBytesTransaction.aggregate([
      { $match: { mediaId: { $in: mediaIds }, status: 'confirmed' } },
      { $group: { _id: '$userId', total: { $sum: '$tuneBytesEarned' } } },
      { $sort: { total: -1 } }
    ]);

    const actualUserIdStr = actualUserId.toString();
    const rankIndex = userTotals.findIndex((entry) => entry._id.toString() === actualUserIdStr);
    const rank = rankIndex >= 0 ? rankIndex + 1 : userTotals.length + 1;
    const totalUsers = userTotals.length;
    const percentile = totalUsers > 0 ? parseFloat(((totalUsers - rank) / totalUsers * 100).toFixed(1)) : 0;

    tagRankings.push({
      tag,
      tuneBytesEarned,
      rank,
      totalUsers,
      percentile,
      lastUpdated: new Date()
    });
  }

  tagRankings.sort((a, b) => b.tuneBytesEarned - a.tuneBytesEarned);
  const limitedRankings = tagRankings.slice(0, limit);

  await User.findByIdAndUpdate(actualUserId, {
    tuneBytesTagRankings: limitedRankings,
    tuneBytesTagRankingsUpdatedAt: new Date()
  });

  console.log(`✅ Updated TuneBytes tag rankings for user ${actualUserId}: ${limitedRankings.length} tags`);
  return limitedRankings;
}

/**
 * Get TuneBytes tag rankings for a user.
 * Ranks users by total TuneBytes earned per tag (full credit to each tag on a tune).
 * Stale rankings are returned immediately and refreshed in the background; only
 * a user with nothing stored (or forceRecalculate) waits for the recalculation.
 */
async function calculateAndUpdateUserTuneBytesTagRankings(userId, limit = 10, forceRecalculate = false) {
  try {
    const User = require('../models/User');

    let actualUserId;
    if (mongoose.Types.ObjectId.isValid(userId)) {
      actualUserId = typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId;
    } else {
      const user = await User.findOne({ uuid: userId }).select('_id');
      if (!user) throw new Error('User not found');
      actualUserId = user._id;
    }

    const user = await User.findById(actualUserId).select('tuneBytesTagRankings tuneBytesTagRankingsUpdatedAt');
    if (!user) throw new Error('User not found');

    const updatedAt = user.tuneBytesTagRankingsUpdatedAt;
    const cached = user.tuneBytesTagRankings || [];

    if (forceRecalculate) {
      return await recalculateDeduped(actualUserId, limit);
    }

    if (updatedAt && updatedAt.getTime() > Date.now() - RANKINGS_FRESH_MS) {
      return cached;
    }

    // Invalidation unsets updatedAt but keeps the old list, which is still worth serving.
    if (updatedAt || cached.length > 0) {
      recalculateDeduped(actualUserId, limit).catch((error) => {
        console.error('❌ Background TuneBytes tag rankings refresh failed:', error);
      });
      return cached;
    }

    return await recalculateDeduped(actualUserId, limit);
  } catch (error) {
    console.error('❌ Error calculating TuneBytes tag rankings:', error);
    throw error;
  }
}

async function invalidateUserTuneBytesTagRankings(userId) {
  try {
    const User = require('../models/User');

    let actualUserId;
    if (mongoose.Types.ObjectId.isValid(userId)) {
      actualUserId = typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId;
    } else {
      const user = await User.findOne({ uuid: userId }).select('_id');
      if (!user) return;
      actualUserId = user._id;
    }

    await User.findByIdAndUpdate(actualUserId, {
      $unset: { tuneBytesTagRankingsUpdatedAt: 1 }
    });
  } catch (error) {
    console.error('❌ Error invalidating TuneBytes tag rankings:', error);
  }
}

module.exports = {
  calculateAndUpdateUserTuneBytesTagRankings,
  invalidateUserTuneBytesTagRankings
};
