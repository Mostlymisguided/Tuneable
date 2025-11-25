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
        totalEscrowEarned: escrowInfo.totalEscrowEarned, // In pence
        totalEscrowEarnedPounds: escrowInfo.totalEscrowEarnedPounds,
        lastPayoutTotalEarned: escrowInfo.lastPayoutTotalEarned, // In pence
        lastPayoutTotalEarnedPounds: escrowInfo.lastPayoutTotalEarnedPounds,
        isFirstPayout: escrowInfo.isFirstPayout,
        payoutEligible: escrowInfo.payoutEligible,
        payoutEligibilityReason: escrowInfo.payoutEligibilityReason,
        remainingToEligible: escrowInfo.remainingToEligible, // In pence
        remainingToEligiblePounds: escrowInfo.remainingToEligiblePounds,
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
    
    const user = await User.findById(userId).select('artistEscrowBalance totalEscrowEarned lastPayoutTotalEarned username email creatorProfile');
    
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
    
    // Payout eligibility thresholds (in pence)
    const FIRST_PAYOUT_THRESHOLD = 3300; // £33.00 - must earn this much before first payout
    const SUBSEQUENT_PAYOUT_INTERVAL = 1000; // £10.00 - must earn this much more for subsequent payouts
    
    const totalEscrowEarned = user.totalEscrowEarned || 0;
    const lastPayoutTotalEarned = user.lastPayoutTotalEarned || 0;
    const isFirstPayout = lastPayoutTotalEarned === 0;
    
    // Check payout eligibility
    if (isFirstPayout) {
      // First payout: must have earned at least £33 total
      if (totalEscrowEarned < FIRST_PAYOUT_THRESHOLD) {
        const remaining = FIRST_PAYOUT_THRESHOLD - totalEscrowEarned;
        return res.status(400).json({
          success: false,
          error: `First payout requires earning at least £33.00 in total tips. You have earned £${(totalEscrowEarned / 100).toFixed(2)} so far. You need to earn £${(remaining / 100).toFixed(2)} more before your first payout.`,
          totalEscrowEarned: totalEscrowEarned,
          totalEscrowEarnedPounds: totalEscrowEarned / 100,
          requiredThreshold: FIRST_PAYOUT_THRESHOLD,
          requiredThresholdPounds: FIRST_PAYOUT_THRESHOLD / 100,
          remaining: remaining,
          remainingPounds: remaining / 100,
          isFirstPayout: true
        });
      }
    } else {
      // Subsequent payout: must have earned at least £10 more since last payout
      const earnedSinceLastPayout = totalEscrowEarned - lastPayoutTotalEarned;
      if (earnedSinceLastPayout < SUBSEQUENT_PAYOUT_INTERVAL) {
        const remaining = SUBSEQUENT_PAYOUT_INTERVAL - earnedSinceLastPayout;
        return res.status(400).json({
          success: false,
          error: `Subsequent payouts require earning at least £10.00 more since your last payout. You have earned £${(earnedSinceLastPayout / 100).toFixed(2)} since your last payout. You need to earn £${(remaining / 100).toFixed(2)} more.`,
          totalEscrowEarned: totalEscrowEarned,
          totalEscrowEarnedPounds: totalEscrowEarned / 100,
          lastPayoutTotalEarned: lastPayoutTotalEarned,
          lastPayoutTotalEarnedPounds: lastPayoutTotalEarned / 100,
          earnedSinceLastPayout: earnedSinceLastPayout,
          earnedSinceLastPayoutPounds: earnedSinceLastPayout / 100,
          requiredInterval: SUBSEQUENT_PAYOUT_INTERVAL,
          requiredIntervalPounds: SUBSEQUENT_PAYOUT_INTERVAL / 100,
          remaining: remaining,
          remainingPounds: remaining / 100,
          isFirstPayout: false
        });
      }
    }
    
    // Check for existing pending request
    const PayoutRequest = require('../models/PayoutRequest');
    const existingRequest = await PayoutRequest.findOne({
      userId: userId,
      status: { $in: ['pending', 'processing'] }
    });
    
    if (existingRequest) {
      return res.status(400).json({
        success: false,
        error: 'You already have a pending payout request. Please wait for it to be processed.'
      });
    }
    
    // Create payout request record
    const payoutRequest = new PayoutRequest({
      userId: userId,
      user_uuid: user.uuid,
      requestedAmount: requestedAmount,
      payoutMethod: payoutMethod || 'bank_transfer',
      payoutDetails: payoutDetails || {},
      status: 'pending',
      username: user.username,
      email: user.email,
      artistName: user.creatorProfile?.artistName || user.username
    });
    
    await payoutRequest.save();
    
    // Store verification hash
    try {
      const verificationService = require('../services/transactionVerificationService');
      await verificationService.storeVerificationHash(payoutRequest, 'PayoutRequest');
    } catch (verifyError) {
      console.error('Failed to store verification hash for payout request:', verifyError);
      // Don't fail the request if verification storage fails
    }
    
    // Send notification to admin
    try {
      const Notification = require('../models/Notification');
      const adminUsers = await User.find({ role: 'admin' }).select('_id');
      
      for (const admin of adminUsers) {
        const notification = new Notification({
          userId: admin._id,
          type: 'payout_requested',
          title: 'New Payout Request',
          message: `${user.creatorProfile?.artistName || user.username} requested a payout of £${(requestedAmount / 100).toFixed(2)}`,
          link: '/admin?tab=payouts',
          linkText: 'View Payout Request'
        });
        await notification.save();
      }
    } catch (notifError) {
      console.error('Failed to send payout request notification:', notifError);
      // Don't fail the request if notification fails
    }
    
    // Send email notification to admin
    try {
      const { sendPayoutRequestNotification } = require('../utils/emailService');
      await sendPayoutRequestNotification(payoutRequest, user);
    } catch (emailError) {
      console.error('Failed to send payout request email:', emailError);
      // Don't fail the request if email fails
    }
    
    console.log(`💰 Payout request created for user ${user.username} (${user.email}):`);
    console.log(`   - Request ID: ${payoutRequest._id}`);
    console.log(`   - Requested: £${(requestedAmount / 100).toFixed(2)}`);
    console.log(`   - Available: £${(availableBalance / 100).toFixed(2)}`);
    console.log(`   - Method: ${payoutMethod || 'bank_transfer'}`);
    
    res.json({
      success: true,
      message: 'Payout request submitted. You will be notified when it is processed.',
      requestId: payoutRequest._id,
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
 * @desc    Get all payout requests (admin only)
 * @access  Private (admin only)
 * 
 * Query params:
 *   status: 'pending' | 'processing' | 'completed' | 'rejected' (optional, defaults to 'pending')
 */
router.get('/admin/payouts', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const PayoutRequest = require('../models/PayoutRequest');
    const statusFilter = req.query.status || 'pending';
    
    // Validate status filter
    const validStatuses = ['pending', 'processing', 'completed', 'rejected', 'all'];
    if (!validStatuses.includes(statusFilter)) {
      return res.status(400).json({
        success: false,
        error: `Invalid status filter. Must be one of: ${validStatuses.join(', ')}`
      });
    }
    
    // Build query
    const query = {};
    if (statusFilter !== 'all') {
      query.status = statusFilter;
    }
    
    // Get payout requests with populated user data
    const payoutRequests = await PayoutRequest.find(query)
      .populate('userId', 'username email artistEscrowBalance creatorProfile')
      .populate('processedBy', 'username')
      .sort({ requestedAt: -1 })
      .limit(100);
    
    // Format response
    const formattedRequests = payoutRequests.map(request => {
      const user = request.userId;
      return {
        _id: request._id,
        uuid: request.uuid,
        userId: request.userId._id || request.userId,
        username: request.username || user?.username,
        email: request.email || user?.email,
        artistName: request.artistName || user?.creatorProfile?.artistName || user?.username,
        requestedAmount: request.requestedAmount,
        requestedAmountPounds: request.requestedAmount / 100,
        availableBalance: user?.artistEscrowBalance || 0,
        availableBalancePounds: (user?.artistEscrowBalance || 0) / 100,
        payoutMethod: request.payoutMethod,
        payoutDetails: request.payoutDetails,
        status: request.status,
        requestedAt: request.requestedAt,
        processedBy: request.processedBy ? {
          _id: request.processedBy._id,
          username: request.processedBy.username
        } : null,
        processedAt: request.processedAt,
        notes: request.notes,
        createdAt: request.createdAt,
        updatedAt: request.updatedAt
      };
    });
    
    // Calculate totals
    const pendingRequests = formattedRequests.filter(r => r.status === 'pending');
    const totalPendingAmount = pendingRequests.reduce((sum, r) => sum + r.requestedAmount, 0);
    
    res.json({
      success: true,
      payouts: formattedRequests,
      totalRequests: formattedRequests.length,
      pendingCount: pendingRequests.length,
      totalPendingAmount: totalPendingAmount,
      totalPendingAmountPounds: totalPendingAmount / 100,
      filter: statusFilter
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
 *   requestId: string (required) - PayoutRequest ID
 *   status: 'completed' | 'rejected' (required)
 *   payoutMethod?: string (optional - override from request)
 *   payoutDetails?: object (optional - transaction ID, etc.)
 *   notes?: string (optional - admin notes or rejection reason)
 * }
 */
router.post('/admin/process-payout', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const PayoutRequest = require('../models/PayoutRequest');
    const { requestId, status, payoutMethod, payoutDetails, notes } = req.body;
    
    if (!requestId) {
      return res.status(400).json({
        success: false,
        error: 'Payout request ID is required'
      });
    }
    
    if (!status || !['completed', 'rejected'].includes(status)) {
      return res.status(400).json({
        success: false,
        error: 'Status is required and must be "completed" or "rejected"'
      });
    }
    
    // Find the payout request (don't populate user yet - will fetch fresh data)
    const payoutRequest = await PayoutRequest.findById(requestId);
    
    if (!payoutRequest) {
      return res.status(404).json({
        success: false,
        error: 'Payout request not found'
      });
    }
    
    if (payoutRequest.status !== 'pending' && payoutRequest.status !== 'processing') {
      return res.status(400).json({
        success: false,
        error: `Payout request is already ${payoutRequest.status}`
      });
    }
    
    // Fetch fresh user data to ensure we have latest balance
    const user = await User.findById(payoutRequest.userId).select('username email artistEscrowBalance totalEscrowEarned lastPayoutTotalEarned artistEscrowHistory creatorProfile');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found for this payout request'
      });
    }
    
    const requestedAmount = payoutRequest.requestedAmount;
    
    if (status === 'completed') {
      // Use atomic update to prevent race conditions - deduct balance atomically
      // This ensures balance is sufficient and update happens in one operation
      const balanceBefore = user.artistEscrowBalance || 0;
      const totalEscrowEarned = user.totalEscrowEarned || 0;
      
      const updatedUser = await User.findOneAndUpdate(
        { 
          _id: user._id, 
          artistEscrowBalance: { $gte: requestedAmount } // Only update if balance is sufficient
        },
        { 
          $inc: { artistEscrowBalance: -requestedAmount }, // Atomic decrement
          $set: { lastPayoutTotalEarned: totalEscrowEarned } // Update last payout total earned to current total
        },
        { new: true, select: 'artistEscrowBalance totalEscrowEarned lastPayoutTotalEarned artistEscrowHistory username email creatorProfile' }
      );
      
      if (!updatedUser) {
        // Balance check failed - user balance was insufficient or changed
        return res.status(400).json({
          success: false,
          error: `User's current balance (£${(balanceBefore / 100).toFixed(2)}) is less than requested amount (£${(requestedAmount / 100).toFixed(2)}) or balance was modified`
        });
      }
      
      // Reload user to ensure we have the full history array (might be needed for proper subdocument handling)
      const userWithHistory = await User.findById(user._id).select('artistEscrowBalance artistEscrowHistory username email creatorProfile');
      
      // Update history entries - only mark entries that were actually paid (FIFO)
      // Mark history entries as claimed in order until payout amount is covered
      if (userWithHistory && userWithHistory.artistEscrowHistory && userWithHistory.artistEscrowHistory.length > 0) {
        let remainingPayout = requestedAmount;
        let historyModified = false;
        
        // Process history entries in order (oldest first for FIFO)
        const historyEntries = userWithHistory.artistEscrowHistory.slice(); // Create a copy
        const updatedHistory = historyEntries.map(entry => {
          // Convert subdocument to plain object if needed
          const entryObj = entry.toObject ? entry.toObject() : (typeof entry === 'object' ? entry : {});
          
          // Only process pending entries that haven't been claimed yet
          if (entryObj.status === 'pending' && remainingPayout > 0 && entryObj.amount) {
            const entryAmount = entryObj.amount;
            // Mark entry as claimed if the payout covers this entry
            if (entryAmount <= remainingPayout) {
              remainingPayout -= entryAmount;
              historyModified = true;
              return {
                ...entryObj,
                status: 'claimed',
                claimedAt: new Date()
              };
            }
          }
          return entryObj;
        });
        
        // Update history if any entries were marked as claimed
        if (historyModified) {
          userWithHistory.artistEscrowHistory = updatedHistory;
          await userWithHistory.save();
        }
      }
      
      // Use the user with history for response (or updatedUser if no history was modified)
      const finalUser = userWithHistory || updatedUser;
      
      // Update payout request
      payoutRequest.status = 'completed';
      payoutRequest.processedBy = req.user._id;
      payoutRequest.processedAt = new Date();
      if (payoutMethod) payoutRequest.payoutMethod = payoutMethod;
      if (payoutDetails) payoutRequest.payoutDetails = { ...payoutRequest.payoutDetails, ...payoutDetails };
      if (notes) payoutRequest.notes = notes;
      await payoutRequest.save();
      
      // Populate user reference for email notification
      await payoutRequest.populate('userId', 'username email artistEscrowBalance creatorProfile');
      const userForEmail = payoutRequest.userId || finalUser;
      
      // Send in-app notification to artist
      try {
        const Notification = require('../models/Notification');
        const notification = new Notification({
          userId: userForEmail._id,
          type: 'payout_processed',
          title: 'Payout Processed',
          message: `Your payout of £${(requestedAmount / 100).toFixed(2)} has been processed via ${payoutRequest.payoutMethod}.`,
          link: '/artist-escrow',
          linkText: 'View Escrow'
        });
        await notification.save();
      } catch (notifError) {
        console.error('Failed to send payout notification:', notifError);
      }
      
      // Send email notification to artist
      try {
        const { sendPayoutCompletedNotification } = require('../utils/emailService');
        await sendPayoutCompletedNotification(payoutRequest, userForEmail);
      } catch (emailError) {
        console.error('Failed to send payout completed email:', emailError);
        // Don't fail the request if email fails
      }
      
      const remainingBalance = finalUser.artistEscrowBalance || 0;
      
      console.log(`✅ Payout completed for user ${userForEmail.username}:`);
      console.log(`   - Request ID: ${payoutRequest._id}`);
      console.log(`   - Amount: £${(requestedAmount / 100).toFixed(2)}`);
      console.log(`   - Method: ${payoutRequest.payoutMethod}`);
      console.log(`   - Balance before: £${(balanceBefore / 100).toFixed(2)}`);
      console.log(`   - Balance after: £${(remainingBalance / 100).toFixed(2)}`);
      console.log(`   - Processed by: ${req.user.username}`);
      
      res.json({
        success: true,
        message: 'Payout processed successfully',
        payout: {
          requestId: payoutRequest._id,
          userId: userForEmail._id,
          username: userForEmail.username,
          amount: requestedAmount,
          amountPounds: requestedAmount / 100,
          payoutMethod: payoutRequest.payoutMethod,
          remainingBalance: remainingBalance,
          remainingBalancePounds: remainingBalance / 100,
          processedAt: payoutRequest.processedAt,
          processedBy: {
            _id: req.user._id,
            username: req.user.username
          }
        }
      });
      
    } else if (status === 'rejected') {
      // Update payout request to rejected
      payoutRequest.status = 'rejected';
      payoutRequest.processedBy = req.user._id;
      payoutRequest.processedAt = new Date();
      if (notes) payoutRequest.notes = notes;
      await payoutRequest.save();
      
      // Populate user reference for email notification
      await payoutRequest.populate('userId', 'username email artistEscrowBalance creatorProfile');
      const userForEmail = payoutRequest.userId || user;
      
      // Send in-app notification to artist
      try {
        const Notification = require('../models/Notification');
        const notification = new Notification({
          userId: userForEmail._id,
          type: 'payout_rejected',
          title: 'Payout Request Rejected',
          message: `Your payout request of £${(requestedAmount / 100).toFixed(2)} has been rejected.${notes ? ` Reason: ${notes}` : ''}`,
          link: '/artist-escrow',
          linkText: 'View Escrow'
        });
        await notification.save();
      } catch (notifError) {
        console.error('Failed to send rejection notification:', notifError);
      }
      
      // Send email notification to artist
      try {
        const { sendPayoutRejectedNotification } = require('../utils/emailService');
        await sendPayoutRejectedNotification(payoutRequest, userForEmail, notes);
      } catch (emailError) {
        console.error('Failed to send payout rejected email:', emailError);
        // Don't fail the request if email fails
      }
      
      console.log(`❌ Payout rejected for user ${userForEmail.username}:`);
      console.log(`   - Request ID: ${payoutRequest._id}`);
      console.log(`   - Amount: £${(requestedAmount / 100).toFixed(2)}`);
      console.log(`   - Reason: ${notes || 'Not specified'}`);
      console.log(`   - Rejected by: ${req.user.username}`);
      
      res.json({
        success: true,
        message: 'Payout request rejected',
        payout: {
          requestId: payoutRequest._id,
          userId: userForEmail._id,
          username: userForEmail.username,
          amount: requestedAmount,
          amountPounds: requestedAmount / 100,
          status: 'rejected',
          rejectedAt: payoutRequest.processedAt,
          rejectedBy: {
            _id: req.user._id,
            username: req.user.username
          },
          reason: notes
        }
      });
    }
    
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

