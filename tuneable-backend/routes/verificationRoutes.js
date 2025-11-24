const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const adminMiddleware = require('../middleware/adminMiddleware');
const verificationService = require('../services/transactionVerificationService');

/**
 * Verify a specific transaction
 * @route GET /api/verification/transaction/:transactionId
 * @access Private (any authenticated user can verify their own transactions)
 */
router.get('/transaction/:transactionId', authMiddleware, async (req, res) => {
  try {
    const { transactionId } = req.params;
    const { type } = req.query; // 'WalletTransaction', 'Bid', etc.

    if (!type) {
      return res.status(400).json({ error: 'Transaction type required (type query param)' });
    }

    const result = await verificationService.verifyTransaction(transactionId, type);

    if (result.error && result.error.includes('not found')) {
      return res.status(404).json(result);
    }

    res.json(result);
  } catch (error) {
    console.error('Verification error:', error);
    res.status(500).json({ error: 'Failed to verify transaction', details: error.message });
  }
});

/**
 * Get verification statistics
 * @route GET /api/verification/stats
 * @access Admin only
 */
router.get('/stats', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const stats = await verificationService.getVerificationStats();
    res.json(stats);
  } catch (error) {
    console.error('Error fetching verification stats:', error);
    res.status(500).json({ error: 'Failed to fetch verification stats', details: error.message });
  }
});

/**
 * Get transactions with hash mismatches (anomalies)
 * @route GET /api/verification/anomalies
 * @access Admin only
 */
router.get('/anomalies', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { limit = 100 } = req.query;
    const anomalies = await verificationService.getAnomalies(parseInt(limit));
    res.json({ anomalies, count: anomalies.length });
  } catch (error) {
    console.error('Error fetching anomalies:', error);
    res.status(500).json({ error: 'Failed to fetch anomalies', details: error.message });
  }
});

/**
 * Verify all transactions of a specific type
 * @route POST /api/verification/verify-type
 * @access Admin only
 */
router.post('/verify-type', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { type, limit = 1000, skip = 0 } = req.body;

    if (!type) {
      return res.status(400).json({ error: 'Transaction type required' });
    }

    const results = await verificationService.verifyAllTransactions(type, { limit, skip });
    res.json(results);
  } catch (error) {
    console.error('Error verifying transactions:', error);
    res.status(500).json({ error: 'Failed to verify transactions', details: error.message });
  }
});

/**
 * Verify all financial transactions
 * @route POST /api/verification/verify-all
 * @access Admin only
 */
router.post('/verify-all', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { limit = 1000, skip = 0 } = req.body;

    const results = await verificationService.verifyAllFinancialTransactions({ limit, skip });
    
    // If anomalies found, log them
    if (results.summary.mismatches > 0) {
      console.error('⚠️ SECURITY ALERT: Hash mismatches detected!', {
        mismatches: results.summary.mismatches,
        anomalies: results.anomalies
      });
    }

    res.json(results);
  } catch (error) {
    console.error('Error verifying all transactions:', error);
    res.status(500).json({ error: 'Failed to verify all transactions', details: error.message });
  }
});

module.exports = router;

