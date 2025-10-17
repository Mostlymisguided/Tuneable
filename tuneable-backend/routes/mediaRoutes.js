const express = require('express');
const router = express.Router();
const Media = require('../models/Media');
const Comment = require('../models/Comment');
const authMiddleware = require('../middleware/authMiddleware');
const { isValidObjectId } = require('../utils/validators');
const { transformResponse } = require('../utils/uuidTransform');
const { resolveId } = require('../utils/idResolver');

// @route   GET /api/media/top-tunes
// @desc    Get top media by global bid value for Top Tunes
// @access  Public
router.get('/top-tunes', async (req, res) => {
  try {
    const { sortBy = 'globalMediaAggregate', limit = 10 } = req.query;
    
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
    
    // Use new Media model, filtering for music content
    let media = await Media.find({ 
      globalMediaAggregate: { $gt: 0 }, // Updated to schema grammar
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
      .select('title artist producer featuring creatorNames duration coverArt globalMediaAggregate uploadedAt bids uuid contentType contentForm genres category tags'); // Updated to schema grammar

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
      globalMediaAggregate: item.globalMediaAggregate, // Updated to schema grammar
      uploadedAt: item.uploadedAt,
      bids: item.bids,
      contentType: item.contentType,
      contentForm: item.contentForm,
      tags: item.tags || []
    }));
    
    res.json(transformResponse({
      success: true,
      songs: transformedSongs, // Keep field name for frontend compatibility
      total: transformedSongs.length,
      sortBy: sortField,
      limit: limitNum
    }));
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

    // Find media by UUID or ObjectId
    let media;
    if (mediaId.includes('-')) {
      // UUID format
      media = await Media.findOne({ uuid: mediaId });
    } else if (isValidObjectId(mediaId)) {
      // ObjectId format
      media = await Media.findById(mediaId);
    } else {
      return res.status(400).json({ error: 'Invalid media ID format' });
    }

    if (!media) {
      return res.status(404).json({ error: 'Media not found' });
    }

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
      });

    // Fetch recent comments - check both songId (legacy) and mediaId (new)
    const recentComments = await Comment.find({ 
      $or: [
        { mediaId: media._id },
        { songId: media._id } // Legacy support
      ],
      parentCommentId: null,
      isDeleted: false 
    })
      .populate('userId', 'username profilePic uuid')
      .sort({ createdAt: -1 })
      .limit(5);

    // Add comments to the response
    populatedMedia.comments = recentComments;

    // Compute GlobalMediaAggregateRank (rank by total bid value)
    // Count how many media have a higher globalMediaAggregate value
    const rank = await Media.countDocuments({
      globalMediaAggregate: { $gt: populatedMedia.globalMediaAggregate || 0 }
    }) + 1; // +1 because rank is 1-indexed

    // Transform Media to match expected frontend format
    const transformedMedia = {
      ...populatedMedia.toObject(),
      artist: populatedMedia.artist && populatedMedia.artist.length > 0 ? 
              populatedMedia.artist[0].name : 'Unknown Artist', // Primary artist name
      artists: populatedMedia.artist || [], // Full artist subdocuments
      creators: populatedMedia.creatorNames || [], // All creator names
      globalMediaAggregateTopRank: rank, // Add computed rank
    };

    res.json(transformResponse({
      message: 'Media profile fetched successfully',
      song: transformedMedia, // Keep 'song' key for frontend compatibility
    }));

  } catch (error) {
    console.error('Error fetching media profile:', error);
    res.status(500).json({ error: 'Error fetching media profile', details: error.message });
  }
});

// @route   PUT /api/media/:id
// @desc    Update media/song details
// @access  Private (Admin or Verified Creator only)
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;
    
    // Resolve ID (handles both UUID and ObjectId)
    const resolvedId = await resolveId(id, Media, 'uuid');
    if (!resolvedId) {
      return res.status(404).json({ error: 'Media not found' });
    }
    
    // Find the media
    const media = await Media.findById(resolvedId);
    if (!media) {
      return res.status(404).json({ error: 'Media not found' });
    }
    
    // Check permissions: must be admin OR verified creator
    const isAdmin = req.user.role && req.user.role.includes('admin');
    const isVerifiedCreator = media.verifiedCreators && media.verifiedCreators.some(
      creatorId => creatorId.toString() === userId.toString()
    );
    
    if (!isAdmin && !isVerifiedCreator) {
      return res.status(403).json({ error: 'Not authorized to edit this media' });
    }
    
    // Update allowed fields
    const allowedUpdates = [
      'title', 'producer', 'featuring', 'album', 'genre',
      'releaseDate', 'duration', 'explicit', 'isrc', 'upc', 'bpm',
      'pitch', 'key', 'elements', 'tags', 'category', 'timeSignature',
      'lyrics', 'rightsHolder', 'rightsHolderEmail', 'description', 'sources'
    ];
    
    allowedUpdates.forEach(field => {
      if (req.body[field] !== undefined) {
        media[field] = req.body[field];
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
      media.genres = req.body.genre ? [req.body.genre] : [];
    }
    
    await media.save();
    
    // Transform response to use UUIDs
    const transformedMedia = transformResponse(media.toObject());
    
    res.json({ 
      message: 'Media updated successfully',
      media: transformedMedia 
    });
  } catch (error) {
    console.error('Error updating media:', error);
    res.status(500).json({ error: 'Failed to update media' });
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

    // Fetch comments (check both mediaId and legacy songId)
    const comments = await Comment.find({ 
      $or: [
        { mediaId: media._id },
        { songId: media._id } // Legacy support
      ],
      parentCommentId: null,
      isDeleted: false 
    })
      .populate('userId', 'username profilePic uuid')
      .sort(sortObj)
      .skip(skip)
      .limit(parseInt(limit));

    // Get total count
    const totalComments = await Comment.countDocuments({ 
      $or: [
        { mediaId: media._id },
        { songId: media._id }
      ],
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

    // Create comment with mediaId (new) instead of songId (legacy)
    const comment = new Comment({
      content: content.trim(),
      userId,
      mediaId: media._id, // Use mediaId instead of songId
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

