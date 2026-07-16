const express = require('express');
const router = express.Router();
const Media = require('../models/Media');
const { getTagProfile } = require('../services/tagProfileService');
const { getCanonicalTag } = require('../utils/tagNormalizer');

const FALLBACK_POPULAR_TAGS = [
  'Hip Hop', 'Electronic', 'House', 'DnB', 'Indie', 'Rock', 'Pop', 'R&B',
  'Jazz', 'Techno', 'Soul', 'Funk', 'Reggae', 'Metal', 'Folk', 'Ambient',
  'UK Rap', 'Deep House', 'Garage', 'Disco', 'Punk', 'Blues', 'Classical',
  'Latin', 'Afrobeats', 'Trap', 'Grime', 'Alternative', 'Country', 'World',
];

// @route   GET /api/tags/popular
// @desc    Popular tags for onboarding / discovery
// @access  Public
router.get('/popular', async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 40, 1), 100);

    const results = await Media.aggregate([
      {
        $match: {
          status: 'active',
          contentType: 'music',
          tags: { $exists: true, $ne: [] },
        },
      },
      { $unwind: '$tags' },
      {
        $group: {
          _id: '$tags',
          count: { $sum: 1 },
          aggregate: { $sum: { $ifNull: ['$globalMediaAggregate', 0] } },
        },
      },
      { $sort: { aggregate: -1, count: -1 } },
      { $limit: limit * 4 },
    ]);

    const tagMap = new Map();
    results.forEach((entry) => {
      const canonical = getCanonicalTag(entry._id);
      if (!canonical) return;
      const existing = tagMap.get(canonical) || { tag: canonical, count: 0, aggregate: 0 };
      existing.count += entry.count;
      existing.aggregate += entry.aggregate || 0;
      tagMap.set(canonical, existing);
    });

    let tags = [...tagMap.values()]
      .sort((a, b) => b.aggregate - a.aggregate || b.count - a.count)
      .slice(0, limit);

    if (tags.length < 12) {
      const seen = new Set(tags.map((t) => t.tag));
      for (const tag of FALLBACK_POPULAR_TAGS) {
        if (seen.has(tag)) continue;
        tags.push({ tag, count: 0, aggregate: 0 });
        seen.add(tag);
        if (tags.length >= limit) break;
      }
    }

    res.json({ tags });
  } catch (error) {
    console.error('Error fetching popular tags:', error);
    res.status(500).json({ error: 'Failed to fetch popular tags' });
  }
});

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

// @route   GET /api/tags/:slug/champions
// @desc    Tip-aggregate champions for a tag (global or Mapbox place scope)
// @access  Public
router.get('/:slug/champions', async (req, res) => {
  try {
    const { slug } = req.params;
    const { locationPlaceId, limit } = req.query;

    if (!slug || !String(slug).trim()) {
      return res.status(400).json({ error: 'Tag slug is required' });
    }

    const { getTagChampions } = require('../services/mediaChampionsService');
    const result = await getTagChampions(slug, { locationPlaceId, limit });

    if (!result) {
      return res.status(404).json({ error: 'Tag not found' });
    }

    res.json(result);
  } catch (error) {
    console.error('Error fetching tag champions:', error);
    res.status(500).json({ error: 'Failed to fetch tag champions' });
  }
});

module.exports = router;
