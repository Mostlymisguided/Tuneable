const express = require('express');
const router = express.Router();
const Label = require('../models/Label');
const User = require('../models/User');
const Media = require('../models/Media');
const authMiddleware = require('../middleware/authMiddleware');
const adminMiddleware = require('../middleware/adminMiddleware');
const { createLabelLogoUpload, getPublicUrl } = require('../utils/r2Upload');

// Configure upload for label logos
const logoUpload = createLabelLogoUpload();

// ========================================
// PUBLIC ROUTES
// ========================================

// Get all labels (public)
router.get('/', async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      genre, 
      sortBy = 'totalBidAmount',
      sortOrder = 'desc',
      search 
    } = req.query;

    const query = { isActive: true };
    
    // Filter by genre
    if (genre) {
      query.genres = genre;
    }
    
    // Search by name or slug
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { slug: { $regex: search, $options: 'i' } }
      ];
    }

    // Build sort object
    const sort = {};
    if (sortBy === 'totalBidAmount') {
      sort['stats.totalBidAmount'] = sortOrder === 'desc' ? -1 : 1;
    } else if (sortBy === 'artistCount') {
      sort['stats.artistCount'] = sortOrder === 'desc' ? -1 : 1;
    } else if (sortBy === 'name') {
      sort.name = sortOrder === 'desc' ? -1 : 1;
    }

    const labels = await Label.find(query)
      .select('name slug logo description genres stats.totalBidAmount stats.artistCount stats.releaseCount')
      .sort(sort)
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Label.countDocuments(query);

    res.json({
      labels,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    });
  } catch (error) {
    console.error('Error fetching labels:', error);
    res.status(500).json({ error: 'Failed to fetch labels' });
  }
});

// Get label by slug (public)
router.get('/:slug', async (req, res) => {
  try {
    const { refresh = false } = req.query;
    const labelStatsService = require('../services/labelStatsService');
    
    const label = await Label.findBySlug(req.params.slug);
    
    if (!label) {
      return res.status(404).json({ error: 'Label not found' });
    }

    // Recalculate stats if requested or if stats are stale (older than 1 hour)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const statsUpdatedAt = label.stats?.lastBidAt || label.updatedAt;
    const isStale = !statsUpdatedAt || statsUpdatedAt < oneHourAgo;

    if (refresh === 'true' || refresh === true || isStale) {
      console.log(`🔄 Recalculating stats for label ${label.name} ${isStale ? '(stale)' : '(forced)'}`);
      await labelStatsService.calculateAndUpdateLabelStats(label._id, true);
    }
    
    // Reload label to get updated stats (always reload after potential recalculation)
    const updatedLabel = await Label.findById(label._id);
    const labelToReturn = updatedLabel || label;

    // Get recent releases
    const recentReleases = await Media.find({ 
      'label.labelId': label._id,
      isActive: true 
    })
    .select('title artist coverArt releaseDate globalMediaAggregate uuid')
    .sort({ releaseDate: -1 })
    .limit(10)
    .lean();

    // Get top performing media
    const topMedia = await Media.find({ 
      'label.labelId': label._id,
      isActive: true 
    })
    .select('title artist coverArt globalMediaAggregate uuid')
    .sort({ globalMediaAggregate: -1 })
    .limit(5)
    .lean();

    // Format media for response
    const formattedRecentReleases = recentReleases.map(m => ({
      _id: m._id,
      uuid: m.uuid,
      title: m.title,
      artist: Array.isArray(m.artist) && m.artist.length > 0 ? m.artist[0].name : 'Unknown Artist',
      coverArt: m.coverArt,
      releaseDate: m.releaseDate,
      stats: {
        totalBidAmount: m.globalMediaAggregate || 0
      }
    }));

    const formattedTopMedia = topMedia.map(m => ({
      _id: m._id,
      uuid: m.uuid,
      title: m.title,
      artist: Array.isArray(m.artist) && m.artist.length > 0 ? m.artist[0].name : 'Unknown Artist',
      coverArt: m.coverArt,
      stats: {
        totalBidAmount: m.globalMediaAggregate || 0,
        bidCount: 0 // Would need to aggregate from bids if needed
      }
    }));

    // Ensure socialMedia and stats have default values if undefined
    const labelResponse = labelToReturn.toObject ? labelToReturn.toObject() : labelToReturn;
    if (!labelResponse.socialMedia) {
      labelResponse.socialMedia = {};
    }
    if (!labelResponse.stats) {
      labelResponse.stats = {
        artistCount: 0,
        releaseCount: 0,
        totalBidAmount: 0,
        averageBidAmount: 0,
        topBidAmount: 0,
        totalBidCount: 0
      };
    }

    res.json({
      label: labelResponse,
      recentReleases: formattedRecentReleases,
      topMedia: formattedTopMedia
    });
  } catch (error) {
    console.error('Error fetching label:', error);
    res.status(500).json({ error: 'Failed to fetch label', details: error.message });
  }
});

// Get label's artists
router.get('/:slug/artists', async (req, res) => {
  try {
    const label = await Label.findBySlug(req.params.slug);
    
    if (!label) {
      return res.status(404).json({ error: 'Label not found' });
    }

    const artists = await User.find({ 
      'labelAffiliations.labelId': label._id,
      'labelAffiliations.status': 'active'
    })
    .select('username profilePic creatorProfile.artistName creatorProfile.genres')
    .populate('creatorProfile');

    res.json({ artists });
  } catch (error) {
    console.error('Error fetching label artists:', error);
    res.status(500).json({ error: 'Failed to fetch label artists' });
  }
});

// Get label's media
router.get('/:slug/media', async (req, res) => {
  try {
    const { page = 1, limit = 20, sortBy = 'releaseDate', sortOrder = 'desc' } = req.query;
    
    const label = await Label.findBySlug(req.params.slug);
    
    if (!label) {
      return res.status(404).json({ error: 'Label not found' });
    }

    const sort = {};
    if (sortBy === 'releaseDate') {
      sort.releaseDate = sortOrder === 'desc' ? -1 : 1;
    } else if (sortBy === 'totalBidAmount') {
      sort['stats.totalBidAmount'] = sortOrder === 'desc' ? -1 : 1;
    }

    const media = await Media.find({ 
      'label.labelId': label._id,
      isActive: true 
    })
    .select('title artist coverArt releaseDate stats.totalBidAmount stats.bidCount')
    .sort(sort)
    .limit(limit * 1)
    .skip((page - 1) * limit);

    const total = await Media.countDocuments({ 
      'label.labelId': label._id,
      isActive: true 
    });

    res.json({
      media,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    });
  } catch (error) {
    console.error('Error fetching label media:', error);
    res.status(500).json({ error: 'Failed to fetch label media' });
  }
});

// ========================================
// AUTHENTICATED ROUTES
// ========================================

// Create label
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { name, description, email, website, genres, foundedYear } = req.body;

    // Validate required fields
    if (!name || !email) {
      return res.status(400).json({ error: 'Label name and email are required' });
    }

    // Check if label name already exists
    const existingLabel = await Label.findOne({ name });
    if (existingLabel) {
      return res.status(400).json({ error: 'Label name already exists' });
    }

    // Check if user already has a label
    const userLabels = await Label.find({ 'admins.userId': req.user.id });
    if (userLabels.length > 0) {
      return res.status(400).json({ error: 'User already has a label' });
    }

    // Generate slug from name (before creating label)
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');

    // Check if slug already exists
    const existingSlug = await Label.findOne({ slug });
    if (existingSlug) {
      return res.status(400).json({ error: 'A label with a similar name already exists' });
    }

    const label = new Label({
      name,
      slug, // Explicitly set slug
      description,
      email,
      website,
      genres: genres || [],
      foundedYear,
      admins: [{
        userId: req.user.id,
        role: 'owner',
        addedAt: new Date()
      }]
    });

    await label.save();

    res.status(201).json({ label });
  } catch (error) {
    console.error('Error creating label:', error);
    res.status(500).json({ error: 'Failed to create label' });
  }
});

// Update label (admin only)
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const label = await Label.findById(req.params.id);
    
    if (!label) {
      return res.status(404).json({ error: 'Label not found' });
    }

    // Check if user is admin
    if (!label.isAdmin(req.user.id)) {
      return res.status(403).json({ error: 'Not authorized to update this label' });
    }

    const updates = req.body;
    Object.assign(label, updates);
    
    await label.save();

    res.json({ label });
  } catch (error) {
    console.error('Error updating label:', error);
    res.status(500).json({ error: 'Failed to update label' });
  }
});

// Upload label logo (authenticated, label admin/owner only)
router.put('/:id/logo', authMiddleware, logoUpload.single('logo'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const label = await Label.findById(req.params.id);
    
    if (!label) {
      return res.status(404).json({ error: 'Label not found' });
    }

    // Check if user can edit this label (admin or label admin/owner)
    const isPlatformAdmin = req.user.role && req.user.role.includes('admin');
    const canEdit = isPlatformAdmin || label.isAdmin(req.user.id);
    
    if (!canEdit) {
      return res.status(403).json({ error: 'Not authorized to update this label' });
    }

    // Use custom domain URL via getPublicUrl
    const logoPath = req.file.key ? getPublicUrl(req.file.key) : (req.file.location || getPublicUrl(`label-logos/${req.file.filename}`));

    console.log(`📸 Saving label logo: ${logoPath} for label ${label.name}`);

    label.logo = logoPath;
    await label.save();

    console.log('✅ Label logo updated:', label.logo);
    res.json({ message: 'Label logo updated successfully', label });
  } catch (error) {
    console.error('Error updating label logo:', error.message);
    res.status(500).json({ error: 'Error updating label logo', details: error.message });
  }
});

// Add admin to label (owner only)
router.post('/:id/admins', authMiddleware, async (req, res) => {
  try {
    const { userId, role } = req.body;
    const label = await Label.findById(req.params.id);
    
    if (!label) {
      return res.status(404).json({ error: 'Label not found' });
    }

    // Check if user is owner
    if (!label.isOwner(req.user.id)) {
      return res.status(403).json({ error: 'Only label owners can add admins' });
    }

    // Check if user exists
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    await label.addAdmin(userId, role, req.user.id);

    res.json({ message: 'Admin added successfully' });
  } catch (error) {
    console.error('Error adding admin:', error);
    res.status(500).json({ error: 'Failed to add admin' });
  }
});

// Remove admin from label (owner only)
router.delete('/:id/admins/:userId', authMiddleware, async (req, res) => {
  try {
    const label = await Label.findById(req.params.id);
    
    if (!label) {
      return res.status(404).json({ error: 'Label not found' });
    }

    // Check if user is owner
    if (!label.isOwner(req.user.id)) {
      return res.status(403).json({ error: 'Only label owners can remove admins' });
    }

    // Can't remove yourself
    if (req.params.userId === req.user.id) {
      return res.status(400).json({ error: 'Cannot remove yourself as admin' });
    }

    await label.removeAdmin(req.params.userId);

    res.json({ message: 'Admin removed successfully' });
  } catch (error) {
    console.error('Error removing admin:', error);
    res.status(500).json({ error: 'Failed to remove admin' });
  }
});

// ========================================
// ADMIN ROUTES
// ========================================

// Verify label (admin only)
router.post('/:id/verify', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const label = await Label.findById(req.params.id);
    
    if (!label) {
      return res.status(404).json({ error: 'Label not found' });
    }

    label.verificationStatus = 'verified';
    label.verifiedAt = new Date();
    label.verifiedBy = req.user.id;

    await label.save();

    res.json({ message: 'Label verified successfully' });
  } catch (error) {
    console.error('Error verifying label:', error);
    res.status(500).json({ error: 'Failed to verify label' });
  }
});

// Get all labels for admin (with verification status)
router.get('/admin/all', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { 
      verificationStatus, 
      genre,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      page = 1, 
      limit = 20 
    } = req.query;
    
    const query = {};
    if (verificationStatus) {
      query.verificationStatus = verificationStatus;
    }
    if (genre) {
      query.genres = genre;
    }
    if (search) {
      query.name = { $regex: search, $options: 'i' };
    }

    // Build sort object
    const sort = {};
    if (sortBy === 'name') {
      sort.name = sortOrder === 'desc' ? -1 : 1;
    } else if (sortBy === 'verificationStatus') {
      sort.verificationStatus = sortOrder === 'desc' ? -1 : 1;
    } else if (sortBy === 'totalBidAmount') {
      sort['stats.totalBidAmount'] = sortOrder === 'desc' ? -1 : 1;
    } else if (sortBy === 'artistCount') {
      sort['stats.artistCount'] = sortOrder === 'desc' ? -1 : 1;
    } else if (sortBy === 'releaseCount') {
      sort['stats.releaseCount'] = sortOrder === 'desc' ? -1 : 1;
    } else if (sortBy === 'lastBidAt') {
      sort['stats.lastBidAt'] = sortOrder === 'desc' ? -1 : 1;
    } else {
      sort.createdAt = sortOrder === 'desc' ? -1 : 1;
    }

    const labels = await Label.find(query)
      .select('name slug email logo verificationStatus verificationMethod verifiedAt verifiedBy stats.totalBidAmount stats.artistCount stats.releaseCount stats.lastBidAt genres createdAt updatedAt')
      .populate('admins.userId', 'username email uuid profilePic')
      .populate('verifiedBy', 'username')
      .sort(sort)
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .lean();

    // Format labels to include owner info
    const formattedLabels = labels.map(label => {
      const owners = label.admins
        .filter(admin => admin.role === 'owner')
        .map(admin => ({
          username: admin.userId?.username || 'Unknown',
          email: admin.userId?.email || '',
          uuid: admin.userId?.uuid || '',
          profilePic: admin.userId?.profilePic || null
        }));

      return {
        ...label,
        owners,
        ownerCount: owners.length
      };
    });

    const total = await Label.countDocuments(query);

    res.json({
      labels: formattedLabels,
      totalPages: Math.ceil(total / limit),
      currentPage: parseInt(page),
      total
    });
  } catch (error) {
    console.error('Error fetching admin labels:', error);
    res.status(500).json({ error: 'Failed to fetch labels', details: error.message });
  }
});

// Recalculate label stats (admin only)
router.post('/admin/recalculate-stats', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const labelStatsService = require('../services/labelStatsService');
    
    const { labelId } = req.body;
    
    if (labelId) {
      // Recalculate stats for specific label
      await labelStatsService.calculateAndUpdateLabelStats(labelId, true);
      
      // Also recalculate rankings
      await labelStatsService.calculateLabelRankings();
      
      res.json({ message: 'Label stats recalculated successfully' });
    } else {
      // Recalculate stats for all labels
      const result = await labelStatsService.recalculateAllLabelStats();
      
      // Also recalculate rankings
      await labelStatsService.calculateLabelRankings();
      
      res.json({
        message: 'All label stats recalculated successfully',
        ...result
      });
    }
  } catch (error) {
    console.error('Error recalculating label stats:', error);
    res.status(500).json({ error: 'Failed to recalculate label stats', details: error.message });
  }
});

module.exports = router;
