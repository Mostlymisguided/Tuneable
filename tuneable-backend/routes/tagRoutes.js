const express = require('express');
const router = express.Router();
const { getTagProfile } = require('../services/tagProfileService');

// @route   GET /api/tags/:slug/profile
// @desc    Tag profile with top tipped media + related party
// @access  Public
router.get('/:slug/profile', async (req, res) => {
  try {
    const { slug } = req.params;
    const { page = 1, limit = 50 } = req.query;

    if (!slug || !String(slug).trim()) {
      return res.status(400).json({ error: 'Tag slug is required' });
    }

    const profile = await getTagProfile(slug, { page, limit });
    res.json(profile);
  } catch (error) {
    if (error.status === 404) {
      return res.status(404).json({ error: error.message || 'Tag not found' });
    }
    console.error('Error fetching tag profile:', error);
    res.status(500).json({ error: 'Failed to fetch tag profile' });
  }
});

module.exports = router;
