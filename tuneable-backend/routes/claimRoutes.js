const express = require('express');
const router = express.Router();
const Claim = require('../models/Claim');
const Media = require('../models/Media');
const User = require('../models/User');
const authMiddleware = require('../middleware/authMiddleware');
const adminMiddleware = require('../middleware/adminMiddleware');
const { canEditMedia } = require('../utils/permissionHelpers');
const { isValidObjectId } = require('../utils/validators');
const { sendClaimNotification, sendOwnershipNotification, sendClaimStatusNotification } = require('../utils/emailService');
const { createClaimUpload, getPublicUrl } = require('../utils/r2Upload');
const { softDeleteMedia } = require('../services/mediaLifecycleService');

// Configure upload using R2 or local fallback
const upload = createClaimUpload();

function isRightsPendingLimbo(media) {
  return media.rightsStatus === 'pending' && !media.rightsCleared;
}

function formatClaimant(userDoc) {
  if (!userDoc) return null;
  return {
    _id: userDoc._id,
    username: userDoc.username,
    email: userDoc.email,
    profilePic: userDoc.profilePic,
    uuid: userDoc.uuid
  };
}

// Submit a new claim (ownership keep or takedown) — only for rights-pending limbo media
router.post('/submit', authMiddleware, upload.array('proofFiles', 5), async (req, res) => {
  try {
    const { mediaId, proofText, intent: rawIntent } = req.body;
    const userId = req.user._id;
    const intent = rawIntent === 'takedown' ? 'takedown' : 'claim_keep';

    if (!mediaId || !proofText) {
      return res.status(400).json({ error: 'mediaId and proofText are required' });
    }

    const media = await Media.findById(mediaId);
    if (!media) {
      return res.status(404).json({ error: 'Media not found' });
    }

    if (media.status === 'deleted') {
      return res.status(404).json({ error: 'Media not found' });
    }

    if (!isRightsPendingLimbo(media)) {
      return res.status(400).json({
        error: 'Claims are only accepted for media awaiting rights clearance'
      });
    }

    // Ownership claims require creator role; takedown only requires auth
    if (intent === 'claim_keep') {
      if (!req.user.role || !req.user.role.includes('creator')) {
        return res.status(403).json({ error: 'User must have creator role to claim ownership' });
      }
    }

    const existingClaim = await Claim.findOne({
      mediaId,
      userId,
      status: 'pending'
    });

    if (existingClaim) {
      return res.status(400).json({ error: 'You already have a pending claim for this tune' });
    }

    const proofFiles = req.files ? req.files.map(file => ({
      filename: file.key || file.filename,
      url: file.key ? getPublicUrl(file.key) : (file.location || getPublicUrl(`claims/${file.filename}`)),
      uploadedAt: new Date()
    })) : [];

    const claim = new Claim({
      mediaId,
      userId,
      intent,
      proofText,
      proofFiles,
      status: 'pending'
    });

    await claim.save();

    try {
      const user = await User.findById(userId);
      await sendClaimNotification(claim, media, user);
    } catch (emailError) {
      console.error('Failed to send claim notification email:', emailError);
    }

    res.status(201).json({
      message: intent === 'takedown'
        ? 'Takedown request submitted successfully'
        : 'Claim submitted successfully',
      claim: {
        _id: claim._id,
        status: claim.status,
        intent: claim.intent,
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

// Get claims for a specific media (admin/media editors only)
router.get('/media/:mediaId', authMiddleware, async (req, res) => {
  try {
    const { mediaId } = req.params;

    if (!isValidObjectId(mediaId)) {
      return res.status(400).json({ error: 'Invalid media ID format' });
    }

    const media = await Media.findById(mediaId);
    if (!media) {
      return res.status(404).json({ error: 'Media not found' });
    }

    if (!canEditMedia(req.user, media)) {
      return res.status(403).json({ error: 'Not authorized to view claims for this media' });
    }

    const claims = await Claim.find({ mediaId })
      .populate('userId', 'username email profilePic uuid')
      .populate('reviewedBy', 'username email profilePic uuid')
      .sort({ submittedAt: -1 });

    const formattedClaims = claims.map(claim => {
      const claimant = formatClaimant(claim.userId);
      const reviewer = formatClaimant(claim.reviewedBy);

      return {
        _id: claim._id,
        mediaId: claim.mediaId?.toString?.() || claim.mediaId,
        intent: claim.intent || 'claim_keep',
        status: claim.status,
        proofText: claim.proofText,
        proofFiles: claim.proofFiles || [],
        submittedAt: claim.submittedAt,
        updatedAt: claim.updatedAt,
        reviewNotes: claim.reviewNotes || null,
        reviewedAt: claim.reviewedAt || null,
        claimant,
        reviewer
      };
    });

    res.json({ claims: formattedClaims });
  } catch (error) {
    console.error('Error fetching claims for media:', error);
    res.status(500).json({ error: 'Failed to fetch claims for media' });
  }
});

// Admin: Get all claims
router.get('/all', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { status } = req.query;
    const filter = status ? { status } : {};

    const claims = await Claim.find(filter)
      .populate('mediaId', 'title artist coverArt rightsStatus rightsCleared')
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

    if (claim.status !== 'pending') {
      return res.status(400).json({ error: 'Claim has already been reviewed' });
    }

    const media = await Media.findById(claim.mediaId);
    if (!media) {
      return res.status(404).json({ error: 'Media not found' });
    }

    const intent = claim.intent || 'claim_keep';
    let takedownResult = null;

    if (status === 'approved') {
      if (intent === 'takedown') {
        if (media.status === 'deleted') {
          return res.status(400).json({ error: 'Media is already deleted' });
        }

        try {
          takedownResult = await softDeleteMedia(
            media,
            req.user,
            'Rights holder claim — takedown approved; tips refunded'
          );
        } catch (deleteError) {
          console.error('Error soft-deleting media for claim takedown:', deleteError);
          return res.status(400).json({
            error: deleteError.message || 'Failed to take down media'
          });
        }

        // Close other pending claims on this media
        await Claim.updateMany(
          { mediaId: media._id, _id: { $ne: claim._id }, status: 'pending' },
          {
            status: 'rejected',
            reviewNotes: 'Media taken down via another approved claim',
            reviewedBy: req.user._id,
            reviewedAt: new Date()
          }
        );
      } else {
        // claim_keep: assign ownership and clear rights limbo
        if (!isRightsPendingLimbo(media) && media.rightsStatus !== 'cleared') {
          // Still allow if somehow already partially processed, but prefer limbo
        }

        const hasExistingOwners = media.mediaOwners && media.mediaOwners.some(
          (o) => o.percentage && o.percentage > 0
        );
        const ownershipPercentage = req.body.ownershipPercentage
          ? Number(req.body.ownershipPercentage)
          : (hasExistingOwners ? 50 : 100);

        try {
          media.addMediaOwner(
            claim.userId,
            ownershipPercentage,
            'primary',
            req.user._id,
            {
              verified: true,
              verifiedAt: new Date(),
              verifiedBy: req.user._id,
              verificationMethod: 'Claim approval',
              verificationNotes: reviewNotes || null,
              verificationSource: 'claim_approval',
              note: reviewNotes || null
            }
          );

          media.rightsCleared = true;
          media.rightsStatus = 'cleared';
          media.rightsConfirmedBy = claim.userId;
          media.rightsConfirmedAt = new Date();

          media.editHistory.push({
            editedBy: req.user._id,
            editedAt: new Date(),
            changes: [{
              field: 'mediaOwners',
              oldValue: 'Pending rights',
              newValue: `Added ${claim.userId} as ${ownershipPercentage}% owner via claim approval; rights cleared`
            }]
          });

          await media.save();

          // Reject other pending claims for this media
          await Claim.updateMany(
            { mediaId: media._id, _id: { $ne: claim._id }, status: 'pending' },
            {
              status: 'rejected',
              reviewNotes: 'Another ownership claim was approved for this media',
              reviewedBy: req.user._id,
              reviewedAt: new Date()
            }
          );

          try {
            const user = await User.findById(claim.userId);
            const addedBy = await User.findById(req.user._id);
            if (user && user.email && addedBy) {
              await sendOwnershipNotification(user, media, ownershipPercentage, addedBy);
            }
          } catch (emailError) {
            console.error('Failed to send ownership notification:', emailError);
          }
        } catch (error) {
          console.error('Error adding media owner:', error);
          return res.status(400).json({ error: 'Failed to assign ownership: ' + error.message });
        }
      }
    }

    claim.status = status;
    claim.reviewNotes = reviewNotes;
    claim.reviewedBy = req.user._id;
    claim.reviewedAt = new Date();
    await claim.save();

    try {
      const notificationService = require('../services/notificationService');
      await notificationService.notifyClaim(
        claim.userId.toString(),
        status,
        claim.mediaId.toString(),
        media.title,
        status === 'rejected' ? reviewNotes : null
      ).catch(err => console.error('Error sending claim notification:', err));
    } catch (error) {
      console.error('Error setting up claim notification:', error);
    }

    try {
      const user = await User.findById(claim.userId);
      if (user && user.email) {
        await sendClaimStatusNotification(user, claim, media, status, req.body.adminMessage);
      }
    } catch (emailError) {
      console.error('Failed to send claim status notification:', emailError);
    }

    res.json({
      message: `Claim ${status}`,
      claim,
      ...(takedownResult
        ? {
            takedown: {
              refundedBidsCount: takedownResult.refundedBidsCount,
              refundedUsersCount: takedownResult.refundedUsersCount,
              refundedAmount: takedownResult.refundedAmount
            }
          }
        : {})
    });
  } catch (error) {
    console.error('Error reviewing claim:', error);
    res.status(500).json({ error: 'Failed to review claim' });
  }
});

module.exports = router;
