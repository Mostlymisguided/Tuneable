const express = require('express');
const router = express.Router();
const Stripe = require('stripe');
const authMiddleware = require('../middleware/authMiddleware');
const User = require('../models/User'); // Import user model
const WalletTransaction = require('../models/WalletTransaction'); // Import wallet transaction model
const { sendPaymentNotification } = require('../utils/emailService');
require('dotenv').config();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Create Payment Intent
router.post('/create-payment-intent', authMiddleware, async (req, res) => {
  try {
    const { amount, currency } = req.body;
    const userId = req.user.uuid;  // Use UUID instead of _id for Stripe metadata

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

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

// Create Stripe Checkout Session for Wallet Top-up
router.post('/create-checkout-session', authMiddleware, async (req, res) => {
  try {
    const { amount, currency = 'gbp' } = req.body;
    const userId = req.user.uuid;  // Use UUID string instead of _id ObjectId

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

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
            unit_amount: Math.round(amount * 100), // Convert to pence
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/wallet?success=true&amount=${amount}`,
      cancel_url: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/wallet?canceled=true`,
      metadata: {
        userId: userId,  // Now a UUID string, not ObjectId
        amount: amount.toString(),
        type: 'wallet_topup'
      },
    });

    res.json({ sessionId: session.id, url: session.url });
  } catch (error) {
    console.error('Stripe Checkout Session Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Webhook to handle successful payments
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.log(`Webhook signature verification failed.`, err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the checkout.session.completed event
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    
    if (session.metadata.type === 'wallet_topup') {
      try {
        const userId = session.metadata.userId;  // This is now a UUID string
        const amountPounds = parseFloat(session.metadata.amount);
        
        // Convert pounds to pence for storage
        const amountPence = Math.round(amountPounds * 100);

        // Find user first to get current balance
        const user = await User.findOne({ uuid: userId });
        
        if (!user) {
          console.error(`User not found for wallet top-up: ${userId}`);
          return;
        }
        
        const balanceBefore = user.balance || 0;
        
        // Update user balance - find by UUID instead of _id
        // Balance is stored in pence
        const updatedUser = await User.findOneAndUpdate(
          { uuid: userId },  // Find by UUID instead of _id
          { $inc: { balance: amountPence } },  // Store in pence
          { new: true }
        );

        if (updatedUser) {
          console.log(`Wallet top-up successful: User ${userId} added £${amountPounds}, new balance: £${(updatedUser.balance / 100).toFixed(2)}`);
          
          // Create wallet transaction record
          try {
            await WalletTransaction.create({
              userId: updatedUser._id,
              user_uuid: updatedUser.uuid,
              amount: amountPence,
              type: 'topup',
              status: 'completed',
              paymentMethod: 'stripe',
              stripeSessionId: session.id,
              stripePaymentIntentId: session.payment_intent,
              balanceBefore: balanceBefore,
              balanceAfter: updatedUser.balance,
              description: `Wallet top-up via Stripe`,
              username: updatedUser.username,
              metadata: {
                currency: session.currency || 'gbp',
                customerEmail: session.customer_email,
                customerDetails: session.customer_details
              }
            });
            console.log(`✅ Created wallet transaction record for top-up: ${session.id}`);
          } catch (txError) {
            console.error('❌ Failed to create wallet transaction record:', txError);
            // Don't fail the webhook if transaction record creation fails
          }
          
          // Send email notification to admin
          try {
            await sendPaymentNotification(updatedUser, amountPounds);
          } catch (emailError) {
            console.error('Failed to send payment notification email:', emailError);
            // Don't fail the request if email fails
          }
        }
      } catch (error) {
        console.error('Error updating user balance from webhook:', error.message);
      }
    }
  }

  res.json({ received: true });
});

// Development endpoint to manually update balance (for testing)
router.post('/update-balance', authMiddleware, async (req, res) => {
  try {
    const { amount, description } = req.body;
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
      await WalletTransaction.create({
        userId: user._id,
        user_uuid: user.uuid,
        amount: amountPence,
        type: 'adjustment',
        status: 'completed',
        paymentMethod: 'manual',
        balanceBefore: balanceBefore,
        balanceAfter: user.balance,
        description: description || 'Manual balance adjustment',
        username: user.username
      });
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
      await WalletTransaction.create({
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
