/**
 * Artist Escrow Service
 * 
 * Handles allocation and management of artist revenue escrow.
 * Phase 1: Internal ledger system (no Stripe Connect yet)
 * 
 * Revenue Split:
 * - 70% to artists (split by mediaOwners percentages)
 * - 30% to Tuneable platform
 * 
 * All amounts are stored in PENCE (integer), not pounds.
 */

const mongoose = require('mongoose');
const User = require('../models/User');
const Media = require('../models/Media');
const Bid = require('../models/Bid');
const ArtistEscrowAllocation = require('../models/ArtistEscrowAllocation');
const { validatePenceAmount } = require('../utils/penceValidation');

// Revenue split constants
const ARTIST_SHARE_PERCENTAGE = 0.70; // 70% to artists
const TUNEABLE_FEE_PERCENTAGE = 0.30; // 30% to platform

class ArtistEscrowService {
  /**
   * Allocate escrow for a bid
   * Called after a bid is successfully placed
   * 
   * @param {string} bidId - The bid ID
   * @param {string} mediaId - The media ID
   * @param {number} bidAmountPence - The bid amount in pence
   * @returns {Promise<Object>} Allocation result
   */
  async allocateEscrowForBid(bidId, mediaId, bidAmountPence) {
    try {
      // Validate inputs
      const validatedAmount = validatePenceAmount(bidAmountPence, 'bid amount for escrow allocation');
      
      // Get media with populated owners
      const media = await Media.findById(mediaId).populate('mediaOwners.userId');
      
      if (!media) {
        throw new Error(`Media ${mediaId} not found`);
      }
      
      // Calculate artist share (70% of bid amount)
      const artistSharePence = Math.round(validatedAmount * ARTIST_SHARE_PERCENTAGE);
      
      // If no media owners, skip allocation (revenue goes to platform)
      if (!media.mediaOwners || media.mediaOwners.length === 0) {
        console.log(`⚠️  No media owners for media ${mediaId}, skipping escrow allocation`);
        return {
          allocated: false,
          reason: 'no_media_owners',
          artistShare: 0,
          tuneableFee: validatedAmount
        };
      }
      
      // Validate ownership percentages sum to 100%
      const totalPercentage = media.mediaOwners.reduce((sum, owner) => sum + (owner.percentage || 0), 0);
      if (Math.abs(totalPercentage - 100) > 0.01) {
        console.warn(`⚠️  Media ${mediaId} ownership percentages sum to ${totalPercentage}%, not 100%`);
        // Normalize percentages if they don't sum to 100%
        if (totalPercentage > 0) {
          media.mediaOwners.forEach(owner => {
            owner.percentage = (owner.percentage / totalPercentage) * 100;
          });
          console.log(`   ✅ Normalized ownership percentages to sum to 100%`);
        }
      }
      
      // Validate all percentages are valid (0-100)
      const invalidOwners = media.mediaOwners.filter(owner => 
        !owner.percentage || owner.percentage < 0 || owner.percentage > 100
      );
      if (invalidOwners.length > 0) {
        console.warn(`⚠️  Media ${mediaId} has ${invalidOwners.length} owners with invalid percentages, skipping them`);
        // Filter out invalid owners
        media.mediaOwners = media.mediaOwners.filter(owner => 
          owner.percentage && owner.percentage >= 0 && owner.percentage <= 100
        );
      }
      
      const allocations = [];
      
      // Allocate to each media owner based on their percentage
      for (const owner of media.mediaOwners) {
        const ownerSharePence = Math.round(artistSharePence * (owner.percentage / 100));
        
        if (ownerSharePence <= 0) {
          continue; // Skip zero allocations
        }
        
        if (owner.userId) {
          // Registered artist - add to their escrow balance
          await this._allocateToRegisteredArtist(
            owner.userId,
            mediaId,
            bidId,
            ownerSharePence,
            owner.percentage
          );
          allocations.push({
            type: 'registered',
            userId: owner.userId.toString(),
            amount: ownerSharePence,
            percentage: owner.percentage
          });
        } else {
          // Unknown artist - create escrow allocation
          await this._allocateToUnknownArtist(
            media,
            bidId,
            ownerSharePence,
            owner.percentage
          );
          allocations.push({
            type: 'unknown',
            amount: ownerSharePence,
            percentage: owner.percentage
          });
        }
      }
      
      // Calculate Tuneable fee (30% + any rounding differences)
      const totalAllocated = allocations.reduce((sum, a) => sum + a.amount, 0);
      const tuneableFeePence = validatedAmount - totalAllocated;
      
      console.log(`✅ Escrow allocated for bid ${bidId}:`);
      console.log(`   - Artist share: £${(artistSharePence / 100).toFixed(2)} (${allocations.length} allocations)`);
      console.log(`   - Tuneable fee: £${(tuneableFeePence / 100).toFixed(2)}`);
      
      return {
        allocated: true,
        artistShare: artistSharePence,
        tuneableFee: tuneableFeePence,
        allocations
      };
      
    } catch (error) {
      console.error(`❌ Error allocating escrow for bid ${bidId}:`, error);
      throw error;
    }
  }
  
  /**
   * Allocate escrow to a registered artist
   * @private
   */
  async _allocateToRegisteredArtist(userId, mediaId, bidId, amountPence, percentage) {
    const validatedAmount = validatePenceAmount(amountPence, 'artist escrow allocation');
    
    // Get media for notification
    const media = await Media.findById(mediaId).select('title artist');
    const mediaTitle = media?.title || 'Unknown Media';
    const artistName = Array.isArray(media?.artist) && media.artist.length > 0 
      ? media.artist[0].name 
      : 'Unknown Artist';
    
    await User.findByIdAndUpdate(userId, {
      $inc: { artistEscrowBalance: validatedAmount },
      $push: {
        artistEscrowHistory: {
          mediaId: mediaId,
          bidId: bidId,
          amount: validatedAmount,
          allocatedAt: new Date(),
          status: 'pending'
        }
      }
    });
    
    // Send notification to artist (async, don't block)
    try {
      const Notification = require('../models/Notification');
      const notification = new Notification({
        userId: userId,
        type: 'escrow_allocated',
        title: 'Escrow Allocated',
        message: `£${(validatedAmount / 100).toFixed(2)} has been added to your escrow balance from "${mediaTitle}"`,
        link: `/tune/${mediaId}`,
        linkText: 'View Media',
        relatedMediaId: mediaId,
        relatedBidId: bidId
      });
      await notification.save();
    } catch (notifError) {
      console.error('Failed to send escrow allocation notification:', notifError);
      // Don't fail allocation if notification fails
    }
    
    console.log(`   ✅ Allocated £${(validatedAmount / 100).toFixed(2)} to registered artist ${userId} (${percentage}%)`);
  }
  
  /**
   * Allocate escrow to an unknown artist
   * @private
   */
  async _allocateToUnknownArtist(media, bidId, amountPence, percentage) {
    const validatedAmount = validatePenceAmount(amountPence, 'unknown artist escrow allocation');
    
    // Get artist name(s) for matching
    const artistNames = media.artist && media.artist.length > 0
      ? media.artist.map(a => a.name)
      : ['Unknown Artist'];
    
    const primaryArtistName = artistNames[0] || 'Unknown Artist';
    
    // Extract YouTube channel ID if available
    const youtubeUrl = media.sources?.get?.('youtube') || media.sources?.youtube;
    let youtubeChannelId = null;
    if (youtubeUrl) {
      // Extract channel ID from YouTube URL
      const channelMatch = youtubeUrl.match(/youtube\.com\/channel\/([a-zA-Z0-9_-]+)/);
      if (channelMatch) {
        youtubeChannelId = channelMatch[1];
      }
    }
    
    // Create escrow allocation
    const allocation = new ArtistEscrowAllocation({
      mediaId: media._id,
      bidId: bidId,
      artistName: primaryArtistName,
      matchingCriteria: {
        artistName: primaryArtistName,
        artistNames: artistNames,
        youtubeChannelId: youtubeChannelId,
        externalIds: media.externalIds || new Map()
      },
      percentage: percentage,
      allocatedAmount: validatedAmount,
      claimed: false
    });
    
    await allocation.save();
    
    console.log(`   ✅ Allocated £${(validatedAmount / 100).toFixed(2)} to unknown artist "${primaryArtistName}" (${percentage}%)`);
  }
  
  /**
   * Match unknown artist allocations to a user
   * Called when an artist registers or verifies their identity
   * 
   * @param {string} userId - The user ID
   * @param {string} artistName - The artist name to match
   * @param {Object} matchingCriteria - Additional matching criteria (optional)
   * @returns {Promise<Object>} Matching result
   */
  async matchUnknownArtistToUser(userId, artistName, matchingCriteria = {}) {
    try {
      if (!artistName) {
        throw new Error('Artist name is required for matching');
      }
      
      // Find unclaimed allocations matching this artist
      const query = {
        claimed: false,
        $or: [
          { artistName: { $regex: new RegExp(artistName, 'i') } },
          { 'matchingCriteria.artistName': { $regex: new RegExp(artistName, 'i') } },
          { 'matchingCriteria.artistNames': { $in: [new RegExp(artistName, 'i')] } }
        ]
      };
      
      // Add additional matching criteria if provided
      if (matchingCriteria.youtubeChannelId) {
        query.$or.push({
          'matchingCriteria.youtubeChannelId': matchingCriteria.youtubeChannelId
        });
      }
      
      const allocations = await ArtistEscrowAllocation.find(query);
      
      if (allocations.length === 0) {
        return {
          matched: false,
          count: 0,
          totalAmount: 0
        };
      }
      
      // Claim all matching allocations
      let totalAmount = 0;
      for (const allocation of allocations) {
        await allocation.claim(userId);
        totalAmount += allocation.allocatedAmount;
      }
      
      console.log(`✅ Matched ${allocations.length} allocations to user ${userId}, total: £${(totalAmount / 100).toFixed(2)}`);
      
      return {
        matched: true,
        count: allocations.length,
        totalAmount: totalAmount,
        allocations: allocations.map(a => ({
          mediaId: a.mediaId,
          bidId: a.bidId,
          amount: a.allocatedAmount,
          allocatedAt: a.allocatedAt
        }))
      };
      
    } catch (error) {
      console.error(`❌ Error matching unknown artist to user ${userId}:`, error);
      throw error;
    }
  }
  
  /**
   * Get escrow balance and history for a user
   * 
   * @param {string} userId - The user ID
   * @returns {Promise<Object>} Escrow information
   */
  async getEscrowInfo(userId) {
    try {
      const user = await User.findById(userId)
        .select('artistEscrowBalance artistEscrowHistory')
        .populate('artistEscrowHistory.mediaId', 'title artist coverArt')
        .populate('artistEscrowHistory.bidId', 'amount createdAt');
      
      if (!user) {
        throw new Error(`User ${userId} not found`);
      }
      
      // Get unclaimed allocations for this user (if any)
      const unclaimedAllocations = await ArtistEscrowAllocation.find({
        artistUserId: userId,
        claimed: false
      })
        .populate('mediaId', 'title artist coverArt')
        .populate('bidId', 'amount createdAt')
        .sort({ allocatedAt: -1 });
      
      return {
        balance: user.artistEscrowBalance || 0, // In pence
        balancePounds: (user.artistEscrowBalance || 0) / 100,
        history: user.artistEscrowHistory || [],
        unclaimedAllocations: unclaimedAllocations.map(a => ({
          _id: a._id,
          mediaId: a.mediaId,
          bidId: a.bidId,
          amount: a.allocatedAmount,
          allocatedAt: a.allocatedAt,
          artistName: a.artistName
        }))
      };
      
    } catch (error) {
      console.error(`❌ Error getting escrow info for user ${userId}:`, error);
      throw error;
    }
  }
  
  /**
   * Calculate artist share from bid amount
   * 
   * @param {number} bidAmountPence - Bid amount in pence
   * @param {number} percentage - Ownership percentage (0-100)
   * @returns {number} Artist share in pence
   */
  calculateArtistShare(bidAmountPence, percentage) {
    const validatedAmount = validatePenceAmount(bidAmountPence, 'bid amount');
    const artistSharePence = Math.round(validatedAmount * ARTIST_SHARE_PERCENTAGE);
    return Math.round(artistSharePence * (percentage / 100));
  }
}

module.exports = new ArtistEscrowService();

