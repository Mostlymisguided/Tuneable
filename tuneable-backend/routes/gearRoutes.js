const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Gear = require('../models/Gear');
const Media = require('../models/Media');
const {
  buildMediaGearQuery,
  refreshGearStats,
  searchGear,
} = require('../services/gearService');

const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

// @route   GET /api/gear/rankings
// @desc    Top gear by media count or aggregate
// @access  Public
router.get('/rankings', async (req, res) => {
  try {
    const {
      type,
      sortBy = 'mediaCount',
      limit = 20,
    } = req.query;

    const query = { isActive: true, 'stats.mediaCount': { $gt: 0 } };
    if (type && ['daw', 'plugin', 'hardware'].includes(type)) {
      query.type = type;
    }

    const sortField = sortBy === 'aggregate'
      ? { 'stats.globalGearAggregate': -1 }
      : { 'stats.mediaCount': -1 };

    const limitNum = Math.min(parseInt(limit, 10) || 20, 50);

    const gear = await Gear.find(query)
      .sort(sortField)
      .limit(limitNum)
      .select('name slug type manufacturer category stats isCatalog imageUrl')
      .lean();

    res.json({ gear, total: gear.length });
  } catch (error) {
    console.error('Error fetching gear rankings:', error);
    res.status(500).json({ error: 'Failed to fetch gear rankings' });
  }
});

// @route   GET /api/gear
// @desc    Search / list gear catalog
// @access  Public
router.get('/', async (req, res) => {
  try {
    const result = await searchGear(req.query);
    res.json({
      gear: result.gear,
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        pages: Math.ceil(result.total / result.limit) || 0,
      },
    });
  } catch (error) {
    console.error('Error searching gear:', error);
    res.status(500).json({ error: 'Failed to search gear' });
  }
});

// @route   GET /api/gear/:slug/profile
// @desc    Gear profile with top tracks
// @access  Public
router.get('/:slug/profile', async (req, res) => {
  try {
    const { slug } = req.params;
    const { page = 1, limit = 50, refresh = false } = req.query;

    let gear = await Gear.findBySlug(slug);
    if (!gear && slug.includes('%')) {
      gear = await Gear.findBySlug(decodeURIComponent(slug));
    }

    // Match catalog by slugified name across types (e.g. /gear/serum → Serum plugin)
    if (!gear) {
      const nameGuess = decodeURIComponent(slug).replace(/-/g, ' ');
      for (const t of ['plugin', 'daw', 'hardware']) {
        gear = await Gear.findByNameAndType(nameGuess, t);
        if (gear) break;
      }
    }

    const limitNum = Math.min(parseInt(limit, 10) || 50, 100);
    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const skip = (pageNum - 1) * limitNum;

    // Virtual gear profile when catalog is not seeded but media credits exist (name from slug)
    if (!gear) {
      const type = req.query.type;
      if (!type || !['daw', 'plugin', 'hardware'].includes(type)) {
        return res.status(404).json({ error: 'Gear not found' });
      }

      const nameFromSlug = decodeURIComponent(slug).replace(/-/g, ' ');
      const gearRegex = new RegExp(`^${nameFromSlug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
      const pathMap = {
        daw: 'productionStack.daws.name',
        plugin: 'productionStack.plugins.name',
        hardware: 'productionStack.hardware.name',
      };
      const mediaQuery = {
        contentType: { $in: ['music'] },
        [pathMap[type]]: gearRegex,
      };

      const [media, total] = await Promise.all([
        Media.find(mediaQuery)
          .sort({ globalMediaAggregate: -1, createdAt: -1 })
          .skip(skip)
          .limit(limitNum)
          .populate('addedBy', 'username profilePic uuid')
          .lean(),
        Media.countDocuments(mediaQuery),
      ]);

      return res.json({
        gear: {
          name: nameFromSlug,
          slug: decodeURIComponent(slug),
          type,
          isCatalog: false,
          stats: { mediaCount: total, globalGearAggregate: 0 },
        },
        media,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          pages: Math.ceil(total / limitNum) || 0,
        },
      });
    }

    if (refresh === 'true' || refresh === true) {
      await refreshGearStats(gear._id);
      gear = await Gear.findById(gear._id);
    } else if (!gear.stats?.mediaCount) {
      await refreshGearStats(gear._id);
      gear = await Gear.findById(gear._id);
    }

    const mediaQuery = buildMediaGearQuery(gear);

    const [media, total] = await Promise.all([
      Media.find(mediaQuery)
        .sort({ globalMediaAggregate: -1, createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .populate('addedBy', 'username profilePic uuid')
        .lean(),
      Media.countDocuments(mediaQuery),
    ]);

    res.json({
      gear,
      media,
      pagination: {
        page: parseInt(page, 10) || 1,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum) || 0,
      },
    });
  } catch (error) {
    console.error('Error fetching gear profile:', error);
    res.status(500).json({ error: 'Failed to fetch gear profile' });
  }
});

// @route   GET /api/gear/:slug
// @desc    Get single gear entity by slug (or uuid)
// @access  Public
router.get('/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    let gear = await Gear.findBySlug(slug);

    if (!gear && slug.includes('-') && slug.length > 30) {
      gear = await Gear.findOne({ uuid: slug, isActive: true });
    }

    if (!gear && isValidObjectId(slug)) {
      gear = await Gear.findOne({ _id: slug, isActive: true });
    }

    if (!gear) {
      return res.status(404).json({ error: 'Gear not found' });
    }

    res.json({ gear });
  } catch (error) {
    console.error('Error fetching gear:', error);
    res.status(500).json({ error: 'Failed to fetch gear' });
  }
});

module.exports = router;
