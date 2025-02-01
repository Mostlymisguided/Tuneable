const express = require('express');
const router = express.Router();
const Stripe = require('stripe');
const authMiddleware = require('../middleware/authMiddleware');
const User = require('../models/User'); // Import user model
require('dotenv').config();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Create Payment Intent
router.post('/create-payment-intent', authMiddleware, async (req, res) => {
  try {
    const { amount, currency } = req.body;
    const userId = req.user.userId;

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

// Confirm Payment & Update User Balance
router.post('/confirm-payment', authMiddleware, async (req, res) => {
  try {
    const { amount } = req.body;
    const userId = req.user.userId;

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

    // Update user balance
    const user = await User.findByIdAndUpdate(
      userId,
      { $inc: { balance: amount } },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ message: 'Payment successful, balance updated', balance: user.balance });
  } catch (error) {
    console.error('Error confirming payment:', error.message);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
