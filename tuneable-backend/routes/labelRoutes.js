const express = require('express');
const router = express.Router();
const Label = require('../models/Label');
const User = require('../models/User');
const Media = require('../models/Media');
const Bid = require('../models/Bid');
const authMiddleware = require('../middleware/authMiddleware');
const adminMiddleware = require('../middleware/adminMiddleware');
const { createLabelProfilePictureUpload, getPublicUrl } = require('../utils/r2Upload');

// Configure upload for label profile pictures
const profilePictureUpload = createLabelProfilePictureUpload();

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
    if (sortBy === 'totalBidAmount' || sortBy === 'globalLabelAggregate') {
      sort['stats.globalLabelAggregate'] = sortOrder === 'desc' ? -1 : 1;
    } else if (sortBy === 'artistCount') {
      sort['stats.artistCount'] = sortOrder === 'desc' ? -1 : 1;
    } else if (sortBy === 'name') {
      sort.name = sortOrder === 'desc' ? -1 : 1;
    }

    const labels = await Label.find(query)
      .select('name slug profilePicture description genres stats.globalLabelAggregate stats.artistCount stats.releaseCount')
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

// Get label team (label editors only)
router.get('/:slug/team', authMiddleware, async (req, res) => {
  try {
    const label = await Label.findBySlug(req.params.slug)
      .populate({
        path: 'admins.userId',
        select: 'username profilePic email uuid'
      })
      .lean();

    if (!label) {
      return res.status(404).json({ error: 'Label not found' });
    }

    const isPlatformAdmin = req.user?.role?.includes('admin');
    if (!isPlatformAdmin) {
      const viewerId = req.user?._id?.toString() || req.user?.id?.toString() || req.user?.uuid?.toString();
      const isLabelEditor = label.admins?.some((admin) => {
        if (!admin || !admin.userId) return false;
        const adminId =
          typeof admin.userId === 'object'
            ? (admin.userId._id?.toString() || admin.userId.uuid?.toString() || admin.userId.toString())
            : admin.userId.toString();
        return adminId === viewerId && (admin.role === 'owner' || admin.role === 'admin');
      });

      if (!isLabelEditor) {
        return res.status(403).json({ error: 'Not authorized to view label ownership' });
      }
    }

    const adminMembers = (label.admins || []).map((admin) => {
      const user = admin.userId || {};
      const userId = typeof user === 'object' ? (user._id || user.uuid) : admin.userId;
      return {
        userId: user,
        username: user.username,
        profilePic: user.profilePic,
        email: user.email,
        role: admin.role,
        joinedAt: admin.addedAt,
        addedBy: admin.addedBy,
        _id: userId
      };
    });

    const adminUserIds = new Set(adminMembers.map((member) => (member._id ? member._id.toString() : null)));

    const affiliatedUsers = await User.find({
      'labelAffiliations.labelId': label._id,
      'labelAffiliations.status': 'active'
    }).select('username profilePic email uuid labelAffiliations');

    const affiliationMembers = [];
    affiliatedUsers.forEach((user) => {
      user.labelAffiliations
        .filter((affiliation) => affiliation.labelId.toString() === label._id.toString())
        .forEach((affiliation) => {
          const userId = user._id?.toString() || user.uuid;
          if (adminUserIds.has(userId)) {
            return;
          }
          affiliationMembers.push({
            userId: {
              _id: user._id,
              uuid: user.uuid,
              username: user.username,
              profilePic: user.profilePic,
            },
            username: user.username,
            profilePic: user.profilePic,
            email: user.email,
            role: affiliation.role || 'member',
            joinedAt: affiliation.joinedAt,
            addedBy: affiliation.invitedBy,
            _id: userId,
          });
        });
    });

    const team = [...adminMembers, ...affiliationMembers];

    res.json({
      team,
      owners: adminMembers.filter((member) => member.role === 'owner'),
      admins: adminMembers.filter((member) => member.role === 'admin'),
      members: affiliationMembers,
    });
  } catch (error) {
    console.error('Error fetching label team:', error);
    res.status(500).json({ error: 'Failed to fetch label team', details: error.message });
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

    // Prepare labelId for query (handle both ObjectId and string formats)
    const labelIdString = label._id.toString();

    // Get recent releases
    const recentReleases = await Media.find({ 
      $or: [
        { 'label.labelId': label._id }, // Match ObjectId format
        { 'label.labelId': labelIdString } // Match string format
      ]
    })
    .select('title artist coverArt releaseDate globalMediaAggregate uuid _id')
    .sort({ releaseDate: -1 })
    .limit(10)
    .lean();

    // Get top performing media
    const topMedia = await Media.find({ 
      $or: [
        { 'label.labelId': label._id },
        { 'label.labelId': labelIdString }
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

    // Ensure socialMedia and stats have default values if undefined
    const labelResponse = labelToReturn.toObject ? labelToReturn.toObject() : labelToReturn;
    if (!labelResponse.socialMedia) {
      labelResponse.socialMedia = {};
    }
    if (!labelResponse.stats) {
      labelResponse.stats = {
        artistCount: 0,
        releaseCount: 0,
        globalLabelAggregate: 0,
        globalLabelBidAvg: 0,
        globalLabelBidTop: 0,
        globalLabelBidCount: 0
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
    } else if (sortBy === 'totalBidAmount' || sortBy === 'globalMediaAggregate') {
      sort.globalMediaAggregate = sortOrder === 'desc' ? -1 : 1;
    }

    const media = await Media.find({ 
      'label.labelId': label._id,
      isActive: true 
    })
    .select('title artist coverArt releaseDate globalMediaAggregate uuid _id')
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

// Create label (with optional profile picture upload)
router.post('/', authMiddleware, profilePictureUpload.single('profilePicture'), async (req, res) => {
  try {
    const { name, description, email, website, genres, foundedYear, userType } = req.body;
    
    // Handle social media links (can come as nested object or individual fields from FormData)
    let socialMedia = {};
    if (req.body.socialMedia) {
      // If sent as object (JSON)
      socialMedia = typeof req.body.socialMedia === 'string' 
        ? JSON.parse(req.body.socialMedia) 
        : req.body.socialMedia;
    } else {
      // Handle form-data format: socialMedia[facebook], socialMedia[youtube], etc.
      socialMedia = {
        facebook: req.body['socialMedia[facebook]'] || '',
        youtube: req.body['socialMedia[youtube]'] || '',
        soundcloud: req.body['socialMedia[soundcloud]'] || ''
      };
      // Remove empty strings
      Object.keys(socialMedia).forEach(key => {
        if (!socialMedia[key] || socialMedia[key].trim() === '') {
          delete socialMedia[key];
        }
      });
    }

    // Validate required fields
    if (!name || !email) {
      return res.status(400).json({ error: 'Label name and email are required' });
    }

    // Check if label name already exists
    const existingLabel = await Label.findOne({ name });
    if (existingLabel) {
      return res.status(400).json({ error: 'Label name already exists' });
    }

    const adminRole = userType === 'affiliated-artist' ? 'admin' : 'owner';

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

    // Handle profile picture upload if provided
    let profilePictureUrl = null;
    let uploadedFileKey = null;
    if (req.file) {
      // Use custom domain URL via getPublicUrl (uses R2_PUBLIC_URL env var)
      // req.file.key contains the S3 key (e.g., "label-logos/userId-timestamp.jpg")
      // Always use getPublicUrl to ensure we get the full R2 URL with custom domain
      if (!req.file.key) {
        console.error('❌ req.file.key is missing! req.file:', req.file);
        return res.status(500).json({ error: 'File upload error: key not found' });
      }
      uploadedFileKey = req.file.key;
      // Always use getPublicUrl to get full URL - it will throw error if R2_PUBLIC_URL not set
      try {
        profilePictureUrl = getPublicUrl(uploadedFileKey);
        console.log(`📸 Uploaded label profile picture: ${profilePictureUrl}`);
        console.log(`📸 File key: ${uploadedFileKey}`);
        console.log(`📸 R2_PUBLIC_URL: ${process.env.R2_PUBLIC_URL}`);
      } catch (error) {
        console.error('❌ Error generating public URL:', error.message);
        return res.status(500).json({ error: 'Failed to generate profile picture URL', details: error.message });
      }
    }

    // Set verification status based on user type
    // Owners start as 'pending' (awaiting admin verification)
    // Affiliated artists start as 'unverified' (less priority)
    const verificationStatus = adminRole === 'owner' ? 'pending' : 'unverified';

    const label = new Label({
      name,
      slug, // Explicitly set slug
      description,
      email,
      website,
      genres: genres || [],
      foundedYear,
      profilePicture: profilePictureUrl,
      socialMedia: Object.keys(socialMedia).length > 0 ? socialMedia : undefined,
      admins: [{
        userId: req.user.id,
        role: adminRole,
        addedAt: new Date()
      }],
      verificationStatus: verificationStatus
    });

    await label.save();

    // After label is saved, if profile picture was uploaded, update the file key to use label ID
    // and update the profile picture URL in the database
    if (uploadedFileKey && profilePictureUrl) {
      try {
        const { S3Client, CopyObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
        const s3Client = new S3Client({
          region: 'auto',
          endpoint: process.env.R2_ENDPOINT,
          credentials: {
            accessKeyId: process.env.R2_ACCESS_KEY_ID,
            secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
          },
        });

        // Extract file extension from original key
        const pathModule = require('path');
        const pathParts = uploadedFileKey.split('/');
        const oldFilename = pathParts[pathParts.length - 1];
        const fileExt = pathModule.extname(oldFilename);
        const timestamp = Date.now();
        
        // Create new key with label ID (matches format: label-logos/labelId-timestamp.ext)
        const newKey = `label-logos/${label._id.toString()}-${timestamp}${fileExt}`;
        
        // Copy file to new location with label ID
        const copyCommand = new CopyObjectCommand({
          Bucket: process.env.R2_BUCKET_NAME,
          CopySource: `${process.env.R2_BUCKET_NAME}/${uploadedFileKey}`,
          Key: newKey,
          ACL: 'public-read'
        });
        await s3Client.send(copyCommand);

        // Delete old file
        const deleteCommand = new DeleteObjectCommand({
          Bucket: process.env.R2_BUCKET_NAME,
          Key: uploadedFileKey
        });
        await s3Client.send(deleteCommand);

        // Update label with new profile picture URL
        // Always use getPublicUrl to ensure full URL is saved
        try {
          const newProfilePictureUrl = getPublicUrl(newKey);
          label.profilePicture = newProfilePictureUrl;
          await label.save();

          console.log(`📸 Updated label profile picture URL: ${newProfilePictureUrl}`);
          console.log(`📸 New file key: ${newKey}`);
          console.log(`📸 Saved to database: ${label.profilePicture}`);
        } catch (urlError) {
          console.error('❌ Error generating public URL after file rename:', urlError.message);
          // If URL generation fails, try to generate URL from newKey manually
          // This should not happen if R2_PUBLIC_URL is set, but just in case
          throw urlError; // Re-throw to be caught by outer catch
        }
      } catch (error) {
        console.error('❌ Error updating label profile picture key:', error);
        // Don't fail the request if file rename fails - the original URL still works
        // But log a warning that the URL might not be in the expected format
        console.warn('⚠️ Label created but profile picture URL might not be in expected format');
      }
    }

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

// Upload label profile picture (authenticated, label admin/owner only)
router.put('/:id/profile-picture', authMiddleware, profilePictureUpload.single('profilePicture'), async (req, res) => {
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

    // Use custom domain URL via getPublicUrl (uses R2_PUBLIC_URL env var)
    // req.file.key contains the S3 key (e.g., "label-logos/labelId-timestamp.jpg")
    // Always use getPublicUrl to ensure we get the full R2 URL with custom domain
    if (!req.file.key) {
      console.error('❌ req.file.key is missing! req.file:', req.file);
      return res.status(500).json({ error: 'File upload error: key not found' });
    }
    
    // Always use getPublicUrl to get full URL - it will throw error if R2_PUBLIC_URL not set
    let profilePicturePath;
    try {
      profilePicturePath = getPublicUrl(req.file.key);
      console.log(`📸 Saving label profile picture: ${profilePicturePath} for label ${label.name}`);
      console.log(`📸 File key: ${req.file.key}`);
      console.log(`📸 R2_PUBLIC_URL: ${process.env.R2_PUBLIC_URL}`);
    } catch (error) {
      console.error('❌ Error generating public URL:', error.message);
      return res.status(500).json({ error: 'Failed to generate profile picture URL', details: error.message });
    }

    label.profilePicture = profilePicturePath;
    await label.save();

    console.log('✅ Label profile picture updated:', label.profilePicture);
    console.log('✅ Saved URL in database:', label.profilePicture);
    res.json({ message: 'Label profile picture updated successfully', label });
  } catch (error) {
    console.error('Error updating label profile picture:', error.message);
    res.status(500).json({ error: 'Error updating label profile picture', details: error.message });
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
    } else if (sortBy === 'totalBidAmount' || sortBy === 'globalLabelAggregate') {
      sort['stats.globalLabelAggregate'] = sortOrder === 'desc' ? -1 : 1;
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
      .select('name slug email logo verificationStatus verificationMethod verifiedAt verifiedBy stats.globalLabelAggregate stats.artistCount stats.releaseCount stats.lastBidAt genres createdAt updatedAt')
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
