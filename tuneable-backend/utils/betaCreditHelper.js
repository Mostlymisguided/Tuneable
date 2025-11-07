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
    const isBetaMode = process.env.BETA_MODE === 'true' || process.env.BETA_MODE === true;
    
    if (!isBetaMode) {
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
        title: 'Welcome Bonus!',
        message: 'Welcome to Tuneable! As a beta user, you\'ve received £11.11 of credit to get started. Use it to bid on tunes and boost your favorite tracks!',
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

