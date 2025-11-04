const mongoose = require('mongoose');

/**
 * Calculate and update label statistics
 * This service calculates label stats from actual data:
 * - artistCount: Users with active labelAffiliations to this label
 * - releaseCount: Media items with this label's labelId
 * - totalBidAmount: Sum of globalMediaAggregate for all label's media
 * - Other bid metrics: aggregated from label's media
 * 
 * @param {ObjectId|String} labelId - Label ID (ObjectId or string)
 * @param {Boolean} forceRecalculate - Force recalculation even if recently updated
 */
async function calculateAndUpdateLabelStats(labelId, forceRecalculate = false) {
  try {
    const Label = require('../models/Label');
    const User = require('../models/User');
    const Media = require('../models/Media');
    const Bid = require('../models/Bid');

    // Resolve label ID
    let actualLabelId;
    if (mongoose.Types.ObjectId.isValid(labelId)) {
      actualLabelId = typeof labelId === 'string' ? new mongoose.Types.ObjectId(labelId) : labelId;
    } else {
      // Try UUID
      const label = await Label.findOne({ uuid: labelId }).select('_id');
      if (!label) {
        throw new Error('Label not found');
      }
      actualLabelId = label._id;
    }

    const label = await Label.findById(actualLabelId);
    if (!label) {
      throw new Error('Label not found');
    }

    console.log(`📊 Calculating stats for label: ${label.name} (${actualLabelId})`);

    // 1. Calculate artistCount - Users with active labelAffiliations
    const artistCount = await User.countDocuments({
      'labelAffiliations.labelId': actualLabelId,
      'labelAffiliations.status': 'active'
    });

    console.log(`   Artists: ${artistCount}`);

    // 2. Calculate releaseCount - Media items with this label's labelId
    // Query handles both ObjectId and string formats for robustness
    const releaseCount = await Media.countDocuments({
      $or: [
        { 'label.labelId': actualLabelId }, // Match ObjectId
        { 'label.labelId': actualLabelId.toString() }, // Match string format
        { 'label.labelId': new mongoose.Types.ObjectId(actualLabelId) } // Match if stored as ObjectId
      ]
    });

    console.log(`   Releases: ${releaseCount}`);

    // 3. Get all media for this label
    // Query handles both ObjectId and string formats for robustness
    const labelMedia = await Media.find({
      $or: [
        { 'label.labelId': actualLabelId }, // Match ObjectId
        { 'label.labelId': actualLabelId.toString() }, // Match string format
        { 'label.labelId': new mongoose.Types.ObjectId(actualLabelId) } // Match if stored as ObjectId
      ]
    }).select('_id title artist globalMediaAggregate globalMediaBidTop');

    const mediaIds = labelMedia.map(m => m._id);

    // 4. Calculate bid metrics from label's media
    let totalBidAmount = 0;
    let topBidAmount = 0;
    let totalBidCount = 0;
    let lastBidAt = null;
    let firstBidAt = null;

    if (mediaIds.length > 0) {
      // Sum total bid amounts from media
      totalBidAmount = labelMedia.reduce((sum, media) => {
        return sum + (media.globalMediaAggregate || 0);
      }, 0);

      // Find top bid amount
      topBidAmount = Math.max(...labelMedia.map(m => m.globalMediaBidTop || 0), 0);

      // Count total bids on label's media
      const bids = await Bid.find({
        mediaId: { $in: mediaIds },
        status: 'active'
      }).select('amount createdAt').sort({ createdAt: 1 }).lean();

      totalBidCount = bids.length;

      // Find first and last bid dates
      if (bids.length > 0) {
        firstBidAt = bids[0].createdAt;
        lastBidAt = bids[bids.length - 1].createdAt;
      }

      // Calculate average bid amount
      const averageBidAmount = totalBidAmount > 0 && totalBidCount > 0 
        ? totalBidAmount / totalBidCount 
        : 0;

      // Get top performing media (top 10 by totalBidAmount)
      const topPerformingMedia = labelMedia
        .map(media => ({
          mediaId: media._id,
          title: media.title,
          artist: Array.isArray(media.artist) && media.artist.length > 0 
            ? media.artist[0].name 
            : 'Unknown Artist',
          totalBidAmount: media.globalMediaAggregate || 0
        }))
        .sort((a, b) => b.totalBidAmount - a.totalBidAmount)
        .slice(0, 10);

      // Count unique bidders on label's media
      const uniqueBidders = await Bid.distinct('userId', {
        mediaId: { $in: mediaIds },
        status: 'active'
      });

      // Get top bidders (top 10 by aggregate bid amount)
      const bidAggregates = await Bid.aggregate([
        {
          $match: {
            mediaId: { $in: mediaIds },
            status: 'active'
          }
        },
        {
          $group: {
            _id: '$userId',
            totalBidAmount: { $sum: '$amount' },
            bidCount: { $sum: 1 }
          }
        },
        {
          $sort: { totalBidAmount: -1 }
        },
        {
          $limit: 10
        }
      ]);

      // Populate usernames for top bidders
      const topBidders = await Promise.all(
        bidAggregates.map(async (agg) => {
          const user = await User.findById(agg._id).select('username').lean();
          return {
            userId: agg._id,
            username: user?.username || 'Unknown',
            totalBidAmount: agg.totalBidAmount,
            bidCount: agg.bidCount
          };
        })
      );

      // Count parties that have played label's media
      const Party = require('../models/Party');
      const partiesWithLabelMedia = await Party.countDocuments({
        'media.mediaId': { $in: mediaIds }
      });

      // Calculate total party bid amount
      const partyBids = await Bid.find({
        mediaId: { $in: mediaIds },
        bidScope: 'party',
        status: 'active'
      }).lean();

      const totalPartyBidAmount = partyBids.reduce((sum, bid) => sum + bid.amount, 0);

      // Update label stats
      label.stats = {
        artistCount,
        releaseCount,
        totalBidAmount,
        averageBidAmount,
        topBidAmount,
        totalBidCount,
        topPerformingMedia,
        partiesWithLabelMedia,
        totalPartyBidAmount,
        uniqueBidders: uniqueBidders.length,
        topBidders,
        lastBidAt,
        firstBidAt,
        // Ranking metrics will be calculated separately via recalculation endpoint
        globalRank: label.stats?.globalRank || null,
        genreRank: label.stats?.genreRank || null,
        percentile: label.stats?.percentile || null
      };
    } else {
      // No media yet - set defaults
      label.stats = {
        artistCount,
        releaseCount,
        totalBidAmount: 0,
        averageBidAmount: 0,
        topBidAmount: 0,
        totalBidCount: 0,
        topPerformingMedia: [],
        partiesWithLabelMedia: 0,
        totalPartyBidAmount: 0,
        uniqueBidders: 0,
        topBidders: [],
        lastBidAt: null,
        firstBidAt: null,
        globalRank: label.stats?.globalRank || null,
        genreRank: label.stats?.genreRank || null,
        percentile: label.stats?.percentile || null
      };
    }

    await label.save();

    console.log(`✅ Updated stats for label ${label.name}:`);
    console.log(`   Artists: ${artistCount}, Releases: ${releaseCount}`);
    console.log(`   Total Bids: £${totalBidAmount.toFixed(2)} (${totalBidCount} bids)`);

    return label.stats;
  } catch (error) {
    console.error('❌ Error calculating label stats:', error);
    throw error;
  }
}

/**
 * Recalculate stats for all labels
 * Useful for periodic updates or after migrations
 */
async function recalculateAllLabelStats() {
  try {
    const Label = require('../models/Label');
    
    const labels = await Label.find({ isActive: true }).select('_id name');
    console.log(`🔄 Recalculating stats for ${labels.length} labels...`);

    let successCount = 0;
    let errorCount = 0;

    for (const label of labels) {
      try {
        await calculateAndUpdateLabelStats(label._id, true);
        successCount++;
      } catch (error) {
        console.error(`❌ Error calculating stats for label ${label.name}:`, error);
        errorCount++;
      }
    }

    console.log(`✅ Stats recalculation complete: ${successCount} succeeded, ${errorCount} failed`);

    return { successCount, errorCount, total: labels.length };
  } catch (error) {
    console.error('❌ Error in bulk stats recalculation:', error);
    throw error;
  }
}

/**
 * Calculate ranking metrics for all labels
 * Updates globalRank, genreRank, and percentile for each label
 */
async function calculateLabelRankings() {
  try {
    const Label = require('../models/Label');

    // Get all labels sorted by totalBidAmount
    const allLabels = await Label.find({ isActive: true })
      .select('_id name genres stats.totalBidAmount')
      .sort({ 'stats.totalBidAmount': -1 });

    // Calculate global rankings
    allLabels.forEach((label, index) => {
      label.stats.globalRank = index + 1;
      label.stats.percentile = allLabels.length > 0 
        ? ((allLabels.length - index) / allLabels.length * 100).toFixed(1)
        : 0;
    });

    // Calculate genre rankings
    const genreGroups = {};
    allLabels.forEach(label => {
      if (label.genres && label.genres.length > 0) {
        label.genres.forEach(genre => {
          if (!genreGroups[genre]) {
            genreGroups[genre] = [];
          }
          genreGroups[genre].push(label);
        });
      }
    });

    // Sort by totalBidAmount within each genre
    Object.keys(genreGroups).forEach(genre => {
      const genreLabels = genreGroups[genre].sort((a, b) => 
        (b.stats?.totalBidAmount || 0) - (a.stats?.totalBidAmount || 0)
      );
      
      genreLabels.forEach((label, index) => {
        label.stats.genreRank = index + 1;
      });
    });

    // Save all updates
    await Promise.all(allLabels.map(label => label.save()));

    console.log(`✅ Calculated rankings for ${allLabels.length} labels`);

    return { labelsUpdated: allLabels.length };
  } catch (error) {
    console.error('❌ Error calculating label rankings:', error);
    throw error;
  }
}

module.exports = {
  calculateAndUpdateLabelStats,
  recalculateAllLabelStats,
  calculateLabelRankings
};

