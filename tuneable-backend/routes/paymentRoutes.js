const express = require('express');
const router = express.Router();
const Stripe = require('stripe');
const authMiddleware = require('../middleware/authMiddleware');
const User = require('../models/User'); // Import user model
const WalletTransaction = require('../models/WalletTransaction'); // Import wallet transaction model
const { sendPaymentNotification } = require('../utils/emailService');
require('dotenv').config();

// Test mode Stripe (for wallet top-ups - can be overridden by AdminSettings)
const stripeTest = new Stripe(process.env.STRIPE_SECRET_KEY_TEST || '');

// Live mode Stripe (for share purchases/funding and wallet top-ups when enabled)
const stripeLive = process.env.STRIPE_SECRET_KEY_LIVE ? new Stripe(process.env.STRIPE_SECRET_KEY_LIVE || '') : null;

// Helper function to get the appropriate Stripe instance for wallet top-ups
const getWalletTopUpStripe = async () => {
  try {
    const AdminSettings = require('../models/AdminSettings');
    const settings = await AdminSettings.getSettings();
    const mode = settings.stripe?.walletTopUpMode || 'live';
    
    if (mode === 'live' && stripeLive) {
      return stripeLive;
    }
    // Default to test mode if live not configured or mode is 'test'
    return stripeTest;
  } catch (error) {
    console.error('Error getting Stripe instance for wallet top-up:', error);
    // Fallback to test mode on error
    return stripeTest;
  }
};

// Create Payment Intent
router.post('/create-payment-intent', authMiddleware, async (req, res) => {
  try {
    const { amount, currency } = req.body;
    const userId = req.user.uuid;  // Use UUID instead of _id for Stripe metadata

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

    const stripe = await getWalletTopUpStripe();
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amount * 100, // Convert to cents
      currency: currency || 'gbp',
      automatic_payment_methods: { enabled: true },
    });

    res.json({ clientSecret: paymentIntent.client_secret, userId });
  } catch (error) {
    console.error('Stripe Payment Intent Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Create Stripe Checkout Session for Wallet Top-up (uses AdminSettings to determine test/live mode)
router.post('/create-checkout-session', authMiddleware, async (req, res) => {
  try {
    const { amount, totalCharge, currency = 'gbp' } = req.body;
    const userId = req.user.uuid;  // Use UUID string instead of _id ObjectId

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

    // Use totalCharge if provided (includes fees), otherwise use amount (backward compatibility)
    const chargeAmount = totalCharge && totalCharge > amount ? totalCharge : amount;
    
    // amount is the wallet credit amount, chargeAmount is what Stripe will charge
    const stripe = await getWalletTopUpStripe();
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: currency,
            product_data: {
              name: 'Tuneable Wallet Top-up',
              description: `Add £${amount} to your Tuneable wallet`,
            },
            unit_amount: Math.round(chargeAmount * 100), // Convert to pence - use totalCharge if provided
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/wallet?success=true&amount=${amount}`,
      cancel_url: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/wallet?canceled=true`,
      metadata: {
        userId: userId,  // Now a UUID string, not ObjectId
        amount: amount.toString(), // Wallet credit amount (what user wants to add)
        totalCharge: chargeAmount.toString(), // Total Stripe charge (including fees)
        type: 'wallet_topup'
      },
    });

    res.json({ sessionId: session.id, url: session.url });
  } catch (error) {
    console.error('Stripe Checkout Session Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Create Stripe Checkout Session for Share Purchase (LIVE MODE)
router.post('/create-share-checkout-session', authMiddleware, async (req, res) => {
  try {
    const { amount, currency = 'gbp', packageId, shares } = req.body;
    const userId = req.user.uuid;

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

    if (!stripeLive) {
      return res.status(500).json({ error: 'Live Stripe key not configured. Share purchases require live mode.' });
    }

    const session = await stripeLive.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: currency,
            product_data: {
              name: 'Tuneable Share Purchase',
              description: shares 
                ? `Purchase ${shares} share${shares > 1 ? 's' : ''} in Tuneable`
                : `Purchase shares in Tuneable`,
            },
            unit_amount: Math.round(amount * 100),
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/join-us?success=true&amount=${amount}&packageId=${packageId || 'custom'}`,
      cancel_url: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/join-us?canceled=true`,
      metadata: {
        userId: userId,
        amount: amount.toString(),
        type: 'share_purchase',
        packageId: packageId || 'custom',
        shares: shares ? shares.toString() : ''
      },
    });

    res.json({ sessionId: session.id, url: session.url });
  } catch (error) {
    console.error('Stripe Share Purchase Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// NOTE: Webhook route is defined directly in index.js at /api/payments/webhook
// This ensures raw body parsing works correctly for Stripe signature verification.
// The webhook handler is NOT in this router to avoid conflicts with Express middleware ordering.

// Development endpoint to manually update balance (for testing)
// NOTE: This is a fallback for when webhooks don't work. In production, webhooks should handle Stripe payments.
router.post('/update-balance', authMiddleware, async (req, res) => {
  try {
    const { amount, description, stripeSessionId } = req.body;
    const userId = req.user._id;  // Use _id here since it's internal only, not passed to Stripe

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

    // Convert amount to pence for comparison
    const amountPence = Math.round(amount * 100);
    
    // Check if webhook already processed this payment
    // Look for recent Stripe transactions with same amount (within last 5 minutes)
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    
    // First check by sessionId if provided
    if (stripeSessionId) {
      const existingBySession = await WalletTransaction.findOne({
        stripeSessionId: stripeSessionId,
        userId: userId
      });
      
      if (existingBySession) {
        console.log(`✅ Payment already processed by webhook for session ${stripeSessionId}`);
        const user = await User.findById(userId);
        return res.json({
          message: 'Payment already processed by webhook',
          balance: user?.balance || 0,
          transaction: existingBySession
        });
      }
    }
    
    // Also check for recent Stripe transactions with same amount (to catch webhook-processed payments)
    // Use a wider time window (10 minutes) and allow for small amount differences (fees might vary)
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    const amountTolerance = 50; // Allow ±50 pence difference (for fee variations)
    
    const existingTransaction = await WalletTransaction.findOne({
      userId: userId,
      amount: { 
        $gte: amountPence - amountTolerance, 
        $lte: amountPence + amountTolerance 
      },
      paymentMethod: 'stripe',
      type: 'topup',
      status: 'completed',
      createdAt: { $gte: tenMinutesAgo }
    });
    
    if (existingTransaction) {
      // Webhook already processed this payment, just return the current balance
      console.log(`✅ Payment already processed by webhook (found existing transaction: ${existingTransaction._id})`);
      console.log(`   Existing amount: £${(existingTransaction.amount / 100).toFixed(2)}, Requested: £${(amountPence / 100).toFixed(2)}`);
      const user = await User.findById(userId);
      return res.json({
        message: 'Payment already processed by webhook',
        balance: user?.balance || 0,
        transaction: existingTransaction
      });
    }

    // Get current balance before update
    const userBefore = await User.findById(userId);
    if (!userBefore) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const balanceBefore = userBefore.balance || 0;

    // Calculate user aggregate PRE (total tips placed) for ledger entry
    const Bid = require('../models/Bid');
    const userBidsPre = await Bid.find({
      userId: userId,
      status: 'active'
    }).lean();
    const userAggregatePre = userBidsPre.reduce((sum, bid) => sum + (bid.amount || 0), 0);

    // Update user balance
    const user = await User.findByIdAndUpdate(
      userId,
      { $inc: { balance: amountPence } },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Create wallet transaction record
    // If this is a Stripe payment fallback, mark it appropriately
    const isStripeFallback = !!stripeSessionId;
    let walletTransaction;
    try {
      walletTransaction = await WalletTransaction.create({
        userId: user._id,
        user_uuid: user.uuid,
        amount: amountPence,
        type: isStripeFallback ? 'topup' : 'adjustment',
        status: 'completed',
        paymentMethod: isStripeFallback ? 'stripe' : 'manual',
        stripeSessionId: stripeSessionId || undefined,
        balanceBefore: balanceBefore,
        balanceAfter: user.balance,
        description: description || (isStripeFallback ? 'Wallet top-up via Stripe (fallback)' : 'Manual balance adjustment'),
        username: user.username
      });
      
      // Store verification hash
      try {
        const verificationService = require('../services/transactionVerificationService');
        await verificationService.storeVerificationHash(walletTransaction, 'WalletTransaction');
      } catch (verifyError) {
        console.error('Failed to store verification hash:', verifyError);
      }
    } catch (txError) {
      console.error('Failed to create wallet transaction record:', txError);
      // Don't fail the request if transaction record creation fails
    }

    // Create ledger entry for top-ups (only for Stripe fallbacks, not manual adjustments)
    if (isStripeFallback) {
      try {
        const tuneableLedgerService = require('../services/tuneableLedgerService');
        const ledgerEntry = await tuneableLedgerService.createTopUpEntry({
          userId: user._id,
          amount: amountPence,
          userBalancePre: balanceBefore,
          userAggregatePre,
          referenceTransactionId: walletTransaction?._id || null,
          metadata: {
            stripeSessionId: stripeSessionId,
            isFallback: true, // Mark as fallback so we know webhook didn't process it
            description: description || 'Wallet top-up via Stripe (fallback)'
          }
        });
        console.log(`✅ Ledger entry created for fallback top-up: Entry ID ${ledgerEntry._id}`);
      } catch (ledgerError) {
        console.error('❌ Failed to create ledger entry for fallback top-up:', ledgerError);
        // Don't fail the request, but log the error
      }
    }

    res.json({ message: 'Balance updated successfully', balance: user.balance });
  } catch (error) {
    console.error('Error updating balance:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Confirm Payment & Update User Balance
router.post('/confirm-payment', authMiddleware, async (req, res) => {
  try {
    const { amount } = req.body;
    const userId = req.user._id;  // Use _id here since it's internal only, not passed to Stripe

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

    // Get current balance before update
    const userBefore = await User.findById(userId);
    if (!userBefore) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const balanceBefore = userBefore.balance || 0;
    const amountPence = Math.round(amount * 100); // Convert to pence if provided in pounds

    // Update user balance
    const user = await User.findByIdAndUpdate(
      userId,
      { $inc: { balance: amountPence } },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Create wallet transaction record
    try {
      const walletTransaction = await WalletTransaction.create({
        userId: user._id,
        user_uuid: user.uuid,
        amount: amountPence,
        type: 'topup',
        status: 'completed',
        paymentMethod: 'manual',
        balanceBefore: balanceBefore,
        balanceAfter: user.balance,
        description: 'Payment confirmed and balance updated',
        username: user.username
      });
      
      // Store verification hash
      try {
        const verificationService = require('../services/transactionVerificationService');
        await verificationService.storeVerificationHash(walletTransaction, 'WalletTransaction');
      } catch (verifyError) {
        console.error('Failed to store verification hash:', verifyError);
      }
    } catch (txError) {
      console.error('Failed to create wallet transaction record:', txError);
      // Don't fail the request if transaction record creation fails
    }

    res.json({ message: 'Payment successful, balance updated', balance: user.balance });
  } catch (error) {
    console.error('Error confirming payment:', error.message);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
