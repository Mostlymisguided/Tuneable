const express = require('express');
const router = express.Router();

// @route   GET /api/artists/champions
// @desc    Tip-aggregate champions for an artist catalog (by userId or name)
// @access  Public
// @query   userId — verified artist user id/uuid
// @query   name — artist display name (fallback when no userId)
// @query   locationPlaceId — optional Mapbox place scope
// @query   limit — max rankings (default 10, max 50)
router.get('/champions', async (req, res) => {
  try {
    const { userId, name, locationPlaceId, limit } = req.query;

    if (!userId && !name) {
      return res.status(400).json({ error: 'userId or name is required' });
    }

    const { getArtistChampions } = require('../services/mediaChampionsService');
    const result = await getArtistChampions(
      {
        userId: typeof userId === 'string' ? userId : undefined,
        name: typeof name === 'string' ? name : undefined,
      },
      { locationPlaceId, limit }
    );

    if (!result) {
      return res.status(404).json({ error: 'Artist not found' });
    }

    res.json(result);
  } catch (error) {
    console.error('Error fetching artist champions:', error);
    res.status(500).json({ error: 'Failed to fetch artist champions' });
  }
});

module.exports = router;
