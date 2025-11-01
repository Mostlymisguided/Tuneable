const mongoose = require('mongoose');

/**
 * Calculate and update tag rankings for a user
 * This service calculates the user's rank for each tag they've bid on
 * and stores the top tags (up to limit) in the user model for fast access
 * 
 * @param {ObjectId|String} userId - User ID (ObjectId or string)
 * @param {Number} limit - Maximum number of tag rankings to store (default: 10)
 * @param {Boolean} forceRecalculate - Force recalculation even if recently updated
 */
async function calculateAndUpdateUserTagRankings(userId, limit = 10, forceRecalculate = false) {
  try {
    const User = require('../models/User');
    const Bid = require('../models/Bid');
    const Media = require('../models/Media');

    // Resolve user ID
    let actualUserId;
    if (mongoose.Types.ObjectId.isValid(userId)) {
      actualUserId = typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId;
    } else {
      // Try UUID
      const user = await User.findOne({ uuid: userId }).select('_id');
      if (!user) {
        throw new Error('User not found');
      }
      actualUserId = user._id;
    }

    // Check if we need to recalculate (if updated recently and not forcing)
    const user = await User.findById(actualUserId).select('tagRankingsUpdatedAt');
    if (!user) {
      throw new Error('User not found');
    }

    // Only recalculate if:
    // 1. Never calculated before, OR
    // 2. Force recalculate is true, OR
    // 3. Last updated more than 1 hour ago (stale threshold)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    if (!forceRecalculate && user.tagRankingsUpdatedAt && user.tagRankingsUpdatedAt > oneHourAgo) {
      console.log(`⏭️  Skipping tag rankings recalculation for user ${actualUserId} - updated recently`);
      return user.tagRankings || [];
    }

    console.log(`🏷️  Calculating tag rankings for user ${actualUserId}`);

    // Get all active bids by this user
    const userBids = await Bid.find({ 
      userId: actualUserId,
      status: 'active'
    })
      .populate('mediaId', 'tags')
      .lean();

    console.log(`📊 Found ${userBids.length} active bids for user`);

    // Aggregate by tag (GlobalUserTagAggregate)
    const tagAggregates = {};
    userBids.forEach(bid => {
      if (bid.mediaId?.tags && Array.isArray(bid.mediaId.tags)) {
        bid.mediaId.tags.forEach(tag => {
          tagAggregates[tag] = (tagAggregates[tag] || 0) + bid.amount;
        });
      }
    });

    console.log(`📊 User has bid on ${Object.keys(tagAggregates).length} different tags`);

    // Calculate GlobalUserTagAggregateRank for each tag
    const tagRankings = [];
    
    for (const [tag, userAggregate] of Object.entries(tagAggregates)) {
      // Get all media with this tag
      const mediaWithTag = await Media.find({ tags: tag }).select('_id').lean();
      const mediaIds = mediaWithTag.map(m => m._id);
      
      if (mediaIds.length === 0) continue;
      
      // Get all bids on these media items
      const allBidsForTag = await Bid.find({
        mediaId: { $in: mediaIds },
        status: 'active'
      }).lean();
      
      // Aggregate by user
      const userTagTotals = {};
      allBidsForTag.forEach(bid => {
        const uid = bid.userId.toString();
        userTagTotals[uid] = (userTagTotals[uid] || 0) + bid.amount;
      });
      
      // Sort users by aggregate
      const sortedUsers = Object.entries(userTagTotals)
        .sort(([, a], [, b]) => b - a);
      
      // Find this user's rank
      const actualUserIdStr = actualUserId.toString();
      const rankIndex = sortedUsers.findIndex(([uid]) => uid === actualUserIdStr);
      const rank = rankIndex >= 0 ? rankIndex + 1 : sortedUsers.length + 1;
      const totalUsers = sortedUsers.length;
      const percentile = totalUsers > 0 ? parseFloat(((totalUsers - rank) / totalUsers * 100).toFixed(1)) : 0;
      
      tagRankings.push({
        tag,
        aggregate: userAggregate,
        rank,
        totalUsers,
        percentile,
        lastUpdated: new Date()
      });
    }

    // Sort by aggregate (highest first)
    tagRankings.sort((a, b) => b.aggregate - a.aggregate);

    // Limit to top N tags
    const limitedRankings = tagRankings.slice(0, limit);

    // Update user with tag rankings
    await User.findByIdAndUpdate(actualUserId, {
      tagRankings: limitedRankings,
      tagRankingsUpdatedAt: new Date()
    });

    console.log(`✅ Updated tag rankings for user ${actualUserId}: ${limitedRankings.length} tags`);

    return limitedRankings;
  } catch (error) {
    console.error('❌ Error calculating tag rankings:', error);
    throw error;
  }
}

/**
 * Invalidate tag rankings for a user (mark as needing recalculation)
 * Call this when a user places a bid to trigger recalculation
 * 
 * @param {ObjectId|String} userId - User ID
 */
async function invalidateUserTagRankings(userId) {
  try {
    const User = require('../models/User');
    
    // Resolve user ID
    let actualUserId;
    if (mongoose.Types.ObjectId.isValid(userId)) {
      actualUserId = typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId;
    } else {
      // Try UUID
      const user = await User.findOne({ uuid: userId }).select('_id');
      if (!user) {
        return; // User not found, silently fail
      }
      actualUserId = user._id;
    }

    // Update timestamp to trigger recalculation on next request
    // Set to null or old date to force recalculation
    await User.findByIdAndUpdate(actualUserId, {
      $unset: { tagRankingsUpdatedAt: 1 } // Remove the timestamp
    });

    console.log(`🔄 Invalidated tag rankings for user ${actualUserId}`);
  } catch (error) {
    console.error('❌ Error invalidating tag rankings:', error);
    // Don't throw - this is a background operation
  }
}

/**
 * Recalculate tag rankings for all affected users when a bid is placed on media with specific tags
 * This is called when a bid affects tag rankings for multiple users
 * 
 * @param {Array<String>} tags - Tags from the media that received a bid
 */
async function invalidateTagRankingsForTag(tag) {
  try {
    // When a bid is placed on media with a tag, all users who bid on that tag
    // may have their rankings affected. However, recalculating all of them immediately
    // would be too expensive. Instead, we'll let them recalculate on next profile load.
    // 
    // For now, we'll just log it. In the future, we could:
    // - Use a queue system (Bull/BullMQ)
    // - Batch invalidate all users with bids on this tag
    // - Use a more sophisticated caching strategy
    
    console.log(`🏷️  Tag "${tag}" received a new bid - rankings may need recalculation`);
  } catch (error) {
    console.error('❌ Error invalidating tag rankings for tag:', error);
  }
}

module.exports = {
  calculateAndUpdateUserTagRankings,
  invalidateUserTagRankings,
  invalidateTagRankingsForTag
};

