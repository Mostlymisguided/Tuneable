const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const Claim = require('../models/Claim');
const Media = require('../models/Media');
const authMiddleware = require('../middleware/authMiddleware');
const adminMiddleware = require('../middleware/adminMiddleware');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/claims/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `claim-${uniqueSuffix}${path.extname(file.originalname)}`);
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

// Submit a new claim
router.post('/submit', authMiddleware, upload.array('proofFiles', 5), async (req, res) => {
  try {
    const { mediaId, proofText } = req.body;
    const userId = req.user._id;

    // Validate inputs
    if (!mediaId || !proofText) {
      return res.status(400).json({ error: 'mediaId and proofText are required' });
    }

    // Check if media exists
    const media = await Media.findById(mediaId);
    if (!media) {
      return res.status(404).json({ error: 'Media not found' });
    }

    // Check if user is a creator
    if (!req.user.role || !req.user.role.includes('creator')) {
      return res.status(403).json({ error: 'User must have creator role to submit claims' });
    }

    // Check if user already has a pending claim for this media
    const existingClaim = await Claim.findOne({
      mediaId,
      userId,
      status: 'pending'
    });

    if (existingClaim) {
      return res.status(400).json({ error: 'You already have a pending claim for this tune' });
    }

    // Process uploaded files
    const proofFiles = req.files ? req.files.map(file => ({
      filename: file.filename,
      url: `/uploads/claims/${file.filename}`,
      uploadedAt: new Date()
    })) : [];

    // Create the claim
    const claim = new Claim({
      mediaId,
      userId,
      proofText,
      proofFiles,
      status: 'pending'
    });

    await claim.save();

    res.status(201).json({
      message: 'Claim submitted successfully',
      claim: {
        _id: claim._id,
        status: claim.status,
        submittedAt: claim.submittedAt
      }
    });
  } catch (error) {
    console.error('Error submitting claim:', error);
    res.status(500).json({ error: 'Failed to submit claim' });
  }
});

// Get user's claims
router.get('/my-claims', authMiddleware, async (req, res) => {
  try {
    const claims = await Claim.find({ userId: req.user._id })
      .populate('mediaId', 'title artist coverArt')
      .sort({ submittedAt: -1 });

    res.json({ claims });
  } catch (error) {
    console.error('Error fetching claims:', error);
    res.status(500).json({ error: 'Failed to fetch claims' });
  }
});

// Admin: Get all claims
router.get('/all', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { status } = req.query;
    const filter = status ? { status } : {};

    const claims = await Claim.find(filter)
      .populate('mediaId', 'title artist coverArt')
      .populate('userId', 'username email profilePic')
      .sort({ submittedAt: -1 });

    res.json({ claims });
  } catch (error) {
    console.error('Error fetching all claims:', error);
    res.status(500).json({ error: 'Failed to fetch claims' });
  }
});

// Admin: Review a claim
router.patch('/:claimId/review', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { claimId } = req.params;
    const { status, reviewNotes } = req.body;

    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'Status must be approved or rejected' });
    }

    const claim = await Claim.findById(claimId);
    if (!claim) {
      return res.status(404).json({ error: 'Claim not found' });
    }

    claim.status = status;
    claim.reviewNotes = reviewNotes;
    claim.reviewedBy = req.user._id;
    claim.reviewedAt = new Date();

    await claim.save();

    // If approved, add user to media's verified creators
    if (status === 'approved') {
      await Media.findByIdAndUpdate(claim.mediaId, {
        $addToSet: { verifiedCreators: claim.userId }
      });
    }

    res.json({
      message: `Claim ${status}`,
      claim
    });
  } catch (error) {
    console.error('Error reviewing claim:', error);
    res.status(500).json({ error: 'Failed to review claim' });
  }
});

module.exports = router;

