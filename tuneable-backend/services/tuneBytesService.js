/**
 * TuneBytes Service
 * 
 * This service handles the calculation and management of TuneBytes,
 * the reward currency for discovering popular music early.
 * 
 * Formula: TuneBytes = (currentTotalValue - bidTimeTotalValue) * ∛(userBidPence) * discoveryBonus
 * Discovery Bonus: 1 + Math.exp(-rank / 10) (exponential decay)
 */

const mongoose = require('mongoose');
const Bid = require('../models/Bid');
const Media = require('../models/Media');
const User = require('../models/User');
const TuneBytesTransaction = require('../models/TuneBytesTransaction');

class TuneBytesService {
  constructor() {
    this.cache = new Map();
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
  }

  /**
   * Calculate TuneBytes for a specific bid using historical growth simulation
   * @param {string} bidId - The bid ID to calculate TuneBytes for
   * @returns {Promise<Object>} Calculation result with TuneBytes earned
   */
  async calculateTuneBytesForBid(bidId) {
    try {
      const bid = await Bid.findById(bidId).populate('mediaId');
      if (!bid) {
        throw new Error(`Bid ${bidId} not found`);
      }

      const media = bid.mediaId;
      if (!media) {
        throw new Error(`Media for bid ${bidId} not found`);
      }

      // Get all bids on this media, sorted by creation time (earliest first)
      const allBids = await Bid.find({
        mediaId: media._id,
        status: { $in: ['active', 'played'] }
      }).sort({ createdAt: 1 }); // Earliest first
      
      // Find this bid's position in the sequence
      const bidIndex = allBids.findIndex(b => b._id.toString() === bidId.toString());
      
      if (bidIndex === -1) {
        throw new Error(`Bid ${bidId} not found in media bid sequence`);
      }
      
      // Calculate total value at time of this bid (sum of all earlier bids)
      const bidTimeTotalValue = allBids
        .slice(0, bidIndex)
        .reduce((sum, b) => sum + b.amount, 0);
      
      // Current total value (sum of all bids)
      const currentTotalValue = allBids.reduce((sum, b) => sum + b.amount, 0);
      
      // Calculate discovery rank (1st, 2nd, 3rd bidder, etc.)
      const discoveryRank = bidIndex + 1;
      
      // Apply refined formula with cubed root and exponential discovery bonus
      const userBidPence = Math.round(bid.amount * 100);
      const discoveryBonus = this.getDiscoveryBonus(discoveryRank);
      
      const tuneBytes = (currentTotalValue - bidTimeTotalValue) * 
                       Math.cbrt(userBidPence) * 
                       discoveryBonus;
      
      const finalTuneBytes = Math.max(0, tuneBytes);

      return {
        tuneBytesEarned: finalTuneBytes,
        calculation: {
          currentTotalValue,
          bidTimeTotalValue,
          userBidAmount: bid.amount,
          userBidPence,
          discoveryRank,
          discoveryBonus,
          timeElapsed: this.getTimeElapsed(bid.createdAt),
          totalBidsOnMedia: allBids.length,
          formula: '(currentTotal - bidTimeTotal) * ∛(userBidPence) * discoveryBonus'
        }
      };
    } catch (error) {
      console.error('Error calculating TuneBytes for bid:', bidId, error);
      throw error;
    }
  }

  /**
   * Get discovery bonus using exponential decay formula
   * @param {number} rank - Discovery rank (1st, 2nd, 3rd, etc.)
   * @returns {number} Discovery bonus multiplier
   */
  getDiscoveryBonus(rank) {
    // Exponential decay: 1 + e^(-rank/10)
    // This gives smooth bonus decay from ~1.9x to 1.0x
    return 1 + Math.exp(-rank / 10);
  }

  /**
   * Get time elapsed since bid in hours
   * @param {Date} bidTime - When the bid was placed
   * @returns {number} Hours elapsed
   */
  getTimeElapsed(bidTime) {
    const now = new Date();
    const elapsedMs = now.getTime() - bidTime.getTime();
    return Math.round(elapsedMs / (1000 * 60 * 60)); // Convert to hours
  }

  /**
   * Award TuneBytes to a user for a specific bid
   * @param {string} bidId - The bid ID
   * @returns {Promise<Object>} Transaction result
   */
  async awardTuneBytesForBid(bidId) {
    try {
      const bid = await Bid.findById(bidId).populate(['userId', 'mediaId']);
      if (!bid) {
        throw new Error(`Bid ${bidId} not found`);
      }

      const user = bid.userId;
      const media = bid.mediaId;

      // Calculate TuneBytes
      const calculation = await this.calculateTuneBytesForBid(bidId);
      
      if (calculation.tuneBytesEarned <= 0) {
        console.log(`No TuneBytes earned for bid ${bidId} (value: ${calculation.tuneBytesEarned})`);
        return { tuneBytesEarned: 0, transaction: null };
      }

      // Create transaction record
      const transaction = new TuneBytesTransaction({
        userId: user._id,
        mediaId: media._id,
        bidId: bid._id,
        user_uuid: user.uuid,
        media_uuid: media.uuid,
        bid_uuid: bid.uuid,
        username: user.username,
        mediaTitle: media.title,
        mediaArtist: Array.isArray(media.artist) && media.artist.length > 0 ? media.artist[0].name : 'Unknown',
        mediaCoverArt: media.coverArt,
        tuneBytesEarned: calculation.tuneBytesEarned,
        calculationSnapshot: calculation.calculation,
        status: 'confirmed'
      });

      await transaction.save();

      // Update user's TuneBytes balance
      await User.findByIdAndUpdate(user._id, {
        $inc: { tuneBytes: calculation.tuneBytesEarned },
        $push: {
          tuneBytesHistory: {
            mediaId: media._id,
            earnedAmount: calculation.tuneBytesEarned,
            earnedAt: new Date(),
            bidId: bid._id,
            discoveryRank: calculation.calculation.discoveryRank,
            reason: calculation.calculation.discoveryRank <= 3 ? 'discovery' : 'popularity_growth'
          }
        }
      });

      // Send notification if TuneBytes earned is significant (> 0.1)
      if (calculation.tuneBytesEarned >= 0.1) {
        try {
          const notificationService = require('../services/notificationService');
          const reason = calculation.calculation.discoveryRank <= 3 ? 'discovery' : 'popularity_growth';
          await notificationService.notifyTuneBytesEarned(
            user._id.toString(),
            calculation.tuneBytesEarned,
            reason,
            media._id.toString(),
            media.title
          ).catch(err => console.error('Error sending TuneBytes earned notification:', err));
        } catch (error) {
          console.error('Error setting up TuneBytes notification:', error);
        }
      }

      console.log(`✅ Awarded ${calculation.tuneBytesEarned.toFixed(2)} TuneBytes to ${user.username} for bid on "${media.title}"`);

      return {
        tuneBytesEarned: calculation.tuneBytesEarned,
        transaction: transaction
      };

    } catch (error) {
      console.error('Error awarding TuneBytes for bid:', bidId, error);
      throw error;
    }
  }

  /**
   * Recalculate TuneBytes for all existing bids on a media item
   * @param {string} mediaId - Media ID
   * @returns {Promise<Object>} Summary of recalculations
   */
  async recalculateTuneBytesForMedia(mediaId) {
    try {
      const bids = await Bid.find({ 
        mediaId: new mongoose.Types.ObjectId(mediaId),
        status: { $in: ['active', 'played'] }
      }).populate(['userId', 'mediaId']);

      let totalAwarded = 0;
      let transactionsCreated = 0;

      for (const bid of bids) {
        try {
          const result = await this.awardTuneBytesForBid(bid._id);
          if (result.tuneBytesEarned > 0) {
            totalAwarded += result.tuneBytesEarned;
            transactionsCreated++;
          }
        } catch (error) {
          console.error(`Error recalculating TuneBytes for bid ${bid._id}:`, error);
        }
      }

      return {
        mediaId,
        bidsProcessed: bids.length,
        transactionsCreated,
        totalTuneBytesAwarded: totalAwarded
      };

    } catch (error) {
      console.error('Error recalculating TuneBytes for media:', mediaId, error);
      throw error;
    }
  }

  /**
   * Get user's TuneBytes statistics
   * @param {string} userId - User ID
   * @returns {Promise<Object>} User's TuneBytes stats
   */
  async getUserTuneBytesStats(userId) {
    try {
      const user = await User.findById(userId);
      if (!user) {
        throw new Error(`User ${userId} not found`);
      }

      const transactions = await TuneBytesTransaction.find({ 
        userId: new mongoose.Types.ObjectId(userId),
        status: 'confirmed'
      }).populate('mediaId', 'title artist coverArt');

      const stats = {
        totalTuneBytes: user.tuneBytes || 0,
        totalTransactions: transactions.length,
        totalMediaDiscovered: new Set(transactions.map(t => t.mediaId._id.toString())).size,
        averageTuneBytesPerTransaction: transactions.length > 0 ? 
          transactions.reduce((sum, t) => sum + t.tuneBytesEarned, 0) / transactions.length : 0,
        topDiscoveryRank: Math.min(...transactions.map(t => t.calculationSnapshot.discoveryRank)),
        recentTransactions: transactions.slice(0, 10)
      };

      return stats;

    } catch (error) {
      console.error('Error getting user TuneBytes stats:', userId, error);
      throw error;
    }
  }

  /**
   * Clear cache (useful for testing or manual cache invalidation)
   */
  clearCache() {
    this.cache.clear();
  }
}

module.exports = new TuneBytesService();
