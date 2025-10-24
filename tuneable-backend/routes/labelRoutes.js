const express = require('express');
const router = express.Router();
const Label = require('../models/Label');
const User = require('../models/User');
const Media = require('../models/Media');
const authMiddleware = require('../middleware/authMiddleware');
const adminMiddleware = require('../middleware/adminMiddleware');

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
    
    // Search by name
    if (search) {
      query.name = { $regex: search, $options: 'i' };
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
      .select('name slug logo description genres stats.totalBidAmount stats.artistCount stats.releaseCount stats.followerCount')
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
    const label = await Label.findBySlug(req.params.slug);
    
    if (!label) {
      return res.status(404).json({ error: 'Label not found' });
    }

    // Get recent releases
    const recentReleases = await Media.find({ 
      'label.labelId': label._id,
      isActive: true 
    })
    .select('title artist coverArt releaseDate stats.totalBidAmount')
    .sort({ releaseDate: -1 })
    .limit(10);

    // Get top performing media
    const topMedia = await Media.find({ 
      'label.labelId': label._id,
      isActive: true 
    })
    .select('title artist coverArt stats.totalBidAmount stats.bidCount')
    .sort({ 'stats.totalBidAmount': -1 })
    .limit(5);

    res.json({
      label,
      recentReleases,
      topMedia
    });
  } catch (error) {
    console.error('Error fetching label:', error);
    res.status(500).json({ error: 'Failed to fetch label' });
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

    const label = new Label({
      name,
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

// Follow/Unfollow label
router.post('/:id/follow', authMiddleware, async (req, res) => {
  try {
    const label = await Label.findById(req.params.id);
    
    if (!label) {
      return res.status(404).json({ error: 'Label not found' });
    }

    const isFollowing = label.followers.some(follower => 
      follower.userId.toString() === req.user.id
    );

    if (isFollowing) {
      // Unfollow
      label.followers = label.followers.filter(follower => 
        follower.userId.toString() !== req.user.id
      );
    } else {
      // Follow
      label.followers.push({
        userId: req.user.id,
        followedAt: new Date()
      });
    }

    await label.save();

    res.json({ 
      isFollowing: !isFollowing,
      followerCount: label.followers.length
    });
  } catch (error) {
    console.error('Error following/unfollowing label:', error);
    res.status(500).json({ error: 'Failed to follow/unfollow label' });
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
    const { verificationStatus, page = 1, limit = 20 } = req.query;
    
    const query = {};
    if (verificationStatus) {
      query.verificationStatus = verificationStatus;
    }

    const labels = await Label.find(query)
      .select('name slug email verificationStatus stats.totalBidAmount stats.artistCount')
      .sort({ createdAt: -1 })
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
    console.error('Error fetching admin labels:', error);
    res.status(500).json({ error: 'Failed to fetch labels' });
  }
});

module.exports = router;
