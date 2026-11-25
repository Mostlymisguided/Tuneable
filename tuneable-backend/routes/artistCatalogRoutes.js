const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const adminMiddleware = require('../middleware/adminMiddleware');
const optionalAuthMiddleware = require('../middleware/optionalAuthMiddleware');
const { createClaimUpload, createProfilePictureUpload, processAndUploadImage, getPublicUrl } = require('../utils/r2Upload');
const catalog = require('../services/artistCatalogService');

const upload = createClaimUpload();
const profilePicUpload = createProfilePictureUpload();

function sendError(res, error, fallback) {
  if (error?.status) {
    return res.status(error.status).json({ error: error.message });
  }
  console.error(fallback, error);
  return res.status(500).json({ error: fallback });
}

// @route   GET /api/artist-catalog/index
// @desc    Slug lookup for credited names, so tune pages can link artist catalogs
// @access  Public
router.get('/index', async (req, res) => {
  try {
    const artists = await catalog.listPublicIndex();
    res.set('Cache-Control', 'public, max-age=60');
    res.json({ artists });
  } catch (error) {
    sendError(res, error, 'Failed to load artist pages');
  }
});

// @route   GET /api/artist-catalog/admin/suggest?q=
// @desc    Credited names that match a search, with an existing page if one exists
// @access  Admin
router.get('/admin/suggest', adminMiddleware, async (req, res) => {
  try {
    const suggestions = await catalog.suggestNames(req.query.q);
    res.json({ suggestions });
  } catch (error) {
    sendError(res, error, 'Failed to search credited artists');
  }
});

// @route   POST /api/artist-catalog/admin/preview
// @desc    Tunes whose credits exactly match the name and aliases
// @access  Admin
router.post('/admin/preview', adminMiddleware, async (req, res) => {
  try {
    const names = Array.isArray(req.body?.names) ? req.body.names : [];
    const preview = await catalog.previewNames(names);
    res.json(preview);
  } catch (error) {
    sendError(res, error, 'Failed to preview artist tunes');
  }
});

// @route   GET /api/artist-catalog/admin
// @desc    Artist pages already published
// @access  Admin
router.get('/admin', adminMiddleware, async (req, res) => {
  try {
    const artists = await catalog.listCatalogs();
    res.json({ artists });
  } catch (error) {
    sendError(res, error, 'Failed to list artist pages');
  }
});

// @route   POST /api/artist-catalog/admin
// @desc    Publish an unclaimed artist page for an explicit set of tunes
// @access  Admin
router.post('/admin', adminMiddleware, async (req, res) => {
  try {
    const created = await catalog.createCatalog(req.body || {}, req.user._id);
    res.status(201).json({
      message: 'Artist page published',
      artist: { _id: created._id, slug: created.slug, name: created.name, status: created.status },
    });
  } catch (error) {
    sendError(res, error, 'Failed to publish artist page');
  }
});

// @route   PATCH /api/artist-catalog/admin/:id
// @desc    Update a published artist page. Claimed pages keep their public address.
// @access  Admin
router.patch('/admin/:id', adminMiddleware, async (req, res) => {
  try {
    const updated = await catalog.updateCatalog(req.params.id, req.body || {}, req.user._id);
    res.json({
      message: 'Artist page updated',
      artist: { _id: updated._id, slug: updated.slug, name: updated.name, status: updated.status },
    });
  } catch (error) {
    sendError(res, error, 'Failed to update artist page');
  }
});

function uploadedProfilePicUrl(file) {
  if (!file) return '';
  if (file.key) return getPublicUrl(file.key);
  if (file.location) return file.location;
  if (file.filename) return getPublicUrl(`profile-pictures/${file.filename}`);
  return '';
}

// @route   PUT /api/artist-catalog/admin/:id/profile-pic
// @desc    Upload the picture shown on an artist page
// @access  Admin
router.put('/admin/:id/profile-pic', adminMiddleware, profilePicUpload.single('profilePic'), processAndUploadImage, async (req, res) => {
  try {
    const profilePic = uploadedProfilePicUrl(req.file);
    if (!profilePic) return res.status(400).json({ error: 'No file uploaded' });
    const updated = await catalog.updateCatalog(req.params.id, { profilePic }, req.user._id);
    res.json({ message: 'Profile picture updated', profilePic: updated.profilePic || '' });
  } catch (error) {
    sendError(res, error, 'Failed to upload profile picture');
  }
});

// @route   DELETE /api/artist-catalog/admin/:id/profile-pic
// @desc    Clear the artist page picture so the initial shows
// @access  Admin
router.delete('/admin/:id/profile-pic', adminMiddleware, async (req, res) => {
  try {
    const updated = await catalog.updateCatalog(req.params.id, { profilePic: '' }, req.user._id);
    res.json({ message: 'Profile picture removed', profilePic: updated.profilePic || '' });
  } catch (error) {
    sendError(res, error, 'Failed to remove profile picture');
  }
});

// @route   GET /api/artist-catalog/admin/claims
// @access  Admin
router.get('/admin/claims', adminMiddleware, async (req, res) => {
  try {
    const claims = await catalog.listClaims(req.query.status || 'pending');
    res.json({ claims });
  } catch (error) {
    sendError(res, error, 'Failed to load artist page claims');
  }
});

// @route   PATCH /api/artist-catalog/admin/claims/:claimId
// @desc    Approve or reject a claim. clearRights also grants ownership and releases escrow.
// @access  Admin
router.patch('/admin/claims/:claimId', adminMiddleware, async (req, res) => {
  try {
    const result = await catalog.reviewClaim(req.params.claimId, {
      status: req.body?.status,
      reviewNotes: req.body?.reviewNotes,
      clearRights: req.body?.clearRights === true,
    }, req.user._id);
    res.json({
      message: req.body?.status === 'approved' ? 'Artist page claim approved' : 'Artist page claim declined',
      warnings: result.warnings || [],
      clearedCount: result.clearedCount || 0,
      escrowPence: result.escrowPence || 0,
    });
  } catch (error) {
    sendError(res, error, 'Failed to review artist page claim');
  }
});

// @route   GET /api/artist-catalog/:slug
// @desc    Public artist page and its attached tunes
// @access  Public
router.get('/:slug', optionalAuthMiddleware, async (req, res) => {
  try {
    const page = await catalog.getPublicCatalog(req.params.slug, req.user?._id || null);
    res.json(page);
  } catch (error) {
    sendError(res, error, 'Failed to load artist page');
  }
});

// @route   POST /api/artist-catalog/:slug/claim
// @desc    Ask to claim the whole artist page. Does not grant ownership by itself.
// @access  Private
router.post('/:slug/claim', authMiddleware, upload.array('proofFiles', 5), async (req, res) => {
  try {
    const proofFiles = req.files ? req.files.map((file) => ({
      filename: file.key || file.filename,
      url: file.key ? getPublicUrl(file.key) : (file.location || getPublicUrl(`claims/${file.filename}`)),
      uploadedAt: new Date(),
    })) : [];

    const claim = await catalog.submitClaim(req.params.slug, req.user._id, {
      proofText: req.body?.proofText,
      proofFiles,
    });
    res.status(201).json({
      message: 'Claim submitted. We will review it before the page is linked to your account.',
      claim: { _id: claim._id, status: claim.status, submittedAt: claim.createdAt },
    });
  } catch (error) {
    sendError(res, error, 'Failed to submit artist page claim');
  }
});

module.exports = router;
