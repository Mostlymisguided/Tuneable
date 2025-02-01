const Stripe = require('stripe');
const User = require('../models/User');
require('dotenv').config();

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

/**
 * Create a payment intent for Stripe
 * @param {string} userId - The ID of the user making the payment
 * @param {number} amount - The amount to charge in USD
 * @param {string} currency - The currency (default: 'usd')
 * @returns {Promise<object>} - Stripe payment intent
 */
const createPaymentIntent = async (userId, amount, currency = 'usd') => {
  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amount * 100, // Convert to cents
      currency,
      payment_method_types: ['card'],
    });

    return { clientSecret: paymentIntent.client_secret };
  } catch (error) {
    console.error('Error creating payment intent:', error.message);
    throw new Error(error.message);
  }
};

/**
 * Update user balance after a successful payment
 * @param {string} userId - The ID of the user whose balance is being updated
 * @param {number} amount - The amount to add to the balance
 * @returns {Promise<object>} - Updated user document
 */
const updateUserBalance = async (userId, amount) => {
  try {
    const user = await User.findByIdAndUpdate(
      userId,
      { $inc: { balance: amount } },
      { new: true }
    );

    if (!user) throw new Error('User not found');

    return user;
  } catch (error) {
    console.error('Error updating user balance:', error.message);
    throw new Error(error.message);
  }
};

module.exports = { createPaymentIntent, updateUserBalance };
