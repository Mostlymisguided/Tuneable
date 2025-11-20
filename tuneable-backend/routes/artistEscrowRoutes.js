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

/**
 * ========================================
 * ADMIN ROUTES
 * ========================================
 */

const adminMiddleware = require('../middleware/adminMiddleware');

/**
 * @route   GET /api/artist-escrow/admin/payouts
 * @desc    Get all pending payout requests (admin only)
 * @access  Private (admin only)
 */
router.get('/admin/payouts', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    // For MVP: Get all users with escrow balance > 0
    // In Phase 2: Query PayoutRequest model
    const usersWithEscrow = await User.find({
      artistEscrowBalance: { $gt: 0 }
    })
      .select('username email artistEscrowBalance artistEscrowHistory creatorProfile')
      .sort({ artistEscrowBalance: -1 })
      .limit(100);
    
    const payoutRequests = usersWithEscrow.map(user => ({
      userId: user._id,
      username: user.username,
      email: user.email,
      artistName: user.creatorProfile?.artistName || user.username,
      balance: user.artistEscrowBalance,
      balancePounds: user.artistEscrowBalance / 100,
      historyCount: user.artistEscrowHistory?.length || 0,
      lastAllocation: user.artistEscrowHistory && user.artistEscrowHistory.length > 0
        ? user.artistEscrowHistory[user.artistEscrowHistory.length - 1].allocatedAt
        : null
    }));
    
    res.json({
      success: true,
      payouts: payoutRequests,
      totalUsers: payoutRequests.length,
      totalAmount: payoutRequests.reduce((sum, p) => sum + p.balance, 0),
      totalAmountPounds: payoutRequests.reduce((sum, p) => sum + p.balancePounds, 0)
    });
  } catch (error) {
    console.error('Error fetching payout requests:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch payout requests',
      details: error.message
    });
  }
});

/**
 * @route   POST /api/artist-escrow/admin/process-payout
 * @desc    Process a payout for an artist (admin only)
 * @access  Private (admin only)
 * 
 * Body: {
 *   userId: string (required)
 *   amount?: number (optional - defaults to full balance)
 *   payoutMethod: string (required - 'bank_transfer', 'paypal', 'stripe', etc.)
 *   payoutDetails: object (optional - transaction ID, notes, etc.)
 * }
 */
router.post('/admin/process-payout', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { userId, amount, payoutMethod, payoutDetails, notes } = req.body;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'User ID is required'
      });
    }
    
    if (!payoutMethod) {
      return res.status(400).json({
        success: false,
        error: 'Payout method is required'
      });
    }
    
    const user = await User.findById(userId).select('username email artistEscrowBalance artistEscrowHistory');
    
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
        error: 'User has no escrow balance available'
      });
    }
    
    const payoutAmountPence = amount ? Math.round(amount * 100) : availableBalance;
    
    if (payoutAmountPence > availableBalance) {
      return res.status(400).json({
        success: false,
        error: `Payout amount (£${(payoutAmountPence / 100).toFixed(2)}) exceeds available balance (£${(availableBalance / 100).toFixed(2)})`
      });
    }
    
    if (payoutAmountPence < 100) {
      return res.status(400).json({
        success: false,
        error: 'Minimum payout amount is £1.00'
      });
    }
    
    // Deduct from escrow balance
    user.artistEscrowBalance = user.artistEscrowBalance - payoutAmountPence;
    
    // Update history entries to 'claimed' status
    if (user.artistEscrowHistory) {
      user.artistEscrowHistory = user.artistEscrowHistory.map(entry => {
        if (entry.status === 'pending') {
          return {
            ...entry,
            status: 'claimed',
            claimedAt: new Date()
          };
        }
        return entry;
      });
    }
    
    await user.save();
    
    // Send notification to artist
    try {
      const Notification = require('../models/Notification');
      const notification = new Notification({
        userId: user._id,
        type: 'payout_processed',
        title: 'Payout Processed',
        message: `Your payout of £${(payoutAmountPence / 100).toFixed(2)} has been processed via ${payoutMethod}.`,
        link: '/artist-escrow',
        linkText: 'View Escrow'
      });
      await notification.save();
    } catch (notifError) {
      console.error('Failed to send payout notification:', notifError);
    }
    
    console.log(`💰 Payout processed for user ${user.username}:`);
    console.log(`   - Amount: £${(payoutAmountPence / 100).toFixed(2)}`);
    console.log(`   - Method: ${payoutMethod}`);
    console.log(`   - Remaining balance: £${(user.artistEscrowBalance / 100).toFixed(2)}`);
    console.log(`   - Processed by: ${req.user.username}`);
    
    res.json({
      success: true,
      message: 'Payout processed successfully',
      payout: {
        userId: user._id,
        username: user.username,
        amount: payoutAmountPence,
        amountPounds: payoutAmountPence / 100,
        payoutMethod: payoutMethod,
        remainingBalance: user.artistEscrowBalance,
        remainingBalancePounds: user.artistEscrowBalance / 100,
        processedAt: new Date(),
        processedBy: req.user._id
      }
    });
    
  } catch (error) {
    console.error('Error processing payout:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process payout',
      details: error.message
    });
  }
});

/**
 * @route   GET /api/artist-escrow/admin/unclaimed
 * @desc    Get all unclaimed escrow allocations (admin only)
 * @access  Private (admin only)
 */
router.get('/admin/unclaimed', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const ArtistEscrowAllocation = require('../models/ArtistEscrowAllocation');
    
    const unclaimed = await ArtistEscrowAllocation.find({ claimed: false })
      .populate('mediaId', 'title artist coverArt')
      .populate('bidId', 'amount createdAt')
      .sort({ allocatedAt: -1 })
      .limit(100);
    
    // Group by artist name
    const grouped = {};
    unclaimed.forEach(allocation => {
      const artistName = allocation.artistName;
      if (!grouped[artistName]) {
        grouped[artistName] = {
          artistName: artistName,
          count: 0,
          totalAmount: 0,
          allocations: []
        };
      }
      grouped[artistName].count++;
      grouped[artistName].totalAmount += allocation.allocatedAmount;
      grouped[artistName].allocations.push({
        _id: allocation._id,
        mediaId: allocation.mediaId,
        bidId: allocation.bidId,
        amount: allocation.allocatedAmount,
        allocatedAt: allocation.allocatedAt
      });
    });
    
    const groupedArray = Object.values(grouped).sort((a, b) => b.totalAmount - a.totalAmount);
    
    res.json({
      success: true,
      unclaimed: {
        totalAllocations: unclaimed.length,
        totalAmount: unclaimed.reduce((sum, a) => sum + a.allocatedAmount, 0),
        totalAmountPounds: unclaimed.reduce((sum, a) => sum + a.allocatedAmount, 0) / 100,
        groupedByArtist: groupedArray
      }
    });
  } catch (error) {
    console.error('Error fetching unclaimed allocations:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch unclaimed allocations',
      details: error.message
    });
  }
});

module.exports = router;

