const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const artistEscrowService = require('../services/artistEscrowService');
const User = require('../models/User');

/**
 * @route   GET /api/artist-escrow/info
 * @desc    Get artist escrow balance and history
 * @access  Private (artist must be logged in)
 */
router.get('/info', authMiddleware, async (req, res) => {
  try {
    const userId = req.user._id;
    
    const escrowInfo = await artistEscrowService.getEscrowInfo(userId);
    
    res.json({
      success: true,
      escrow: {
        balance: escrowInfo.balance, // In pence
        balancePounds: escrowInfo.balancePounds,
        history: escrowInfo.history,
        unclaimedAllocations: escrowInfo.unclaimedAllocations
      }
    });
  } catch (error) {
    console.error('Error fetching escrow info:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch escrow information',
      details: error.message 
    });
  }
});

/**
 * @route   POST /api/artist-escrow/match
 * @desc    Match unknown artist allocations to current user
 * @access  Private (artist must be logged in)
 * 
 * Body: {
 *   artistName: string (required)
 *   youtubeChannelId?: string (optional)
 *   externalIds?: object (optional)
 * }
 */
router.post('/match', authMiddleware, async (req, res) => {
  try {
    const userId = req.user._id;
    const { artistName, youtubeChannelId, externalIds } = req.body;
    
    if (!artistName) {
      return res.status(400).json({
        success: false,
        error: 'Artist name is required'
      });
    }
    
    const matchingCriteria = {};
    if (youtubeChannelId) {
      matchingCriteria.youtubeChannelId = youtubeChannelId;
    }
    if (externalIds) {
      matchingCriteria.externalIds = externalIds;
    }
    
    const result = await artistEscrowService.matchUnknownArtistToUser(
      userId,
      artistName,
      matchingCriteria
    );
    
    if (result.matched) {
      res.json({
        success: true,
        message: `Matched ${result.count} allocation(s) totaling £${(result.totalAmount / 100).toFixed(2)}`,
        matched: true,
        count: result.count,
        totalAmount: result.totalAmount,
        totalAmountPounds: result.totalAmount / 100,
        allocations: result.allocations
      });
    } else {
      res.json({
        success: true,
        message: 'No matching allocations found',
        matched: false,
        count: 0,
        totalAmount: 0
      });
    }
  } catch (error) {
    console.error('Error matching artist allocations:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to match artist allocations',
      details: error.message
    });
  }
});

/**
 * @route   POST /api/artist-escrow/request-payout
 * @desc    Request payout of escrow balance (manual processing for MVP)
 * @access  Private (artist must be logged in)
 * 
 * Body: {
 *   amount?: number (optional - defaults to full balance)
 *   payoutMethod?: string (optional - 'bank_transfer', 'paypal', etc.)
 *   payoutDetails?: object (optional - account details)
 * }
 */
router.post('/request-payout', authMiddleware, async (req, res) => {
  try {
    const userId = req.user._id;
    const { amount, payoutMethod, payoutDetails } = req.body;
    
    const user = await User.findById(userId).select('artistEscrowBalance username email');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }
    
    const availableBalance = user.artistEscrowBalance || 0;
    
    if (availableBalance <= 0) {
      return res.status(400).json({
        success: false,
        error: 'No escrow balance available for payout'
      });
    }
    
    const requestedAmount = amount ? Math.round(amount * 100) : availableBalance; // Convert to pence if provided in pounds
    
    if (requestedAmount > availableBalance) {
      return res.status(400).json({
        success: false,
        error: `Requested amount (£${(requestedAmount / 100).toFixed(2)}) exceeds available balance (£${(availableBalance / 100).toFixed(2)})`
      });
    }
    
    if (requestedAmount < 100) { // Minimum £1.00
      return res.status(400).json({
        success: false,
        error: 'Minimum payout amount is £1.00'
      });
    }
    
    // For MVP: Create a payout request record (manual processing)
    // In Phase 2: This would trigger Stripe Connect transfer
    
    // TODO: Create PayoutRequest model for tracking manual payouts
    // For now, just return success and log for admin processing
    
    console.log(`💰 Payout request from user ${user.username} (${user.email}):`);
    console.log(`   - Requested: £${(requestedAmount / 100).toFixed(2)}`);
    console.log(`   - Available: £${(availableBalance / 100).toFixed(2)}`);
    console.log(`   - Method: ${payoutMethod || 'not specified'}`);
    console.log(`   - Details:`, payoutDetails || 'none');
    
    res.json({
      success: true,
      message: 'Payout request submitted. You will be notified when it is processed.',
      requestedAmount: requestedAmount,
      requestedAmountPounds: requestedAmount / 100,
      availableBalance: availableBalance,
      availableBalancePounds: availableBalance / 100,
      note: 'Payouts are processed manually. You will receive an email when your payout is processed.'
    });
    
  } catch (error) {
    console.error('Error processing payout request:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process payout request',
      details: error.message
    });
  }
});

/**
 * @route   GET /api/artist-escrow/stats
 * @desc    Get escrow statistics (for admin or artist dashboard)
 * @access  Private
 */
router.get('/stats', authMiddleware, async (req, res) => {
  try {
    const userId = req.user._id;
    const user = await User.findById(userId).select('role artistEscrowBalance');
    
    // Only admins can see global stats
    const isAdmin = user.role && user.role.includes('admin');
    
    if (isAdmin) {
      // Get global escrow stats
      const ArtistEscrowAllocation = require('../models/ArtistEscrowAllocation');
      
      const [totalUnclaimed, totalClaimed, totalUsersWithEscrow] = await Promise.all([
        ArtistEscrowAllocation.aggregate([
          { $match: { claimed: false } },
          { $group: { _id: null, total: { $sum: '$allocatedAmount' } } }
        ]),
        ArtistEscrowAllocation.aggregate([
          { $match: { claimed: true } },
          { $group: { _id: null, total: { $sum: '$allocatedAmount' } } }
        ]),
        User.countDocuments({ artistEscrowBalance: { $gt: 0 } })
      ]);
      
      const unclaimedTotal = totalUnclaimed[0]?.total || 0;
      const claimedTotal = totalClaimed[0]?.total || 0;
      
      res.json({
        success: true,
        stats: {
          unclaimedTotal: unclaimedTotal,
          unclaimedTotalPounds: unclaimedTotal / 100,
          claimedTotal: claimedTotal,
          claimedTotalPounds: claimedTotal / 100,
          totalUsersWithEscrow: totalUsersWithEscrow
        }
      });
    } else {
      // Regular users see only their own stats
      const escrowInfo = await artistEscrowService.getEscrowInfo(userId);
      
      res.json({
        success: true,
        stats: {
          balance: escrowInfo.balance,
          balancePounds: escrowInfo.balancePounds,
          historyCount: escrowInfo.history.length,
          unclaimedAllocationsCount: escrowInfo.unclaimedAllocations.length
        }
      });
    }
  } catch (error) {
    console.error('Error fetching escrow stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch escrow statistics',
      details: error.message
    });
  }
});

module.exports = router;

