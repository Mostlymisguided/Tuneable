const express = require('express');
const router = express.Router();
const Collective = require('../models/Collective');
const User = require('../models/User');
const Media = require('../models/Media');
const Bid = require('../models/Bid');
const authMiddleware = require('../middleware/authMiddleware');
const adminMiddleware = require('../middleware/adminMiddleware');
const { createLabelProfilePictureUpload, getPublicUrl } = require('../utils/r2Upload');
const { createNotification } = require('../services/notificationService');

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
    if (sortBy === 'totalBidAmount' || sortBy === 'globalCollectiveAggregate') {
      sort['stats.globalCollectiveAggregate'] = sortOrder === 'desc' ? -1 : 1;
    } else if (sortBy === 'memberCount') {
      sort['stats.memberCount'] = sortOrder === 'desc' ? -1 : 1;
    } else if (sortBy === 'name') {
      sort.name = sortOrder === 'desc' ? -1 : 1;
    }

    const collectives = await Collective.find(query)
      .select('name slug profilePicture description genres type stats.globalCollectiveAggregate stats.memberCount stats.releaseCount')
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

// Get collective team (collective admins only)
router.get('/:slug/team', authMiddleware, async (req, res) => {
  try {
    const collective = await Collective.findBySlug(req.params.slug)
      .populate('members.userId', 'username profilePic email uuid')
      .lean();

    if (!collective) {
      return res.status(404).json({ error: 'Collective not found' });
    }

    const isPlatformAdmin = req.user?.role?.includes('admin');
    if (!isPlatformAdmin) {
      const viewerId = req.user?._id?.toString() || req.user?.id?.toString() || req.user?.uuid?.toString();
      const isCollectiveEditor = (collective.members || []).some((member) => {
        if (!member || !member.userId || member.leftAt) return false;
        const memberId =
          typeof member.userId === 'object'
            ? (member.userId._id?.toString() || member.userId.uuid?.toString() || member.userId.toString())
            : member.userId.toString();
        return (
          memberId === viewerId &&
          (member.role === 'founder' || member.role === 'admin')
        );
      });

      if (!isCollectiveEditor) {
        return res.status(403).json({ error: 'Not authorized to view collective ownership' });
      }
    }

    const activeMembers = (collective.members || []).filter((member) => !member.leftAt);

    const team = activeMembers.map((member) => {
      const user = member.userId || {};
      const userId = typeof user === 'object' ? (user._id || user.uuid || user.toString()) : member.userId;
      return {
        userId: user,
        username: user.username,
        profilePic: user.profilePic,
        email: user.email,
        role: member.role,
        joinedAt: member.joinedAt,
        addedBy: member.addedBy,
        instrument: member.instrument,
        _id: userId
      };
    });

    res.json({
      team,
      founders: team.filter((member) => member.role === 'founder'),
      admins: team.filter((member) => member.role === 'admin'),
      members: team.filter((member) => member.role === 'member'),
    });
  } catch (error) {
    console.error('Error fetching collective team:', error);
    res.status(500).json({ error: 'Failed to fetch collective team', details: error.message });
  }
});

// Invite admin to collective (founders only)
router.post('/:slug/invite-admin', authMiddleware, async (req, res) => {
  try {
    const { slug } = req.params;
    const { userId, email } = req.body;
    const inviterId = req.user._id;
    
    const collective = await Collective.findBySlug(slug);
    if (!collective) {
      return res.status(404).json({ error: 'Collective not found' });
    }
    
    // Check if inviter is founder
    const isFounder = collective.isFounder(inviterId);
    if (!isFounder) {
      return res.status(403).json({ error: 'Only collective founders can invite admins' });
    }
    
    let targetUser;
    if (userId) {
      targetUser = await User.findById(userId);
    } else if (email) {
      targetUser = await User.findOne({ email: email.toLowerCase().trim() });
    } else {
      return res.status(400).json({ error: 'Either userId or email is required' });
    }
    
    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Check if user is already a member
    if (collective.isMember(targetUser._id)) {
      const existingMember = collective.members.find(
        m => m.userId.toString() === targetUser._id.toString() && !m.leftAt
      );
      if (existingMember && (existingMember.role === 'admin' || existingMember.role === 'founder')) {
        return res.status(400).json({ error: 'User is already an admin or founder of this collective' });
      }
    }
    
    // Add as admin
    await collective.addMember(targetUser._id, 'admin', inviterId);
    
    // Create notification for the invited user
    try {
      const inviter = await User.findById(inviterId).select('username');
      await createNotification({
        userId: targetUser._id,
        type: 'collective_invite',
        title: 'Collective Invitation',
        message: `${inviter?.username || 'Someone'} invited you to join "${collective.name}" as an admin`,
        link: `/collective/${collective.slug}`,
        linkText: 'View Collective',
        relatedUserId: inviterId
      });
    } catch (notifError) {
      console.error('Error creating collective invite notification:', notifError);
      // Don't fail the request if notification fails
    }
    
    res.json({ success: true, message: 'Admin invited successfully' });
  } catch (error) {
    console.error('Error inviting admin:', error);
    res.status(500).json({ error: 'Failed to invite admin', details: error.message });
  }
});

// Invite member to collective (founders and admins)
router.post('/:slug/invite-member', authMiddleware, async (req, res) => {
  try {
    const { slug } = req.params;
    const { userId, email, role = 'member', instrument } = req.body;
    const inviterId = req.user._id;
    
    if (!['member', 'admin'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role. Must be member or admin' });
    }
    
    const collective = await Collective.findBySlug(slug);
    if (!collective) {
      return res.status(404).json({ error: 'Collective not found' });
    }
    
    // Check if inviter is founder or admin
    const isCollectiveEditor = collective.isAdmin(inviterId);
    if (!isCollectiveEditor) {
      return res.status(403).json({ error: 'Only collective founders and admins can invite members' });
    }
    
    let targetUser;
    if (userId) {
      targetUser = await User.findById(userId);
    } else if (email) {
      targetUser = await User.findOne({ email: email.toLowerCase().trim() });
    } else {
      return res.status(400).json({ error: 'Either userId or email is required' });
    }
    
    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Check if user is already a member
    if (collective.isMember(targetUser._id)) {
      const existingMember = collective.members.find(
        m => m.userId.toString() === targetUser._id.toString() && !m.leftAt
      );
      if (existingMember) {
        if (existingMember.role === role) {
          return res.status(400).json({ error: 'User is already a member with this role' });
        }
        // If they're already a member with a different role, we'll update it
      }
    }
    
    // Add member
    await collective.addMember(targetUser._id, role, inviterId, instrument || null);
    
    // Create notification for the invited user
    try {
      const inviter = await User.findById(inviterId).select('username');
      await createNotification({
        userId: targetUser._id,
        type: 'collective_invite',
        title: 'Collective Invitation',
        message: `${inviter?.username || 'Someone'} invited you to join "${collective.name}" as a ${role}${instrument ? ` (${instrument})` : ''}`,
        link: `/collective/${collective.slug}`,
        linkText: 'View Collective',
        relatedUserId: inviterId
      });
    } catch (notifError) {
      console.error('Error creating collective invite notification:', notifError);
      // Don't fail the request if notification fails
    }
    
    res.json({ success: true, message: 'Member invited successfully' });
  } catch (error) {
    console.error('Error inviting member:', error);
    res.status(500).json({ error: 'Failed to invite member', details: error.message });
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
        globalCollectiveAggregate: 0,
        globalCollectiveBidAvg: 0,
        globalCollectiveBidTop: 0,
        globalCollectiveBidCount: 0
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

// Remove member from collective (founder/admin only, or self-removal)
router.delete('/:slug/members/:userId', authMiddleware, async (req, res) => {
  try {
    const { slug, userId } = req.params;
    const requesterId = req.user._id;
    
    const collective = await Collective.findBySlug(slug);
    
    if (!collective) {
      return res.status(404).json({ error: 'Collective not found' });
    }

    const isSelfRemoval = userId === requesterId.toString();
    const isAdmin = collective.isAdmin(requesterId);

    // Allow self-removal OR founder/admin removing others
    if (!isSelfRemoval && !isAdmin) {
      return res.status(403).json({ error: 'Only collective founders and admins can remove other members' });
    }

    // Prevent removing the last founder
    if (!isSelfRemoval) {
      const targetMember = collective.members.find(m => m.userId.toString() === userId && !m.leftAt);
      if (targetMember && targetMember.role === 'founder') {
        const founderCount = collective.members.filter(m => m.role === 'founder' && !m.leftAt).length;
        if (founderCount <= 1) {
          return res.status(400).json({ error: 'Cannot remove the last founder' });
        }
      }
    }

    await collective.removeMember(userId);

    res.json({ message: 'Member removed successfully' });
  } catch (error) {
    console.error('Error removing member:', error);
    res.status(500).json({ error: 'Failed to remove member' });
  }
});

// Change member role (founder only)
router.patch('/:slug/members/:userId/role', authMiddleware, async (req, res) => {
  try {
    const { slug, userId } = req.params;
    const { role } = req.body;
    const requesterId = req.user._id;
    
    const collective = await Collective.findBySlug(slug);
    
    if (!collective) {
      return res.status(404).json({ error: 'Collective not found' });
    }

    if (!collective.isFounder(requesterId)) {
      return res.status(403).json({ error: 'Only collective founders can change member roles' });
    }

    if (!['founder', 'admin', 'member'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role. Must be founder, admin, or member' });
    }

    // Prevent changing the last founder's role
    if (role !== 'founder') {
      const targetMember = collective.members.find(m => m.userId.toString() === userId && !m.leftAt);
      if (targetMember && targetMember.role === 'founder') {
        const founderCount = collective.members.filter(m => m.role === 'founder' && !m.leftAt).length;
        if (founderCount <= 1) {
          return res.status(400).json({ error: 'Cannot change the last founder\'s role' });
        }
      }
    }

    await collective.addMember(userId, role, requesterId);

    res.json({ message: 'Member role updated successfully' });
  } catch (error) {
    console.error('Error changing member role:', error);
    res.status(500).json({ error: 'Failed to change member role' });
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

