/**
 * Beta Credit Helper
 * 
 * Utility function to give beta users £11.11 credit on sign up
 * and create a notification explaining the credit
 */

const notificationService = require('../services/notificationService');

/**
 * Give beta signup credit to a new user
 * @param {Object} user - User document (must be saved)
 * @returns {Promise<boolean>} - True if credit was added, false otherwise
 */
const giveBetaSignupCredit = async (user) => {
  try {
    const BETA_SIGNUP_CREDIT_PENCE = 1111; // £11.11 in pence
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
    
    // Add credit to user balance
    user.balance = (user.balance || 0) + BETA_SIGNUP_CREDIT_PENCE;
    await user.save();
    console.log(`✅ Added £11.11 beta signup credit to user ${user.username}. New balance: £${(user.balance / 100).toFixed(2)}`);
    
    // Create notification explaining the credit
    try {
      await notificationService.createNotification({
        userId: user._id,
        type: 'admin_announcement',
        title: 'Beta Wallet Credit Added',
        message: 'You have been gifted £11.11 credit as a beta user. You can top up through the wallet and it will not cost you anything in beta mode. Ideally, when the platform goes live, you will choose to transfer your beta top ups with real money. If not, only your first £11.11 of bids will be transferred. You can top up for free but please bear this in mind and spend as you would in real life.',
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

