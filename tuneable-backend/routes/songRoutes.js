const express = require("express");
const multer = require("multer");
const path = require("path");
const mongoose = require("mongoose");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");
const Song = require("../models/Song"); // Legacy model
const Media = require("../models/Media"); // New unified model
const Party = require("../models/Party");
const Comment = require("../models/Comment");
const { isValidObjectId } = require("../utils/validators");
const { transformResponse } = require('../utils/uuidTransform');

// Configure Multer for File Uploads
const fileFilter = (req, file, cb) => {
  const allowedTypes = ["audio/mpeg", "audio/wav", "audio/mp3"];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Invalid file type. Only MP3 and WAV are allowed."), false);
  }
};

const storage = multer.memoryStorage(); // Store file in memory

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 33 * 1024 * 1024 }, // Limit: 33MB
});

// @route   POST /api/songs/upload
// @desc    Upload a song file and store metadata
// @access  Private (User must be logged in)
router.post("/upload", authMiddleware, async (req, res) => {
   console.log("🔐 User Info from Auth Middleware:", req.user);
  upload.single("file")(req, res, async (err) => {
    if (err) {
      console.error("Multer error:", err);
      return res.status(500).json({ message: "File upload failed", error: err.message });
    }

    try {
      console.log("🔵 Upload Route Hit!");

      if (!req.file) {
        console.log("⛔ No file received!");
        return res.status(400).json({ message: "No file uploaded" });
      }

      console.log("🟢 File Received:", req.file);
      console.log("🟡 Form Data:", req.body);

      const { title, artist } = req.body;
      if (!title || !artist) {
        return res.status(400).json({ message: "Title and artist are required" });
      }

      const objectId = new mongoose.Types.ObjectId();

      // Create a new song entry first to generate an `_id`
      const newSong = new Song({
        _id: objectId,
        title,
        artist,
        addedBy: req.user._id,
      });
      await newSong.save();

      // Generate a safe filename
      const safeTitle = title.replace(/[^a-zA-Z0-9]/g, "_");
      const safeArtist = artist.replace(/[^a-zA-Z0-9]/g, "_");
      const songID = newSong._id.toString();
      const ext = path.extname(req.file.originalname);
      const finalFilename = `${safeArtist}-${safeTitle}-${songID}${ext}`;

      console.log("🟠 Final Filename:", finalFilename);

      // Save the file to disk manually
      const filePath = `uploads/${finalFilename}`;
      require("fs").writeFileSync(filePath, req.file.buffer); // Save from memory storage

      // Update song metadata
      newSong.sources.set("local", `/uploads/${finalFilename}`);
      await newSong.save();

      console.log("✅ Song successfully uploaded:", newSong);
      return res.status(201).json({ message: "Song uploaded successfully", song: newSong });

    } catch (error) {
      console.error("🚨 Upload error:", error);
      return res.status(500).json({ message: "Something went wrong!", error: error.message });
    }
  });
});

// @route   GET /api/songs/public
// @desc    Fetch public songs for TuneFeed without authentication
// @access  Public
router.get("/public", async (req, res) => {
  try {
    const { sortBy, filterBy, limit = 50 } = req.query;

    let query = {};
    // Apply filters if provided (e.g., tag, BPM range)
    if (filterBy) {
      try {
        const filters = JSON.parse(filterBy);
        if (filters.tag) query.tag = filters.tag;
        if (filters.bpmMin && filters.bpmMax) {
          query.bpm = { $gte: filters.bpmMin, $lte: filters.bpmMax };
        }
      } catch (error) {
        return res.status(400).json({ error: "Invalid filter format" });
      }
    }

    let sortCriteria = {};
switch (sortBy) {
  case "highestBid":
  case "highest_bid":  // Optional: support both naming conventions
    sortCriteria = { globalBidValue: -1 };
    break;
  case "newest":
    sortCriteria = { updatedAt: -1 }; // Sort by updatedAt field
    break;
  case "mostPlayed":
    sortCriteria = { popularity: -1 };
    break;
  default:
    sortCriteria = { updatedAt: -1 }; // Default to newest
}

    // Fetch songs with filtering and sorting applied
    const songs = await Song.find(query)
      .populate({
        path: "bids",
        populate: {
          path: "userId",
          model: "User",
          select: "username",
        },
      })
      .populate({
        path: "addedBy",
        model: "User",
        select: "username",
      })
      .sort(sortCriteria)
      .limit(Number(limit));

    console.log("Fetched public songs:", JSON.stringify(songs, null, 2));
    res.status(200).json({
      message: "Public songs fetched successfully!",
      songs,
    });
  } catch (err) {
    console.error("Error fetching public songs:", err.message);
    res.status(500).json({ error: "Error fetching public songs", details: err.message });
  }
});


// @route   GET /api/songs
// @desc    Fetch all songs for TuneFeed with filtering & sorting
// @access  Private
router.get("/", authMiddleware, async (req, res) => {
  console.log("Route Hit:", req.originalUrl);

  try {
    const { sortBy, filterBy, limit = 50 } = req.query;

    let query = {};

    // Apply filters (e.g., tag, BPM range, etc.)
    if (filterBy) {
      try {
        const filters = JSON.parse(filterBy); // Expecting JSON in query
        if (filters.tag) query.tag = filters.tag;
        if (filters.bpmMin && filters.bpmMax) {
          query.bpm = { $gte: filters.bpmMin, $lte: filters.bpmMax };
        }
      } catch (error) {
        return res.status(400).json({ error: "Invalid filter format" });
      }
    }

    let sortCriteria = {};
switch (sortBy) {
  case "highestBid":
  case "highest_bid":  // Optional: support both naming conventions
    sortCriteria = { globalBidValue: -1 };
    break;
  case "newest":
    sortCriteria = { updatedAt: -1 }; // Sort by updatedAt field
    break;
  case "mostPlayed":
    sortCriteria = { popularity: -1 };
    break;
  default:
    sortCriteria = { updatedAt: -1 }; // Default to newest
}


    // Fetch songs with sorting and filtering applied
    const songs = await Song.find(query)
      .populate({
        path: "bids",
        populate: {
          path: "userId",
          model: "User",
          select: "username",
        },
      })
      .populate({
        path: "addedBy",
        model: "User",
        select: "username",
      })
      .sort(sortCriteria)
      .limit(Number(limit));

    console.log("Fetched songs for TuneFeed:", JSON.stringify(songs, null, 2));

    res.status(200).json({
      message: "Songs fetched successfully!",
      songs,
    });
  } catch (err) {
    console.error("Error fetching TuneFeed songs:", err.message);
    res.status(500).json({ error: "Error fetching TuneFeed songs", details: err.message });
  }
});

// @route   GET /api/songs/:partyId/songs/:songId
// @desc    Fetch details of a specific song in a party
// @access  Private
router.get("/:partyId/songs/:songId", authMiddleware, async (req, res) => {
  console.log("Route Hit:", req.originalUrl);
  console.log("Party ID:", req.params.partyId);
  console.log("Song ID:", req.params.songId);

  try {
    const { partyId, songId } = req.params;

    if (!isValidObjectId(partyId) || !isValidObjectId(songId)) {
      return res.status(400).json({ error: "Invalid ID format" });
    }

    // Validate that the party exists
    const party = await Party.findById(partyId);
    if (!party) return res.status(404).json({ error: "Party not found" });

    //  the song details with populated bid info
    const song = await Song.findById(songId)
      .populate({
        path: "bids",
        populate: {
          path: "userId",
          model: "User",
          select: "username",
        },
      })
      .populate({
        path: "addedBy",
        model: "User",
        select: "username",
      });

    console.log("Populated song:", JSON.stringify(song, null, 2));

    if (!song) return res.status(404).json({ error: "Song not found" });

    res.status(200).json({ message: "Song details ed successfully!", song });
  } catch (err) {
    console.error("Error ing song details:", err.message);
    res.status(500).json({ error: "Error ing song details", details: err.message });
  }
});

// @route   GET /api/songs/:songId/profile
// @desc    Get comprehensive song details for Tune Profile page
// @access  Public (for viewing song details)
router.get('/:songId/profile', async (req, res) => {
  try {
    const { songId } = req.params;

    // Try to find in Media collection first (new unified model)
    let media;
    if (songId.includes('-')) {
      // UUID format
      media = await Media.findOne({ uuid: songId });
    } else if (isValidObjectId(songId)) {
      // ObjectId format
      media = await Media.findById(songId);
    } else {
      return res.status(400).json({ error: 'Invalid media ID format' });
    }

    // Fallback to legacy Song collection if not found in Media
    if (!media) {
      let song;
      if (songId.includes('-')) {
        song = await Song.findOne({ uuid: songId });
      } else if (isValidObjectId(songId)) {
        song = await Song.findById(songId);
      }
      
      if (!song) {
        return res.status(404).json({ error: 'Media not found' });
      }
      
      // Populate legacy song with bids and user data
      const populatedSong = await Song.findById(song._id)
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
      });

      // Fetch recent comments for the legacy song
      const recentComments = await Comment.find({ 
        songId: song._id, 
        parentCommentId: null,
        isDeleted: false 
      })
        .populate('userId', 'username profilePic uuid')
        .sort({ createdAt: -1 })
        .limit(5);

      // Add comments to the response
      populatedSong.comments = recentComments;

      res.json(transformResponse({
        message: 'Song profile fetched successfully',
        song: populatedSong,
      }));
      
    } else {
      // Handle new Media model
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
        });

      // Fetch recent comments for the media
      const recentComments = await Comment.find({ 
        songId: media._id, 
        parentCommentId: null,
        isDeleted: false 
      })
        .populate('userId', 'username profilePic uuid')
        .sort({ createdAt: -1 })
        .limit(5);

      // Add comments to the response
      populatedMedia.comments = recentComments;

      // Transform Media to match expected format
      const transformedMedia = {
        ...populatedMedia.toObject(),
        artist: populatedMedia.artist && populatedMedia.artist.length > 0 ? 
                populatedMedia.artist[0].name : 'Unknown Artist', // Primary artist name
        artists: populatedMedia.artist || [], // Full artist subdocuments
        creators: populatedMedia.creatorNames || [], // All creator names
      };

      res.json(transformResponse({
        message: 'Media profile fetched successfully',
        song: transformedMedia,
      }));
    }

  } catch (error) {
    console.error('Error fetching song profile:', error);
    res.status(500).json({ error: 'Error fetching song profile', details: error.message });
  }
});

// @route   GET /api/songs/top-tunes
// @desc    Get top songs by global bid value for Top Tunes
// @access  Public
router.get('/top-tunes', async (req, res) => {
  try {
    const { sortBy = 'globalBidValue', limit = 10 } = req.query;
    
    // Validate sortBy parameter - map legacy fields to new Media fields
    const validSortFields = ['globalBidValue', 'title', 'creators', 'duration', 'uploadedAt'];
    const sortField = validSortFields.includes(sortBy) ? sortBy : 'globalBidValue';
    
    // Map legacy field names to Media model fields
    const fieldMapping = {
      'title': 'title',
      'artist': 'creators', // Map artist to creators
      'duration': 'duration',
      'globalBidValue': 'globalBidValue',
      'uploadedAt': 'uploadedAt'
    };
    
    const mediaSortField = fieldMapping[sortField] || sortField;
    
    // Validate limit parameter
    const limitNum = Math.min(parseInt(limit) || 10, 100); // Max 100 items
    
    // Build sort object
    let sortObj = {};
    if (mediaSortField === 'globalBidValue') {
      sortObj[mediaSortField] = -1; // Descending for bid value
    } else if (mediaSortField === 'title' || mediaSortField === 'creators') {
      sortObj[mediaSortField] = 1; // Ascending for text fields
    } else {
      sortObj[mediaSortField] = -1; // Descending for duration and date
    }
    
    // Use new Media model, filtering for music content
    let media = await Media.find({ 
      globalBidValue: { $gt: 0 },
      contentType: { $in: ['music'] } // Only music content for now
    })
      .sort(sortObj)
      .limit(limitNum)
      .populate({
        path: 'bids',
        model: 'Bid',
        populate: {
          path: 'userId',
          model: 'User',
          select: 'username profilePic uuid',
        },
      })
      .select('title artist producer featuring creatorNames duration coverArt globalBidValue uploadedAt bids uuid contentType contentForm genres category');

    // Ensure proper population by manually checking and populating if needed
    const Bid = require('../models/Bid');
    const User = require('../models/User');
    
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
      id: item.uuid || item._id,
      uuid: item.uuid,
      title: item.title,
      artist: item.artist && item.artist.length > 0 ? item.artist[0].name : 'Unknown Artist', // Primary artist name
      artists: item.artist || [], // Full artist array with subdocuments
      creators: item.creatorNames || [], // All creator names
      producer: item.producer || [],
      featuring: item.featuring || [],
      duration: item.duration,
      coverArt: item.coverArt,
      globalBidValue: item.globalBidValue,
      uploadedAt: item.uploadedAt,
      bids: item.bids,
      contentType: item.contentType,
      contentForm: item.contentForm
    }));
    
    res.json(transformResponse({
      success: true,
      songs: transformedSongs,
      total: transformedSongs.length,
      sortBy: sortField,
      limit: limitNum
    }));
  } catch (err) {
    console.error('Error fetching Top Tunes songs:', err);
    res.status(500).json({ 
      success: false, 
      error: 'Error fetching Top Tunes songs', 
      details: err.message 
    });
  }
});

// ==================== COMMENT ROUTES ====================

// @route   POST /api/songs/:songId/comments
// @desc    Create a new comment on a song
// @access  Private (requires authentication)
router.post('/:songId/comments', authMiddleware, async (req, res) => {
  try {
    const { songId } = req.params;
    const { content, parentCommentId } = req.body;
    const userId = req.user._id;

    // Validate content
    if (!content || content.trim().length === 0) {
      return res.status(400).json({ error: 'Comment content is required' });
    }

    if (content.length > 1000) {
      return res.status(400).json({ error: 'Comment must be less than 1000 characters' });
    }

    // Validate song exists
    let song;
    if (songId.includes('-')) {
      song = await Song.findOne({ uuid: songId });
    } else if (isValidObjectId(songId)) {
      song = await Song.findById(songId);
    } else {
      return res.status(400).json({ error: 'Invalid song ID format' });
    }

    if (!song) {
      return res.status(404).json({ error: 'Song not found' });
    }

    // Create comment
    const comment = new Comment({
      content: content.trim(),
      userId,
      songId: song._id,
      parentCommentId: parentCommentId || null,
    });

    await comment.save();

    // Populate user data for response
    await comment.populate('userId', 'username profilePic uuid');

    res.status(201).json(transformResponse({
      message: 'Comment created successfully',
      comment,
    }));

  } catch (error) {
    console.error('Error creating comment:', error);
    res.status(500).json({ error: 'Error creating comment', details: error.message });
  }
});

// @route   GET /api/songs/:songId/comments
// @desc    Get all comments for a song
// @access  Public
router.get('/:songId/comments', async (req, res) => {
  try {
    const { songId } = req.params;
    const { page = 1, limit = 20, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;

    // Validate song exists
    let song;
    if (songId.includes('-')) {
      song = await Song.findOne({ uuid: songId });
    } else if (isValidObjectId(songId)) {
      song = await Song.findById(songId);
    } else {
      return res.status(400).json({ error: 'Invalid song ID format' });
    }

    if (!song) {
      return res.status(404).json({ error: 'Song not found' });
    }

    // Build sort object
    const sortObj = {};
    sortObj[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Fetch comments (top-level only, no replies for now)
    const comments = await Comment.find({ 
      songId: song._id, 
      parentCommentId: null,
      isDeleted: false 
    })
      .populate('userId', 'username profilePic uuid')
      .sort(sortObj)
      .skip(skip)
      .limit(parseInt(limit));

    // Get total count
    const totalComments = await Comment.countDocuments({ 
      songId: song._id, 
      parentCommentId: null,
      isDeleted: false 
    });

    res.json(transformResponse({
      message: 'Comments fetched successfully',
      comments,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalComments,
        pages: Math.ceil(totalComments / parseInt(limit)),
      },
    }));

  } catch (error) {
    console.error('Error fetching comments:', error);
    res.status(500).json({ error: 'Error fetching comments', details: error.message });
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

    res.json(transformResponse({
      message: hasLiked ? 'Comment unliked' : 'Comment liked',
      comment,
      hasLiked: !hasLiked,
    }));

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

    res.json(transformResponse({
      message: 'Comment deleted successfully',
    }));

  } catch (error) {
    console.error('Error deleting comment:', error);
    res.status(500).json({ error: 'Error deleting comment', details: error.message });
  }
});

module.exports = router;
