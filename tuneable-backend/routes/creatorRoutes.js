const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const User = require('../models/User');
const authMiddleware = require('../middleware/authMiddleware');
const adminMiddleware = require('../middleware/adminMiddleware');
const { sendCreatorApplicationNotification } = require('../utils/emailService');

// Configure multer for proof file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/creator-applications/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `creator-proof-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|pdf/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only images (JPEG, PNG) and PDFs are allowed'));
    }
  }
});

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
    if (!artistName || !bio) {
      return res.status(400).json({ error: 'Artist name and bio are required' });
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

    // Process uploaded proof files
    const proofFiles = req.files ? req.files.map(file => ({
      filename: file.filename,
      url: `/uploads/creator-applications/${file.filename}`,
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

    // Check for OAuth verification (future enhancement)
    // For now, all applications are pending manual review
    const isOAuthVerified = false; // TODO: Check if user has verified OAuth accounts

    if (isOAuthVerified) {
      // Auto-approve if OAuth verified
      user.creatorProfile.verificationStatus = 'verified';
      user.creatorProfile.verifiedAt = new Date();
      
      // Add creator role
      if (!user.role.includes('creator')) {
        user.role.push('creator');
      }
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
      .select('username email profilePic creatorProfile role createdAt')
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
    }

    // If rejected, remove creator role
    if (status === 'rejected' && user.role.includes('creator')) {
      user.role = user.role.filter(r => r !== 'creator');
    }

    await user.save();

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

