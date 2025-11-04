const express = require('express');
const multer = require('multer');
const path = require('path');
const router = express.Router();
const Media = require('../models/Media');
const Comment = require('../models/Comment');
const User = require('../models/User');
const authMiddleware = require('../middleware/authMiddleware');
const { isValidObjectId } = require('../utils/validators');
// const { transformResponse } = require('../utils/uuidTransform'); // Removed - using ObjectIds directly
// const { resolveId } = require('../utils/idResolver'); // Removed - using ObjectIds directly
const { createMediaUpload, createCoverArtUpload, getPublicUrl } = require('../utils/r2Upload');
const { toCreatorSubdocs } = require('../utils/creatorHelpers');
const MetadataExtractor = require('../utils/metadataExtractor');

// Configure media upload
const mediaUpload = createMediaUpload();
const coverArtUpload = createCoverArtUpload();

// Create a custom multer configuration that handles both files
const mixedUpload = multer({
  storage: multer.memoryStorage(),
  limits: { 
    fileSize: 50 * 1024 * 1024, // 50MB max
    files: 2 // Max 2 files (audio + cover art)
  },
  fileFilter: (req, file, cb) => {
    if (file.fieldname === 'audioFile') {
      // Only MP3 files for audio
      const allowedTypes = /mp3/;
      const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
      const mimetype = file.mimetype === 'audio/mpeg' || file.mimetype === 'audio/mp3';
      
      if (mimetype && extname) {
        return cb(null, true);
      } else {
        return cb(new Error('Only MP3 files are allowed for audio'));
      }
    } else if (file.fieldname === 'coverArtFile') {
      // Only image files for cover art
      if (file.mimetype.startsWith('image/')) {
        return cb(null, true);
      } else {
        return cb(new Error('Only image files are allowed for cover art'));
      }
    } else {
      return cb(new Error('Invalid field name'));
    }
  }
});

// @route   POST /api/media/upload
// @desc    Upload media file (MP3) - Creator/Admin only
// @access  Private (Verified creators and admins)
router.post('/upload', authMiddleware, mixedUpload.fields([
  { name: 'audioFile', maxCount: 1 },
  { name: 'coverArtFile', maxCount: 1 }
]), async (req, res) => {
  try {
    const userId = req.user._id;
    
    // Check if user is a verified creator or admin
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const { canUploadMedia } = require('../utils/permissionHelpers');
    if (!canUploadMedia(user)) {
      return res.status(403).json({ error: 'Only verified creators and admins can upload media' });
    }
    
    if (!req.files || !req.files.audioFile || req.files.audioFile.length === 0) {
      return res.status(400).json({ error: 'No audio file uploaded' });
    }
    
    const audioFile = req.files.audioFile[0];
    const coverArtFile = req.files.coverArtFile ? req.files.coverArtFile[0] : null;
    
    console.log(`🎵 Processing upload: ${audioFile.originalname} (${audioFile.size} bytes)`);
    if (coverArtFile) {
      console.log(`🖼️ Cover art file: ${coverArtFile.originalname} (${coverArtFile.size} bytes)`);
    }
    
    // Extract metadata from uploaded file
    let extractedMetadata = null;
    
    try {
      console.log('🔍 Extracting metadata from uploaded file...');
      extractedMetadata = await MetadataExtractor.extractFromBuffer(audioFile.buffer, audioFile.originalname);
      
      // Validate extracted metadata
      const validation = MetadataExtractor.validateMetadata(extractedMetadata);
      if (validation.warnings.length > 0) {
        console.log('⚠️ Metadata validation warnings:', validation.warnings);
      }
      
    } catch (metadataError) {
      console.error('❌ Metadata extraction failed:', metadataError.message);
      // Continue with manual metadata if extraction fails
    }
    
    // Extract metadata from request (user-provided, takes priority over extracted)
    const {
      title,
      artistName,
      album,
      genre,
      releaseDate,
      duration,
      explicit,
      tags,
      description,
      coverArt
    } = req.body;
    
    // Upload audio file to R2 manually
    let fileUrl;
    try {
      console.log('📤 Uploading audio file to R2...');
      const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
      const s3Client = new S3Client({
        region: 'auto',
        endpoint: process.env.R2_ENDPOINT,
        credentials: {
          accessKeyId: process.env.R2_ACCESS_KEY_ID,
          secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
        },
      });
      
      const username = user.username || 'unknown';
      const timestamp = Date.now();
      const safeFilename = audioFile.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
      const audioKey = `media-uploads/${username}-${timestamp}-${safeFilename}`;
      
      const audioCommand = new PutObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: audioKey,
        Body: audioFile.buffer,
        ContentType: 'audio/mpeg',
        ACL: 'public-read',
        CacheControl: 'public, max-age=31536000'
      });
      
      await s3Client.send(audioCommand);
      fileUrl = getPublicUrl(audioKey);
      console.log(`✅ Audio file uploaded to R2: ${fileUrl}`);
    } catch (uploadError) {
      console.error('❌ Error uploading audio file to R2:', uploadError.message);
      return res.status(500).json({ error: 'Failed to upload audio file' });
    }
    
    // Parse tags (comma-separated string to array)
    const parsedTags = tags ? tags.split(',').map(t => t.trim()).filter(t => t) : [];
    
    // Determine final values (user input takes priority over extracted metadata)
    const finalTitle = title || extractedMetadata?.title || 'Untitled';
    const finalArtistName = artistName?.trim() || extractedMetadata?.artist || user.creatorProfile?.artistName || user.username;
    const finalAlbum = album || extractedMetadata?.album || null;
    const finalGenres = genre ? [genre] : (extractedMetadata?.genres || []);
    const finalDuration = duration ? parseInt(duration) : (extractedMetadata?.duration || null);
    const finalExplicit = explicit === 'true' || explicit === true || extractedMetadata?.explicit || false;
    const finalCoverArt = coverArt || null;
    
    // Validate required fields
    if (!finalTitle) {
      return res.status(400).json({ error: 'Title is required' });
    }
    
    // Map extracted metadata to Media model format
    const mappedMetadata = extractedMetadata ? 
      MetadataExtractor.mapToMediaModel(extractedMetadata, userId) : {};
    
    // Create Media entry with extracted and manual metadata
    const media = new Media({
      // Basic information (user input takes priority)
      title: finalTitle,
      album: finalAlbum,
      releaseDate: releaseDate || mappedMetadata.releaseDate || undefined,
      
      // Creators (use extracted if no user input)
      artist: artistName ? toCreatorSubdocs([{
        name: finalArtistName,
        userId: userId,
        verified: true
      }]) : (mappedMetadata.artist || toCreatorSubdocs([{
        name: finalArtistName,
        userId: userId,
        verified: true
      }])),
      
      // Additional creators from metadata
      producer: mappedMetadata.producer || [],
      songwriter: mappedMetadata.songwriter || [],
      composer: mappedMetadata.composer || [],
      label: mappedMetadata.label || [],
      
      // Technical metadata
      duration: finalDuration,
      bitrate: mappedMetadata.bitrate || null,
      sampleRate: mappedMetadata.sampleRate || null,
      explicit: finalExplicit,
      
      // Advanced metadata
      bpm: mappedMetadata.bpm || null,
      key: mappedMetadata.key || null,
      isrc: mappedMetadata.isrc || null,
      upc: mappedMetadata.upc || null,
      lyrics: mappedMetadata.lyrics || null,
      
      // Content classification
      genres: finalGenres,
      language: mappedMetadata.language || 'en',
      tags: parsedTags,
      description: description || '',
      coverArt: finalCoverArt,
      
      // Note: trackNumber, discNumber, and publisher fields don't exist in Media model
      encodedBy: mappedMetadata.encodedBy || null,
      comment: mappedMetadata.comment || null,
      
      // File information
      sources: { upload: fileUrl },
      contentType: ['music'],
      contentForm: ['tune'],
      mediaType: ['mp3'],
      fileSize: audioFile.size,
      
      // System fields
      addedBy: userId,
      uploadedAt: new Date(),
      
      // Rights confirmation (assumed true when uploaded via checkbox)
      rightsCleared: true,
      rightsConfirmedBy: userId,
      rightsConfirmedAt: new Date(),
      
      // Auto-assign ownership to uploader
      mediaOwners: [{
        userId: userId,
        percentage: 100,
        role: 'primary',
        verified: true,
        addedBy: userId,
        addedAt: new Date()
      }]
    });
    
    await media.save();
    
    // Process cover art file if provided
    if (coverArtFile) {
      try {
        console.log('🖼️ Processing cover art file...');
        
        // Upload cover art to R2 manually
        const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
        const s3Client = new S3Client({
          region: 'auto',
          endpoint: process.env.R2_ENDPOINT,
          credentials: {
            accessKeyId: process.env.R2_ACCESS_KEY_ID,
            secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
          },
        });
        
        const timestamp = Date.now();
        const safeTitle = finalTitle.replace(/[^a-zA-Z0-9]/g, '_');
        const coverArtKey = `cover-art/${safeTitle}-${timestamp}.jpg`;
        
        const coverArtCommand = new PutObjectCommand({
          Bucket: process.env.R2_BUCKET_NAME,
          Key: coverArtKey,
          Body: coverArtFile.buffer,
          ContentType: coverArtFile.mimetype,
          ACL: 'public-read',
          CacheControl: 'public, max-age=31536000'
        });
        
        await s3Client.send(coverArtCommand);
        const coverArtUrl = getPublicUrl(coverArtKey);
        
        // Update media with cover art URL
        media.coverArt = coverArtUrl;
        await media.save();
        console.log(`✅ Cover art saved: ${coverArtUrl}`);
      } catch (coverArtError) {
        console.error('❌ Error processing cover art file:', coverArtError.message);
        // Continue without cover art - don't fail the upload
      }
    }
    // Process artwork if found in extracted metadata (fallback)
    else if (extractedMetadata && extractedMetadata.artwork && extractedMetadata.artwork.length > 0) {
      try {
        console.log('🖼️ Processing extracted artwork...');
        const artworkUrl = await MetadataExtractor.processArtwork(extractedMetadata.artwork, media._id.toString());
        
        if (artworkUrl) {
          // Update media with artwork URL
          media.coverArt = artworkUrl;
          await media.save();
          console.log(`✅ Artwork saved: ${artworkUrl}`);
        }
      } catch (artworkError) {
        console.error('❌ Error processing artwork:', artworkError.message);
        // Continue without artwork - don't fail the upload
      }
    }
    
    // Set default cover art if none was provided or extracted
    if (!media.coverArt) {
      media.coverArt = '/default-cover.jpg';
      await media.save();
      console.log('✅ Set default cover art for media');
    }
    
    console.log(`✅ Creator ${user.username} uploaded: ${title} (${media.uuid})`);
    
    res.status(201).json({
      message: 'Media uploaded successfully',
      media: {
        uuid: media.uuid,
        _id: media._id,
        title: media.title,
        artist: media.artist,
        coverArt: media.coverArt,
        sources: media.sources
      }
    });
    
  } catch (error) {
    console.error('Error uploading media:', error);
    res.status(500).json({ error: 'Failed to upload media', details: error.message });
  }
});

// @route   GET /api/media
// @desc    Get all media with pagination and filtering
// @access  Public
router.get('/', async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      sortBy = 'globalMediaAggregate',
      sortOrder = 'desc',
      genre,
      creator,
      search
    } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Build query
    const query = { contentType: { $in: ['music'] } };
    
    if (genre) {
      query.genres = { $in: [genre] };
    }
    
    if (creator) {
      query.creatorNames = { $regex: creator, $options: 'i' };
    }
    
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { 'artist.name': { $regex: search, $options: 'i' } },
        { creatorNames: { $regex: search, $options: 'i' } }
      ];
    }

    // Build sort object
    const sortObj = {};
    sortObj[sortBy] = sortOrder === 'desc' ? -1 : 1;
    sortObj.createdAt = -1; // Secondary sort by creation date

    const media = await Media.find(query)
      .sort(sortObj)
      .skip(skip)
      .limit(parseInt(limit))
      .populate('addedBy', 'username profilePic uuid')
      .lean();

    const total = await Media.countDocuments(query);

    res.json({
      media,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching media:', error);
    res.status(500).json({ error: 'Failed to fetch media' });
  }
});

// @route   GET /api/media/public
// @desc    Get public media (same as /api/media but with different access)
// @access  Public
router.get('/public', async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      sortBy = 'globalMediaAggregate',
      sortOrder = 'desc',
      genre,
      creator,
      search
    } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Build query for public media
    const query = { 
      contentType: { $in: ['music'] },
      // Add any public-specific filters here
    };
    
    if (genre) {
      query.genres = { $in: [genre] };
    }
    
    if (creator) {
      query.creatorNames = { $regex: creator, $options: 'i' };
    }
    
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { 'artist.name': { $regex: search, $options: 'i' } },
        { creatorNames: { $regex: search, $options: 'i' } }
      ];
    }

    // Build sort object
    const sortObj = {};
    sortObj[sortBy] = sortOrder === 'desc' ? -1 : 1;
    sortObj.createdAt = -1; // Secondary sort by creation date

    const media = await Media.find(query)
      .sort(sortObj)
      .skip(skip)
      .limit(parseInt(limit))
      .populate('addedBy', 'username profilePic uuid')
      .lean();

    const total = await Media.countDocuments(query);

    res.json({
      media,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching public media:', error);
    res.status(500).json({ error: 'Failed to fetch public media' });
  }
});

// @route   GET /api/media/top-tunes
// @desc    Get top media by global bid value for Top Tunes
// @access  Public
router.get('/top-tunes', async (req, res) => {
  try {
    const { sortBy = 'globalMediaAggregate', limit = 10, timePeriod = 'all-time', search, tags } = req.query;
    
    // Validate sortBy parameter - map to Media model fields
    const validSortFields = ['globalMediaAggregate', 'title', 'creators', 'duration', 'uploadedAt'];
    const sortField = validSortFields.includes(sortBy) ? sortBy : 'globalMediaAggregate';
    
    // Map field names to Media model fields
    const fieldMapping = {
      'title': 'title',
      'artist': 'creators', // Map artist to creators
      'duration': 'duration',
      'globalMediaAggregate': 'globalMediaAggregate', // Updated to schema grammar
      'uploadedAt': 'uploadedAt'
    };
    
    const mediaSortField = fieldMapping[sortField] || sortField;
    
    // Validate limit parameter
    const limitNum = Math.min(parseInt(limit) || 10, 100); // Max 100 items
    
    // Build sort object
    let sortObj = {};
    if (mediaSortField === 'globalMediaAggregate') {
      sortObj[mediaSortField] = -1; // Descending for bid value
    } else if (mediaSortField === 'title' || mediaSortField === 'creators') {
      sortObj[mediaSortField] = 1; // Ascending for text fields
    } else {
      sortObj[mediaSortField] = -1; // Descending for duration and date
    }
    
    // Build query object
    let query = { 
      globalMediaAggregate: { $gt: 0 }, // Updated to schema grammar
      contentType: { $in: ['music'] } // Only music content for now
    };
    
    // Ensure proper population by manually checking and populating if needed
    const Bid = require('../models/Bid');
    const User = require('../models/User');
    
    // Add time period filtering
    if (timePeriod !== 'all-time') {
      const now = new Date();
      let startDate;
      
      switch (timePeriod) {
        case 'today':
          startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          break;
        case 'week':
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case 'month':
          startDate = new Date(now.getFullYear(), now.getMonth(), 1);
          break;
        case 'year':
          startDate = new Date(now.getFullYear(), 0, 1);
          break;
        default:
          startDate = null;
      }
      
      if (startDate) {
        query.uploadedAt = { $gte: startDate };
      }
    }
    
    // Add search filtering
    if (search && search.trim()) {
      const searchRegex = new RegExp(search.trim(), 'i');
      query.$or = [
        { title: searchRegex },
        { 'artist.name': searchRegex },
        { creatorNames: searchRegex }
      ];
    }
    
    // Use new Media model, filtering for music content
    let media = await Media.find(query)
      .sort(sortObj)
      .limit(limitNum * 2) // Get more results for filtering
      .populate({
        path: 'bids',
        model: 'Bid',
        populate: {
          path: 'userId',
          model: 'User',
          select: 'username profilePic uuid',
        },
      })
      .select('title artist producer featuring creatorNames duration coverArt globalMediaAggregate uploadedAt bids uuid contentType contentForm genres category tags'); // Updated to schema grammar

    // Apply fuzzy tag matching on results if tags are specified
    if (tags && Array.isArray(tags) && tags.length > 0) {
      console.log('🔍 Tag filtering - tags received:', tags);
      
      // Create fuzzy matching function to normalize tags
      const normalizeTag = (tag) => {
        return tag.toLowerCase()
          .replace(/[\s\-_\.]+/g, '') // Remove spaces, hyphens, underscores, dots
          .replace(/[^\w]/g, ''); // Remove any other non-word characters
      };
      
      // Normalize search tags
      const normalizedSearchTags = tags.map(tag => normalizeTag(tag.trim()));
      console.log('🔍 Normalized search tags:', normalizedSearchTags);
      
      // Filter media items that have matching tags
      media = media.filter(item => {
        if (!item.tags || !Array.isArray(item.tags)) return false;
        
        return item.tags.some(storedTag => {
          const normalizedStoredTag = normalizeTag(storedTag);
          return normalizedSearchTags.includes(normalizedStoredTag);
        });
      }).slice(0, limitNum); // Limit to requested count
      
      console.log('🔍 Media found after tag filtering:', media.length, 'items');
    }

    console.log('🔍 Media found:', media.length, 'items');
    
    // Ensure proper population by manually checking and populating if needed
    for (let mediaItem of media) {
      if (mediaItem.bids && mediaItem.bids.length > 0) {
        for (let bid of mediaItem.bids) {
          // If userId is still a string, populate it manually
          if (typeof bid.userId === 'string') {
            const user = await User.findOne({ uuid: bid.userId }).select('username profilePic uuid');
            if (user) {
              bid.userId = user;
            }
          }
        }
      }
    }
    
    // Transform Media items to match expected frontend format
    const transformedSongs = media.map(item => ({
      id: item._id || item.uuid,
      uuid: item.uuid,
      title: item.title,
      artist: item.artist && item.artist.length > 0 ? item.artist[0].name : 'Unknown Artist', // Primary artist name
      artists: item.artist || [], // Full artist array with subdocuments
      creators: item.creatorNames || [], // All creator names
      producer: item.producer || [],
      featuring: item.featuring || [],
      duration: item.duration,
      coverArt: item.coverArt,
      globalMediaAggregate: item.globalMediaAggregate, // Updated to schema grammar
      uploadedAt: item.uploadedAt,
      bids: item.bids,
      contentType: item.contentType,
      contentForm: item.contentForm,
      tags: item.tags || []
    }));
    
    res.json({
      success: true,
      songs: transformedSongs, // Keep field name for frontend compatibility
      total: transformedSongs.length,
      sortBy: sortField,
      limit: limitNum
    });
  } catch (err) {
    console.error('Error fetching Top Tunes:', err);
    res.status(500).json({ 
      success: false, 
      error: 'Error fetching Top Tunes', 
      details: err.message 
    });
  }
});

// @route   GET /api/media/:mediaId/profile
// @desc    Get comprehensive media details for Tune Profile page
// @access  Public (for viewing media details)
router.get('/:mediaId/profile', async (req, res) => {
  try {
    const { mediaId } = req.params;
    console.log('🔍 Media profile request for mediaId:', mediaId);

    // Find media by UUID or ObjectId
    let media;
    if (mediaId.includes('-')) {
      // UUID format
      console.log('🔍 Searching by UUID:', mediaId);
      media = await Media.findOne({ uuid: mediaId });
    } else if (isValidObjectId(mediaId)) {
      // ObjectId format
      console.log('🔍 Searching by ObjectId:', mediaId);
      media = await Media.findById(mediaId);
    } else {
      console.log('❌ Invalid media ID format:', mediaId);
      return res.status(400).json({ error: 'Invalid media ID format' });
    }

    if (!media) {
      console.log('❌ Media not found for ID:', mediaId);
      return res.status(404).json({ error: 'Media not found' });
    }
    
    console.log('✅ Media found:', media.title);

    // Populate media with bids and user data
    const populatedMedia = await Media.findById(media._id)
      .populate({
        path: 'bids',
        model: 'Bid',
        populate: {
          path: 'userId',
          model: 'User',
          select: 'username profilePic uuid',
        },
      })
      .populate({
        path: 'addedBy',
        model: 'User',
        select: 'username profilePic uuid',
      })
      .populate({
        path: 'label.labelId',
        model: 'Label',
        select: 'name slug logo verificationStatus stats.artistCount stats.releaseCount stats.totalBidAmount'
      });

    // Fetch recent comments
    const recentComments = await Comment.find({ 
      mediaId: media._id,
      parentCommentId: null,
      isDeleted: false 
    })
      .populate('userId', 'username profilePic uuid')
      .sort({ createdAt: -1 })
      .limit(5);

    // Add comments to the response
    populatedMedia.comments = recentComments;

    // Calculate accurate globalMediaAggregate from all active bids
    // This ensures the displayed total matches the sum of all bids, even if stored value is stale
    const Bid = require('../models/Bid');
    const allBids = await Bid.find({
      mediaId: media._id,
      status: 'active'
    });
    
    const calculatedGlobalMediaAggregate = allBids.reduce((sum, bid) => sum + bid.amount, 0);
    
    console.log(`📊 Calculated globalMediaAggregate: ${calculatedGlobalMediaAggregate} (from ${allBids.length} bids) vs stored: ${populatedMedia.globalMediaAggregate || 0}`);

    // Update stored value if it's incorrect (self-healing mechanism)
    const storedValue = populatedMedia.globalMediaAggregate || 0;
    const tolerance = 0.01; // Allow small floating point differences
    if (Math.abs(calculatedGlobalMediaAggregate - storedValue) > tolerance) {
      console.log(`⚠️  Stored globalMediaAggregate is incorrect, updating from ${storedValue} to ${calculatedGlobalMediaAggregate}`);
      await Media.findByIdAndUpdate(media._id, { 
        globalMediaAggregate: calculatedGlobalMediaAggregate 
      });
      // Update the populatedMedia object so we use the corrected value below
      populatedMedia.globalMediaAggregate = calculatedGlobalMediaAggregate;
    }

    // Compute GlobalMediaAggregateRank (rank by total bid value) - use calculated value
    // Count how many media have a higher globalMediaAggregate value
    const rank = await Media.countDocuments({
      globalMediaAggregate: { $gt: calculatedGlobalMediaAggregate }
    }) + 1; // +1 because rank is 1-indexed

    // Convert sources Map to plain object BEFORE toObject()
    let sourcesObj = {};
    if (populatedMedia.sources) {
      if (populatedMedia.sources instanceof Map) {
        // Convert Map to plain object
        populatedMedia.sources.forEach((value, key) => {
          sourcesObj[key] = value;
        });
      } else if (typeof populatedMedia.sources === 'object' && populatedMedia.sources !== null) {
        // Handle if it's already an object
        sourcesObj = { ...populatedMedia.sources };
      }
    }
    
    console.log('📡 Backend sources conversion:', {
      originalType: populatedMedia.sources?.constructor?.name,
      isMap: populatedMedia.sources instanceof Map,
      convertedSources: sourcesObj
    });
    
    // Transform Media to match expected frontend format
    const mediaObj = populatedMedia.toObject();
    
    const transformedMedia = {
      ...mediaObj,
      sources: sourcesObj, // Use pre-converted sources
      artist: populatedMedia.artist && populatedMedia.artist.length > 0 ? 
              populatedMedia.artist[0].name : 'Unknown Artist', // Primary artist name
      artists: populatedMedia.artist || [], // Full artist subdocuments
      creators: populatedMedia.creatorNames || [], // All creator names
      globalMediaAggregateTopRank: rank, // Add computed rank
      globalMediaAggregate: calculatedGlobalMediaAggregate, // Override with calculated value from all bids
    };

    console.log('📤 Sending media profile response:', {
      message: 'Media profile fetched successfully',
      media: transformedMedia
    });
    
    res.json({
      message: 'Media profile fetched successfully',
      media: transformedMedia, // Updated to 'media' key for frontend compatibility
    });

  } catch (error) {
    console.error('Error fetching media profile:', error);
    res.status(500).json({ error: 'Error fetching media profile', details: error.message });
  }
});

// @route   PUT /api/media/:id
// @desc    Update media details
// @access  Private (Admin or Verified Creator only)
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;
    
    // Use ObjectId directly (no resolution needed)
    if (!isValidObjectId(id)) {
      return res.status(400).json({ error: 'Invalid media ID format' });
    }
    
    // Find the media
    const media = await Media.findById(id);
    if (!media) {
      return res.status(404).json({ error: 'Media not found' });
    }
    
    // Check permissions: must be admin OR media owner OR verified creator
    const { canEditMedia } = require('../utils/permissionHelpers');
    if (!canEditMedia(req.user, media)) {
      return res.status(403).json({ error: 'Not authorized to edit this media' });
    }
    
    // Track changes for edit history
    const changes = [];
    
    // Update allowed fields
    // Note: 'sources' is handled separately below due to Map type
    const allowedUpdates = [
      'title', 'producer', 'featuring', 'album', 'genre',
      'releaseDate', 'duration', 'explicit', 'isrc', 'upc', 'bpm',
      'pitch', 'key', 'elements', 'tags', 'category', 'timeSignature',
      'lyrics', 'description'
    ];
    
    allowedUpdates.forEach(field => {
      if (req.body[field] !== undefined) {
        let value = req.body[field];
        
        // Convert numeric fields from string to number if needed
        const numericFields = ['pitch', 'bpm', 'duration', 'bitrate', 'sampleRate'];
        if (numericFields.includes(field) && typeof value === 'string' && value.trim() !== '') {
          const numValue = parseFloat(value);
          if (!isNaN(numValue)) {
            value = numValue;
          }
        }
        
        // Check if value actually changed
        if (media[field] !== value) {
          changes.push({
            field,
            oldValue: media[field],
            newValue: value
          });
          media[field] = value;
        }
      }
    });
    
    // Special handling for creator fields (convert strings/arrays to subdocument format)
    
    // Artist field (string -> array of subdocuments)
    if (req.body.artist !== undefined) {
      if (typeof req.body.artist === 'string' && req.body.artist.trim()) {
        media.artist = [{
          name: req.body.artist.trim(),
          userId: null,
          verified: false
        }];
      } else if (req.body.artist === '') {
        media.artist = [];
      }
    }
    
    // Producer field (string -> array of subdocuments)
    if (req.body.producer !== undefined) {
      if (typeof req.body.producer === 'string' && req.body.producer.trim()) {
        media.producer = [{
          name: req.body.producer.trim(),
          userId: null,
          verified: false
        }];
      } else if (req.body.producer === '') {
        media.producer = [];
      }
    }
    
    // Featuring field (array of strings -> array of subdocuments)
    if (req.body.featuring !== undefined) {
      if (Array.isArray(req.body.featuring)) {
        media.featuring = req.body.featuring
          .filter(name => name && typeof name === 'string' && name.trim())
          .map(name => ({
            name: typeof name === 'string' ? name.trim() : name.name,
            userId: null,
            verified: false
          }));
      }
    }
    
    // Genre field (singular -> genres array)
    if (req.body.genre !== undefined) {
      const oldGenres = media.genres;
      media.genres = req.body.genre ? [req.body.genre] : [];
      if (JSON.stringify(oldGenres) !== JSON.stringify(media.genres)) {
        changes.push({
          field: 'genres',
          oldValue: oldGenres,
          newValue: media.genres
        });
      }
    }
    
    // Label field (handle label linking)
    if (req.body.label !== undefined || req.body.labelId !== undefined) {
      const Label = require('../models/Label');
      const oldLabel = media.label && media.label.length > 0 ? media.label[0] : null;
      
      // If labelId is provided, link to existing label
      if (req.body.labelId && req.body.labelId !== null && req.body.labelId !== '') {
        try {
          const labelToLink = await Label.findById(req.body.labelId);
          if (labelToLink) {
            media.label = [{
              name: labelToLink.name,
              labelId: labelToLink._id,
              verified: false, // Leave false for MVP as per user request
              catalogNumber: req.body.catalogNumber || null,
              releaseDate: req.body.labelReleaseDate ? new Date(req.body.labelReleaseDate) : null
            }];
            
            if (JSON.stringify(oldLabel) !== JSON.stringify(media.label[0])) {
              changes.push({
                field: 'label',
                oldValue: oldLabel,
                newValue: media.label[0]
              });
            }
          } else {
            // Label ID provided but not found - just use name
            let labelName = '';
            if (Array.isArray(req.body.label)) {
              labelName = req.body.label.length > 0 && typeof req.body.label[0] === 'string' 
                ? req.body.label[0] 
                : '';
            } else if (typeof req.body.label === 'string') {
              labelName = req.body.label;
            }
            
            if (labelName && labelName.trim()) {
              media.label = [{
                name: labelName.trim(),
                userId: null,
                labelId: null,
                verified: false
              }];
            } else {
              media.label = [];
            }
          }
        } catch (error) {
          console.error('Error finding label:', error);
          // Fallback to just name
          let labelName = '';
          if (Array.isArray(req.body.label)) {
            labelName = req.body.label.length > 0 && typeof req.body.label[0] === 'string' 
              ? req.body.label[0] 
              : '';
          } else if (typeof req.body.label === 'string') {
            labelName = req.body.label;
          }
          
          if (labelName && labelName.trim()) {
            media.label = [{
              name: labelName.trim(),
              userId: null,
              labelId: null,
              verified: false
            }];
          } else {
            media.label = [];
          }
        }
      } else if (req.body.label !== undefined) {
        // Just label name provided (no labelId)
        // Handle both string and array formats
        let labelName = '';
        if (Array.isArray(req.body.label)) {
          // If it's an array, use the first element if it's a string, otherwise ignore
          labelName = req.body.label.length > 0 && typeof req.body.label[0] === 'string' 
            ? req.body.label[0] 
            : '';
        } else if (typeof req.body.label === 'string') {
          labelName = req.body.label;
        }
        
        if (labelName && labelName.trim()) {
          // Try to find label by name
          const labelByName = await Label.findOne({ name: labelName.trim() });
          if (labelByName) {
            media.label = [{
              name: labelByName.name,
              labelId: labelByName._id,
              verified: false,
              catalogNumber: req.body.catalogNumber || null,
              releaseDate: req.body.labelReleaseDate ? new Date(req.body.labelReleaseDate) : null
            }];
          } else {
            // Label not found - just store name
            media.label = [{
              name: labelName.trim(),
              userId: null,
              labelId: null,
              verified: false
            }];
          }
        } else {
          // Empty label - remove it
          media.label = [];
        }
        
        if (JSON.stringify(oldLabel) !== JSON.stringify(media.label.length > 0 ? media.label[0] : null)) {
          changes.push({
            field: 'label',
            oldValue: oldLabel,
            newValue: media.label.length > 0 ? media.label[0] : null
          });
        }
      }
    }
    
    // Special handling for sources field (Map type)
    if (req.body.sources !== undefined) {
      // Get old sources before modifying
      const oldSources = media.sources instanceof Map 
        ? Object.fromEntries(media.sources) 
        : (media.sources || {});
      
      // Convert object to Map if needed
      if (req.body.sources && typeof req.body.sources === 'object' && !(req.body.sources instanceof Map)) {
        // Clear existing sources
        if (media.sources instanceof Map) {
          media.sources.clear();
        } else {
          media.sources = new Map();
        }
        
        // Add new sources from object
        Object.entries(req.body.sources).forEach(([key, value]) => {
          if (value && typeof value === 'string' && value.trim()) {
            media.sources.set(key, value.trim());
          }
        });
        
        // Track change
        const newSources = Object.fromEntries(media.sources);
        if (JSON.stringify(oldSources) !== JSON.stringify(newSources)) {
          changes.push({
            field: 'sources',
            oldValue: oldSources,
            newValue: newSources
          });
        }
      } else if (req.body.sources === null || req.body.sources === '') {
        // Clear sources
        if (media.sources instanceof Map) {
          media.sources.clear();
        } else {
          media.sources = new Map();
        }
        
        // Track change if sources were cleared
        if (Object.keys(oldSources).length > 0) {
          changes.push({
            field: 'sources',
            oldValue: oldSources,
            newValue: {}
          });
        }
      }
    }
    
    // Add to edit history if there are changes
    if (changes.length > 0) {
      // Ensure editHistory array exists
      if (!media.editHistory) {
        media.editHistory = [];
      }
      media.editHistory.push({
        editedBy: userId,
        editedAt: new Date(),
        changes: changes
      });
    }
    
    await media.save();
    
    // Return media with ObjectId directly
    res.json({ 
      message: 'Media updated successfully',
      media: media 
    });
  } catch (error) {
    console.error('Error updating media:', error);
    console.error('Error stack:', error.stack);
    console.error('Request body:', req.body);
    console.error('Media ID:', req.params.id);
    res.status(500).json({ 
      error: 'Failed to update media',
      details: error.message 
    });
  }
});

// @route   GET /api/media/:mediaId/comments
// @desc    Get all comments for a media item
// @access  Public
router.get('/:mediaId/comments', async (req, res) => {
  try {
    const { mediaId } = req.params;
    const { page = 1, limit = 20, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;

    // Find media
    let media;
    if (mediaId.includes('-')) {
      media = await Media.findOne({ uuid: mediaId });
    } else if (isValidObjectId(mediaId)) {
      media = await Media.findById(mediaId);
    } else {
      return res.status(400).json({ error: 'Invalid media ID format' });
    }

    if (!media) {
      return res.status(404).json({ error: 'Media not found' });
    }

    // Build sort object
    const sortObj = {};
    sortObj[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Fetch comments
    const comments = await Comment.find({ 
      mediaId: media._id,
      parentCommentId: null,
      isDeleted: false 
    })
      .populate('userId', 'username profilePic uuid')
      .sort(sortObj)
      .skip(skip)
      .limit(parseInt(limit));

    // Get total count
    const totalComments = await Comment.countDocuments({ 
      mediaId: media._id,
      parentCommentId: null,
      isDeleted: false 
    });

    res.json({
      message: 'Comments fetched successfully',
      comments,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalComments,
        pages: Math.ceil(totalComments / parseInt(limit)),
      },
    });

  } catch (error) {
    console.error('Error fetching comments:', error);
    res.status(500).json({ error: 'Error fetching comments', details: error.message });
  }
});

// @route   POST /api/media/:mediaId/comments
// @desc    Create a new comment on a media item
// @access  Private (requires authentication)
router.post('/:mediaId/comments', authMiddleware, async (req, res) => {
  try {
    const { mediaId } = req.params;
    const { content, parentCommentId } = req.body;
    const userId = req.user._id;

    // Validate content
    if (!content || content.trim().length === 0) {
      return res.status(400).json({ error: 'Comment content is required' });
    }

    if (content.length > 1000) {
      return res.status(400).json({ error: 'Comment must be less than 1000 characters' });
    }

    // Validate media exists
    let media;
    if (mediaId.includes('-')) {
      media = await Media.findOne({ uuid: mediaId });
    } else if (isValidObjectId(mediaId)) {
      media = await Media.findById(mediaId);
    } else {
      return res.status(400).json({ error: 'Invalid media ID format' });
    }

    if (!media) {
      return res.status(404).json({ error: 'Media not found' });
    }

    // Create comment with mediaId
    const comment = new Comment({
      content: content.trim(),
      userId,
      mediaId: media._id,
      parentCommentId: parentCommentId || null,
    });

    await comment.save();

    // Populate user data for response
    await comment.populate('userId', 'username profilePic uuid');

    // Send notification if this is a reply to another comment
    if (parentCommentId) {
      try {
        const notificationService = require('../services/notificationService');
        const parentComment = await Comment.findById(parentCommentId);
        if (parentComment && parentComment.userId.toString() !== userId.toString()) {
          notificationService.notifyCommentReply(
            parentComment.userId.toString(),
            userId.toString(),
            media._id.toString(),
            parentCommentId,
            comment._id.toString(),
            media.title
          ).catch(err => console.error('Error sending comment reply notification:', err));
        }
      } catch (error) {
        console.error('Error setting up comment reply notification:', error);
      }
    }

    res.status(201).json({
      message: 'Comment created successfully',
      comment,
    });

  } catch (error) {
    console.error('Error creating comment:', error);
    res.status(500).json({ error: 'Error creating comment', details: error.message });
  }
});

// @route   POST /api/comments/:commentId/like
// @desc    Like/unlike a comment
// @access  Private (requires authentication)
router.post('/comments/:commentId/like', authMiddleware, async (req, res) => {
  try {
    const { commentId } = req.params;
    const userId = req.user._id;

    if (!isValidObjectId(commentId)) {
      return res.status(400).json({ error: 'Invalid comment ID format' });
    }

    const comment = await Comment.findById(commentId);
    if (!comment) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    // Check if user already liked the comment
    const hasLiked = comment.likes.includes(userId);

    if (hasLiked) {
      // Unlike
      comment.likes.pull(userId);
    } else {
      // Like
      comment.likes.push(userId);
    }

    await comment.save();
    await comment.populate('userId', 'username profilePic uuid');

    res.json({
      message: hasLiked ? 'Comment unliked' : 'Comment liked',
      comment,
      hasLiked: !hasLiked,
    });

  } catch (error) {
    console.error('Error toggling comment like:', error);
    res.status(500).json({ error: 'Error toggling comment like', details: error.message });
  }
});

// @route   DELETE /api/comments/:commentId
// @desc    Delete a comment (soft delete)
// @access  Private (comment owner only)
router.delete('/comments/:commentId', authMiddleware, async (req, res) => {
  try {
    const { commentId } = req.params;
    const userId = req.user._id;

    if (!isValidObjectId(commentId)) {
      return res.status(400).json({ error: 'Invalid comment ID format' });
    }

    const comment = await Comment.findById(commentId);
    if (!comment) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    // Check if user owns the comment
    if (comment.userId.toString() !== userId.toString()) {
      return res.status(403).json({ error: 'You can only delete your own comments' });
    }

    // Soft delete
    comment.isDeleted = true;
    comment.deletedAt = new Date();
    await comment.save();

    res.json({
      message: 'Comment deleted successfully',
    });

  } catch (error) {
    console.error('Error deleting comment:', error);
    res.status(500).json({ error: 'Error deleting comment', details: error.message });
  }
});

// @route   POST /api/media/:mediaId/global-bid
// @desc    Place a global bid (chart support) on a media item
// @access  Private
router.post('/:mediaId/global-bid', authMiddleware, async (req, res) => {
  try {
    const { mediaId } = req.params;
    const { amount } = req.body;
    const userId = req.user._id;

    // Validate amount
    if (!amount || amount < 0.33) {
      return res.status(400).json({ error: 'Minimum bid is £0.33' });
    }

    // Get user and check balance
    const User = require('../models/User');
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Convert bid amount from pounds to pence (user input is in pounds)
    const bidAmountPence = Math.round(amount * 100);
    
    // Balance is already stored in pence
    if (user.balance < bidAmountPence) {
      return res.status(400).json({ 
        error: 'Insufficient balance',
        required: amount,
        available: user.balance / 100  // Convert to pounds for error message
      });
    }

    // Find media by ObjectId (preferred) or UUID (fallback)
    // Note: ObjectId is preferred for consistency with other routes, UUID is fallback for compatibility
    let media;
    if (isValidObjectId(mediaId)) {
      // ObjectId format (preferred)
      media = await Media.findById(mediaId);
    } else if (mediaId.includes('-')) {
      // UUID format (fallback)
      media = await Media.findOne({ uuid: mediaId });
    } else {
      return res.status(400).json({ error: 'Invalid media ID format' });
    }

    if (!media) {
      return res.status(404).json({ error: 'Media not found' });
    }

    // Get Global Party using new system
    const Party = require('../models/Party');
    const globalParty = await Party.getGlobalParty();
    
    if (!globalParty) {
      return res.status(500).json({ error: 'Global Party not found. Please contact support.' });
    }

    // Check if media already exists in global party
    let partyMediaEntry = globalParty.media.find(m => m.mediaId && m.mediaId.toString() === media._id.toString());
    
    // Create bid using standard party bid flow
    const Bid = require('../models/Bid');
    // Store amount in pence (convert from pounds input)
    const bid = new Bid({
      userId,
      partyId: globalParty._id,
      mediaId: media._id,
      amount: bidAmountPence, // Store in pence
      status: 'active',
      bidScope: 'global', // Mark as global bid
      username: user.username,
      partyName: globalParty.name, // 'Global Party'
      partyType: globalParty.type, // 'global'
      mediaTitle: media.title,
      mediaArtist: media.artist?.[0]?.name || 'Unknown',
      mediaCoverArt: media.coverArt,
      isInitialBid: !partyMediaEntry,
      mediaContentType: media.contentType,
      mediaContentForm: media.contentForm,
      mediaDuration: media.duration
    });

    await bid.save();

    // Calculate and award TuneBytes for this bid (async, don't block response)
    try {
      const tuneBytesService = require('../services/tuneBytesService');
      tuneBytesService.awardTuneBytesForBid(bid._id).catch(error => {
        console.error('Failed to calculate TuneBytes for bid:', bid._id, error);
      });
    } catch (error) {
      console.error('Error setting up TuneBytes calculation:', error);
    }

    // Invalidate and recalculate tag rankings for this user (async, don't block response)
    try {
      const tagRankingsService = require('../services/tagRankingsService');
      tagRankingsService.invalidateUserTagRankings(userId).catch(error => {
        console.error('Failed to invalidate tag rankings:', error);
      });
      // Recalculate tag rankings in background
      tagRankingsService.calculateAndUpdateUserTagRankings(userId, 10).catch(error => {
        console.error('Failed to recalculate tag rankings:', error);
      });
    } catch (error) {
      console.error('Error setting up tag rankings calculation:', error);
    }

    // Update label stats if media has a label (async, don't block response)
    try {
      const labelStatsService = require('../services/labelStatsService');
      if (media.label && Array.isArray(media.label) && media.label.length > 0) {
        // Get all unique labelIds from media's label array
        const labelIds = media.label
          .map(l => l.labelId)
          .filter(id => id != null)
          .filter((id, index, self) => self.indexOf(id) === index); // Remove duplicates
        
        // Update stats for each label
        labelIds.forEach(labelId => {
          labelStatsService.calculateAndUpdateLabelStats(labelId).catch(error => {
            console.error(`Failed to update stats for label ${labelId}:`, error);
          });
        });
      }
    } catch (error) {
      console.error('Error setting up label stats calculation:', error);
    }

    // Add or update media in global party
    if (!partyMediaEntry) {
      partyMediaEntry = {
        mediaId: media._id,
        media_uuid: media.uuid,
        addedBy: userId,
        addedBy_uuid: user.uuid,
        partyMediaAggregate: amount,
        partyBids: [bid._id],
        status: 'queued',
        queuedAt: new Date(),
        partyMediaBidTop: amount,
        partyMediaBidTopUser: userId,
        partyMediaAggregateTop: amount,
        partyMediaAggregateTopUser: userId
      };
      globalParty.media.push(partyMediaEntry);
    } else {
      partyMediaEntry.partyMediaAggregate = (partyMediaEntry.partyMediaAggregate || 0) + amount;
      partyMediaEntry.partyBids = partyMediaEntry.partyBids || [];
      partyMediaEntry.partyBids.push(bid._id);
    }
    
    await globalParty.save();

    // Store previous top bid info for outbid notification
    const previousTopBidAmount = media.globalMediaBidTop || 0;
    const previousTopBidderId = media.globalMediaBidTopUser;
    const wasNewTopBid = amount > previousTopBidAmount;

    // Update media's bid arrays (BidMetricsEngine will handle aggregates)
    media.bids = media.bids || [];
    media.bids.push(bid._id);
    
    // Update top bid if this is higher
    if (wasNewTopBid) {
      media.globalMediaBidTop = amount;
      media.globalMediaBidTopUser = userId;
    }
    
    // Also add to globalBids array
    media.globalBids = media.globalBids || [];
    media.globalBids.push(bid._id);
    
    await media.save();

    // Send notifications (async, don't block response)
    try {
      const notificationService = require('../services/notificationService');
      
      // Notify media owner if bidder is not the owner
      const mediaOwnerId = media.addedBy?.toString() || media.addedBy?._id?.toString();
      if (mediaOwnerId && mediaOwnerId !== userId.toString()) {
        notificationService.notifyBidReceived(
          mediaOwnerId,
          userId.toString(),
          media._id.toString(),
          bid._id.toString(),
          amount,
          media.title
        ).catch(err => console.error('Error sending bid received notification:', err));
      }
      
      // Notify previous top bidder if they were outbid (and it's not the same user)
      if (wasNewTopBid && previousTopBidderId && previousTopBidderId.toString() !== userId.toString()) {
        notificationService.notifyOutbid(
          previousTopBidderId.toString(),
          media._id.toString(),
          bid._id.toString(),
          amount,
          media.title
        ).catch(err => console.error('Error sending outbid notification:', err));
      }
    } catch (error) {
      console.error('Error setting up notifications:', error);
    }

    // Update user balance (already in pence, no conversion needed)
    user.balance = user.balance - bidAmountPence;
    await user.save();

    // Send high-value bid notification
    const { sendHighValueBidNotification } = require('../utils/emailService');
    if (amount >= 10) {
      try {
        await sendHighValueBidNotification(bid, media, user, 10);
      } catch (emailError) {
        console.error('Failed to send high-value bid notification:', emailError);
      }
    }

    res.json({
      message: 'Global bid placed successfully',
      bid,
      updatedBalance: user.balance,
      globalPartyId: globalParty._id
    });
  } catch (error) {
    console.error('Error placing global bid:', error);
    res.status(500).json({ error: 'Failed to place global bid', details: error.message });
  }
});

// @route   GET /api/media/:mediaId/top-parties
// @desc    Get top parties where this media appears
// @access  Public
router.get('/:mediaId/top-parties', async (req, res) => {
  try {
    const { mediaId } = req.params;
    const { limit = 10 } = req.query;

    console.log('🎪 Top parties request for media:', mediaId);

    // Handle both ObjectIds and UUIDs
    let actualMediaId = mediaId;
    if (!isValidObjectId(mediaId)) {
      // If it's not an ObjectId, try to find by UUID
      const media = await Media.findOne({ uuid: mediaId }).select('_id');
      if (!media) {
        return res.status(404).json({ error: 'Media not found' });
      }
      actualMediaId = media._id;
    }

    console.log('✅ Using media ID:', actualMediaId);

    // Find all parties that contain this media
    const Party = require('../models/Party');
    // TODO: Exclude Global Party once we have many parties
    // const GLOBAL_PARTY_ID = '67c6a02895baad05d3a97cf4';
    
    const parties = await Party.find({
      'media.mediaId': actualMediaId,
      status: { $in: ['active', 'scheduled'] }
      // _id: { $ne: GLOBAL_PARTY_ID } // Temporarily include Global Party for visibility
    })
      .populate('host', 'username uuid profilePic')
      .lean();

    console.log('📊 Found parties containing this media:', parties.length);

    // Extract party info and bid totals for this media
    const partyStats = parties.map(party => {
      const mediaEntry = party.media.find(m => m.mediaId.toString() === actualMediaId.toString());
      console.log(`  Party "${party.name}": aggregate=${mediaEntry?.partyMediaAggregate || 0}, bids=${mediaEntry?.partyBids?.length || 0}`);
      return {
        _id: party._id,
        name: party.name,
        location: party.location,
        host: party.host,
        partyMediaAggregate: mediaEntry?.partyMediaAggregate || 0,
        bidCount: mediaEntry?.partyBids?.length || 0,
        status: party.status
      };
    })
      .filter(p => p.partyMediaAggregate > 0) // Only include parties with bids
      .sort((a, b) => b.partyMediaAggregate - a.partyMediaAggregate) // Sort by bid total
      .slice(0, parseInt(limit) || 10);

    console.log('✅ Returning', partyStats.length, 'parties with bids');

    res.json({
      parties: partyStats
    });
  } catch (error) {
    console.error('Error fetching top parties:', error);
    res.status(500).json({ error: 'Failed to fetch top parties' });
  }
});

// @route   GET /api/media/:mediaId/tag-rankings
// @desc    Get tag rankings for a specific media item
// @access  Public
router.get('/:mediaId/tag-rankings', async (req, res) => {
  try {
    const { mediaId } = req.params;

    console.log('🏷️ Tag rankings request for media:', mediaId);

    // Handle both ObjectIds and UUIDs
    let actualMediaId = mediaId;
    if (!isValidObjectId(mediaId)) {
      // If it's not an ObjectId, try to find by UUID
      const mediaByUuid = await Media.findOne({ uuid: mediaId }).select('_id');
      if (!mediaByUuid) {
        return res.status(404).json({ error: 'Media not found' });
      }
      actualMediaId = mediaByUuid._id;
    }

    const media = await Media.findById(actualMediaId);
    if (!media) {
      return res.status(404).json({ error: 'Media not found' });
    }

    if (!media.tags || media.tags.length === 0) {
      return res.json({ tagRankings: [] });
    }

    console.log('📊 Computing rankings for tags:', media.tags);

    // Calculate ranking for each tag
    const tagRankings = [];
    
    for (const tag of media.tags) {
      // Find all media with this tag, sorted by globalMediaAggregate
      const mediaWithTag = await Media.find({ 
        tags: tag,
        contentType: { $in: ['music'] } // Only music for now
      })
        .sort({ globalMediaAggregate: -1 })
        .select('uuid title globalMediaAggregate')
        .lean();
      
      // Find this media's rank
      const rankIndex = mediaWithTag.findIndex(m => m._id.toString() === actualMediaId.toString());
      const rank = rankIndex + 1;
      const total = mediaWithTag.length;
      const percentile = total > 0 ? ((total - rank) / total * 100).toFixed(1) : '0';
      
      tagRankings.push({
        tag,
        rank,
        total,
        percentile: parseFloat(percentile),
        aggregate: media.globalMediaAggregate || 0
      });
      
      console.log(`  Tag "${tag}": Rank #${rank} of ${total} (Top ${percentile}%)`);
    }

    // Sort by best rank (lowest number)
    tagRankings.sort((a, b) => a.rank - b.rank);

    console.log('✅ Returning', tagRankings.length, 'tag rankings');

    res.json({
      tagRankings
    });
  } catch (error) {
    console.error('Error fetching tag rankings:', error);
    res.status(500).json({ error: 'Failed to fetch tag rankings' });
  }
});

// @route   GET /api/media/admin/stats
// @desc    Get media statistics (admin only)
// @access  Private (Admin)
router.get('/admin/stats', authMiddleware, async (req, res) => {
  try {
    // Check if user is admin
    if (!req.user.role || !req.user.role.includes('admin')) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const totalMedia = await Media.countDocuments({ contentType: { $in: ['music'] } });
    
    res.json({
      totalMedia
    });
  } catch (error) {
    console.error('Error fetching media stats:', error);
    res.status(500).json({ error: 'Failed to fetch media stats' });
  }
});

module.exports = router;

