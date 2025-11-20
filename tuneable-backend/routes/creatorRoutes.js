const express = require('express');
const router = express.Router();
const User = require('../models/User');
const authMiddleware = require('../middleware/authMiddleware');
const adminMiddleware = require('../middleware/adminMiddleware');
const { sendCreatorApplicationNotification } = require('../utils/emailService');
const { createCreatorApplicationUpload, getPublicUrl } = require('../utils/r2Upload');

// Configure upload using R2 or local fallback
const upload = createCreatorApplicationUpload();

// Submit creator application
router.post('/apply', authMiddleware, upload.array('proofFiles', 5), async (req, res) => {
  try {
    const userId = req.user._id;
    const {
      artistName,
      bio,
      genres,
      roles,
      website,
      socialMedia,
      label,
      management,
      distributor,
      verificationMethod
    } = req.body;

    // Validate required fields
    if (!artistName) {
      return res.status(400).json({ error: 'Artist name is required' });
    }

    // Get user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if already has creator profile
    if (user.creatorProfile && user.creatorProfile.verificationStatus === 'verified') {
      return res.status(400).json({ error: 'User is already a verified creator' });
    }

    // Parse arrays from JSON strings if needed
    const parsedGenres = typeof genres === 'string' ? JSON.parse(genres) : genres;
    const parsedRoles = typeof roles === 'string' ? JSON.parse(roles) : roles;
    const parsedSocialMedia = typeof socialMedia === 'string' ? JSON.parse(socialMedia) : socialMedia;

    // Process uploaded proof files - use custom domain URL (R2_PUBLIC_URL)
    // req.file.key contains the S3 key, use it with getPublicUrl for custom domain
    const proofFiles = req.files ? req.files.map(file => ({
      filename: file.key || file.filename, // R2 uses key, local uses filename
      url: file.key ? getPublicUrl(file.key) : (file.location || getPublicUrl(`creator-applications/${file.filename}`)), // Use custom domain
      uploadedAt: new Date()
    })) : [];

    // Create/update creator profile
    user.creatorProfile = {
      artistName,
      bio,
      genres: parsedGenres || [],
      roles: parsedRoles || [],
      website: website || '',
      socialMedia: parsedSocialMedia || {},
      label: label || '',
      management: management || '',
      distributor: distributor || '',
      verificationStatus: 'pending',
      verificationMethod: verificationMethod || 'manual',
      proofFiles // Store proof files in profile
    };

    // Add creator role immediately on application submission
    // This allows pending creators to access creator dashboard and upload features
    if (!user.role.includes('creator')) {
      user.role.push('creator');
    }

    // Check for OAuth verification (future enhancement)
    // For now, all applications are pending manual review
    const isOAuthVerified = false; // TODO: Check if user has verified OAuth accounts

    if (isOAuthVerified) {
      // Auto-approve if OAuth verified
      user.creatorProfile.verificationStatus = 'verified';
      user.creatorProfile.verifiedAt = new Date();
    }

    await user.save();

    // Send email notification to admin
    try {
      await sendCreatorApplicationNotification(user);
    } catch (emailError) {
      console.error('Failed to send notification email:', emailError);
      // Don't fail the request if email fails
    }

    res.status(200).json({
      message: isOAuthVerified 
        ? 'Creator application approved! You are now a verified creator.' 
        : 'Creator application submitted successfully. We\'ll review it within 24-48 hours.',
      creatorProfile: {
        artistName: user.creatorProfile.artistName,
        verificationStatus: user.creatorProfile.verificationStatus,
        isCreator: user.role.includes('creator')
      }
    });
  } catch (error) {
    console.error('Error submitting creator application:', error);
    res.status(500).json({ error: 'Failed to submit creator application' });
  }
});

// Get creator application status
router.get('/status', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('creatorProfile role');
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      hasCreatorProfile: !!user.creatorProfile,
      isCreator: user.role.includes('creator'),
      creatorProfile: user.creatorProfile || null
    });
  } catch (error) {
    console.error('Error fetching creator status:', error);
    res.status(500).json({ error: 'Failed to fetch creator status' });
  }
});

// Update creator profile
router.patch('/profile', authMiddleware, async (req, res) => {
  try {
    const userId = req.user._id;
    const updates = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (!user.creatorProfile) {
      return res.status(400).json({ error: 'No creator profile found. Please apply first.' });
    }

    // Update allowed fields
    const allowedFields = ['artistName', 'bio', 'genres', 'roles', 'website', 'socialMedia', 'label', 'management', 'distributor'];
    
    allowedFields.forEach(field => {
      if (updates[field] !== undefined) {
        user.creatorProfile[field] = updates[field];
      }
    });

    await user.save();

    res.json({
      message: 'Creator profile updated successfully',
      creatorProfile: user.creatorProfile
    });
  } catch (error) {
    console.error('Error updating creator profile:', error);
    res.status(500).json({ error: 'Failed to update creator profile' });
  }
});

// Admin: Get all pending creator applications
router.get('/applications', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { status } = req.query;
    const filter = { 'creatorProfile.verificationStatus': status || 'pending' };

    const applications = await User.find(filter)
      .select('_id username email profilePic creatorProfile role createdAt')
      .sort({ 'creatorProfile.submittedAt': -1 });

    res.json({ applications });
  } catch (error) {
    console.error('Error fetching creator applications:', error);
    res.status(500).json({ error: 'Failed to fetch applications' });
  }
});

// Admin: Review creator application
router.patch('/applications/:userId/review', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;
    const { status, reviewNotes } = req.body;

    if (!userId || userId === 'undefined' || userId === 'null') {
      return res.status(400).json({ error: 'User ID is required' });
    }

    if (!['verified', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'Status must be verified or rejected' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (!user.creatorProfile) {
      return res.status(400).json({ error: 'User has no creator profile' });
    }

    user.creatorProfile.verificationStatus = status;
    user.creatorProfile.reviewNotes = reviewNotes;
    user.creatorProfile.verifiedBy = req.user._id;
    user.creatorProfile.verifiedAt = new Date();

    // If approved, add creator role
    if (status === 'verified' && !user.role.includes('creator')) {
      user.role.push('creator');
      
      // Match unknown artist escrow allocations when creator is verified
      try {
        const artistEscrowService = require('../services/artistEscrowService');
        const artistName = user.creatorProfile?.artistName;
        
        if (artistName) {
          // Extract YouTube channel ID from social media if available
          const socialMedia = user.creatorProfile?.socialMedia || {};
          const youtubeUrl = socialMedia.youtube || '';
          let youtubeChannelId = null;
          
          if (youtubeUrl) {
            const channelMatch = youtubeUrl.match(/youtube\.com\/channel\/([a-zA-Z0-9_-]+)/);
            if (channelMatch) {
              youtubeChannelId = channelMatch[1];
            }
          }
          
          const matchingCriteria = {};
          if (youtubeChannelId) {
            matchingCriteria.youtubeChannelId = youtubeChannelId;
          }
          
          const matchResult = await artistEscrowService.matchUnknownArtistToUser(
            user._id,
            artistName,
            matchingCriteria
          );
          
          if (matchResult.matched && matchResult.count > 0) {
            console.log(`✅ Matched ${matchResult.count} escrow allocations to verified creator ${user.username}`);
            
            // Send notification about matched allocations
            const Notification = require('../models/Notification');
            const notification = new Notification({
              userId: user._id,
              type: 'escrow_matched',
              title: 'Escrow Allocations Matched',
              message: `We found £${(matchResult.totalAmount / 100).toFixed(2)} in escrow allocations that match your artist name "${artistName}". These have been added to your escrow balance.`,
              link: '/artist-escrow',
              linkText: 'View Escrow Balance'
            });
            await notification.save();
          }
        }
      } catch (escrowError) {
        console.error('Error matching escrow allocations on creator verification:', escrowError);
        // Don't fail verification if escrow matching fails
      }
    }

    // If rejected, remove creator role
    if (status === 'rejected' && user.role.includes('creator')) {
      user.role = user.role.filter(r => r !== 'creator');
    }

    await user.save();

    // Send notification to user
    try {
      const notificationService = require('../services/notificationService');
      await notificationService.notifyCreatorApplication(
        user._id.toString(),
        status,
        status === 'rejected' ? reviewNotes : null
      ).catch(err => console.error('Error sending creator application notification:', err));
    } catch (error) {
      console.error('Error setting up creator application notification:', error);
    }

    res.json({
      message: `Creator application ${status}`,
      user: {
        username: user.username,
        creatorProfile: user.creatorProfile,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Error reviewing creator application:', error);
    res.status(500).json({ error: 'Failed to review application' });
  }
});

module.exports = router;

