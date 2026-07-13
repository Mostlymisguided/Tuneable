/**
 * Beta Credit Helper
 * 
 * Utility function to give beta users £11.11 credit on sign up
 * and create a notification explaining the credit
 */

const notificationService = require('../services/notificationService');
const WalletTransaction = require('../models/WalletTransaction');
const { WELCOME_CREDIT_PENCE } = require('./welcomeCreditHelper');

/**
 * Give beta signup credit to a new user
 * @param {Object} user - User document (must be saved)
 * @returns {Promise<boolean>} - True if credit was added, false otherwise
 */
const giveBetaSignupCredit = async (user) => {
  try {
    const BETA_SIGNUP_CREDIT_PENCE = WELCOME_CREDIT_PENCE; // £11.11 in pence
    const rawBetaMode = process.env.VITE_BETA_MODE;
    const normalizedBetaMode = typeof rawBetaMode === 'string'
      ? rawBetaMode.trim().toLowerCase()
      : rawBetaMode;
    const isBetaMode = normalizedBetaMode === 'true' ||
      normalizedBetaMode === '1' ||
      normalizedBetaMode === 'yes' ||
      normalizedBetaMode === 'on' ||
      normalizedBetaMode === true;

    if (!isBetaMode) {
      console.log(`[BetaSignupCredit] Skipping credit — VITE_BETA_MODE is set to "${rawBetaMode ?? 'undefined'}"`);
      return false;
    }
    
    // Get balance before update
    const balanceBefore = user.balance || 0;
    
    // Add credit to user balance (stored in pence) and track remaining promo credit
    user.balance = balanceBefore + BETA_SIGNUP_CREDIT_PENCE;
    user.welcomeCreditRemainingPence = (user.welcomeCreditRemainingPence || 0) + BETA_SIGNUP_CREDIT_PENCE;
    await user.save();
    console.log(`✅ Added £11.11 beta signup credit to user ${user.username}. New balance: £${(user.balance / 100).toFixed(2)}`);
    
    // Create wallet transaction record
    try {
      await WalletTransaction.create({
        userId: user._id,
        user_uuid: user.uuid,
        amount: BETA_SIGNUP_CREDIT_PENCE,
        type: 'beta_credit',
        status: 'completed',
        paymentMethod: 'beta',
        balanceBefore: balanceBefore,
        balanceAfter: user.balance,
        description: 'Welcome credit (£11.11)',
        username: user.username
      });
      console.log(`✅ Created wallet transaction record for beta credit: ${user.username}`);
    } catch (txError) {
      console.error('❌ Failed to create wallet transaction record for beta credit:', txError);
      // Don't fail if transaction record creation fails
    }
    
    // Create notification explaining the credit
    try {
      await notificationService.createNotification({
        userId: user._id,
        type: 'admin_announcement',
        title: 'Welcome Credit Added',
        message: "Thanks for joining early — we've added £11.11 to your wallet to get you started. Unused welcome credit may be revoked at Tuneable's discretion.",
        link: '/wallet',
        linkText: 'View Wallet',
        groupKey: `beta_signup_credit_${user._id}`
      });
      console.log(`✅ Created beta signup credit notification for user ${user.username}`);
    } catch (notificationError) {
      console.error('Failed to create beta signup credit notification:', notificationError);
      // Don't fail if notification fails
    }
    
    return true;
  } catch (error) {
    console.error('Error giving beta signup credit:', error);
    // Don't throw - we don't want to fail registration if credit fails
    return false;
  }
};

module.exports = {
  giveBetaSignupCredit
};
