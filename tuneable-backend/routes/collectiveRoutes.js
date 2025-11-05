const express = require('express');
const router = express.Router();
const Collective = require('../models/Collective');
const User = require('../models/User');
const Media = require('../models/Media');
const Bid = require('../models/Bid');
const authMiddleware = require('../middleware/authMiddleware');
const adminMiddleware = require('../middleware/adminMiddleware');
const { createLabelProfilePictureUpload, getPublicUrl } = require('../utils/r2Upload');

// Configure upload for collective profile pictures (reuse label upload config)
const profilePictureUpload = createLabelProfilePictureUpload();

// ========================================
// PUBLIC ROUTES
// ========================================

// Get all collectives (public)
router.get('/', async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      genre, 
      type,
      sortBy = 'totalBidAmount',
      sortOrder = 'desc',
      search 
    } = req.query;

    const query = { isActive: true };
    
    // Filter by genre
    if (genre) {
      query.genres = genre;
    }
    
    // Filter by type
    if (type) {
      query.type = type;
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
    } else if (sortBy === 'memberCount') {
      sort['stats.memberCount'] = sortOrder === 'desc' ? -1 : 1;
    } else if (sortBy === 'name') {
      sort.name = sortOrder === 'desc' ? -1 : 1;
    }

    const collectives = await Collective.find(query)
      .select('name slug profilePicture description genres type stats.totalBidAmount stats.memberCount stats.releaseCount')
      .sort(sort)
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Collective.countDocuments(query);

    res.json({
      collectives,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    });
  } catch (error) {
    console.error('Error fetching collectives:', error);
    res.status(500).json({ error: 'Failed to fetch collectives' });
  }
});

// Get collective by slug (public)
router.get('/:slug', async (req, res) => {
  try {
    const { refresh = false } = req.query;
    // TODO: Create collectiveStatsService similar to labelStatsService
    // const collectiveStatsService = require('../services/collectiveStatsService');
    
    const collective = await Collective.findBySlug(req.params.slug);
    
    if (!collective) {
      return res.status(404).json({ error: 'Collective not found' });
    }

    // TODO: Recalculate stats if requested (similar to labels)
    // For now, just return the collective

    // Get recent releases (media where collective is credited)
    const recentReleases = await Media.find({ 
      $or: [
        { 'artist.collectiveId': collective._id },
        { 'producer.collectiveId': collective._id },
        { 'featuring.collectiveId': collective._id }
      ]
    })
    .select('title artist coverArt releaseDate globalMediaAggregate uuid _id')
    .sort({ releaseDate: -1 })
    .limit(10)
    .lean();

    // Get top performing media
    const topMedia = await Media.find({ 
      $or: [
        { 'artist.collectiveId': collective._id },
        { 'producer.collectiveId': collective._id },
        { 'featuring.collectiveId': collective._id }
      ]
    })
    .select('title artist coverArt globalMediaAggregate uuid _id')
    .sort({ globalMediaAggregate: -1 })
    .limit(5)
    .lean();

    // Get bid counts for recent releases
    const recentReleaseIds = recentReleases.map(r => r._id);
    let bidCounts = [];
    if (recentReleaseIds.length > 0) {
      bidCounts = await Bid.aggregate([
        {
          $match: {
            mediaId: { $in: recentReleaseIds },
            status: 'active'
          }
        },
        {
          $group: {
            _id: '$mediaId',
            count: { $sum: 1 }
          }
        }
      ]);
    }

    // Create bid count lookup for recent releases
    const bidCountLookup = {};
    bidCounts.forEach(item => {
      bidCountLookup[item._id.toString()] = item.count;
    });

    // Get bid counts for top media
    const topMediaIds = topMedia.map(m => m._id);
    let topBidCounts = [];
    if (topMediaIds.length > 0) {
      topBidCounts = await Bid.aggregate([
        {
          $match: {
            mediaId: { $in: topMediaIds },
            status: 'active'
          }
        },
        {
          $group: {
            _id: '$mediaId',
            count: { $sum: 1 }
          }
        }
      ]);
    }

    // Create bid count lookup for top media
    const topBidCountLookup = {};
    topBidCounts.forEach(item => {
      topBidCountLookup[item._id.toString()] = item.count;
    });

    // Format media for response
    const formattedRecentReleases = recentReleases.map(m => ({
      _id: m._id,
      uuid: m.uuid,
      title: m.title,
      artist: Array.isArray(m.artist) && m.artist.length > 0 ? m.artist[0].name : 'Unknown Artist',
      coverArt: m.coverArt,
      releaseDate: m.releaseDate,
      stats: {
        totalBidAmount: m.globalMediaAggregate || 0,
        bidCount: bidCountLookup[m._id.toString()] || 0
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
        bidCount: topBidCountLookup[m._id.toString()] || 0
      }
    }));

    // Populate members
    const populatedCollective = await Collective.findById(collective._id)
      .populate('members.userId', 'username profilePic uuid');

    // Ensure socialMedia and stats have default values if undefined
    const collectiveResponse = populatedCollective.toObject ? populatedCollective.toObject() : populatedCollective;
    if (!collectiveResponse.socialMedia) {
      collectiveResponse.socialMedia = {};
    }
    if (!collectiveResponse.stats) {
      collectiveResponse.stats = {
        memberCount: 0,
        releaseCount: 0,
        totalBidAmount: 0,
        averageBidAmount: 0,
        topBidAmount: 0,
        totalBidCount: 0
      };
    }

    res.json({
      collective: collectiveResponse,
      recentReleases: formattedRecentReleases,
      topMedia: formattedTopMedia
    });
  } catch (error) {
    console.error('Error fetching collective:', error);
    res.status(500).json({ error: 'Failed to fetch collective', details: error.message });
  }
});

// Get collective's members
router.get('/:slug/members', async (req, res) => {
  try {
    const collective = await Collective.findBySlug(req.params.slug);
    
    if (!collective) {
      return res.status(404).json({ error: 'Collective not found' });
    }

    const populatedCollective = await Collective.findById(collective._id)
      .populate('members.userId', 'username profilePic uuid creatorProfile.artistName creatorProfile.genres');

    // Filter out former members (those with leftAt date)
    const activeMembers = populatedCollective.members.filter(member => !member.leftAt);

    res.json({ members: activeMembers });
  } catch (error) {
    console.error('Error fetching collective members:', error);
    res.status(500).json({ error: 'Failed to fetch collective members' });
  }
});

// Get collective's media
router.get('/:slug/media', async (req, res) => {
  try {
    const { page = 1, limit = 20, sortBy = 'releaseDate', sortOrder = 'desc' } = req.query;
    
    const collective = await Collective.findBySlug(req.params.slug);
    
    if (!collective) {
      return res.status(404).json({ error: 'Collective not found' });
    }

    const sort = {};
    if (sortBy === 'releaseDate') {
      sort.releaseDate = sortOrder === 'desc' ? -1 : 1;
    } else if (sortBy === 'totalBidAmount') {
      sort.globalMediaAggregate = sortOrder === 'desc' ? -1 : 1;
    }

    const media = await Media.find({ 
      $or: [
        { 'artist.collectiveId': collective._id },
        { 'producer.collectiveId': collective._id },
        { 'featuring.collectiveId': collective._id }
      ]
    })
    .select('title artist coverArt releaseDate globalMediaAggregate uuid _id')
    .sort(sort)
    .limit(limit * 1)
    .skip((page - 1) * limit);

    const total = await Media.countDocuments({ 
      $or: [
        { 'artist.collectiveId': collective._id },
        { 'producer.collectiveId': collective._id },
        { 'featuring.collectiveId': collective._id }
      ]
    });

    res.json({
      media,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    });
  } catch (error) {
    console.error('Error fetching collective media:', error);
    res.status(500).json({ error: 'Failed to fetch collective media' });
  }
});

// ========================================
// AUTHENTICATED ROUTES
// ========================================

// Create collective (with optional profile picture upload)
router.post('/', authMiddleware, profilePictureUpload.single('profilePicture'), async (req, res) => {
  try {
    const { name, description, email, website, genres, foundedYear, type } = req.body;

    // Validate required fields
    if (!name || !email) {
      return res.status(400).json({ error: 'Collective name and email are required' });
    }

    // Check if collective name already exists
    const existingCollective = await Collective.findOne({ name });
    if (existingCollective) {
      return res.status(400).json({ error: 'Collective name already exists' });
    }

    // Generate slug from name (before creating collective)
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');

    // Check if slug already exists
    const existingSlug = await Collective.findOne({ slug });
    if (existingSlug) {
      return res.status(400).json({ error: 'A collective with a similar name already exists' });
    }

    // Handle profile picture upload if provided
    let profilePictureUrl = null;
    if (req.file) {
      profilePictureUrl = req.file.key ? getPublicUrl(req.file.key) : (req.file.location || getPublicUrl(`profile-pictures/${req.file.filename}`));
      console.log(`📸 Saving collective profile picture: ${profilePictureUrl} for collective ${name}`);
    }

    const collective = new Collective({
      name,
      slug, // Explicitly set slug
      description,
      email,
      website,
      genres: genres || [],
      foundedYear,
      type: type || 'collective',
      profilePicture: profilePictureUrl,
      members: [{
        userId: req.user.id,
        role: 'founder',
        joinedAt: new Date(),
        addedBy: req.user.id,
        verified: true
      }]
    });

    await collective.save();

    res.status(201).json({ collective });
  } catch (error) {
    console.error('Error creating collective:', error);
    res.status(500).json({ error: 'Failed to create collective', details: error.message });
  }
});

// Update collective (founder/admin only)
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const collective = await Collective.findById(req.params.id);
    
    if (!collective) {
      return res.status(404).json({ error: 'Collective not found' });
    }

    // Check if user is admin
    if (!collective.isAdmin(req.user.id)) {
      return res.status(403).json({ error: 'Not authorized to update this collective' });
    }

    const updates = req.body;
    Object.assign(collective, updates);
    
    await collective.save();

    res.json({ collective });
  } catch (error) {
    console.error('Error updating collective:', error);
    res.status(500).json({ error: 'Failed to update collective' });
  }
});

// Upload collective profile picture (authenticated, collective admin/founder only)
router.put('/:id/profile-picture', authMiddleware, profilePictureUpload.single('profilePicture'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const collective = await Collective.findById(req.params.id);
    
    if (!collective) {
      return res.status(404).json({ error: 'Collective not found' });
    }

    // Check if user can edit this collective (admin or collective admin/founder)
    const isPlatformAdmin = req.user.role && req.user.role.includes('admin');
    const canEdit = isPlatformAdmin || collective.isAdmin(req.user.id);
    
    if (!canEdit) {
      return res.status(403).json({ error: 'Not authorized to update this collective' });
    }

    // Use custom domain URL via getPublicUrl
    const profilePicturePath = req.file.key ? getPublicUrl(req.file.key) : (req.file.location || getPublicUrl(`profile-pictures/${req.file.filename}`));

    console.log(`📸 Saving collective profile picture: ${profilePicturePath} for collective ${collective.name}`);

    collective.profilePicture = profilePicturePath;
    await collective.save();

    console.log('✅ Collective profile picture updated:', collective.profilePicture);
    res.json({ message: 'Collective profile picture updated successfully', collective });
  } catch (error) {
    console.error('Error updating collective profile picture:', error.message);
    res.status(500).json({ error: 'Error updating collective profile picture', details: error.message });
  }
});

// Add member to collective (founder/admin only)
router.post('/:id/members', authMiddleware, async (req, res) => {
  try {
    const { userId, role, instrument } = req.body;
    const collective = await Collective.findById(req.params.id);
    
    if (!collective) {
      return res.status(404).json({ error: 'Collective not found' });
    }

    // Check if user is admin
    if (!collective.isAdmin(req.user.id)) {
      return res.status(403).json({ error: 'Only collective founders/admins can add members' });
    }

    // Check if user exists
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    await collective.addMember(userId, role || 'member', req.user.id, instrument);

    res.json({ message: 'Member added successfully' });
  } catch (error) {
    console.error('Error adding member:', error);
    res.status(500).json({ error: 'Failed to add member' });
  }
});

// Remove member from collective (founder/admin only)
router.delete('/:id/members/:userId', authMiddleware, async (req, res) => {
  try {
    const collective = await Collective.findById(req.params.id);
    
    if (!collective) {
      return res.status(404).json({ error: 'Collective not found' });
    }

    // Check if user is admin
    if (!collective.isAdmin(req.user.id)) {
      return res.status(403).json({ error: 'Only collective founders/admins can remove members' });
    }

    // Can't remove yourself
    if (req.params.userId === req.user.id) {
      return res.status(400).json({ error: 'Cannot remove yourself as member' });
    }

    await collective.removeMember(req.params.userId);

    res.json({ message: 'Member removed successfully' });
  } catch (error) {
    console.error('Error removing member:', error);
    res.status(500).json({ error: 'Failed to remove member' });
  }
});

// ========================================
// ADMIN ROUTES
// ========================================

// Verify collective (admin only)
router.post('/:id/verify', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const collective = await Collective.findById(req.params.id);
    
    if (!collective) {
      return res.status(404).json({ error: 'Collective not found' });
    }

    collective.verificationStatus = 'verified';
    collective.verifiedAt = new Date();
    collective.verifiedBy = req.user.id;
    collective.verificationMethod = 'admin';

    await collective.save();

    res.json({ message: 'Collective verified successfully', collective });
  } catch (error) {
    console.error('Error verifying collective:', error);
    res.status(500).json({ error: 'Failed to verify collective' });
  }
});

module.exports = router;

