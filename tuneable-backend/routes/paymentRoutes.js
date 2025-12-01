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

// Webhook to handle successful payments (handles both test and live modes)
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  console.log('🔔 Stripe webhook received - checking signature...');
  const sig = req.headers['stripe-signature'];
  let event;
  let isLiveMode = false;

  if (!sig) {
    console.error('❌ Webhook request missing stripe-signature header');
    return res.status(400).send('Missing stripe-signature header');
  }

  // Try test mode webhook first
  try {
    const testSecret = process.env.STRIPE_WEBHOOK_SECRET_TEST || process.env.STRIPE_WEBHOOK_SECRET;
    if (!testSecret) {
      console.warn('⚠️ STRIPE_WEBHOOK_SECRET_TEST not configured, skipping test mode verification');
      throw new Error('Test webhook secret not configured');
    }
    event = stripeTest.webhooks.constructEvent(
      req.body, 
      sig, 
      testSecret
    );
    isLiveMode = false;
    console.log(`✅ Webhook signature verified (TEST mode): Event type: ${event.type}`);
  } catch (testErr) {
    console.log(`⚠️ Test mode webhook verification failed: ${testErr.message}`);
    // If test webhook fails, try live webhook
    if (stripeLive && process.env.STRIPE_WEBHOOK_SECRET_LIVE) {
      try {
        event = stripeLive.webhooks.constructEvent(
          req.body, 
          sig, 
          process.env.STRIPE_WEBHOOK_SECRET_LIVE
        );
        isLiveMode = true;
        console.log(`✅ Webhook signature verified (LIVE mode): Event type: ${event.type}`);
      } catch (liveErr) {
        console.error(`❌ Webhook signature verification failed for both test and live modes. Test error: ${testErr.message}, Live error: ${liveErr.message}`);
        return res.status(400).send(`Webhook Error: ${liveErr.message}`);
      }
    } else {
      console.error(`❌ Webhook signature verification failed. Test error: ${testErr.message}, Live mode not configured or secret missing`);
      return res.status(400).send(`Webhook Error: ${testErr.message}`);
    }
  }

  // Handle the checkout.session.completed event
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    console.log(`📦 Checkout session completed: Session ID ${session.id}, Metadata:`, session.metadata);
    
    if (session.metadata && session.metadata.type === 'wallet_topup') {
      console.log(`🔔 Webhook received for wallet top-up: Session ${session.id}, User ${session.metadata.userId}`);
      try {
        const userId = session.metadata.userId;
        
        if (!userId) {
          console.error('❌ Wallet top-up webhook: userId missing from session metadata');
          return;
        }
        
        // Get the actual Stripe instance (test or live)
        const stripe = isLiveMode ? stripeLive : stripeTest;
        
        // Retrieve PaymentIntent to get actual amount received (net after fees)
        let paymentIntent;
        if (session.payment_intent) {
          paymentIntent = await stripe.paymentIntents.retrieve(session.payment_intent);
        }
        
        // Use actual amount received from Stripe (net after fees)
        // This is what Tuneable actually receives in the bank account
        const amountReceivedPence = paymentIntent
          ? paymentIntent.amount_received || paymentIntent.amount  // amount_received is net after fees
          : session.amount_total; // Fallback to session total if PaymentIntent not available
        
        // Calculate fees for transparency
        const amountRequestedPence = Math.round(parseFloat(session.metadata.amount) * 100);
        const stripeFeesPence = amountRequestedPence - amountReceivedPence;
        
        // Convert to pounds for display
        const amountReceivedPounds = amountReceivedPence / 100;
        const stripeFeesPounds = stripeFeesPence / 100;
        
        // Find user first to get current balance
        const user = await User.findOne({ uuid: userId });
        
        if (!user) {
          console.error(`User not found for wallet top-up: ${userId}`);
          return;
        }
        
        const balanceBefore = user.balance || 0;
        
        // Calculate user aggregate PRE (total tips placed)
        const Bid = require('../models/Bid');
        const userBidsPre = await Bid.find({
          userId: user._id,
          status: 'active'
        }).lean();
        const userAggregatePre = userBidsPre.reduce((sum, bid) => sum + (bid.amount || 0), 0);
        
        // Update user balance with ACTUAL amount received (net after fees)
        const updatedUser = await User.findOneAndUpdate(
          { uuid: userId },
          { $inc: { balance: amountReceivedPence } }, // Use NET amount, not requested amount
          { new: true }
        );
        
        if (updatedUser) {
          console.log(`Wallet top-up successful: User ${userId} requested £${(amountRequestedPence / 100).toFixed(2)}, received £${amountReceivedPounds.toFixed(2)} (fees: £${stripeFeesPounds.toFixed(2)}), new balance: £${(updatedUser.balance / 100).toFixed(2)}`);
          
          // Create wallet transaction record with fee information
          let walletTransaction;
          try {
            walletTransaction = await WalletTransaction.create({
              userId: updatedUser._id,
              user_uuid: updatedUser.uuid,
              amount: amountReceivedPence, // NET amount received
              type: 'topup',
              status: 'completed',
              paymentMethod: 'stripe',
              stripeSessionId: session.id,
              stripePaymentIntentId: session.payment_intent,
              balanceBefore: balanceBefore,
              balanceAfter: updatedUser.balance,
              description: `Wallet top-up via Stripe (net: £${amountReceivedPounds.toFixed(2)})`,
              username: updatedUser.username,
              metadata: {
                currency: session.currency || 'gbp',
                customerEmail: session.customer_email,
                customerDetails: session.customer_details,
                // Fee tracking
                amountRequested: amountRequestedPence, // What user paid
                amountReceived: amountReceivedPence, // What Tuneable received
                stripeFees: stripeFeesPence, // Fees absorbed by user
                stripeFeesPounds: stripeFeesPounds.toFixed(2),
                isLiveMode: isLiveMode
              }
            });
            console.log(`✅ Wallet transaction created: ${walletTransaction._id} for user ${userId}`);
            
            // Store verification hash
            try {
              const verificationService = require('../services/transactionVerificationService');
              await verificationService.storeVerificationHash(walletTransaction, 'WalletTransaction');
            } catch (verifyError) {
              console.error('Failed to store verification hash:', verifyError);
            }
          } catch (txError) {
            console.error('❌ Failed to create wallet transaction record:', txError);
            console.error('Transaction error details:', {
              userId: updatedUser._id,
              user_uuid: updatedUser.uuid,
              amount: amountReceivedPence,
              stripeSessionId: session.id,
              error: txError.message,
              stack: txError.stack
            });
            // Continue even if wallet transaction creation fails - balance was already updated
          }
          
          // Create ledger entry with NET amount - ALWAYS try to create, even if walletTransaction failed
          // This ensures all top-ups are recorded in the ledger for financial integrity
          console.log(`📝 Attempting to create ledger entry for top-up: User ${userId}, Amount: £${amountReceivedPounds.toFixed(2)}`);
          try {
            const tuneableLedgerService = require('../services/tuneableLedgerService');
            
            // Validate required parameters before calling
            if (!updatedUser._id) {
              throw new Error('updatedUser._id is missing');
            }
            if (typeof amountReceivedPence !== 'number' || isNaN(amountReceivedPence)) {
              throw new Error(`Invalid amountReceivedPence: ${amountReceivedPence}`);
            }
            if (typeof balanceBefore !== 'number' || isNaN(balanceBefore)) {
              throw new Error(`Invalid balanceBefore: ${balanceBefore}`);
            }
            if (typeof userAggregatePre !== 'number' || isNaN(userAggregatePre)) {
              throw new Error(`Invalid userAggregatePre: ${userAggregatePre}`);
            }
            
            console.log(`📝 Ledger entry parameters validated: userId=${updatedUser._id}, amount=${amountReceivedPence}, balancePre=${balanceBefore}, aggregatePre=${userAggregatePre}`);
            
            const ledgerEntry = await tuneableLedgerService.createTopUpEntry({
              userId: updatedUser._id,
              amount: amountReceivedPence, // NET amount for ledger
              userBalancePre: balanceBefore,
              userAggregatePre,
              referenceTransactionId: walletTransaction?._id || null, // Use walletTransaction ID if available
              metadata: {
                stripeSessionId: session.id,
                stripePaymentIntentId: session.payment_intent,
                currency: session.currency || 'gbp',
                customerEmail: session.customer_email,
                customerDetails: session.customer_details,
                // Fee tracking in ledger
                amountRequested: amountRequestedPence,
                amountReceived: amountReceivedPence,
                stripeFees: stripeFeesPence,
                isLiveMode: isLiveMode,
                walletTransactionCreated: !!walletTransaction?._id // Track if wallet transaction exists
              }
            });
            
            console.log(`✅ Ledger entry created successfully: Entry ID ${ledgerEntry._id}, User ${userId}, Amount: £${amountReceivedPounds.toFixed(2)}, Transaction: ${walletTransaction?._id || 'N/A'}`);
          } catch (ledgerError) {
            console.error('❌ CRITICAL: Failed to create ledger entry for top-up');
            console.error('Ledger error details:', {
              userId: updatedUser._id,
              user_uuid: updatedUser.uuid,
              amount: amountReceivedPence,
              amountType: typeof amountReceivedPence,
              walletTransactionId: walletTransaction?._id || null,
              userBalancePre: balanceBefore,
              userBalancePreType: typeof balanceBefore,
              userAggregatePre: userAggregatePre,
              userAggregatePreType: typeof userAggregatePre,
              error: ledgerError.message,
              errorName: ledgerError.name,
              stack: ledgerError.stack
            });
            // Don't throw - balance was already updated, just log the error
            // This is a critical error but we don't want to fail the webhook
          }
          
          // Send email notification
          try {
            await sendPaymentNotification(updatedUser, amountReceivedPounds);
          } catch (emailError) {
            console.error('Failed to send payment notification email:', emailError);
          }
        }
      } catch (error) {
        console.error('Error updating user balance from webhook:', error.message);
      }
    } else if (session.metadata.type === 'share_purchase') {
      // Handle share purchase (live mode)
      try {
        const userId = session.metadata.userId;
        const amountPounds = parseFloat(session.metadata.amount);
        const packageId = session.metadata.packageId;
        const shares = parseInt(session.metadata.shares || '0');

        console.log(`✅ Share purchase successful: User ${userId} purchased ${shares} shares (package: ${packageId}) for £${amountPounds}`);
        
        // TODO: Store share purchase in database
        // You'll need to create a SharePurchase model or add shares field to User model
        // For now, we'll just log it. You can implement share tracking later:
        // 
        // Example implementation:
        // const user = await User.findOne({ uuid: userId });
        // if (user) {
        //   // Add shares to user or create separate SharePurchase record
        //   await SharePurchase.create({
        //     userId: user._id,
        //     user_uuid: userId,
        //     shares: shares,
        //     amount: Math.round(amountPounds * 100), // in pence
        //     packageId: packageId,
        //     stripeSessionId: session.id,
        //     status: 'completed'
        //   });
        // }
        
      } catch (error) {
        console.error('Error processing share purchase:', error.message);
      }
    }
  }

  res.json({ received: true });
});

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
    const existingTransaction = await WalletTransaction.findOne({
      userId: userId,
      amount: amountPence,
      paymentMethod: 'stripe',
      type: 'topup',
      status: 'completed',
      createdAt: { $gte: fiveMinutesAgo }
    });
    
    if (existingTransaction) {
      // Webhook already processed this payment, just return the current balance
      console.log(`✅ Payment already processed by webhook (found existing transaction: ${existingTransaction._id})`);
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
    try {
      const walletTransaction = await WalletTransaction.create({
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
