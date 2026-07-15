const mongoose = require('mongoose');

/**
 * Calculate and update TuneBytes tag rankings for a user.
 * Ranks users by total TuneBytes earned per tag (full credit to each tag on a tune).
 */
async function calculateAndUpdateUserTuneBytesTagRankings(userId, limit = 10, forceRecalculate = false) {
  try {
    const User = require('../models/User');
    const TuneBytesTransaction = require('../models/TuneBytesTransaction');
    const Media = require('../models/Media');

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

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    if (!forceRecalculate && user.tuneBytesTagRankingsUpdatedAt && user.tuneBytesTagRankingsUpdatedAt > oneHourAgo) {
      return user.tuneBytesTagRankings || [];
    }

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
