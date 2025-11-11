const express = require('express');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const authMiddleware = require('../middleware/authMiddleware');
const { 
  sendEmailVerification, 
  sendPasswordReset, 
  sendWelcomeEmail,
  sendOwnershipNotification,
  sendClaimStatusNotification,
  sendInviteEmail
} = require('../utils/emailService');

const router = express.Router();

// @route   POST /api/email/verify/send
// @desc    Send email verification
// @access  Private
router.post('/verify/send', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (user.emailVerified) {
      return res.status(400).json({ error: 'Email already verified' });
    }

    if (!user.email) {
      return res.status(400).json({ error: 'No email address on file' });
    }

    // Generate verification token
    const token = user.generateEmailVerificationToken();
    await user.save();

    // Send verification email
    const emailSent = await sendEmailVerification(user, token);
    if (!emailSent) {
      return res.status(500).json({ error: 'Failed to send verification email' });
    }

    res.json({ message: 'Verification email sent successfully' });
  } catch (error) {
    console.error('Error sending verification email:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// @route   POST /api/email/verify/confirm
// @desc    Confirm email verification
// @access  Public
router.post('/verify/confirm', [
  body('token').notEmpty().withMessage('Verification token is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { token } = req.body;
    const user = await User.findOne({ emailVerificationToken: token });
    
    if (!user) {
      return res.status(400).json({ error: 'Invalid or expired verification token' });
    }

    const verified = user.verifyEmail(token);
    if (!verified) {
      return res.status(400).json({ error: 'Invalid or expired verification token' });
    }

    await user.save();

    // Send welcome email
    try {
      await sendWelcomeEmail(user);
    } catch (emailError) {
      console.error('Failed to send welcome email:', emailError);
      // Don't fail the verification if welcome email fails
    }

    res.json({ message: 'Email verified successfully' });
  } catch (error) {
    console.error('Error verifying email:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// @route   POST /api/email/password-reset/request
// @desc    Request password reset
// @access  Public
router.post('/password-reset/request', [
  body('email').isEmail().withMessage('Valid email is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email } = req.body;
    const user = await User.findOne({ email: email.toLowerCase().trim() });
    
    if (!user) {
      // Don't reveal if email exists or not for security
      return res.json({ message: 'If an account with that email exists, a password reset link has been sent' });
    }

    // Generate reset token
    const token = user.generatePasswordResetToken();
    await user.save();

    // Send reset email
    const emailSent = await sendPasswordReset(user, token);
    if (!emailSent) {
      return res.status(500).json({ error: 'Failed to send password reset email' });
    }

    res.json({ message: 'If an account with that email exists, a password reset link has been sent' });
  } catch (error) {
    console.error('Error requesting password reset:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// @route   POST /api/email/password-reset/confirm
// @desc    Confirm password reset
// @access  Public
router.post('/password-reset/confirm', [
  body('token').notEmpty().withMessage('Reset token is required'),
  body('newPassword').isLength({ min: 6 }).withMessage('Password must be at least 6 characters')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { token, newPassword } = req.body;
    const user = await User.findOne({ passwordResetToken: token });
    
    if (!user) {
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }

    const reset = user.resetPassword(token, newPassword);
    if (!reset) {
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }

    await user.save();

    res.json({ message: 'Password reset successfully' });
  } catch (error) {
    console.error('Error resetting password:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// @route   POST /api/email/ownership/notify
// @desc    Send ownership notification
// @access  Private (Admin only)
router.post('/ownership/notify', authMiddleware, async (req, res) => {
  try {
    // Check if user is admin
    const user = await User.findById(req.user._id);
    if (!user || !user.role.includes('admin')) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { userId, mediaId, ownershipPercentage, addedBy } = req.body;

    if (!userId || !mediaId || !ownershipPercentage || !addedBy) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Get user and media
    const targetUser = await User.findById(userId);
    const Media = require('../models/Media');
    const media = await Media.findById(mediaId);
    const addedByUser = await User.findById(addedBy);

    if (!targetUser || !media || !addedByUser) {
      return res.status(404).json({ error: 'User, media, or addedBy user not found' });
    }

    if (!targetUser.email) {
      return res.status(400).json({ error: 'Target user has no email address' });
    }

    // Send ownership notification
    const emailSent = await sendOwnershipNotification(targetUser, media, ownershipPercentage, addedByUser);
    if (!emailSent) {
      return res.status(500).json({ error: 'Failed to send ownership notification' });
    }

    res.json({ message: 'Ownership notification sent successfully' });
  } catch (error) {
    console.error('Error sending ownership notification:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// @route   POST /api/email/claim-status/notify
// @desc    Send claim status notification
// @access  Private (Admin only)
router.post('/claim-status/notify', authMiddleware, async (req, res) => {
  try {
    // Check if user is admin
    const user = await User.findById(req.user._id);
    if (!user || !user.role.includes('admin')) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { claimId, status, adminMessage } = req.body;

    if (!claimId || !status) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Get claim and related data
    const Claim = require('../models/Claim');
    const Media = require('../models/Media');
    
    const claim = await Claim.findById(claimId)
      .populate('userId', 'username email')
      .populate('mediaId');

    if (!claim) {
      return res.status(404).json({ error: 'Claim not found' });
    }

    if (!claim.userId.email) {
      return res.status(400).json({ error: 'Claimant has no email address' });
    }

    // Send claim status notification
    const emailSent = await sendClaimStatusNotification(
      claim.userId, 
      claim.mediaId, 
      claim, 
      status, 
      adminMessage
    );
    
    if (!emailSent) {
      return res.status(500).json({ error: 'Failed to send claim status notification' });
    }

    res.json({ message: 'Claim status notification sent successfully' });
  } catch (error) {
    console.error('Error sending claim status notification:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// @route   POST /api/email/invite
// @desc    Send invite emails to recipients
// @access  Private
router.post('/invite', authMiddleware, [
  body('emails').isArray().withMessage('Emails must be an array'),
  body('emails.*').isEmail().withMessage('Each email must be valid')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { emails } = req.body;
    const inviter = await User.findById(req.user._id);
    
    if (!inviter) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (!inviter.personalInviteCode) {
      return res.status(400).json({ error: 'You do not have an invite code' });
    }

    const inviteLink = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/register?invite=${inviter.personalInviteCode}`;
    const results = [];
    const errors_occurred = [];

    // Send emails to all recipients
    for (const email of emails) {
      try {
        const emailSent = await sendInviteEmail(
          email,
          inviter.username,
          inviter.personalInviteCode,
          inviteLink
        );
        
        if (emailSent) {
          results.push({ email, success: true });
        } else {
          errors_occurred.push({ email, error: 'Failed to send email' });
        }
      } catch (error) {
        console.error(`Error sending invite to ${email}:`, error);
        errors_occurred.push({ email, error: error.message });
      }
    }

    if (errors_occurred.length > 0 && results.length === 0) {
      return res.status(500).json({ 
        error: 'Failed to send all invite emails',
        results,
        errors: errors_occurred
      });
    }

    res.json({ 
      message: `Successfully sent ${results.length} invite email(s)`,
      results,
      errors: errors_occurred.length > 0 ? errors_occurred : undefined
    });
  } catch (error) {
    console.error('Error sending invite emails:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
