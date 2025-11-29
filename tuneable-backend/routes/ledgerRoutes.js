const express = require('express');
const router = express.Router();
const TuneableLedger = require('../models/TuneableLedger');
const User = require('../models/User');
const Media = require('../models/Media');
const authMiddleware = require('../middleware/authMiddleware');
const adminMiddleware = require('../middleware/adminMiddleware');
const mongoose = require('mongoose');

/**
 * GET /api/ledger/stats
 * Get ledger statistics for dashboard
 */
router.get('/stats', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const [
      totalCount,
      tipCount,
      refundCount,
      topUpCount,
      payoutCount,
      totalVolume,
      recentEntries,
      sequenceRange
    ] = await Promise.all([
      TuneableLedger.countDocuments(),
      TuneableLedger.countDocuments({ transactionType: 'TIP' }),
      TuneableLedger.countDocuments({ transactionType: 'REFUND' }),
      TuneableLedger.countDocuments({ transactionType: 'TOP_UP' }),
      TuneableLedger.countDocuments({ transactionType: 'PAY_OUT' }),
      TuneableLedger.aggregate([
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]),
      TuneableLedger.find()
        .sort({ sequence: -1 })
        .limit(10)
        .select('sequence transactionType amount timestamp username mediaTitle')
        .lean(),
      TuneableLedger.aggregate([
        { $group: { _id: null, min: { $min: '$sequence' }, max: { $max: '$sequence' } } }
      ])
    ]);

    const totalVolumePence = totalVolume[0]?.total || 0;
    const range = sequenceRange[0] || { min: 0, max: 0 };

    // Get last 24 hours activity
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const last24Hours = await TuneableLedger.countDocuments({
      timestamp: { $gte: oneDayAgo }
    });

    res.json({
      success: true,
      stats: {
        totalTransactions: totalCount,
        byType: {
          tips: tipCount,
          refunds: refundCount,
          topUps: topUpCount,
          payouts: payoutCount
        },
        totalVolume: totalVolumePence,
        totalVolumePounds: (totalVolumePence / 100).toFixed(2),
        sequenceRange: {
          first: range.min || 0,
          last: range.max || 0,
          total: range.max && range.min ? range.max - range.min + 1 : 0
        },
        last24Hours,
        recentEntries
      }
    });
  } catch (error) {
    console.error('Error fetching ledger stats:', error);
    res.status(500).json({ error: 'Failed to fetch ledger statistics', details: error.message });
  }
});

/**
 * GET /api/ledger/entries
 * Get ledger entries with filtering, sorting, and pagination
 */
router.get('/entries', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const {
      transactionType,
      userId,
      mediaId,
      startDate,
      endDate,
      minAmount,
      maxAmount,
      sortBy = 'sequence',
      sortDirection = 'desc',
      page = 1,
      limit = 50,
      search
    } = req.query;

    // Build query
    const query = {};

    if (transactionType) {
      query.transactionType = transactionType;
    }

    if (userId) {
      if (mongoose.Types.ObjectId.isValid(userId)) {
        query.userId = userId;
      } else {
        // Invalid ObjectId, return empty results
        return res.json({
          success: true,
          entries: [],
          pagination: {
            total: 0,
            page: parseInt(page),
            limit: parseInt(limit),
            pages: 0
          }
        });
      }
    }

    if (mediaId) {
      if (mongoose.Types.ObjectId.isValid(mediaId)) {
        query.mediaId = mediaId;
      } else {
        // Invalid ObjectId, return empty results
        return res.json({
          success: true,
          entries: [],
          pagination: {
            total: 0,
            page: parseInt(page),
            limit: parseInt(limit),
            pages: 0
          }
        });
      }
    }

    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) query.timestamp.$gte = new Date(startDate);
      if (endDate) query.timestamp.$lte = new Date(endDate);
    }

    if (minAmount || maxAmount) {
      query.amount = {};
      if (minAmount) query.amount.$gte = parseInt(minAmount);
      if (maxAmount) query.amount.$lte = parseInt(maxAmount);
    }

    // Search by username, mediaTitle, or description
    if (search) {
      query.$or = [
        { username: { $regex: search, $options: 'i' } },
        { mediaTitle: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const sort = { [sortBy]: sortDirection === 'asc' ? 1 : -1 };

    // Get total count and entries
    const [total, entries] = await Promise.all([
      TuneableLedger.countDocuments(query),
      TuneableLedger.find(query)
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit))
        .populate('userId', 'username email uuid')
        .populate('mediaId', 'title uuid')
        .populate('partyId', 'name uuid')
        .populate('bidId', 'amount status')
        .lean()
    ]);

    res.json({
      success: true,
      entries,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching ledger entries:', error);
    res.status(500).json({ error: 'Failed to fetch ledger entries', details: error.message });
  }
});

/**
 * GET /api/ledger/entry/:entryId
 * Get single ledger entry details
 */
router.get('/entry/:entryId', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { entryId } = req.params;

    const entry = await TuneableLedger.findById(entryId)
      .populate('userId', 'username email uuid profilePic')
      .populate('mediaId', 'title uuid coverArt')
      .populate('partyId', 'name uuid')
      .populate('bidId', 'amount status createdAt')
      .populate('referenceTransactionId')
      .lean();

    if (!entry) {
      return res.status(404).json({ error: 'Ledger entry not found' });
    }

    // Verify integrity
    const doc = new TuneableLedger(entry);
    const isValid = doc.verifyIntegrity();

    res.json({
      success: true,
      entry: {
        ...entry,
        integrityValid: isValid
      }
    });
  } catch (error) {
    console.error('Error fetching ledger entry:', error);
    res.status(500).json({ error: 'Failed to fetch ledger entry', details: error.message });
  }
});

/**
 * GET /api/ledger/user/:userId
 * Get user's ledger history
 */
router.get('/user/:userId', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;
    const { limit = 100 } = req.query;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }

    const entries = await TuneableLedger.getUserLedger(userId, parseInt(limit));

    res.json({
      success: true,
      entries,
      count: entries.length
    });
  } catch (error) {
    console.error('Error fetching user ledger:', error);
    res.status(500).json({ error: 'Failed to fetch user ledger', details: error.message });
  }
});

/**
 * GET /api/ledger/media/:mediaId
 * Get media's ledger history
 */
router.get('/media/:mediaId', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { mediaId } = req.params;
    const { limit = 100 } = req.query;

    if (!mongoose.Types.ObjectId.isValid(mediaId)) {
      return res.status(400).json({ error: 'Invalid media ID' });
    }

    const entries = await TuneableLedger.getMediaLedger(mediaId, parseInt(limit));

    res.json({
      success: true,
      entries,
      count: entries.length
    });
  } catch (error) {
    console.error('Error fetching media ledger:', error);
    res.status(500).json({ error: 'Failed to fetch media ledger', details: error.message });
  }
});

/**
 * POST /api/ledger/verify
 * Verify ledger integrity
 */
router.post('/verify', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { limit = 1000 } = req.body;

    const result = await TuneableLedger.verifyLedgerIntegrity(parseInt(limit));

    res.json({
      success: true,
      verification: {
        ...result,
        invalidCount: result.invalid || 0, // Map invalid to invalidCount for frontend
        integrityPercentage: result.totalChecked > 0
          ? ((result.valid / result.totalChecked) * 100).toFixed(2)
          : 0
      }
    });
  } catch (error) {
    console.error('Error verifying ledger integrity:', error);
    res.status(500).json({ error: 'Failed to verify ledger integrity', details: error.message });
  }
});

/**
 * GET /api/ledger/search
 * Search ledger entries by various criteria
 */
router.get('/search', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { q, type = 'all' } = req.query;

    if (!q || q.length < 2) {
      return res.status(400).json({ error: 'Search query must be at least 2 characters' });
    }

    const query = {};

    switch (type) {
      case 'uuid':
        query.uuid = q;
        break;
      case 'sequence':
        query.sequence = parseInt(q);
        break;
      case 'hash':
        query.transactionHash = q;
        break;
      case 'user':
        const users = await User.find({
          $or: [
            { username: { $regex: q, $options: 'i' } },
            { email: { $regex: q, $options: 'i' } },
            { uuid: q }
          ]
        }).select('_id').lean();
        query.userId = { $in: users.map(u => u._id) };
        break;
      case 'media':
        const media = await Media.find({
          $or: [
            { title: { $regex: q, $options: 'i' } },
            { uuid: q }
          ]
        }).select('_id').lean();
        query.mediaId = { $in: media.map(m => m._id) };
        break;
      default:
        // Search across multiple fields
        query.$or = [
          { uuid: q },
          { username: { $regex: q, $options: 'i' } },
          { mediaTitle: { $regex: q, $options: 'i' } },
          { description: { $regex: q, $options: 'i' } },
          { transactionHash: q }
        ];
        if (!isNaN(q)) {
          query.$or.push({ sequence: parseInt(q) });
        }
    }

    const entries = await TuneableLedger.find(query)
      .sort({ sequence: -1 })
      .limit(50)
      .populate('userId', 'username uuid')
      .populate('mediaId', 'title uuid')
      .lean();

    res.json({
      success: true,
      entries,
      count: entries.length
    });
  } catch (error) {
    console.error('Error searching ledger:', error);
    res.status(500).json({ error: 'Failed to search ledger', details: error.message });
  }
});

/**
 * GET /api/ledger/reconciliation
 * Compare user balances and media aggregates with ledger
 */
router.get('/reconciliation', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { userId, mediaId } = req.query;

    if (userId) {
      // Reconcile user balance
      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Get latest ledger entry for this user
      const latestEntry = await TuneableLedger.findOne({ userId })
        .sort({ sequence: -1 })
        .lean();

      const expectedBalance = latestEntry?.userBalancePost || 0;
      const actualBalance = user.balance || 0;
      const discrepancy = actualBalance - expectedBalance;

      res.json({
        success: true,
        reconciliation: {
          userId: user._id,
          username: user.username,
          actualBalance,
          expectedBalance,
          discrepancy,
          isBalanced: discrepancy === 0,
          lastLedgerSequence: latestEntry?.sequence || null,
          lastLedgerTimestamp: latestEntry?.timestamp || null
        }
      });
    } else if (mediaId) {
      // Reconcile media aggregate
      const media = await Media.findById(mediaId);
      if (!media) {
        return res.status(404).json({ error: 'Media not found' });
      }

      // Get latest ledger entry for this media
      const latestEntry = await TuneableLedger.findOne({ mediaId })
        .sort({ sequence: -1 })
        .lean();

      const expectedAggregate = latestEntry?.mediaAggregatePost || 0;
      const actualAggregate = media.globalMediaAggregate || 0;
      const discrepancy = actualAggregate - expectedAggregate;

      res.json({
        success: true,
        reconciliation: {
          mediaId: media._id,
          mediaTitle: media.title,
          actualAggregate,
          expectedAggregate,
          discrepancy,
          isBalanced: discrepancy === 0,
          lastLedgerSequence: latestEntry?.sequence || null,
          lastLedgerTimestamp: latestEntry?.timestamp || null
        }
      });
    } else {
      return res.status(400).json({ error: 'Either userId or mediaId is required' });
    }
  } catch (error) {
    console.error('Error reconciling ledger:', error);
    res.status(500).json({ error: 'Failed to reconcile ledger', details: error.message });
  }
});

module.exports = router;

