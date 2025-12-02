const express = require('express');
const mongoose = require('mongoose');
const crypto = require('crypto');
const axios = require('axios');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const optionalAuthMiddleware = require('../middleware/optionalAuthMiddleware');
const adminMiddleware = require('../middleware/adminMiddleware');
const Party = require('../models/Party');
const Media = require('../models/Media');
const Bid = require('../models/Bid');
const User = require('../models/User');
const { getVideoDetails } = require('../services/youtubeService');
const { isValidObjectId } = require('../utils/validators');
const { broadcastToParty } = require('../utils/socketIO');
const { DEFAULT_COVER_ART } = require('../utils/coverArtUtils');
// const { transformResponse } = require('../utils/uuidTransform'); // Removed - using ObjectIds directly
const { resolvePartyId } = require('../utils/idResolver'); // Re-enabled to handle "global" slug
const { sendPartyCreationNotification, sendHighValueBidNotification } = require('../utils/emailService');
// Note: Old bidCalculations utility functions are no longer used
// All bid metric calculations are now handled by BidMetricsEngine
// via Bid model hooks (post('save') and post('remove'))
require('dotenv').config(); // Load .env variables

// What3words functionality removed for now
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

// Centralized error handler
const handleError = (res, err, message, status = 500) => {
    console.error(`${message}:`, err.message);
    res.status(status).json({ error: message, details: err.message });
};

// Generate unique party code
const deriveCodeFromPartyId = (objectId) => {
    return crypto.createHash('md5').update(objectId.toString()).digest('hex').substring(0, 6).toUpperCase();
  };

/**
 * Capitalize the first letter of each word in a tag (title case)
 * @param {string} tag - The tag to capitalize
 * @returns {string} - The capitalized tag
 */
const capitalizeTag = (tag) => {
  if (!tag || typeof tag !== 'string') return tag;
  return tag
    .trim()
    .split(/\s+/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
};

/**
 * Merge tags and ensure they're capitalized (title case)
 * @param {Array} existingTags - Existing tags array
 * @param {Array} newTags - New tags to merge
 * @returns {Array} - Merged and capitalized tags array
 */
const mergeTags = (existingTags, newTags) => {
  if (!newTags || !Array.isArray(newTags) || newTags.length === 0) {
    // Capitalize existing tags if they're not already capitalized
    return (existingTags || []).map(tag => capitalizeTag(tag));
  }
  
  const existing = (existingTags || []).map(t => t.toLowerCase().trim());
  const merged = [...(existingTags || []).map(tag => capitalizeTag(tag))];
  
  newTags.forEach(tag => {
    const capitalizedTag = capitalizeTag(tag);
    const lowerTag = capitalizedTag.toLowerCase().trim();
    if (lowerTag && !existing.includes(lowerTag)) {
      merged.push(capitalizedTag);
      existing.push(lowerTag);
    }
  });
  
  return merged;
};

/**
 * Route: POST /
 * Create a new party
 * Access: Admin only (requires admin role)
 */
router.post('/', adminMiddleware, async (req, res) => {
    try {
      console.log('🔥 Create Party Request Received:', req.body);
      console.log('🔑 Authenticated User:', req.user);
  
      const { name, location, startTime, privacy, type, mediaSource, minimumBid, tags, description } = req.body;
  
      if (!name ) {
        console.log('❌ Missing Name');
        return res.status(400).json({ error: 'Name is required' });
      }

      if (!location ) {
        return res.status(400).json({ message: "Location is required" });
      }
  
      const userId = req.user._id;
      if (!isValidObjectId(userId)) {
        console.log('❌ Invalid User ID:', userId);
        return res.status(400).json({ error: 'Invalid userId' });
      }
  
      // Generate MongoDB ObjectId manually so we can hash it for partyCode
      const objectId = new mongoose.Types.ObjectId();
      const partyCode = deriveCodeFromPartyId(objectId); // ✅ Hash the unique _id to create partyCode

      const party = new Party({
        _id: objectId,
        name,
        location,
        host: userId,
        partyCode,
        partiers: [userId],
        bids: [],
        startTime: startTime || new Date(), // Use provided startTime or current time for automatic
        privacy: privacy || 'public',
        type: type || 'remote',
        status: startTime ? 'scheduled' : 'active', // If no startTime provided, party starts immediately
        mediaSource: mediaSource || 'youtube',
        minimumBid: minimumBid || 0.33,
        tags: tags || [],
        description: description || '',
      });
  
      await party.save();
      console.log('✅ Party Created Successfully:', party);

      // Send email notification to admin
      try {
        const host = await User.findById(userId);
        await sendPartyCreationNotification(party, host);
      } catch (emailError) {
        console.error('Failed to send party creation notification email:', emailError);
        // Don't fail the request if email fails
      }
  
      broadcastToParty(party._id.toString(), { type: 'PARTY_CREATED', party });
      res.status(201).json({ message: 'Party created successfully', party });
  
    } catch (err) {
      console.error('🔥 Error creating party:', err);
      res.status(500).json({ error: 'Server error', details: err.message });
    }
  });


router.post("/join/:partyId", authMiddleware, resolvePartyId(), async (req, res) => {
    const { partyId } = req.params;
    const { inviteCode, location } = req.body;
    const userId = req.user._id;

    try {
        const party = await Party.findById(partyId);
        if (!party) return res.status(404).json({ message: "Party not found" });

        // Check if user is the host (host can always join without code)
        const isHost = party.host.toString() === userId.toString();
        
        // ✅ Check if user is kicked from this party
        const isKicked = party.kickedUsers && party.kickedUsers.some(
            ku => ku.userId && ku.userId.toString() === userId.toString()
        );
        
        if (isKicked) {
            const kickInfo = party.kickedUsers.find(
                ku => ku.userId && ku.userId.toString() === userId.toString()
            );
            return res.status(403).json({ 
                message: "You have been removed from this party and cannot rejoin",
                kickedAt: kickInfo?.kickedAt,
                reason: kickInfo?.reason || null
            });
        }
        
        if (party.privacy === "private" && !isHost && party.partyCode !== inviteCode) {
            return res.status(403).json({ message: "Invalid invite code" });
        }

        // TODO: Implement geocoding logic for live parties
        // if (party.type === "live") {
        //     const distance = calculateDistance(location, party.location);
        //     if (distance > party.allowedRadius) {
        //         return res.status(403).json({ message: "You're too far away to join" });
        //     }
        // }

        // ✅ Fix: Properly check if user is already in partiers array
        // Convert both to strings for reliable comparison (ObjectId.includes() doesn't work correctly)
        const userIdString = userId.toString();
        const isAlreadyPartier = party.partiers.some(
            partier => partier.toString() === userIdString
        );

        if (!isAlreadyPartier) {
            // Add user to party's partiers array
            party.partiers.push(userId);
            await party.save();
            console.log(`✅ Added user ${userId} to party ${partyId} partiers array`);
            
            // Add party to user's joinedParties array
            const User = require('../models/User');
            const user = await User.findById(userId);
            if (user) {
                // Check if user is already in this party
                const alreadyJoined = user.joinedParties.some(jp => jp.partyId.toString() === partyId);
                if (!alreadyJoined) {
                    user.joinedParties.push({
                        partyId: partyId, // partyId is now ObjectId (no conversion needed)
                        role: isHost ? 'host' : 'partier'
                    });
                    await user.save();
                    console.log(`✅ Added party ${partyId} to user ${userId} joinedParties`);
                }
            }
        } else {
            console.log(`ℹ️  User ${userId} is already a partier in party ${partyId}`);
        }

        // ✅ Always return updated party with populated partiers
        const updatedParty = await Party.findById(partyId)
            .populate('partiers', 'username uuid')
            .populate('host', 'username uuid')
            .lean();
        
        res.json({ 
            message: "Joined successfully", 
            party: updatedParty 
        });

    } catch (error) {
        res.status(500).json({ message: "Server error", error });
    }
});


/**
 * Route: GET /
 * Fetch all parties
 * Access: Public (optional auth - shows private parties if logged in)
 */
router.get('/', optionalAuthMiddleware, async (req, res) => {
    try {
        const userId = req.user?._id; // Optional - may be null for unauthenticated users
        
        // Get user's joined parties to filter private parties (only if logged in)
        let joinedPartyIds = [];
        if (userId) {
            const User = require('../models/User');
            const user = await User.findById(userId).select('joinedParties');
            joinedPartyIds = user?.joinedParties?.map(jp => jp.partyId) || [];
        }
        
        // Use aggregation to get parties with media counts in a single query
        const partiesWithCounts = await Party.aggregate([
            {
                $match: {
                    // Show public parties OR (if logged in) private parties the user has joined OR parties the user hosts
                    $or: [
                        { privacy: 'public' },
                        ...(userId ? [
                            { privacy: 'private', _id: { $in: joinedPartyIds } },
                            { privacy: 'private', host: userId }
                        ] : [])
                    ]
                }
            },
            {
                $project: {
                    uuid: 1,
                    name: 1,
                    location: 1,
                    host: 1,
                    partyCode: 1,
                    partiers: 1,
                    startTime: 1,
                    endTime: 1,
                    privacy: 1,
                    type: 1,
                    status: 1,
                    watershed: 1,
                    tags: 1,
                    description: 1,
                    createdAt: 1,
                    updatedAt: 1,
                    minimumBid: 1,
                    mediaSource: 1,
                    media: 1, // Include media array for partyAggregate calculation
                    // Count active media only (matching Party page display)
                    mediaCount: {
                        $size: {
                            $filter: {
                                input: { $ifNull: ['$media', []] },
                                as: 'item',
                                cond: { $eq: ['$$item.status', 'active'] }
                            }
                        }
                    },
                    // Calculate total party aggregate (sum of all active media partyMediaAggregate)
                    partyAggregate: {
                        $reduce: {
                            input: {
                                $filter: {
                                    input: { $ifNull: ['$media', []] },
                                    as: 'item',
                                    cond: { $eq: ['$$item.status', 'active'] }
                                }
                            },
                            initialValue: 0,
                            in: { $add: ['$$value', { $ifNull: ['$$this.partyMediaAggregate', 0] }] }
                        }
                    }
                }
            },
            {
                $lookup: {
                    from: 'users',
                    localField: 'host',
                    foreignField: '_id',
                    as: 'hostData'
                }
            },
            {
                $unwind: {
                    path: '$hostData',
                    preserveNullAndEmptyArrays: true
                }
            },
            {
                $project: {
                    _id: 1, // Explicitly include _id for consistency
                    uuid: 1,
                    name: 1,
                    location: 1,
                    host: {
                        _id: '$hostData._id',
                        username: '$hostData.username',
                        uuid: '$hostData.uuid'
                    },
                    partyCode: 1,
                    partiers: 1,
                    startTime: 1,
                    endTime: 1,
                    privacy: 1,
                    type: 1,
                    status: 1,
                    watershed: 1,
                    tags: 1,
                    description: 1,
                    slug: 1, // ✅ Include slug for tag parties
                    createdAt: 1,
                    updatedAt: 1,
                    minimumBid: 1,
                    mediaSource: 1,
                    mediaCount: 1,
                    partyAggregate: 1 // Preserve partyAggregate calculated in previous stage
                }
            }
        ]);

        // For tag parties, calculate partiers as all unique users who have tipped on media with that tag
        const Bid = require('../models/Bid');
        const Media = require('../models/Media');
        const User = require('../models/User');
        
        for (let party of partiesWithCounts) {
            if (party.type === 'tag' && party.tags && party.tags.length > 0) {
                const tagPartyTag = party.tags[0];
                const { capitalizeTag } = require('../services/tagPartyService');
                const normalizedTag = capitalizeTag(tagPartyTag);
                const lowerTag = normalizedTag.toLowerCase().trim();
                
                // Find all media with this tag that has bids
                const mediaWithTag = await Media.find({
                    tags: { 
                        $elemMatch: { 
                            $regex: new RegExp(`^${lowerTag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') 
                        } 
                    },
                    bids: { $exists: true, $ne: [] }
                }).select('_id').lean();
                
                if (mediaWithTag.length > 0) {
                    const mediaIds = mediaWithTag.map(m => m._id);
                    
                    // Find all unique users who have active bids on this media
                    const uniqueUserIds = await Bid.distinct('userId', {
                        mediaId: { $in: mediaIds },
                        status: 'active'
                    });
                    
                    // Populate partiers
                    if (uniqueUserIds.length > 0) {
                        const partierUsers = await User.find({ _id: { $in: uniqueUserIds } })
                            .select('username uuid')
                            .lean();
                        party.partiers = partierUsers;
                    } else {
                        party.partiers = [];
                    }
                } else {
                    party.partiers = [];
                }
            }
        }

        res.status(200).json({ message: 'Parties fetched successfully', parties: partiesWithCounts });
    } catch (err) {
        handleError(res, err, 'Failed to fetch parties');
    }
});

// @route   GET /api/parties/search-by-code/:code
// @desc    Search for a party by party code
// @access  Private
router.get('/search-by-code/:code', authMiddleware, async (req, res) => {
    try {
        const { code } = req.params;
        const userId = req.user._id;
        
        if (!code || code.trim().length === 0) {
            return res.status(400).json({ error: 'Party code is required' });
        }
        
        const party = await Party.findOne({ partyCode: code.toUpperCase().trim() })
            .populate('host', 'username uuid')
            .lean();
        
        if (!party) {
            return res.status(404).json({ error: 'Party not found' });
        }
        
        // Check if user has already joined
        const User = require('../models/User');
        const user = await User.findById(userId).select('joinedParties');
        const isJoined = user?.joinedParties?.some(jp => 
            jp.partyId.toString() === party._id.toString()
        ) || false;
        
        // Check if user is the host
        const isHost = party.host._id.toString() === userId.toString();
        
        res.json({
            party: {
                _id: party._id,
                uuid: party.uuid,
                name: party.name,
                location: party.location,
                host: party.host,
                partyCode: party.partyCode,
                privacy: party.privacy,
                type: party.type,
                status: party.status,
                description: party.description,
                tags: party.tags,
                minimumBid: party.minimumBid,
                mediaSource: party.mediaSource,
                isJoined,
                isHost
            }
        });
    } catch (err) {
        console.error('Error searching party by code:', err);
        handleError(res, err, 'Failed to search party by code');
    }
});

// FETCH PARTY DETAILS
// Access: Public (optional auth - shows private parties if logged in and joined)
router.get('/:id/details', optionalAuthMiddleware, resolvePartyId(), async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user?._id; // Optional - may be null for unauthenticated users

        // Check if this is the Global Party
        const isGlobalParty = await Party.getGlobalParty();
        const isRequestingGlobalParty = isGlobalParty && isGlobalParty._id.toString() === id;

        let party;
        
        // First, check if this is a tag party
        party = await Party.findById(id);
        const isTagParty = party && party.type === 'tag';
        
        if (isRequestingGlobalParty) {
            // For Global Party, we need to aggregate ALL media with ANY bids
            console.log('🌍 Fetching Global Party - aggregating all media with bids...');
            
            // Performance monitoring for Global Party
            const startTime = Date.now();
            
            // Get the Global Party object
            party = isGlobalParty;
            
            // Find ALL media that has ANY bids (party or global)
            // Bid and Media are already required at top of file
            
            // Query all media with bids, but only populate ACTIVE bids
            // This ensures we only count active bids in the aggregate calculation
            const allMediaWithBids = await Media.find({
                bids: { $exists: true, $ne: [] },
                status: { $ne: 'vetoed' } // Exclude globally vetoed media
            })
            .populate({
                path: 'bids',
                model: 'Bid',
                match: { status: 'active' }, // ✅ Only populate active bids (exclude vetoed)
                populate: {
                    path: 'userId',
                    select: 'username profilePic uuid homeLocation secondaryLocation'
                }
            })
            .populate('globalMediaBidTopUser', 'username profilePic uuid homeLocation secondaryLocation')
            .populate('globalMediaAggregateTopUser', 'username profilePic uuid homeLocation secondaryLocation')
            .populate('addedBy', 'username profilePic uuid homeLocation secondaryLocation');

            // Convert to party media format for consistent frontend handling
            // Recalculate partyMediaAggregate from active bids on-the-fly to ensure accuracy
            party.media = allMediaWithBids
                .map(media => {
                    // Filter to only active bids (populate match may not filter all cases)
                    const activeBids = (media.bids || []).filter(bid => bid.status === 'active');
                    
                    // Skip media with no active bids
                    if (activeBids.length === 0) {
                        return null;
                    }
                    
                    // Recalculate globalMediaAggregate from active bids only (in pence)
                    // This ensures accuracy regardless of stale stored values
                    const calculatedGlobalMediaAggregate = activeBids.reduce((sum, bid) => {
                        return sum + (typeof bid.amount === 'number' ? bid.amount : 0);
                    }, 0);
                    
                    // Calculate top bid from active bids
                    const topBid = activeBids.reduce((max, bid) => {
                        return (bid.amount || 0) > (max.amount || 0) ? bid : max;
                    }, activeBids[0] || { amount: 0 });
                    
                    // Calculate user aggregates to find top aggregate user
                    const userAggregates = {};
                    activeBids.forEach(bid => {
                        const userId = bid.userId?._id?.toString() || bid.userId?.toString();
                        if (userId) {
                            if (!userAggregates[userId]) {
                                userAggregates[userId] = {
                                    userId: bid.userId?._id || bid.userId,
                                    total: 0
                                };
                            }
                            userAggregates[userId].total += (bid.amount || 0);
                        }
                    });
                    
                    // Find user with highest aggregate
                    const topAggregateUser = Object.values(userAggregates).reduce(
                        (max, user) => user.total > max.total ? user : max,
                        { total: 0, userId: null }
                    );
                    
                    return {
                        mediaId: media,
                        media_uuid: media.uuid,
                        addedBy: media.addedBy?._id || media.addedBy,
                        // Use calculated aggregate from active bids (accurate, not stale)
                        partyMediaAggregate: calculatedGlobalMediaAggregate,
                        partyBids: activeBids, // Only include active bids
                        status: 'active',
                        queuedAt: media.createdAt || new Date(),
                        partyMediaBidTop: topBid.amount || 0,
                        partyMediaBidTopUser: topBid.userId?._id || topBid.userId || null,
                        partyMediaAggregateTop: topAggregateUser.total || 0,
                        partyMediaAggregateTopUser: topAggregateUser.userId || null
                    };
                })
                .filter(media => media !== null); // Remove media with no active bids
            
            // Populate partiers, host, and kickedUsers for Global Party
            const User = require('../models/User');
            // Use actual partiers who joined, not all users - filter out deleted users
            party.partiers = (await User.find({ _id: { $in: party.partiers } }).select('username uuid')).filter(user => user !== null);
            party.host = await User.findOne({ username: 'Tuneable' }).select('username uuid');
            // Populate kickedUsers if they exist
            if (party.kickedUsers && party.kickedUsers.length > 0) {
                const kickedUserIds = party.kickedUsers.map(ku => ku.userId).filter(Boolean);
                const kickedUsers = await User.find({ _id: { $in: kickedUserIds } }).select('username uuid');
                const kickedByIds = party.kickedUsers.map(ku => ku.kickedBy).filter(Boolean);
                const kickedByUsers = await User.find({ _id: { $in: kickedByIds } }).select('username uuid');
                
                party.kickedUsers = party.kickedUsers.map(ku => {
                    const user = kickedUsers.find(u => u._id.toString() === ku.userId.toString());
                    const kickedBy = kickedByUsers.find(u => u._id.toString() === ku.kickedBy.toString());
                    return {
                        ...ku,
                        userId: user || ku.userId,
                        kickedBy: kickedBy || ku.kickedBy
                    };
                });
            }
            
            // Performance monitoring - log Global Party metrics
            const endTime = Date.now();
            const processingTime = endTime - startTime;
            console.log(`🌍 Global Party Performance Metrics:`);
            console.log(`   - Processing time: ${processingTime}ms`);
            console.log(`   - Partiers count: ${party.partiers.length}`);
            console.log(`   - Media count: ${party.media.length}`);
            
            // Log warning if processing takes too long (performance canary)
            if (processingTime > 5000) {
                console.warn(`⚠️  Global Party processing took ${processingTime}ms - consider optimization!`);
            }
            
        } else if (isTagParty) {
            // For Tag Party, we need to aggregate ALL media with the tag that has ANY bids
            const tagPartyTag = party.tags && party.tags.length > 0 ? party.tags[0] : null;
            
            if (!tagPartyTag) {
                console.warn(`⚠️  Tag party ${id} has no tags`);
                party.media = [];
            } else {
                console.log(`🏷️  Fetching Tag Party for tag "${tagPartyTag}" - aggregating all media with this tag and bids...`);
                
                // Performance monitoring for Tag Party
                const startTime = Date.now();
                
                // Normalize tag for case-insensitive matching
                const { capitalizeTag } = require('../services/tagPartyService');
                const normalizedTag = capitalizeTag(tagPartyTag);
                const lowerTag = normalizedTag.toLowerCase().trim();
                
                // Find ALL media with this tag that has ANY bids
                const allMediaWithTagAndBids = await Media.find({
                    tags: { 
                        $elemMatch: { 
                            $regex: new RegExp(`^${lowerTag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') 
                        } 
                    },
                    bids: { $exists: true, $ne: [] },
                    status: { $ne: 'vetoed' } // Exclude globally vetoed media
                })
                .populate({
                    path: 'bids',
                    model: 'Bid',
                    match: { status: 'active' }, // ✅ Only populate active bids (exclude vetoed)
                    populate: {
                        path: 'userId',
                        select: 'username profilePic uuid homeLocation secondaryLocation'
                    }
                })
                .populate('globalMediaBidTopUser', 'username profilePic uuid homeLocation secondaryLocation')
                .populate('globalMediaAggregateTopUser', 'username profilePic uuid homeLocation secondaryLocation')
                .populate('addedBy', 'username profilePic uuid homeLocation secondaryLocation');

                // Convert to party media format for consistent frontend handling
                // Recalculate partyMediaAggregate from active bids on-the-fly to ensure accuracy
                party.media = allMediaWithTagAndBids
                    .map(media => {
                        // Filter to only active bids (populate match may not filter all cases)
                        const activeBids = (media.bids || []).filter(bid => bid.status === 'active');
                        
                        // Skip media with no active bids
                        if (activeBids.length === 0) {
                            return null;
                        }
                        
                        // Recalculate globalMediaAggregate from active bids only (in pence)
                        const calculatedGlobalMediaAggregate = activeBids.reduce((sum, bid) => {
                            return sum + (typeof bid.amount === 'number' ? bid.amount : 0);
                        }, 0);
                        
                        // Calculate top bid from active bids
                        const topBid = activeBids.reduce((max, bid) => {
                            return (bid.amount || 0) > (max.amount || 0) ? bid : max;
                        }, activeBids[0] || { amount: 0 });
                        
                        // Calculate user aggregates to find top aggregate user
                        const userAggregates = {};
                        activeBids.forEach(bid => {
                            const userId = bid.userId?._id?.toString() || bid.userId?.toString();
                            if (userId) {
                                if (!userAggregates[userId]) {
                                    userAggregates[userId] = {
                                        userId: bid.userId?._id || bid.userId,
                                        total: 0
                                    };
                                }
                                userAggregates[userId].total += (bid.amount || 0);
                            }
                        });
                        
                        // Find user with highest aggregate
                        const topAggregateUser = Object.values(userAggregates).reduce(
                            (max, user) => user.total > max.total ? user : max,
                            { total: 0, userId: null }
                        );
                        
                        return {
                            mediaId: media,
                            media_uuid: media.uuid,
                            addedBy: media.addedBy?._id || media.addedBy,
                            // Use calculated aggregate from active bids (accurate, not stale)
                            partyMediaAggregate: calculatedGlobalMediaAggregate,
                            partyBids: activeBids, // Only include active bids
                            status: 'active',
                            queuedAt: media.createdAt || new Date(),
                            partyMediaBidTop: topBid.amount || 0,
                            partyMediaBidTopUser: topBid.userId?._id || topBid.userId || null,
                            partyMediaAggregateTop: topAggregateUser.total || 0,
                            partyMediaAggregateTopUser: topAggregateUser.userId || null
                        };
                    })
                    .filter(media => media !== null); // Remove media with no active bids
                
                // For tag parties, calculate partiers as all unique users who have tipped on media
                const User = require('../models/User');
                const uniqueUserIds = new Set();
                party.media.forEach(mediaEntry => {
                    const bids = mediaEntry.partyBids || [];
                    bids.forEach(bid => {
                        if (bid && bid.userId) {
                            const userId = bid.userId._id?.toString() || bid.userId.toString();
                            if (userId) {
                                uniqueUserIds.add(userId);
                            }
                        }
                    });
                });
                
                // Populate partiers with all unique users who have tipped
                if (uniqueUserIds.size > 0) {
                    const partierUsers = await User.find({ _id: { $in: Array.from(uniqueUserIds) } })
                        .select('username uuid')
                        .lean();
                    party.partiers = partierUsers;
                } else {
                    party.partiers = [];
                }
                
                // Set host to Tuneable user
                party.host = await User.findOne({ username: 'Tuneable' }).select('username uuid').lean();
                
                // Performance monitoring - log Tag Party metrics
                const endTime = Date.now();
                const processingTime = endTime - startTime;
                console.log(`🏷️  Tag Party Performance Metrics:`);
                console.log(`   - Tag: "${normalizedTag}"`);
                console.log(`   - Processing time: ${processingTime}ms`);
                console.log(`   - Media count: ${party.media.length}`);
                console.log(`   - Partiers count: ${party.partiers.length}`);
                
                // Log warning if processing takes too long (performance canary)
                if (processingTime > 5000) {
                    console.warn(`⚠️  Tag Party processing took ${processingTime}ms - consider optimization!`);
                }
            }
            
        } else {
            // Regular party fetching logic
            party = await Party.findById(id)
            .populate({
                path: 'media.mediaId',
                model: 'Media',
                select: 'title artist duration coverArt sources globalMediaAggregate bids addedBy tags category globalMediaBidTop globalMediaBidTopUser globalMediaAggregateTop globalMediaAggregateTopUser featuring creatorDisplay', // ✅ Updated to schema grammar field names
                populate: [
                    {
                        path: 'bids',
                        model: 'Bid',
                        match: { status: 'active' }, // ✅ Only populate active bids (exclude vetoed)
                        populate: {
                            path: 'userId',
                            select: 'username profilePic uuid homeLocation secondaryLocation',  // ✅ Added profilePic, uuid, and location for top bidders display
                        },
                    },
                    {
                        path: 'globalMediaBidTopUser',
                        model: 'User',
                        select: 'username profilePic uuid homeLocation secondaryLocation'
                    },
                    {
                        path: 'globalMediaAggregateTopUser',
                        model: 'User',
                        select: 'username profilePic uuid homeLocation secondaryLocation'
                    },
                    {
                        path: 'artist.userId',
                        model: 'User',
                        select: 'username profilePic uuid creatorProfile.artistName'
                    },
                    {
                        path: 'artist.collectiveId',
                        model: 'Collective',
                        select: 'name slug profilePicture verificationStatus'
                    },
                    {
                        path: 'featuring.userId',
                        model: 'User',
                        select: 'username profilePic uuid creatorProfile.artistName'
                    }
                ]
            })
            .populate({
                path: 'media.partyMediaBidTopUser',
                model: 'User',
                select: 'username profilePic uuid homeLocation secondaryLocation'
            })
            .populate({
                path: 'media.partyMediaAggregateTopUser',
                model: 'User',
                select: 'username profilePic uuid homeLocation secondaryLocation'
            })
            .populate({
                path: 'media.vetoedBy',
                select: 'username uuid'
            })
            .populate({
                path: 'media.partyBids',
                model: 'Bid',
                match: { status: 'active' }, // ✅ Only populate active bids (exclude vetoed)
                populate: {
                    path: 'userId',
                    select: 'username profilePic uuid homeLocation secondaryLocation'
                }
            })
            .populate({
                path: 'partiers',
                model: 'User',
                select: 'username uuid',
            })
            .populate({
                path: 'host',
                model: 'User',
                select: 'username uuid',  // ✅ Include uuid for isHost comparison
            })
            .populate({
                path: 'kickedUsers.userId',
                model: 'User',
                select: 'username uuid',
            })
            .populate({
                path: 'kickedUsers.kickedBy',
                model: 'User',
                select: 'username uuid',
            });
            
            // ✅ Filter out deleted users from partiers array (populate returns null for deleted users)
            if (party.partiers && Array.isArray(party.partiers)) {
                party.partiers = party.partiers.filter(partier => partier !== null && partier !== undefined);
            }
        }

        if (!party) {
            return res.status(404).json({ error: 'Party not found' });
        }

        // Check if party is private and user is not authenticated or not joined
        if (party.privacy === 'private' && !isRequestingGlobalParty) {
            if (!userId) {
                return res.status(403).json({ 
                    error: 'Private party', 
                    message: 'This is a private party. Please log in and join to view it.' 
                });
            }
            
            // Check if user is host, partier, or has joined
            const User = require('../models/User');
            const user = await User.findById(userId).select('joinedParties');
            const joinedPartyIds = user?.joinedParties?.map(jp => jp.partyId.toString()) || [];
            const isHost = party.host.toString() === userId.toString();
            const isPartier = party.partiers.some(p => {
                if (!p) return false;
                const partierId = typeof p === 'object' ? p._id.toString() : p.toString();
                return partierId === userId.toString();
            });
            const hasJoined = joinedPartyIds.includes(party._id.toString());
            
            if (!isHost && !isPartier && !hasJoined) {
                return res.status(403).json({ 
                    error: 'Access denied', 
                    message: 'You must join this private party to view it.' 
                });
            }
        }

        console.log('Fetched Party Details:', JSON.stringify(party, null, 2));

        // ✅ **Flatten `mediaId` structure & extract platform URLs with PARTY-SPECIFIC bid values and status**
        const processedMedia = party.media.map((entry) => {
            if (!entry.mediaId) return null; // Edge case: skip invalid entries

            // ✅ Convert sources Map to plain object (for consistent frontend handling)
            let sourcesObj = {};
            if (entry.mediaId.sources) {
                if (entry.mediaId.sources instanceof Map) {
                    // Convert Map to plain object
                    console.log(`📼 Converting Map sources for media: ${entry.mediaId.title}`);
                    entry.mediaId.sources.forEach((value, key) => {
                        if (value) sourcesObj[key] = value;
                    });
                } else if (typeof entry.mediaId.sources === 'object') {
                    // Already an object, just copy and filter null values
                    Object.entries(entry.mediaId.sources).forEach(([key, value]) => {
                        if (value) sourcesObj[key] = value;
                    });
                }
                console.log(`📼 Sources for "${entry.mediaId.title}":`, Object.keys(sourcesObj).join(', '));
            }

            return {
                _id: entry.mediaId._id,
                id: entry.mediaId._id || entry.mediaId.uuid, // Use ObjectId first, fallback to UUID
                uuid: entry.mediaId._id || entry.mediaId.uuid, // Also include uuid field for consistency
                title: entry.mediaId.title,
                artist: Array.isArray(entry.mediaId.artist) && entry.mediaId.artist.length > 0 
                    ? entry.mediaId.artist[0].name 
                    : (entry.mediaId.artist || 'Unknown Artist'), // Backward compatibility string
                artists: Array.isArray(entry.mediaId.artist) ? entry.mediaId.artist : [], // Full artist array with userIds for ClickableArtistDisplay
                featuring: entry.mediaId.featuring || [], // Featuring artists array
                creatorDisplay: entry.mediaId.creatorDisplay, // Creator display string
                duration: entry.mediaId.duration || '666',
                coverArt: entry.mediaId.coverArt || DEFAULT_COVER_ART,
                sources: sourcesObj, // ✅ Store sources as object { youtube: '...', upload: '...' }
                globalMediaAggregate: entry.mediaId.globalMediaAggregate || 0, // Global total (schema grammar)
                partyMediaAggregate: entry.partyMediaAggregate || 0, // ✅ Party-media aggregate (schema grammar)
                bids: entry.partyBids || [], // ✅ Use party-specific bids (PartyUserMediaAggregate) instead of global bids
                addedBy: entry.mediaId.addedBy, // ✅ Ensures `addedBy` exists
                totalBidValue: entry.partyMediaAggregate || 0, // ✅ Use party-media aggregate for queue ordering
                tags: entry.mediaId.tags || [], // ✅ Include tags
                category: entry.mediaId.category || 'Unknown', // ✅ Include category
                
                // Party-media top bid metrics (schema grammar)
                partyMediaBidTop: entry.partyMediaBidTop || 0,
                partyMediaBidTopUser: entry.partyMediaBidTopUser,
                partyMediaAggregateTop: entry.partyMediaAggregateTop || 0,
                partyMediaAggregateTopUser: entry.partyMediaAggregateTopUser,
                
                // Global media top bid metrics (schema grammar)
                globalMediaBidTop: entry.mediaId.globalMediaBidTop || 0,
                globalMediaBidTopUser: entry.mediaId.globalMediaBidTopUser,
                globalMediaAggregateTop: entry.mediaId.globalMediaAggregateTop || 0,
                globalMediaAggregateTopUser: entry.mediaId.globalMediaAggregateTopUser,
                
                // ✅ NEW: Song status and timing information
                status: entry.status || 'active',
                queuedAt: entry.queuedAt,
                playedAt: entry.playedAt,
                completedAt: entry.completedAt,
                vetoedAt: entry.vetoedAt,
                vetoedBy: entry.vetoedBy ? (typeof entry.vetoedBy === 'object' ? entry.vetoedBy.username : entry.vetoedBy) : null,
                vetoedBy_uuid: entry.vetoedBy && typeof entry.vetoedBy === 'object' ? entry.vetoedBy.uuid : null,
                vetoedReason: entry.vetoedReason,
            };
        }).filter(Boolean); // ✅ Remove null entries (but keep vetoed media for frontend to display)

        // ✅ Sort media by bid value (active media first, then vetoed)
        processedMedia.sort((a, b) => {
            // First, sort by status (active first, then vetoed)
            if (a.status === 'active' && b.status !== 'active') return -1;
            if (a.status !== 'active' && b.status === 'active') return 1;
            // Then sort by bid value (highest first)
            return (b.totalBidValue || 0) - (a.totalBidValue || 0);
        });

        // ✅ **Return a cleaned response (don't overwrite `party.songs`)**
        const responseParty = {
            _id: party._id,
            name: party.name,
            location: party.location,
            host: party.host,
            partyCode: party.partyCode,
            partiers: party.partiers,
            kickedUsers: party.kickedUsers || [], // ✅ Include kicked users
            startTime: party.startTime,
            endTime: party.endTime,
            watershed: party.watershed,
            type: party.type,
            status: party.status,
            mediaSource: party.mediaSource,
            tags: party.tags || [], // ✅ Include tags
            description: party.description || '', // ✅ Include description
            slug: party.slug || null, // ✅ Include slug for tag parties
            privacy: party.privacy || 'public', // ✅ Include privacy
            minimumBid: party.minimumBid || 0.33, // ✅ Include minimumBid
            createdAt: party.createdAt,
            updatedAt: party.updatedAt,
            media: processedMedia, // ✅ Return flattened, sorted media
        };

        res.status(200).json({
            message: 'Party details fetched successfully',
            party: responseParty,
        });
    } catch (err) {
        console.error('Error fetching party details:', err.message);
        res.status(500).json({ error: 'Failed to fetch party details', details: err.message });
    }
});

// What3words functionality removed for now
// router.post('/convert-to-3wa', async (req, res) => {
//     const { lat, lon } = req.body;
//     try {
//         const response = await w3w.convertTo3wa({ lat, lon });
//         res.json({ what3words: response.words });
//     } catch (error) {
//         handleError(res, error, 'Error converting to What3words');
//     }
// });

// What3words functionality removed for now
// router.post('/convert-to-coordinates', async (req, res) => {
//     const { words } = req.body;
//     try {
//         const response = await w3w.convertToCoordinates({ words });
//         res.json({ lat: response.coordinates.lat, lon: response.coordinates.lng });
//     } catch (error) {
//         handleError(res, error, 'Error converting from What3words');
//     }
// });

// Google Maps: Convert address to lat/lon
router.post('/geocode-address', async (req, res) => {
    const { address } = req.body;
    try {
        const response = await axios.get(
            `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${GOOGLE_MAPS_API_KEY}`
        );
        const location = response.data.results[0]?.geometry?.location;
        if (!location) return res.status(400).json({ error: 'Invalid address' });

        res.json({ lat: location.lat, lon: location.lng });
    } catch (error) {
        handleError(res, error, 'Error geocoding address');
    }
});

/**
 * Route: GET /:partyId/search
 * Search within party queue media
 * Access: Protected
 */
router.get('/:partyId/search', authMiddleware, resolvePartyId(), async (req, res) => {
    try {
        const { partyId } = req.params;
        const { q } = req.query;

        if (!q || typeof q !== 'string') {
            return res.status(400).json({ error: 'Search query (q) is required' });
        }

        // Check if this is the Global Party
        const isGlobalParty = await Party.getGlobalParty();
        const isRequestingGlobalParty = isGlobalParty && isGlobalParty._id.toString() === partyId;

        let party;
        
        // Check if this is a tag party
        party = await Party.findById(partyId);
        const isTagParty = party && party.type === 'tag';
        
        if (isRequestingGlobalParty) {
            // For Global Party, search through ALL media with ANY bids
            console.log('🌍 Searching Global Party - searching all media with bids...');
            
            const Media = require('../models/Media');
            const allMediaWithBids = await Media.find({
                bids: { $exists: true, $ne: [] },
                status: { $ne: 'vetoed' } // Exclude globally vetoed media
            }).select('title artist duration coverArt sources globalMediaAggregate tags category uuid contentType contentForm');
            
            // Convert to party format for consistent handling
            party = {
                media: allMediaWithBids.map(media => ({
                    mediaId: media
                }))
            };
        } else if (isTagParty) {
            // For Tag Party, search through ALL media with the tag that has ANY bids
            const tagPartyTag = party.tags && party.tags.length > 0 ? party.tags[0] : null;
            
            if (!tagPartyTag) {
                party.media = [];
            } else {
                console.log(`🏷️  Searching Tag Party for tag "${tagPartyTag}" - searching all media with this tag and bids...`);
                
                const Media = require('../models/Media');
                const { capitalizeTag } = require('../services/tagPartyService');
                const normalizedTag = capitalizeTag(tagPartyTag);
                const lowerTag = normalizedTag.toLowerCase().trim();
                
                const allMediaWithTagAndBids = await Media.find({
                    tags: { 
                        $elemMatch: { 
                            $regex: new RegExp(`^${lowerTag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') 
                        } 
                    },
                    bids: { $exists: true, $ne: [] },
                    status: { $ne: 'vetoed' } // Exclude globally vetoed media
                }).select('title artist duration coverArt sources globalMediaAggregate tags category uuid contentType contentForm');
                
                // Convert to party format for consistent handling
                party = {
                    media: allMediaWithTagAndBids.map(media => ({
                        mediaId: media
                    }))
                };
            }
        } else {
            // Regular party search logic
            party = await Party.findById(partyId)
                .populate({
                    path: 'media.mediaId',
                    model: 'Media',
                    select: 'title artist duration coverArt sources globalMediaAggregate tags category uuid contentType contentForm'
                });
        }

        if (!party) {
            return res.status(404).json({ error: 'Party not found' });
        }

        // Search through party media
        const searchTerms = q.toLowerCase().split(' ').filter(t => t.trim());
        const matchingMedia = [];

        party.media.forEach(mediaEntry => {
            const media = mediaEntry.mediaId;
            if (!media) return;

            // Check if ANY search term matches
            const hasMatch = searchTerms.some(term => {
                const title = (media.title || '').toLowerCase();
                const artist = Array.isArray(media.artist)
                    ? media.artist.map(a => a.name || '').join(' ').toLowerCase()
                    : '';
                const tags = Array.isArray(media.tags)
                    ? media.tags.join(' ').toLowerCase()
                    : '';
                const category = (media.category || '').toLowerCase();

                return title.includes(term) ||
                       artist.includes(term) ||
                       tags.includes(term) ||
                       category.includes(term);
            });

            if (hasMatch) {
                matchingMedia.push({
                    id: media._id,
                    uuid: media.uuid,
                    title: media.title,
                    artist: Array.isArray(media.artist) && media.artist.length > 0
                        ? media.artist[0].name
                        : 'Unknown Artist',
                    coverArt: media.coverArt,
                    duration: media.duration,
                    sources: media.sources,
                    globalMediaAggregate: media.globalMediaAggregate || 0,
                    partyMediaAggregate: mediaEntry.partyMediaAggregate || 0,
                    tags: media.tags,
                    category: media.category,
                    status: mediaEntry.status
                });
            }
        });

        res.json({
            success: true,
            results: matchingMedia,
            count: matchingMedia.length,
            query: q
        });

    } catch (err) {
        handleError(res, err, 'Failed to search party queue');
    }
});

// Route 1: Add new media to party with initial bid
router.post('/:partyId/media/add', authMiddleware, resolvePartyId(), async (req, res) => {
    try {
        const { partyId } = req.params;
        const { url, title, artist, bidAmount, platform, duration, tags, category } = req.body;
        const userId = req.user._id;

        if (!mongoose.isValidObjectId(partyId)) {
            return res.status(400).json({ error: 'Invalid partyId format' });
        }

        if (bidAmount <= 0) {
            return res.status(400).json({ error: 'Bid amount must be greater than 0' });
        }

        // Get party and check minimum bid
        const party = await Party.findById(partyId).populate('host', 'username uuid');
        if (!party) {
            return res.status(404).json({ error: 'Party not found' });
        }

        if (bidAmount < party.minimumBid) {
            return res.status(400).json({ 
                error: `Bid amount must be at least £${party.minimumBid}`,
                minimumBid: party.minimumBid,
                providedBid: bidAmount
            });
        }

        // Check user balance
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Convert bid amount from pounds to pence (user input is in pounds)
        const bidAmountPence = Math.round(bidAmount * 100);
        
        // Balance is already stored in pence
        if (user.balance < bidAmountPence) {
            return res.status(400).json({ 
                error: 'Insufficient balance',
                required: bidAmount,
                available: user.balance / 100  // Convert to pounds for error message
            });
        }

        // Extract cover art and duration
        const { getYouTubeThumbnailFromUrl } = require('../utils/youtubeUtils');
        const { DEFAULT_COVER_ART } = require('../utils/coverArtUtils');
        
        let extractedCoverArt = DEFAULT_COVER_ART;
        let extractedDuration = duration || 180;

        if (platform === 'youtube' && url) {
            const thumbnail = getYouTubeThumbnailFromUrl(url);
            if (thumbnail) {
                extractedCoverArt = thumbnail;
            }
            
            // Extract video ID for getting duration
            const { extractYouTubeVideoId } = require('../utils/youtubeUtils');
            const videoId = extractYouTubeVideoId(url);
            if (videoId) {
                try {
                    const videoDetails = await getVideoDetails(videoId);
                    extractedDuration = videoDetails.duration || duration || 180;
                    // Note: We no longer use videoDetails.tags - only user-provided tags are used
                } catch (error) {
                    console.error('Error fetching video details:', error);
                }
            }
        }

        // Use only user-provided tags (no extraction from YouTube)
        // Capitalize tags for consistent display
        let videoTags = Array.isArray(tags) ? tags.map(tag => capitalizeTag(tag)) : [];
        let videoCategory = category || 'Unknown';
        
        // Check if media already exists to prevent duplicates
        let existingMedia = null;

        // First, try to find by URL (most reliable)
        if (url) {
            existingMedia = await Media.findOne({
                $or: [
                    { 'sources.youtube': url },
                    { 'sources.upload': url }
                ]
            });
        }

        // If not found by URL, try to find by title + artist
        if (!existingMedia) {
            existingMedia = await Media.findOne({
                title: title,
                'artist.name': artist
            });
        }

        let media;
        if (existingMedia) {
            // Use existing media
            media = existingMedia;
            // Merge tags if provided
            if (videoTags && videoTags.length > 0) {
                media.tags = mergeTags(media.tags, videoTags);
                console.log(`✅ Merged tags into existing media: "${media.title}" (${media._id})`);
            }
            console.log(`✅ Using existing media: "${media.title}" (${media._id})`);
        } else {
            // Create new media item
            const mediaData = {
                title,
                artist: [{ name: artist, userId: null, verified: false }],
                coverArt: extractedCoverArt,
                duration: extractedDuration,
                sources: { [platform]: url },
                tags: videoTags,
                category: videoCategory,
                addedBy: userId,
                globalMediaAggregate: bidAmountPence, // Store in pence (schema grammar)
                contentType: 'music',
                contentForm: 'tune'
            };

            // Store original YouTube metadata if this is a YouTube video
            if (platform === 'youtube' && url) {
                const { extractYouTubeVideoId } = require('../utils/youtubeUtils');
                const videoId = extractYouTubeVideoId(url);
                if (videoId) {
                    mediaData.externalIds = { youtube: videoId };
                    // Store original YouTube data for refresh tracking
                    mediaData.youtubeMetadata = {
                        originalTitle: title, // Store original title from YouTube
                        originalThumbnail: extractedCoverArt, // Store original thumbnail
                        isAvailable: true,
                        availabilityCheckedAt: new Date()
                    };
                }
            }

            media = new Media(mediaData);
            
            console.log(`✅ Created new media: "${media.title}" (${media._id})`);
        }

        // Check if media is globally vetoed (after finding/creating media)
        if (media.status === 'vetoed') {
            return res.status(403).json({ 
                error: `"${media.title}" has been globally vetoed and cannot be added to any party.`,
                mediaId: media._id,
                mediaTitle: media.title,
                vetoedAt: media.vetoedAt,
                vetoedBy: media.vetoedBy
            });
        }

        // Calculate queue context
        const queuedMedia = party.media.filter(m => m.status === 'active');
        const queueSize = queuedMedia.length;
        const queuePosition = queueSize + 1; // This new media will be at the end

        // Detect platform from user-agent (don't use 'platform' from req.body as it's the media platform like 'youtube')
        const userAgent = req.headers['user-agent'] || '';
        let detectedPlatform = 'unknown';
        if (userAgent.includes('Mobile')) detectedPlatform = 'mobile';
        else if (userAgent.includes('Tablet')) detectedPlatform = 'tablet';
        else if (userAgent.includes('Mozilla') || userAgent.includes('Chrome')) detectedPlatform = 'web';

        // For initial bids, user aggregates are just the bid amount (no previous bids)
        // Store in pence
        const userPartyAggregate = bidAmountPence; // First bid in this party
        const userGlobalAggregate = bidAmountPence; // First bid globally
        
        // Create bid record with denormalized fields and aggregate tracking
        // Store amount in pence (convert from pounds input)
        const bid = new Bid({
            userId,
            partyId,
            mediaId: media._id, // Use mediaId instead of songId
            amount: bidAmountPence, // Store in pence
            status: 'active',
            bidScope: (party.type === 'global' || party.type === 'tag') ? 'global' : 'party', // Set bidScope based on party type
            
            // Required denormalized fields
            username: user.username,
            partyName: party.name,
            mediaTitle: media.title,
            partyType: party.type,
            
            // Recommended fields
            mediaArtist: Array.isArray(media.artist) && media.artist.length > 0 ? media.artist[0].name : 'Unknown Artist',
            mediaCoverArt: media.coverArt,
            isInitialBid: true, // This is adding new media to party
            queuePosition: queuePosition,
            queueSize: queueSize,
            mediaContentType: media.contentType,
            mediaContentForm: media.contentForm,
            mediaDuration: media.duration,
            platform: detectedPlatform,
            
            // Note: Aggregate values are computed dynamically by BidMetricsEngine
            // and are no longer stored in the Bid model
        });

        await bid.save();

        // Allocate artist escrow for this bid (async, don't block response)
        try {
          const artistEscrowService = require('../services/artistEscrowService');
          artistEscrowService.allocateEscrowForBid(bid._id, media._id, bidAmountPence).catch(error => {
            console.error('Failed to allocate escrow for bid:', bid._id, error);
            // Don't fail the bid if escrow allocation fails - log and continue
          });
        } catch (error) {
          console.error('Error setting up escrow allocation:', error);
          // Don't fail the bid if escrow setup fails
        }

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

        // Send email notification for high-value bids
        try {
          await sendHighValueBidNotification(bid, media, user, 10);
        } catch (emailError) {
          console.error('Failed to send high-value bid notification email:', emailError);
          // Don't fail the request if email fails
        }

        // Add bid to media's bids array (contains ALL bids regardless of scope)
        media.bids = media.bids || [];
        media.bids.push(bid._id);
        
        await media.save();

        // Check if media is already in the party to prevent duplicates
        const existingPartyMediaEntry = party.media.find(entry => 
            entry.mediaId && entry.mediaId.toString() === media._id.toString()
        );

        let isNewMediaEntry = false;
        if (existingPartyMediaEntry) {
            // Media already exists in party
            if (existingPartyMediaEntry.status === 'active') {
                // Media is already active - just add the bid to existing entry
                // Note: partyMediaAggregate will be recalculated by BidMetricsEngine post-save hook
                // We don't manually update it here to avoid race conditions and ensure vetoed bids are excluded
                existingPartyMediaEntry.partyBids = existingPartyMediaEntry.partyBids || [];
                existingPartyMediaEntry.partyBids.push(bid._id);
                
                // Update top bid if this is higher (this can be done immediately as it's a single value comparison)
                if (bidAmountPence > (existingPartyMediaEntry.partyMediaBidTop || 0)) {
                    existingPartyMediaEntry.partyMediaBidTop = bidAmountPence;
                    existingPartyMediaEntry.partyMediaBidTopUser = userId;
                }
                
                // Note: partyMediaAggregateTop will be recalculated by BidMetricsEngine
                // We don't manually update it here to ensure accuracy
            } else if (existingPartyMediaEntry.status === 'vetoed') {
                // Media was vetoed - reject the attempt to re-add it
                return res.status(403).json({ 
                    error: `"${media.title}" has been vetoed from this party and cannot be added again. Vetoed media remains in the party history but cannot receive new tips.`,
                    mediaId: media._id,
                    mediaTitle: media.title,
                    vetoedAt: existingPartyMediaEntry.vetoedAt,
                    vetoedBy: existingPartyMediaEntry.vetoedBy
                });
            }
        } else {
            // Media not in party - add it
            isNewMediaEntry = true;
            const partyMediaEntry = {
                mediaId: media._id,
                media_uuid: media.uuid,
                addedBy: userId,
                partyMediaAggregate: bidAmountPence, // Initial value - will be recalculated by BidMetricsEngine
                partyBids: [bid._id],
                status: 'active',
                queuedAt: new Date(),
                // Top bid tracking (first bid is automatically the top bid) - schema grammar
                partyMediaBidTop: bidAmountPence, // Store in pence
                partyMediaBidTopUser: userId,
                partyMediaAggregateTop: userPartyAggregate, // Initial value - will be recalculated by BidMetricsEngine
                partyMediaAggregateTopUser: userId
            };

            party.media.push(partyMediaEntry);
        }
        
        // Fix any legacy 'queued' statuses in all media entries before saving
        party.media.forEach(entry => {
          if (entry.status && entry.status !== 'active' && entry.status !== 'vetoed') {
            entry.status = 'active';
          }
        });
        
        await party.save();

        // Update global bid tracking - only update if this is a new top bid or new media
        // Store in pence
        const previousTopBidAmount = media.globalMediaBidTop || 0; // Already in pence
        const wasNewTopBid = bidAmountPence > previousTopBidAmount;
        
        if (wasNewTopBid || isNewMediaEntry) {
            // Only update if this is a new top bid or it's completely new media
            media.globalMediaBidTop = bidAmountPence;
            media.globalMediaBidTopUser = userId;
            media.globalMediaAggregateTop = userGlobalAggregate;
            media.globalMediaAggregateTopUser = userId;
        }
        
        // Save media once with all changes (tags, bids, global bid tracking)
        // This ensures tags are preserved through all modifications
        await media.save();
        console.log(`✅ Saved media with tags: "${media.title}" - tags: [${(media.tags || []).join(', ')}]`);

        // Note: For first tip on new media, the tipper is typically the owner, so no tip_received notification needed

        // Capture PRE balances BEFORE updating
        const userBalancePre = user.balance;
        const mediaAggregatePre = media.globalMediaAggregate || 0;
        
        // Calculate user aggregate PRE (sum of all active bids BEFORE this one)
        // Bid is already required at top of file
        const userBidsPre = await Bid.find({
          userId: userId,
          status: 'active'
        }).lean();
        const userAggregatePre = userBidsPre.reduce((sum, bid) => sum + (bid.amount || 0), 0);
        
        // Create ledger entry FIRST (before balance update) to capture accurate PRE balances
        try {
          const tuneableLedgerService = require('../services/tuneableLedgerService');
          await tuneableLedgerService.createTipEntry({
            userId,
            mediaId: media._id,
            partyId,
            bidId: bid._id,
            amount: bidAmountPence,
            userBalancePre,
            userAggregatePre,
            mediaAggregatePre,
            referenceTransactionId: bid._id,
            metadata: {
              isNewMedia: isNewMediaEntry,
              queuePosition,
              queueSize,
              platform: detectedPlatform
            }
          });
        } catch (error) {
          console.error('Failed to create ledger entry for bid:', bid._id);
          console.error('Ledger error details:', error.message);
          console.error('Ledger error stack:', error.stack);
          // Don't fail the bid if ledger entry fails - log and continue
        }
        
        // THEN update user balance (already in pence, no conversion needed)
        user.balance = user.balance - bidAmountPence;
        await user.save();

        // Populate the response
        const populatedMedia = await Media.findById(media._id)
            .populate({
                path: 'bids',
                populate: {
                    path: 'userId',
                    select: 'username profilePic uuid'
                }
            });

        res.status(201).json({
            message: isNewMediaEntry ? 'Media added to party successfully' : 'Bid added to existing media in party',
            media: populatedMedia,
            bid: bid,
            updatedBalance: user.balance,
            isNewMedia: isNewMediaEntry
        });

    } catch (err) {
        console.error('Error adding media to party:', err);
        res.status(500).json({ error: 'Failed to add media to party', details: err.message });
    }
});

// Route 2: Place bid on existing media in party
router.post('/:partyId/media/:mediaId/bid', authMiddleware, resolvePartyId(), async (req, res) => {
    try {
        const { partyId, mediaId } = req.params;
        const { bidAmount, tags } = req.body;
        const userId = req.user._id;

        if (!mongoose.isValidObjectId(partyId)) {
            return res.status(400).json({ error: 'Invalid partyId format' });
        }

        if (bidAmount <= 0) {
            return res.status(400).json({ error: 'Bid amount must be greater than 0' });
        }

        // Get party and check if media exists in party
        let party = await Party.findById(partyId).populate('media.mediaId');
        if (!party) {
            return res.status(404).json({ error: 'Party not found' });
        }

        // Check if this is the Global Party
        const isGlobalParty = await Party.getGlobalParty();
        const isRequestingGlobalParty = isGlobalParty && isGlobalParty._id.toString() === partyId;

        // Check if this is a tag party
        const isTagParty = party && party.type === 'tag';

        let partyMediaEntry;
        let actualMediaId;
        let populatedMedia;

        if (isRequestingGlobalParty) {
            // For Global Party, media doesn't exist in party.media array
            // We need to find the media directly from the Media collection
            console.log('🌍 Global Party bidding - finding media directly from Media collection');
            
            // Resolve media ID (handle both ObjectId and UUID)
            const Media = require('../models/Media');
            if (mongoose.isValidObjectId(mediaId)) {
                actualMediaId = mediaId;
                populatedMedia = await Media.findById(actualMediaId);
            } else {
                // Try finding by UUID
                populatedMedia = await Media.findOne({ uuid: mediaId });
                if (populatedMedia) {
                    actualMediaId = populatedMedia._id;
                }
            }

            if (!populatedMedia) {
                return res.status(404).json({ error: 'Media not found' });
            }

            // Get active bids for this media to calculate accurate aggregate
            const activeBids = await Bid.find({
                mediaId: populatedMedia._id,
                status: 'active'
            });
            
            // Calculate partyMediaAggregate from active bids (accurate, not stale)
            const calculatedGlobalMediaAggregate = activeBids.reduce((sum, bid) => {
                return sum + (typeof bid.amount === 'number' ? bid.amount : 0);
            }, 0);

            // Create a virtual party media entry for Global Party
            partyMediaEntry = {
                mediaId: populatedMedia._id,
                media_uuid: populatedMedia.uuid,
                partyMediaAggregate: calculatedGlobalMediaAggregate, // Use calculated value from active bids
                partyBids: activeBids, // Only include active bids
                status: 'active'
            };

        } else if (isTagParty) {
            // For Tag Party, media doesn't exist in party.media array
            // We need to find the media directly from the Media collection and verify it has the tag
            console.log('🏷️  Tag Party bidding - finding media directly from Media collection');
            
            // Resolve media ID (handle both ObjectId and UUID)
            const Media = require('../models/Media');
            if (mongoose.isValidObjectId(mediaId)) {
                actualMediaId = mediaId;
                populatedMedia = await Media.findById(actualMediaId);
            } else {
                // Try finding by UUID
                populatedMedia = await Media.findOne({ uuid: mediaId });
                if (populatedMedia) {
                    actualMediaId = populatedMedia._id;
                }
            }

            if (!populatedMedia) {
                return res.status(404).json({ error: 'Media not found' });
            }

            // Verify media has the tag party's tag
            const tagPartyTag = party.tags && party.tags.length > 0 ? party.tags[0] : null;
            if (tagPartyTag) {
                const { capitalizeTag } = require('../services/tagPartyService');
                const normalizedTag = capitalizeTag(tagPartyTag);
                const lowerTag = normalizedTag.toLowerCase().trim();
                const mediaHasTag = populatedMedia.tags && Array.isArray(populatedMedia.tags) && 
                    populatedMedia.tags.some(tag => {
                        const tagLower = typeof tag === 'string' ? tag.toLowerCase().trim() : '';
                        return tagLower === lowerTag;
                    });
                
                if (!mediaHasTag) {
                    return res.status(400).json({ 
                        error: `Media does not have the tag "${normalizedTag}" required for this tag party`,
                        mediaId: actualMediaId,
                        mediaTitle: populatedMedia.title,
                        requiredTag: normalizedTag
                    });
                }
            }

            // Get active bids for this media to calculate accurate aggregate
            const activeBids = await Bid.find({
                mediaId: actualMediaId,
                status: 'active'
            })
            .populate('userId', 'username profilePic uuid homeLocation secondaryLocation');

            // Calculate aggregate from active bids only (in pence)
            const calculatedGlobalMediaAggregate = activeBids.reduce((sum, bid) => {
                return sum + (typeof bid.amount === 'number' ? bid.amount : 0);
            }, 0);

            // Create a virtual party media entry for Tag Party
            partyMediaEntry = {
                mediaId: populatedMedia._id,
                media_uuid: populatedMedia.uuid,
                partyMediaAggregate: calculatedGlobalMediaAggregate, // Use calculated value from active bids
                partyBids: activeBids, // Only include active bids
                status: 'active'
            };

        } else {
            // Regular party logic - find media in party.media array
            if (mongoose.isValidObjectId(mediaId)) {
                partyMediaEntry = party.media.find(entry => 
                    entry.mediaId && entry.mediaId._id.toString() === mediaId
                );
            } else {
                // Try finding by UUID
                partyMediaEntry = party.media.find(entry => 
                    entry.media_uuid === mediaId || (entry.mediaId && entry.mediaId.uuid === mediaId)
                );
            }

            if (!partyMediaEntry) {
                return res.status(404).json({ error: 'Media not found in party queue' });
            }

            actualMediaId = partyMediaEntry.mediaId._id || partyMediaEntry.mediaId;
            populatedMedia = partyMediaEntry.mediaId;

            // Check if media is globally vetoed
            if (populatedMedia.status === 'vetoed') {
                return res.status(403).json({ 
                    error: `"${populatedMedia.title}" has been globally vetoed and cannot receive tips.`,
                    mediaId: actualMediaId,
                    mediaTitle: populatedMedia.title,
                    vetoedAt: populatedMedia.vetoedAt,
                    vetoedBy: populatedMedia.vetoedBy
                });
            }

            // Check if media is vetoed in this party - reject bids on vetoed media
            if (partyMediaEntry.status === 'vetoed') {
                return res.status(403).json({ 
                    error: `"${populatedMedia.title}" has been vetoed from this party and cannot receive tips. Vetoed media remains in the party history but cannot receive new tips.`,
                    mediaId: actualMediaId,
                    mediaTitle: populatedMedia.title,
                    vetoedAt: partyMediaEntry.vetoedAt,
                    vetoedBy: partyMediaEntry.vetoedBy
                });
            }
        }

        // Check minimum bid
        if (bidAmount < party.minimumBid) {
            return res.status(400).json({ 
                error: `Bid amount must be at least £${party.minimumBid}`,
                minimumBid: party.minimumBid,
                providedBid: bidAmount
            });
        }

        // Check user balance
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Convert bid amount from pounds to pence (user input is in pounds)
        const bidAmountPence = Math.round(bidAmount * 100);
        
        // Balance is already stored in pence
        if (user.balance < bidAmountPence) {
            return res.status(400).json({ 
                error: 'Insufficient balance',
                required: bidAmount,
                available: user.balance / 100  // Convert to pounds for error message
            });
        }

        // actualMediaId and populatedMedia are now set above based on party type

        // Calculate queue context
        let queuedMedia, queueSize, queuePosition;
        
        if (isRequestingGlobalParty) {
            // For Global Party, all media is considered "active" and we get it from Media collection
            const Media = require('../models/Media');
            queuedMedia = await Media.find({ bids: { $exists: true, $ne: [] } });
            queueSize = queuedMedia.length;
            queuePosition = queuedMedia.findIndex(m => m._id.toString() === actualMediaId.toString()) + 1;
        } else if (isTagParty) {
            // For Tag Party, get all media with the tag that has bids
            const Media = require('../models/Media');
            const tagPartyTag = party.tags && party.tags.length > 0 ? party.tags[0] : null;
            if (tagPartyTag) {
                const { capitalizeTag } = require('../services/tagPartyService');
                const normalizedTag = capitalizeTag(tagPartyTag);
                const lowerTag = normalizedTag.toLowerCase().trim();
                
                queuedMedia = await Media.find({
                    tags: { 
                        $elemMatch: { 
                            $regex: new RegExp(`^${lowerTag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') 
                        } 
                    },
                    bids: { $exists: true, $ne: [] }
                });
            } else {
                queuedMedia = [];
            }
            queueSize = queuedMedia.length;
            queuePosition = queuedMedia.findIndex(m => m._id.toString() === actualMediaId.toString()) + 1;
        } else {
            // Regular party logic
            queuedMedia = party.media.filter(m => m.status === 'active' && m.mediaId); // Filter out null mediaId entries
            queueSize = queuedMedia.length;
            queuePosition = queuedMedia.findIndex(m => 
                (m.mediaId._id || m.mediaId).toString() === actualMediaId.toString()
            ) + 1; // +1 for 1-indexed position
        }

        // Detect platform from user-agent
        const userAgent = req.headers['user-agent'] || '';
        let detectedPlatform = 'unknown';
        if (userAgent.includes('Mobile')) detectedPlatform = 'mobile';
        else if (userAgent.includes('Tablet')) detectedPlatform = 'tablet';
        else if (userAgent.includes('Mozilla') || userAgent.includes('Chrome')) detectedPlatform = 'web';

        // Note: User aggregate bid values are now computed dynamically by BidMetricsEngine
        // No need to calculate them here as they're not stored in the Bid model
        
        // Create bid record with denormalized fields and aggregate tracking
        const bid = new Bid({
            userId,
            partyId,
            mediaId: actualMediaId, // Use mediaId instead of songId
            amount: bidAmountPence, // Store in pence
            status: 'active',
            bidScope: party.type === 'global' ? 'global' : 'party', // Set bidScope based on party type
            
            // Required denormalized fields
            username: user.username,
            partyName: party.name,
            mediaTitle: populatedMedia.title,
            partyType: party.type,
            
            // Recommended fields
            mediaArtist: Array.isArray(populatedMedia.artist) && populatedMedia.artist.length > 0 ? populatedMedia.artist[0].name : 'Unknown Artist',
            mediaCoverArt: populatedMedia.coverArt,
            isInitialBid: false, // This is boosting existing media in party
            queuePosition: queuePosition > 0 ? queuePosition : null, // null if not found in queue
            queueSize: queueSize,
            mediaContentType: populatedMedia.contentType,
            mediaContentForm: populatedMedia.contentForm,
            mediaDuration: populatedMedia.duration,
            platform: detectedPlatform
            
            // Note: Aggregate values are computed dynamically by BidMetricsEngine
            // and are no longer stored in the Bid model
        });

        await bid.save();

        // Allocate artist escrow for this bid (async, don't block response)
        try {
          const artistEscrowService = require('../services/artistEscrowService');
          artistEscrowService.allocateEscrowForBid(bid._id, populatedMedia._id, bidAmountPence).catch(error => {
            console.error('Failed to allocate escrow for bid:', bid._id, error);
            // Don't fail the bid if escrow allocation fails - log and continue
          });
        } catch (error) {
          console.error('Error setting up escrow allocation:', error);
          // Don't fail the bid if escrow setup fails
        }

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
          if (populatedMedia.label && Array.isArray(populatedMedia.label) && populatedMedia.label.length > 0) {
            // Get all unique labelIds from media's label array
            const labelIds = populatedMedia.label
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

        // Send email notification for high-value bids
        try {
          await sendHighValueBidNotification(bid, populatedMedia, user, 10);
        } catch (emailError) {
          console.error('Failed to send high-value bid notification email:', emailError);
          // Don't fail the request if email fails
        }

        // Update party media entry bid aggregate (schema grammar)
        if (isRequestingGlobalParty || isTagParty) {
            // For Global Party and Tag Party, we don't update the party.media array since it's virtual
            // The media aggregate is updated in the Media model below
            if (isRequestingGlobalParty) {
                console.log('🌍 Global Party bidding - skipping party.media update (virtual)');
            } else {
                console.log('🏷️  Tag Party bidding - skipping party.media update (virtual)');
            }
        } else {
            // Regular party logic - update party media entry
            // Note: partyMediaAggregate will be recalculated by BidMetricsEngine post-save hook
            // We don't manually update it here to avoid race conditions and ensure vetoed bids are excluded
            partyMediaEntry.partyBids = partyMediaEntry.partyBids || [];
            partyMediaEntry.partyBids.push(bid._id);
            // Ensure status is valid (fix any legacy 'queued' status)
            if (partyMediaEntry.status !== 'active' && partyMediaEntry.status !== 'vetoed') {
              partyMediaEntry.status = 'active';
            }
            
            // Fix any legacy 'queued' statuses in all media entries before saving
            party.media.forEach(entry => {
              if (entry.status && entry.status !== 'active' && entry.status !== 'vetoed') {
                entry.status = 'active';
              }
            });
            
            await party.save();
        }

        // Update media global bid value
        const media = await Media.findById(actualMediaId);
        if (media) {
            // Merge tags if provided (tags are already capitalized in mergeTags)
            if (tags && Array.isArray(tags) && tags.length > 0) {
                const tagsBefore = media.tags || [];
                // Capitalize incoming tags before merging
                const capitalizedTags = tags.map(tag => capitalizeTag(tag));
                media.tags = mergeTags(media.tags, capitalizedTags);
                console.log(`✅ Merged tags into media: "${media.title}" (${media._id})`);
                console.log(`   Tags before: [${tagsBefore.join(', ')}]`);
                console.log(`   New tags: [${tags.join(', ')}]`);
                console.log(`   Tags after: [${(media.tags || []).join(', ')}]`);
            }
            
            // Store previous top tip info for outtipped notification
            const previousTopBidAmount = media.globalMediaBidTop || 0; // Already in pence
            const previousTopBidderId = media.globalMediaBidTopUser;
            const wasNewTopBid = bidAmountPence > previousTopBidAmount; // Compare pence to pence
            
            media.globalMediaAggregate = (media.globalMediaAggregate || 0) + bidAmountPence; // Add pence to pence (schema grammar)
            media.bids = media.bids || [];
            media.bids.push(bid._id);
            
            // Update top bid if this is higher
            if (wasNewTopBid) {
                media.globalMediaBidTop = bidAmountPence; // Store in pence
                media.globalMediaBidTopUser = userId;
            }
            
            // Note: media.bids array already contains this bid (added above)
            // No need to maintain separate globalBids array - bidScope field on Bid model is sufficient
            await media.save();
            console.log(`✅ Saved media with tags: "${media.title}" (${media._id}) - final tags: [${(media.tags || []).join(', ')}]`);

            // Send notifications (async, don't block response)
            try {
                const notificationService = require('../services/notificationService');
                
                // Notify media owner if bidder is not the owner
                const mediaOwnerId = media.addedBy?.toString() || media.addedBy?._id?.toString();
                if (mediaOwnerId && mediaOwnerId !== userId.toString()) {
                    notificationService.notifyBidReceived(
                        mediaOwnerId,
                        userId.toString(),
                        actualMediaId.toString(),
                        bid._id.toString(),
                        bidAmount,
                        populatedMedia.title
                    ).catch(err => console.error('Error sending tip received notification:', err));
                }
                
                // Notify previous top tipper if they were outtipped (and it's not the same user)
                if (wasNewTopBid && previousTopBidderId && previousTopBidderId.toString() !== userId.toString()) {
                    notificationService.notifyOutbid(
                        previousTopBidderId.toString(),
                        actualMediaId.toString(),
                        bid._id.toString(),
                        bidAmount,
                        populatedMedia.title
                    ).catch(err => console.error('Error sending outtipped notification:', err));
                }
            } catch (error) {
                console.error('Error setting up notifications:', error);
            }
        }

        // Note: Bid tracking is now handled automatically by BidMetricsEngine
        // via the Bid model's post('save') hook - no need to call manually

        // Capture PRE balances BEFORE updating
        const userBalancePre = user.balance;
        const mediaAggregatePre = media.globalMediaAggregate || 0;
        
        // Calculate user aggregate PRE (sum of all active bids BEFORE this one)
        // Bid is already required at top of file
        const userBidsPre = await Bid.find({
          userId: userId,
          status: 'active'
        }).lean();
        const userAggregatePre = userBidsPre.reduce((sum, bid) => sum + (bid.amount || 0), 0);
        
        // Create ledger entry FIRST (before balance update) to capture accurate PRE balances
        try {
          const tuneableLedgerService = require('../services/tuneableLedgerService');
          await tuneableLedgerService.createTipEntry({
            userId,
            mediaId: actualMediaId,
            partyId,
            bidId: bid._id,
            amount: bidAmountPence,
            userBalancePre,
            userAggregatePre,
            mediaAggregatePre,
            referenceTransactionId: bid._id,
            metadata: {
              queuePosition,
              queueSize,
              platform: detectedPlatform
            }
          });
        } catch (error) {
          console.error('Failed to create ledger entry for bid:', bid._id);
          console.error('Ledger error details:', error.message);
          console.error('Ledger error stack:', error.stack);
          // Don't fail the bid if ledger entry fails - log and continue
        }
        
        // THEN update user balance (already in pence, no conversion needed)
        user.balance = user.balance - bidAmountPence;
        await user.save();

        // Get updated media with bids
        const updatedMedia = await Media.findById(actualMediaId)
            .populate({
                path: 'bids',
                populate: {
                    path: 'userId',
                    select: 'username profilePic uuid'
                }
            });

        res.status(201).json({
            message: 'Bid placed successfully',
            media: updatedMedia,
            bid: bid,
            updatedBalance: user.balance
        });

    } catch (err) {
        console.error('Error placing bid:', err);
        res.status(500).json({ error: 'Failed to place bid', details: err.message });
    }
});

// Mark media as playing (called by web player when media starts)
// Note: Status is now managed per-user in webPlayerStore, this endpoint just broadcasts
router.post('/:partyId/media/:mediaId/play', authMiddleware, resolvePartyId(), async (req, res) => {
    try {
        const { partyId, mediaId } = req.params;
        const userId = req.user._id;

        if (!isValidObjectId(partyId) || !isValidObjectId(mediaId)) {
            return res.status(400).json({ error: 'Invalid partyId or mediaId format' });
        }

        const party = await Party.findById(partyId);
        if (!party) {
            return res.status(404).json({ error: 'Party not found' });
        }

        // Check if user is the host
        if (party.host.toString() !== userId) {
            return res.status(403).json({ error: 'Only the host can start media' });
        }

        const mediaIndex = party.media.findIndex(media => media.mediaId.toString() === mediaId);
        if (mediaIndex === -1) {
            return res.status(404).json({ error: 'Media not found in this party' });
        }

        const mediaEntry = party.media[mediaIndex];
        
        // Can only play active media
        if (mediaEntry.status !== 'active') {
            return res.status(400).json({ error: 'Can only play active media' });
        }

        // Update playedAt timestamp (for tracking purposes)
        mediaEntry.playedAt = new Date();
        await party.save();

        // Broadcast play event via Socket.IO (for notifications, not status control)
        broadcastToParty(partyId.toString(), {
            type: 'MEDIA_STARTED',
            mediaId: mediaId,
            playedAt: mediaEntry.playedAt
        });

        res.json({
            message: 'Media started playing',
            mediaId: mediaId,
            playedAt: mediaEntry.playedAt
        });
    } catch (err) {
        console.error('Error starting media:', err);
        res.status(500).json({ error: 'Error starting media', details: err.message });
    }
});

// Reset all media to queued status (for testing/development)
router.post('/:partyId/media/reset', authMiddleware, resolvePartyId(), async (req, res) => {
    try {
        const { partyId } = req.params;
        const userId = req.user._id;

        if (!isValidObjectId(partyId)) {
            return res.status(400).json({ error: 'Invalid partyId format' });
        }

        const party = await Party.findById(partyId);
        if (!party) {
            return res.status(404).json({ error: 'Party not found' });
        }

        // Check if user is the host
        if (party.host.toString() !== userId) {
            return res.status(403).json({ error: 'Only the host can reset media' });
        }

        // Reset all media to active status
        party.media.forEach(media => {
            media.status = 'active';
            media.playedAt = null;
            media.completedAt = null;
            media.vetoedAt = null;
            media.vetoedBy = null;
        });

        await party.save();

        res.json({
            message: 'All media reset to active status',
            mediaCount: party.media.length
        });
    } catch (err) {
        console.error('Error resetting media:', err);
        res.status(500).json({ error: 'Error resetting media', details: err.message });
    }
});

// Mark media as played (called by web player when media finishes)
router.post('/:partyId/media/:mediaId/complete', authMiddleware, resolvePartyId(), async (req, res) => {
    try {
        const { partyId, mediaId } = req.params;
        const userId = req.user._id;

        if (!isValidObjectId(partyId) || !isValidObjectId(mediaId)) {
            return res.status(400).json({ error: 'Invalid partyId or mediaId format' });
        }

        const party = await Party.findById(partyId);
        if (!party) {
            return res.status(404).json({ error: 'Party not found' });
        }

        // Check if user is the host
        if (party.host.toString() !== userId) {
            return res.status(403).json({ error: 'Only the host can complete media' });
        }

        const mediaIndex = party.media.findIndex(media => media.mediaId.toString() === mediaId);
        if (mediaIndex === -1) {
            return res.status(404).json({ error: 'Media not found in this party' });
        }

        const mediaEntry = party.media[mediaIndex];
        
        console.log(`Attempting to complete media ${mediaId} with status: ${mediaEntry.status}`);
        
        // Can only complete active media
        if (mediaEntry.status !== 'active') {
            console.log(`Media ${mediaId} is in status '${mediaEntry.status}', cannot complete`);
            return res.status(400).json({ error: 'Can only complete active media' });
        }

        // Update completedAt timestamp (status remains 'active' as playback is per-user)
        mediaEntry.completedAt = new Date();

        await party.save();

        // Broadcast completion event via Socket.IO
        console.log(`Broadcasting MEDIA_COMPLETED for media ${mediaId} in party ${partyId}`);
        broadcastToParty(partyId.toString(), {
            type: 'MEDIA_COMPLETED',
            mediaId: mediaId,
            completedAt: mediaEntry.completedAt
        });

        res.json({
            message: 'Media completed',
            mediaId: mediaId,
            completedAt: mediaEntry.completedAt
        });
    } catch (err) {
        console.error('Error completing media:', err);
        res.status(500).json({ error: 'Error completing media', details: err.message });
    }
});

// Get media by status
router.get('/:partyId/media/status/:status', authMiddleware, resolvePartyId(), async (req, res) => {
    try {
        const { partyId, status } = req.params;
        const validStatuses = ['active', 'vetoed'];

        if (!validStatuses.includes(status)) {
            return res.status(400).json({ error: 'Invalid status. Must be one of: ' + validStatuses.join(', ') });
        }

        const party = await Party.findById(partyId)
            .populate('media.addedBy', 'username');
        if (!party) {
            return res.status(404).json({ error: 'Party not found' });
        }

        const mediaWithStatus = party.media.filter(media => media.status === status);
        
        // Sort by party media aggregate (highest first) for all statuses - schema grammar
        mediaWithStatus.sort((a, b) => (b.partyMediaAggregate || 0) - (a.partyMediaAggregate || 0));

        res.json({
            status: status,
            media: mediaWithStatus,
            count: mediaWithStatus.length
        });
    } catch (err) {
        console.error('Error fetching media by status:', err);
        res.status(500).json({ error: 'Error fetching media by status', details: err.message });
    }
});

// Update all party statuses based on current time
router.post('/update-statuses', async (req, res) => {
    try {
        const updatedCount = await Party.updateAllStatuses();
        res.json({ 
            message: 'Party statuses updated successfully', 
            updatedCount: updatedCount 
        });
    } catch (err) {
        console.error('Error updating party statuses:', err);
        res.status(500).json({ error: 'Error updating party statuses', details: err.message });
    }
});

// Skip to next media (remote parties only)
// Note: Accepts mediaId in request body to identify current media (playback is per-user)
router.post('/:partyId/skip-next', authMiddleware, resolvePartyId(), async (req, res) => {
    try {
        const { partyId } = req.params;
        const { mediaId } = req.body; // Current media being skipped
        const userId = req.user._id;

        const party = await Party.findById(partyId).populate('media.mediaId');
        if (!party) {
            return res.status(404).json({ error: 'Party not found' });
        }

        // Only allow for remote parties
        if (party.type !== 'remote') {
            return res.status(400).json({ error: 'Skip functionality only available for remote parties' });
        }

        // Check if user is the host
        if (party.host.toString() !== userId) {
            return res.status(403).json({ error: 'Only the host can skip media' });
        }

        if (!mediaId) {
            return res.status(400).json({ error: 'mediaId is required in request body' });
        }

        // Find current media by mediaId
        const currentMediaIndex = party.media.findIndex(media => 
            media.mediaId && (media.mediaId._id || media.mediaId).toString() === mediaId.toString()
        );

        if (currentMediaIndex === -1) {
            return res.status(404).json({ error: 'Media not found in party' });
        }

        // Update completedAt timestamp for current media
        party.media[currentMediaIndex].completedAt = new Date();

        // Find next active media
        const nextActiveIndex = party.media.findIndex((media, index) => 
            index > currentMediaIndex && media.status === 'active'
        );

        await party.save();

        res.json({ 
            success: true, 
            message: 'Skipped to next media',
            currentMedia: nextActiveIndex !== -1 ? party.media[nextActiveIndex] : null,
            nextMediaId: nextActiveIndex !== -1 ? (party.media[nextActiveIndex].mediaId?._id || party.media[nextActiveIndex].mediaId) : null
        });

    } catch (error) {
        console.error('Error skipping to next media:', error);
        res.status(500).json({ error: 'Failed to skip to next media' });
    }
});

// Skip to previous media (remote parties only)
// Note: Accepts mediaId in request body to identify current media (playback is per-user)
router.post('/:partyId/skip-previous', authMiddleware, resolvePartyId(), async (req, res) => {
    try {
        const { partyId } = req.params;
        const { mediaId } = req.body; // Current media being skipped
        const userId = req.user._id;

        const party = await Party.findById(partyId).populate('media.mediaId');
        if (!party) {
            return res.status(404).json({ error: 'Party not found' });
        }

        // Only allow for remote parties
        if (party.type !== 'remote') {
            return res.status(400).json({ error: 'Skip functionality only available for remote parties' });
        }

        // Check if user is the host
        if (party.host.toString() !== userId) {
            return res.status(403).json({ error: 'Only the host can skip media' });
        }

        if (!mediaId) {
            return res.status(400).json({ error: 'mediaId is required in request body' });
        }

        // Find current media by mediaId
        const currentMediaIndex = party.media.findIndex(media => 
            media.mediaId && (media.mediaId._id || media.mediaId).toString() === mediaId.toString()
        );

        if (currentMediaIndex === -1) {
            return res.status(404).json({ error: 'Media not found in party' });
        }

        // Find previous media with completedAt timestamp (indicating it was played)
        const previousPlayedIndex = party.media.findIndex((media, index) => 
            index < currentMediaIndex && media.completedAt !== null && media.status === 'active'
        );

        await party.save();

        res.json({ 
            success: true, 
            message: 'Skipped to previous media',
            currentMedia: previousPlayedIndex !== -1 ? party.media[previousPlayedIndex] : null,
            previousMediaId: previousPlayedIndex !== -1 ? (party.media[previousPlayedIndex].mediaId?._id || party.media[previousPlayedIndex].mediaId) : null
        });

    } catch (error) {
        console.error('Error skipping to previous media:', error);
        res.status(500).json({ error: 'Failed to skip to previous media' });
    }
});

// End a party (host only)
router.post('/:partyId/end', authMiddleware, resolvePartyId(), async (req, res) => {
    try {
        const { partyId } = req.params;
        const userId = req.user._id;

        if (!isValidObjectId(partyId)) {
            return res.status(400).json({ error: 'Invalid partyId format' });
        }

        const party = await Party.findById(partyId);
        if (!party) {
            return res.status(404).json({ error: 'Party not found' });
        }

        // Check if user is the host
        if (party.host.toString() !== userId) {
            return res.status(403).json({ error: 'Only the host can end the party' });
        }

        // Check if party is already ended
        if (party.status === 'ended') {
            return res.status(400).json({ error: 'Party is already ended' });
        }

        // Update party status to ended
        party.status = 'ended';
        party.endTime = new Date();
        await party.save();

        // Broadcast party ended event via WebSocket
        try {
            broadcastToParty(partyId, {
                type: 'PARTY_ENDED',
                partyId: partyId,
                endedAt: party.endTime
            });
        } catch (broadcastError) {
            console.error('Error broadcasting PARTY_ENDED event:', broadcastError);
            // Don't fail the request if broadcast fails
        }

        res.json({
            message: 'Party ended successfully',
            partyId: partyId,
            endedAt: party.endTime
        });
    } catch (err) {
        console.error('Error ending party:', err);
        res.status(500).json({ error: 'Error ending party', details: err.message });
    }
});

// Veto a media item from a party (party veto or delegates to global veto)
// POST /api/parties/:partyId/media/veto
router.post('/:partyId/media/veto', authMiddleware, resolvePartyId(), async (req, res) => {
    try {
        const { partyId } = req.params;
        const { mediaId, reason } = req.body;
        // Bid, User, and Media are already required at top of file
        const mongoose = require('mongoose');
        const axios = require('axios');

        if (!mediaId) {
            return res.status(400).json({ error: 'mediaId is required in request body' });
        }

        // Find the party
        const party = await Party.findById(partyId);
        if (!party) {
            return res.status(404).json({ error: 'Party not found' });
        }

        // Check if user is the host OR admin
        const isHost = party.host.toString() === req.user._id.toString();
        const isAdmin = req.user.role && req.user.role.includes('admin');
        
        if (!isHost && !isAdmin) {
            return res.status(403).json({ error: 'Only the party host or admin can veto' });
        }

        // If this is the global party, delegate to the global veto endpoint
        // Note: Global veto requires admin permissions
        if (party.type === 'global') {
            // Check if user is admin (required for global veto)
            if (!isAdmin) {
                return res.status(403).json({ 
                    error: 'Only admins can perform global vetoes. Party hosts can only veto media within their specific party.' 
                });
            }
            
            console.log(`🌍 Global party veto detected - delegating to global veto endpoint`);
            
            // Make internal HTTP call to global veto endpoint
            try {
                const baseUrl = process.env.BASE_URL || 'http://localhost:8000';
                const globalVetoUrl = `${baseUrl}/api/media/${mediaId}/veto`;
                
                // Forward the request with the same auth token
                const response = await axios.post(globalVetoUrl, { reason }, {
                    headers: {
                        'Authorization': req.headers.authorization,
                        'Content-Type': 'application/json'
                    }
                });
                
                // Return the response from global veto endpoint
                return res.json({
                    ...response.data,
                    vetoType: 'global',
                    delegated: true
                });
            } catch (axiosError) {
                // If the global veto endpoint returns an error, forward it
                if (axiosError.response) {
                    return res.status(axiosError.response.status).json(axiosError.response.data);
                }
                throw axiosError;
            }
        }

        // PARTY VETO: Handle party-specific veto logic
        // Resolve actual mediaId first (handle both ObjectId and UUID)
        let actualMediaId = mediaId;
        let mediaDoc = null;
        if (!mongoose.isValidObjectId(mediaId)) {
            mediaDoc = await Media.findOne({ uuid: mediaId });
            if (!mediaDoc) {
                return res.status(404).json({ error: 'Media not found' });
            }
            actualMediaId = mediaDoc._id.toString();
        } else {
            mediaDoc = await Media.findById(mediaId);
            if (!mediaDoc) {
                return res.status(404).json({ error: 'Media not found' });
            }
            actualMediaId = mediaId;
        }

        // Find the media in the party's queue
        let mediaIndex = party.media.findIndex(entry => {
            if (!entry.mediaId) return false;
            
            // Handle populated mediaId (object with _id)
            const entryMediaId = entry.mediaId._id ? entry.mediaId._id.toString() : entry.mediaId.toString();
            const entryUuid = entry.mediaId.uuid || entry.media_uuid;
            
            // Check if mediaId matches (ObjectId format)
            if (mongoose.isValidObjectId(mediaId) && entryMediaId === mediaId) {
                return true;
            }
            
            // Check if UUID matches
            if (entryUuid && entryUuid === mediaId) {
                return true;
            }
            
            // Also check direct mediaId string comparison (for unpopulated references)
            if (entry.mediaId.toString() === mediaId) {
                return true;
            }
            
            return false;
        });

        // For party vetoes, media must be in the party's media array
        if (mediaIndex === -1) {
            return res.status(404).json({ error: 'Media not found in party queue' });
        }

        // Refresh party to ensure we have the latest data
        await party.populate('media.mediaId');
        const mediaEntry = party.media[mediaIndex];
        
        // Ensure actualMediaId is an ObjectId for queries
        const mediaObjectIdForQuery = mongoose.isValidObjectId(actualMediaId) 
            ? new mongoose.Types.ObjectId(actualMediaId)
            : actualMediaId;
        
        // For party veto, only find bids for this specific party
        const bidsToRefund = await Bid.find({
            mediaId: mediaObjectIdForQuery,
            partyId: partyId,
            status: 'active'
        }).populate('userId', 'balance uuid username');
        
        console.log(`🔄 Found ${bidsToRefund.length} bids to refund for vetoed media ${mediaId} in party ${party.name}`);
        
        // Group bids by userId for efficient refunds
        const refundsByUser = new Map();
        
        for (const bid of bidsToRefund) {
            // Skip bids with null or invalid userId (e.g., deleted users)
            if (!bid.userId || !bid.userId._id) {
                console.warn(`⚠️ Skipping bid ${bid._id} - user not found (likely deleted)`);
                // Still mark the bid as vetoed even if we can't refund
                await Bid.findByIdAndUpdate(bid._id, { status: 'vetoed' });
                continue;
            }
            
            const userId = bid.userId._id.toString();
            
            if (!refundsByUser.has(userId)) {
                refundsByUser.set(userId, {
                    user: bid.userId,
                    totalAmount: 0,
                    bidIds: []
                });
            }
            
            const refund = refundsByUser.get(userId);
            refund.totalAmount += bid.amount;
            refund.bidIds.push(bid._id);
        }
        
        // Refund all users and update bid statuses
        const refundPromises = [];
        
        for (const [userId, refund] of refundsByUser) {
            // Get user and media for PRE balances
            const user = await User.findById(userId);
            const media = await Media.findById(mediaId);
            
            if (!user || !media) {
                console.warn(`⚠️ Skipping refund - user or media not found`);
                continue;
            }
            
            // Capture PRE balances BEFORE updating
            const userBalancePre = user.balance || 0;
            const mediaAggregatePre = media.globalMediaAggregate || 0;
            
            // Calculate user aggregate PRE (sum of all active bids BEFORE refund)
            // Bid is already required at top of file
            const userBidsPre = await Bid.find({
              userId: userId,
              status: 'active'
            }).lean();
            const userAggregatePre = userBidsPre.reduce((sum, bid) => sum + (bid.amount || 0), 0);
            
            // Create ledger entries for each bid being refunded BEFORE balance update
            // Process bids in order to maintain accurate balance and aggregate tracking
            let runningUserBalance = userBalancePre;
            let runningUserAggregate = userAggregatePre;
            let runningMediaAggregate = mediaAggregatePre;
            
            for (const bidId of refund.bidIds) {
                try {
                    const bid = await Bid.findById(bidId);
                    if (bid) {
                        const tuneableLedgerService = require('../services/tuneableLedgerService');
                        await tuneableLedgerService.createRefundEntry({
                            userId: user._id,
                            mediaId: media._id,
                            partyId: partyId,
                            bidId: bid._id,
                            amount: bid.amount,
                            userBalancePre: runningUserBalance, // Cumulative balance
                            userAggregatePre: runningUserAggregate, // Adjust per bid
                            mediaAggregatePre: runningMediaAggregate, // Adjust per bid
                            referenceTransactionId: null,
                            metadata: {
                                reason: 'Media vetoed in party',
                                vetoedBy: req.user._id.toString()
                            }
                        });
                        
                        // Update running balances/aggregates for next bid
                        runningUserBalance = runningUserBalance + bid.amount;
                        runningUserAggregate = Math.max(0, runningUserAggregate - bid.amount);
                        runningMediaAggregate = Math.max(0, runningMediaAggregate - bid.amount);
                    }
                } catch (ledgerError) {
                    console.error(`Failed to create ledger entry for refund bid ${bidId}:`, ledgerError);
                    // Don't fail the refund if ledger entry fails
                }
            }
            
            // Refund user balance (add back the amount) AFTER ledger entries are created
            refundPromises.push(
                User.findByIdAndUpdate(userId, {
                    $inc: { balance: refund.totalAmount }
                })
            );
            
            const username = refund.user?.username || 'Unknown User';
            console.log(`💰 Refunding £${(refund.totalAmount / 100).toFixed(2)} to user ${username}`);
            
            // Update all bids for this user to 'vetoed' status
            refundPromises.push(
                Bid.updateMany(
                    { _id: { $in: refund.bidIds } },
                    { 
                        $set: { 
                            status: 'vetoed',
                            vetoedBy: req.user._id,
                            vetoedReason: reason || null,
                            vetoedAt: new Date()
                        } 
                    }
                )
            );
        }
        
        await Promise.all(refundPromises);

        // PARTY VETO: Update party media entry status
        // Recalculate partyMediaAggregate after vetoing bids
        // Since we used updateMany, post-save hooks won't fire, so we need to manually recalculate
        try {
            const bidMetricsEngine = require('../services/bidMetricsEngine');
            const result = await bidMetricsEngine.computeMetric('PartyMediaAggregate', {
                partyId: partyId.toString(),
                mediaId: actualMediaId
            });
            // Update the aggregate to reflect only active bids (vetoed bids are now excluded)
            await Party.findOneAndUpdate(
                {
                    _id: partyId,
                    'media.mediaId': actualMediaId
                },
                {
                    $set: {
                        'media.$.partyMediaAggregate': result.amount || 0
                    }
                }
            );
            console.log(`📊 Recalculated partyMediaAggregate after veto: ${result.amount || 0} pence`);
        } catch (metricError) {
            console.error('Error recalculating partyMediaAggregate after veto:', metricError);
            // Don't fail the veto if metric recalculation fails
        }
        
        // Update party media entry status
        mediaEntry.status = 'vetoed';
        mediaEntry.vetoedAt = new Date();
        mediaEntry.vetoedBy = req.user._id;
        await party.save();
        console.log(`🎉 Applied PARTY veto to media in party: ${party.name}`);

        // Get populated media for notification
        const populatedMedia = await Media.findById(mediaObjectIdForQuery).select('title uuid');
        if (!populatedMedia) {
            console.error(`⚠️ Media ${actualMediaId} not found for notification`);
        }
        
        // Send notifications to all users who bid on this media
        try {
            const notificationService = require('../services/notificationService');
            for (const [userId, refund] of refundsByUser) {
                notificationService.notifyMediaVetoed(
                    userId,
                    actualMediaId,
                    populatedMedia?.title || 'Unknown Media',
                    partyId,
                    party.name,
                    refund.totalAmount,
                    reason || null
                ).catch(err => console.error(`Error sending veto notification to user ${userId}:`, err));
            }
        } catch (notifError) {
            console.error('Error setting up notifications:', notifError);
            // Don't fail the veto if notifications fail
        }

        const totalRefunded = Array.from(refundsByUser.values()).reduce((sum, r) => sum + r.totalAmount, 0);

        res.json({
            message: 'Media vetoed from party successfully',
            vetoType: 'party',
            mediaId: mediaId,
            vetoedAt: mediaEntry.vetoedAt,
            refundedBidsCount: bidsToRefund.length,
            refundedUsersCount: refundsByUser.size,
            refundedAmount: totalRefunded,
            notificationsSent: refundsByUser.size
        });

    } catch (err) {
        console.error('Error vetoing media:', err);
        console.error('Error stack:', err.stack);
        res.status(500).json({ 
            error: 'Error vetoing media', 
            details: err.message,
            stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
        });
    }
});

// Unveto a media item from a party (restore to active, notify users)
router.post('/:partyId/media/:mediaId/unveto', authMiddleware, resolvePartyId(), async (req, res) => {
    try {
        const { partyId, mediaId } = req.params;
        // Bid, User, and Media are already required at top of file
        const notificationService = require('../services/notificationService');
        const mongoose = require('mongoose');

        // Find the party
        const party = await Party.findById(partyId);
        if (!party) {
            return res.status(404).json({ error: 'Party not found' });
        }

        // Check if user is the host OR admin
        const isHost = party.host.toString() === req.user._id.toString();
        const isAdmin = req.user.role && req.user.role.includes('admin');
        
        if (!isHost && !isAdmin) {
            return res.status(403).json({ error: 'Only the party host or admin can unveto media' });
        }

        // Find the media in the party's queue
        const mediaIndex = party.media.findIndex(entry => 
            (entry.mediaId && entry.mediaId.toString() === mediaId) || 
            (entry.media_uuid === mediaId)
        );
        if (mediaIndex === -1) {
            return res.status(404).json({ error: 'Media not found in party queue' });
        }

        const mediaEntry = party.media[mediaIndex];

        // Resolve actual mediaId
        let actualMediaId = mediaId;
        if (!mongoose.isValidObjectId(mediaId)) {
            const mediaDoc = await Media.findOne({ uuid: mediaId });
            if (!mediaDoc) {
                return res.status(404).json({ error: 'Media not found' });
            }
            actualMediaId = mediaDoc._id.toString();
        }

        // Get populated media for title
        const populatedMedia = await Media.findById(actualMediaId).select('title uuid status');
        if (!populatedMedia) {
            return res.status(404).json({ error: 'Media not found' });
        }

        // Check if this is Global Party - handle global unveto
        if (party.type === 'global') {
            // GLOBAL UNVETO: Check if media is globally vetoed
            if (populatedMedia.status !== 'vetoed') {
                return res.status(400).json({ error: 'Media is not globally vetoed' });
            }

            // Remove global veto
            populatedMedia.status = 'active';
            populatedMedia.vetoedAt = null;
            populatedMedia.vetoedBy = null;
            populatedMedia.vetoedReason = null;
            await populatedMedia.save();
            console.log(`🌍 Removed GLOBAL veto from media: ${populatedMedia.title}`);

            // Find all users who had vetoed bids on this media (globally)
            const vetoedBids = await Bid.find({
                mediaId: actualMediaId,
                status: 'vetoed'
            }).populate('userId', 'uuid username');

            const userIds = [...new Set(vetoedBids.map(bid => bid.userId?._id?.toString()).filter(Boolean))];

            // Send notifications
            const notificationPromises = userIds.map(userId => 
                notificationService.notifyMediaUnvetoed(
                    userId,
                    actualMediaId,
                    populatedMedia.title
                ).catch(err => console.error(`Error sending unveto notification to user ${userId}:`, err))
            );
            await Promise.all(notificationPromises);

            return res.json({
                message: 'Global veto removed successfully',
                vetoType: 'global',
                mediaId: actualMediaId,
                mediaTitle: populatedMedia.title,
                note: 'Media can now be added to parties again. Existing party vetoes remain in effect.'
            });
        } else {
            // PARTY UNVETO: Check if media is vetoed in this party
            if (mediaEntry.status !== 'vetoed') {
                return res.status(400).json({ error: 'Media is not vetoed in this party' });
            }

            // Find all users who had vetoed bids on this media in this party
            const vetoedBids = await Bid.find({
                mediaId: actualMediaId,
                partyId: partyId,
                status: 'vetoed'
            }).populate('userId', 'uuid username');

            // Get unique user IDs
            const userIds = [...new Set(vetoedBids.map(bid => bid.userId?._id?.toString()).filter(Boolean))];

            // Restore party media status to active
            mediaEntry.status = 'active';
            mediaEntry.vetoedAt = null;
            mediaEntry.vetoedBy = null;

            await party.save();
            console.log(`🎉 Removed PARTY veto from media in party: ${party.name}`);

            // Send notifications to all users who had vetoed bids
            // Note: We do NOT restore bid statuses - they remain vetoed
            // Users can place new bids if they want
            const notificationPromises = userIds.map(userId => 
                notificationService.notifyMediaUnvetoed(
                    userId,
                    actualMediaId,
                    populatedMedia.title,
                    partyId,
                    party.name
                ).catch(err => console.error(`Error sending unveto notification to user ${userId}:`, err))
            );

            await Promise.all(notificationPromises);

            res.json({
                message: 'Media unvetoed from party successfully',
                vetoType: 'party',
                mediaId: actualMediaId,
                mediaTitle: populatedMedia.title,
                notifiedUsers: userIds.length,
                note: 'Bids remain vetoed. Users can place new bids if they wish.'
            });
        }

    } catch (err) {
        console.error('Error unvetoing media:', err);
        res.status(500).json({ error: 'Error unvetoing media', details: err.message });
    }
});

// Kick a user from a party (host or admin only)
router.post('/:partyId/kick/:userId', authMiddleware, resolvePartyId(), async (req, res) => {
    try {
        const { partyId, userId } = req.params;
        const { reason } = req.body || {};
        const kickerId = req.user._id;
        const mongoose = require('mongoose');
        const { isValidObjectId } = require('mongoose');
        
        // Validate ObjectIds
        if (!isValidObjectId(partyId) || !isValidObjectId(userId)) {
            return res.status(400).json({ error: 'Invalid party or user ID' });
        }
        
        // Find party
        const party = await Party.findById(partyId);
        if (!party) {
            return res.status(404).json({ error: 'Party not found' });
        }
        
        // Check permissions: host or admin only
        const isHost = party.host.toString() === kickerId.toString();
        const isAdmin = req.user.role && req.user.role.includes('admin');
        
        if (!isHost && !isAdmin) {
            return res.status(403).json({ error: 'Only the party host or admin can kick users' });
        }
        
        // Cannot kick self
        if (userId === kickerId.toString()) {
            return res.status(400).json({ error: 'You cannot kick yourself' });
        }
        
        // Cannot kick the host
        if (party.host.toString() === userId) {
            return res.status(400).json({ error: 'Cannot kick the party host' });
        }
        
        // Check if user is already kicked
        const alreadyKicked = party.kickedUsers && party.kickedUsers.some(
            ku => ku.userId && ku.userId.toString() === userId
        );
        
        if (alreadyKicked) {
            return res.status(400).json({ error: 'User is already kicked from this party' });
        }
        
        // Remove user from partiers array
        party.partiers = party.partiers.filter(
            partier => partier.toString() !== userId
        );
        
        // Add to kickedUsers array
        if (!party.kickedUsers) {
            party.kickedUsers = [];
        }
        party.kickedUsers.push({
            userId: userId,
            kickedAt: new Date(),
            kickedBy: kickerId,
            reason: reason || null
        });
        
        await party.save();
        
        // Remove party from user's joinedParties array
        const User = require('../models/User');
        const kickedUser = await User.findById(userId).select('username uuid');
        if (kickedUser) {
            kickedUser.joinedParties = kickedUser.joinedParties.filter(
                jp => jp.partyId.toString() !== partyId
            );
            await kickedUser.save();
        }
        
        // Send notification to kicked user
        const notificationService = require('../services/notificationService');
        if (kickedUser) {
            await notificationService.createNotification({
                userId: userId,
                type: 'warning', // Using existing warning type
                title: 'Removed from Party',
                message: `You have been removed from "${party.name}"${reason ? `. Reason: ${reason}` : ''}`,
                link: `/parties`,
                linkText: 'View Parties',
                relatedPartyId: partyId,
                relatedUserId: kickerId
            }).catch(err => console.error('Error sending kick notification:', err));
        }
        
        // Broadcast kick event via Socket.IO
        try {
            broadcastToParty(partyId, {
                type: 'USER_KICKED',
                userId: userId,
                kickedBy: kickerId,
                reason: reason || null
            });
        } catch (broadcastError) {
            console.error('Error broadcasting USER_KICKED event:', broadcastError);
            // Don't fail the request if broadcast fails
        }
        
        res.json({
            message: 'User kicked successfully',
            kickedUserId: userId,
            kickedUsername: kickedUser?.username || 'Unknown',
            reason: reason || null
        });
        
    } catch (err) {
        console.error('Error kicking user:', err);
        res.status(500).json({ error: 'Error kicking user', details: err.message });
    }
});

// Unkick a user from a party (host or admin only)
router.post('/:partyId/unkick/:userId', authMiddleware, resolvePartyId(), async (req, res) => {
    try {
        const { partyId, userId } = req.params;
        const unkickerId = req.user._id;
        const { isValidObjectId } = require('mongoose');
        
        // Validate ObjectIds
        if (!isValidObjectId(partyId) || !isValidObjectId(userId)) {
            return res.status(400).json({ error: 'Invalid party or user ID' });
        }
        
        const party = await Party.findById(partyId);
        if (!party) {
            return res.status(404).json({ error: 'Party not found' });
        }
        
        // Check permissions
        const isHost = party.host.toString() === unkickerId.toString();
        const isAdmin = req.user.role && req.user.role.includes('admin');
        
        if (!isHost && !isAdmin) {
            return res.status(403).json({ error: 'Only the party host or admin can unkick users' });
        }
        
        // Check if user is actually kicked
        const kickEntry = party.kickedUsers && party.kickedUsers.find(
            ku => ku.userId && ku.userId.toString() === userId
        );
        
        if (!kickEntry) {
            return res.status(400).json({ error: 'User is not kicked from this party' });
        }
        
        // Remove from kickedUsers
        party.kickedUsers = party.kickedUsers.filter(
            ku => ku.userId && ku.userId.toString() !== userId
        );
        
        await party.save();
        
        // Optionally send notification to unkicked user
        const User = require('../models/User');
        const unkickedUser = await User.findById(userId).select('username uuid');
        const notificationService = require('../services/notificationService');
        if (unkickedUser) {
            await notificationService.createNotification({
                userId: userId,
                type: 'party_invite', // Reusing invite type for "you can rejoin" message
                title: 'Party Access Restored',
                message: `You can now rejoin "${party.name}"`,
                link: `/party/${partyId}`,
                linkText: 'View Party',
                relatedPartyId: partyId
            }).catch(err => console.error('Error sending unkick notification:', err));
        }
        
        res.json({
            message: 'User unkicked successfully',
            userId: userId,
            username: unkickedUser?.username || 'Unknown',
            note: 'User can now rejoin the party'
        });
        
    } catch (err) {
        console.error('Error unkicking user:', err);
        res.status(500).json({ error: 'Error unkicking user', details: err.message });
    }
});

// Get media sorted by bid values within specific time periods
router.get('/:partyId/media/sorted/:timePeriod', authMiddleware, resolvePartyId(), async (req, res) => {
    try {
        const { partyId, timePeriod } = req.params;
        const validTimePeriods = ['all-time', 'this-year', 'this-month', 'this-week', 'today'];

        if (!validTimePeriods.includes(timePeriod)) {
            return res.status(400).json({ 
                error: 'Invalid time period. Must be one of: ' + validTimePeriods.join(', ') 
            });
        }

        // Check if this is the Global Party
        const isGlobalParty = await Party.getGlobalParty();
        const isRequestingGlobalParty = isGlobalParty && isGlobalParty._id.toString() === partyId;

        let party;

        if (isRequestingGlobalParty) {
            // For Global Party, we need to aggregate ALL media with ANY bids
            console.log('🌍 Time-based sorting for Global Party - aggregating all media with bids...');
            
            // Get the Global Party object
            party = isGlobalParty;
            
            // For Global Party, we'll handle media aggregation below
        } else {
            // Regular party fetching logic
            party = await Party.findById(partyId)
                .populate({
                    path: 'media.mediaId',
                    model: 'Media',
                    select: 'title artist duration coverArt sources globalMediaAggregate bids addedBy tags category uuid featuring creatorDisplay', // Updated to schema grammar
                    populate: [
                        {
                            path: 'bids',
                            model: 'Bid',
                            populate: {
                                path: 'userId',
                                select: 'username profilePic uuid',
                            },
                        },
                        {
                            path: 'artist.userId',
                            model: 'User',
                            select: 'username profilePic uuid creatorProfile.artistName'
                        },
                        {
                            path: 'artist.collectiveId',
                            model: 'Collective',
                            select: 'name slug profilePicture verificationStatus'
                        },
                        {
                            path: 'featuring.userId',
                            model: 'User',
                            select: 'username profilePic uuid creatorProfile.artistName'
                        }
                    ]
                })
                .populate({
                    path: 'media.partyBids',
                    model: 'Bid',
                    populate: {
                        path: 'userId',
                        select: 'username profilePic uuid homeLocation secondaryLocation'
                    }
                })
                .populate('media.addedBy', 'username');

            if (!party) {
                return res.status(404).json({ error: 'Party not found' });
            }
        }

        // Calculate date ranges
        const now = new Date();
        let startDate = null;

        switch (timePeriod) {
            case 'today':
                startDate = new Date(now.getTime() - (24 * 60 * 60 * 1000)); // 24 hours ago
                break;
            case 'this-week':
                startDate = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000)); // 7 days ago
                break;
            case 'this-month':
                startDate = new Date(now.getTime() - (28 * 24 * 60 * 60 * 1000)); // 28 days ago
                break;
            case 'this-year':
                startDate = new Date(now.getTime() - (365 * 24 * 60 * 60 * 1000)); // 365 days ago
                break;
            case 'all-time':
                startDate = null; // No date filter
                break;
        }

        let bids;
        let allMediaWithBids;

        if (isRequestingGlobalParty) {
            // For Global Party, get bids from ALL parties within the time period
            let bidQuery = { 
                status: 'active' // Only count active bids
            };

            if (startDate) {
                bidQuery.createdAt = { $gte: startDate };
            }

            bids = await Bid.find(bidQuery).select('mediaId amount createdAt partyId');
            
            // Get all media that has bids within the time period
            const Media = require('../models/Media');
            allMediaWithBids = await Media.find({
                bids: { $exists: true, $ne: [] }
            })
            .populate({
                path: 'bids',
                model: 'Bid',
                match: { status: 'active' }, // ✅ Only populate active bids (exclude vetoed)
                populate: {
                    path: 'userId',
                    select: 'username profilePic uuid homeLocation secondaryLocation'
                }
            })
            .populate('globalMediaBidTopUser', 'username profilePic uuid homeLocation secondaryLocation')
            .populate('globalMediaAggregateTopUser', 'username profilePic uuid homeLocation secondaryLocation')
            .populate('addedBy', 'username profilePic uuid homeLocation secondaryLocation')
            .populate({
                path: 'artist.userId',
                model: 'User',
                select: 'username profilePic uuid creatorProfile.artistName'
            })
            .populate({
                path: 'artist.collectiveId',
                model: 'Collective',
                select: 'name slug profilePicture verificationStatus'
            })
            .populate({
                path: 'featuring.userId',
                model: 'User',
                select: 'username profilePic uuid creatorProfile.artistName'
            });

            console.log(`🌍 Global Party time sorting: Found ${bids.length} bids within time period, ${allMediaWithBids.length} media with bids`);
        } else {
            // Regular party logic - get bids for this specific party
            let bidQuery = { 
                partyId: party._id,
                status: 'active' // Only count active bids
            };

            if (startDate) {
                bidQuery.createdAt = { $gte: startDate };
            }

            bids = await Bid.find(bidQuery).select('mediaId amount createdAt');
        }

        // Calculate bid values for each media within the time period
        const mediaBidValues = {};
        bids.forEach(bid => {
            const mediaId = bid.mediaId?.toString();
            if (mediaId) {
                mediaBidValues[mediaId] = (mediaBidValues[mediaId] || 0) + bid.amount;
            }
        });

        let processedMedia;

        if (isRequestingGlobalParty) {
            // For Global Party, process all media with bids
            processedMedia = allMediaWithBids
                .map((media) => {
                    // Filter to only active bids (populate match may not filter all cases)
                    const activeBids = (media.bids || []).filter(bid => bid.status === 'active');
                    
                    // Skip media with no active bids
                    if (activeBids.length === 0) {
                        return null;
                    }
                    
                    // Recalculate globalMediaAggregate from active bids only (in pence)
                    // This ensures accuracy regardless of stale stored values
                    const calculatedGlobalMediaAggregate = activeBids.reduce((sum, bid) => {
                        return sum + (typeof bid.amount === 'number' ? bid.amount : 0);
                    }, 0);
                    
                    const availablePlatforms = Object.entries(media.sources || {})
                        .filter(([key, value]) => value)
                        .map(([key, value]) => ({ platform: key, url: value }));

                    const timePeriodBidValue = mediaBidValues[media._id.toString()] || 0;

                    // Get artist name from Media subdocument array
                    const artistName = Array.isArray(media.artist) && media.artist.length > 0
                        ? media.artist[0].name
                        : 'Unknown Artist';

                    return {
                        _id: media._id,
                        id: media._id || media.uuid, // Use ObjectId first, fallback to UUID
                        uuid: media._id || media.uuid, // Also include uuid field for consistency
                        title: media.title,
                        artist: artistName, // Backward compatibility string
                        artists: Array.isArray(media.artist) ? media.artist : [], // Full artist array with userIds for ClickableArtistDisplay
                        featuring: media.featuring || [], // Featuring artists array
                        creatorDisplay: media.creatorDisplay, // Creator display string
                        duration: media.duration,
                        coverArt: media.coverArt,
                        sources: media.sources,
                        availablePlatforms,
                        globalMediaAggregate: calculatedGlobalMediaAggregate, // Use calculated value (accurate, not stale)
                        partyMediaAggregate: calculatedGlobalMediaAggregate, // For Global Party, use calculated global aggregate
                        timePeriodBidValue, // Bid value for the specific time period
                        bids: activeBids, // Only include active bids for TopBidders component
                        tags: media.tags || [], // Include tags for display
                        category: media.category || null, // Include category for display
                        addedBy: media.addedBy,
                        status: 'active', // Global Party media is always active
                        queuedAt: media.createdAt || new Date(),
                        playedAt: null,
                        completedAt: null,
                        vetoedAt: null,
                        vetoedBy: null,
                        contentType: media.contentType || 'music'
                    };
                })
                .filter(media => media !== null) // Remove media with no active bids
                .sort((a, b) => (b.timePeriodBidValue || 0) - (a.timePeriodBidValue || 0)); // Sort by time period bid value
        } else {
            // Regular party logic - process party media
            processedMedia = party.media
                .map((entry) => {
                    if (!entry.mediaId) return null;

                    const availablePlatforms = Object.entries(entry.mediaId.sources || {})
                        .filter(([key, value]) => value)
                        .map(([key, value]) => ({ platform: key, url: value }));

                    const timePeriodBidValue = mediaBidValues[entry.mediaId._id.toString()] || 0;

                    // Get artist name from Media subdocument array
                    const artistName = Array.isArray(entry.mediaId.artist) && entry.mediaId.artist.length > 0
                        ? entry.mediaId.artist[0].name
                        : 'Unknown Artist';

                    return {
                        _id: entry.mediaId._id,
                        id: entry.mediaId._id || entry.mediaId.uuid, // Use ObjectId first, fallback to UUID
                        uuid: entry.mediaId._id || entry.mediaId.uuid, // Also include uuid field for consistency
                        title: entry.mediaId.title,
                        artist: artistName, // Backward compatibility string
                        artists: Array.isArray(entry.mediaId.artist) ? entry.mediaId.artist : [], // Full artist array with userIds for ClickableArtistDisplay
                        featuring: entry.mediaId.featuring || [], // Featuring artists array
                        creatorDisplay: entry.mediaId.creatorDisplay, // Creator display string
                        duration: entry.mediaId.duration,
                        coverArt: entry.mediaId.coverArt,
                        sources: entry.mediaId.sources,
                        availablePlatforms,
                        globalMediaAggregate: entry.mediaId.globalMediaAggregate || 0, // Schema grammar
                        partyMediaAggregate: entry.partyMediaAggregate || 0, // All-time party-media aggregate (schema grammar)
                        timePeriodBidValue, // Bid value for the specific time period
                        bids: entry.partyBids || [], // Use party-specific bids (PartyUserMediaAggregate) for regular parties
                        tags: entry.mediaId.tags || [], // Include tags for display
                        category: entry.mediaId.category || null, // Include category for display
                        addedBy: entry.addedBy,
                        status: entry.status,
                        queuedAt: entry.queuedAt,
                        playedAt: entry.playedAt,
                        completedAt: entry.completedAt,
                        vetoedAt: entry.vetoedAt,
                        vetoedBy: entry.vetoedBy,
                        contentType: entry.contentType || 'music'
                    };
                })
                .filter(media => media !== null)
                .filter(media => media.status !== 'vetoed') // ✅ Filter out vetoed media
                .sort((a, b) => (b.timePeriodBidValue || 0) - (a.timePeriodBidValue || 0)); // Sort by time period bid value
        }

        res.json({
            timePeriod: timePeriod,
            media: processedMedia,
            count: processedMedia.length,
            periodStartDate: startDate,
            periodEndDate: now
        });

    } catch (err) {
        console.error('Error fetching media sorted by time period:', err);
        res.status(500).json({ 
            error: 'Error fetching media sorted by time period', 
            details: err.message 
        });
    }
});

// @route   PUT /api/parties/:partyId/media/:mediaId/unveto
// @desc    Un-veto a media item (restore to queue) - host only
// @access  Private (host only)
router.put('/:partyId/media/:mediaId/unveto', authMiddleware, resolvePartyId(), async (req, res) => {
    try {
        const { partyId, mediaId } = req.params;
        
        const party = await Party.findById(partyId);
        if (!party) {
            return res.status(404).json({ error: 'Party not found' });
        }
        
        // Check if user is the host
        if (party.host.toString() !== req.user._id.toString()) {
            return res.status(403).json({ error: 'Only the host can un-veto media' });
        }
        
        // Find the media in the party
        const mediaEntry = party.media.find(m => 
            (m.mediaId && m.mediaId.toString() === mediaId) || 
            (m.media_uuid === mediaId)
        );
        
        if (!mediaEntry) {
            return res.status(404).json({ error: 'Media not found in party' });
        }
        
        // Restore media to active status
        mediaEntry.status = 'active';
        mediaEntry.vetoedAt = null;
        mediaEntry.vetoedBy = null;
        
        await party.save();
        
        res.json({
            message: 'Media restored to queue successfully',
            party: party
        });
        
    } catch (err) {
        console.error('Error un-vetoing media:', err);
        res.status(500).json({ 
            error: 'Error un-vetoing media', 
            details: err.message 
        });
    }
});

// @route   GET /api/parties/admin/stats
// @desc    Get party statistics (admin only)
// @access  Private (Admin)
router.get('/admin/stats', authMiddleware, async (req, res) => {
    try {
        // Check if user is admin
        if (!req.user.role || !req.user.role.includes('admin')) {
            return res.status(403).json({ error: 'Admin access required' });
        }

        const activeParties = await Party.countDocuments({ status: 'active' });
        const totalParties = await Party.countDocuments({});
        
        res.json({
            activeParties,
            totalParties
        });
    } catch (error) {
        console.error('Error fetching party stats:', error);
        res.status(500).json({ error: 'Failed to fetch party stats' });
    }
});

// ========================================
// USER TIP REMOVAL & REFUND ROUTES
// ========================================

/**
 * @route   POST /api/parties/:partyId/bids/:bidId/remove
 * @desc    Remove user's own tip (instant refund within 10 minutes)
 * @access  Private (user must own the bid)
 */
router.post('/:partyId/bids/:bidId/remove', authMiddleware, resolvePartyId(), async (req, res) => {
    try {
        const { partyId, bidId } = req.params;
        const userId = req.user._id;
        // Bid, User, and Media are already required at top of file
        const mongoose = require('mongoose');
        const bidMetricsEngine = require('../services/bidMetricsEngine');
        const artistEscrowService = require('../services/artistEscrowService');

        // Validate inputs
        if (!mongoose.isValidObjectId(bidId)) {
            return res.status(400).json({ error: 'Invalid bidId format' });
        }

        // Find the bid
        const bid = await Bid.findById(bidId);
        if (!bid) {
            return res.status(404).json({ error: 'Bid not found' });
        }

        // Check if user owns this bid
        if (bid.userId.toString() !== userId.toString()) {
            return res.status(403).json({ error: 'You can only remove your own tips' });
        }

        // Check if bid is already refunded or vetoed
        if (bid.status !== 'active') {
            return res.status(400).json({ 
                error: `Bid is already ${bid.status}`,
                currentStatus: bid.status
            });
        }

        // Check time window (10 minutes = 600,000 milliseconds)
        const timeSinceBid = Date.now() - new Date(bid.createdAt).getTime();
        const INSTANT_REMOVAL_WINDOW = 10 * 60 * 1000; // 10 minutes

        if (timeSinceBid > INSTANT_REMOVAL_WINDOW) {
            return res.status(400).json({ 
                error: 'Instant removal window has expired. Please use the refund request feature.',
                timeSinceBid: timeSinceBid,
                windowMs: INSTANT_REMOVAL_WINDOW,
                useRefundRequest: true
            });
        }

        // Get user and media
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const media = await Media.findById(bid.mediaId);
        if (!media) {
            return res.status(404).json({ error: 'Media not found' });
        }

        const party = await Party.findById(partyId);
        if (!party) {
            return res.status(404).json({ error: 'Party not found' });
        }

        // Capture PRE balances BEFORE updating
        const userBalancePre = user.balance || 0;
        const mediaAggregatePre = media.globalMediaAggregate || 0;
        
        // Calculate user aggregate PRE (sum of all active bids BEFORE refund)
        // Bid is already required at top of file
        const userBidsPre = await Bid.find({
          userId: userId,
          status: 'active'
        }).lean();
        const userAggregatePre = userBidsPre.reduce((sum, bid) => sum + (bid.amount || 0), 0);
        
        // Create ledger entry FIRST (before balance update) to capture accurate PRE balances
        try {
          const tuneableLedgerService = require('../services/tuneableLedgerService');
          await tuneableLedgerService.createRefundEntry({
            userId: user._id,
            mediaId: media._id,
            partyId: partyId,
            bidId: bid._id,
            amount: bid.amount,
            userBalancePre,
            userAggregatePre,
            mediaAggregatePre,
            referenceTransactionId: null,
            metadata: {
              reason: 'User removed tip within 10-minute window',
              removedBy: userId.toString()
            }
          });
        } catch (ledgerError) {
          console.error('Failed to create ledger entry for instant removal refund:', ledgerError);
          // Don't fail the refund if ledger entry fails - log and continue
        }
        
        // Refund the bid amount to user balance
        const refundAmount = bid.amount; // Already in pence
        user.balance = (user.balance || 0) + refundAmount;
        await user.save();

        // Update bid status
        bid.status = 'refunded';
        bid.refundedAt = new Date();
        bid.refundedBy = userId; // User removed their own tip
        bid.refundReason = 'User removed tip within 10-minute window';
        await bid.save();

        // Reverse escrow allocation if possible
        // Note: If artist already claimed, this will need admin review
        try {
            const ArtistEscrowAllocation = require('../models/ArtistEscrowAllocation');
            const escrowAllocation = await ArtistEscrowAllocation.findOne({ bidId: bid._id });
            
            if (escrowAllocation) {
                if (!escrowAllocation.claimed) {
                    // Reverse unclaimed allocation
                    await escrowAllocation.remove();
                    console.log(`✅ Reversed unclaimed escrow allocation for bid ${bidId}`);
                } else if (escrowAllocation.claimed && escrowAllocation.artistUserId) {
                    // Escrow was claimed by a registered artist - try to reverse from their balance
                    const artistUser = await User.findById(escrowAllocation.artistUserId);
                    if (artistUser && artistUser.artistEscrowBalance > 0) {
                        const userShare = escrowAllocation.allocatedAmount; // Use the actual allocated amount
                        if (artistUser.artistEscrowBalance >= userShare) {
                            artistUser.artistEscrowBalance -= userShare;
                            artistUser.totalEscrowEarned = Math.max(0, (artistUser.totalEscrowEarned || 0) - userShare);
                            await artistUser.save();
                            console.log(`✅ Reversed escrow from artist balance for bid ${bidId}`);
                        } else {
                            console.log(`⚠️  Insufficient escrow balance to reverse - requires admin review`);
                        }
                    }
                } else {
                    // Escrow was claimed but no artistUserId - flag for admin review
                    console.log(`⚠️  Escrow already claimed for bid ${bidId} - requires admin review`);
                }
            } else {
                // No escrow allocation found - escrow may have been allocated directly to registered artist
                // Check media owners to find registered artists who received escrow
                const mediaWithOwners = await Media.findById(bid.mediaId).select('mediaOwners');
                if (mediaWithOwners && mediaWithOwners.mediaOwners) {
                    const userShare = Math.round(refundAmount * 0.70); // 70% artist share
                    for (const owner of mediaWithOwners.mediaOwners) {
                if (owner.userId) {
                  const artistUser = await User.findById(owner.userId);
                  if (artistUser && artistUser.artistEscrowBalance > 0) {
                    const ownerShare = Math.round(userShare * (owner.percentage / 100));
                    if (artistUser.artistEscrowBalance >= ownerShare) {
                      artistUser.artistEscrowBalance -= ownerShare;
                      artistUser.totalEscrowEarned = Math.max(0, (artistUser.totalEscrowEarned || 0) - ownerShare);
                      
                      // Update artistEscrowHistory - mark the entry for this bid as refunded
                      if (artistUser.artistEscrowHistory && artistUser.artistEscrowHistory.length > 0) {
                        const historyEntry = artistUser.artistEscrowHistory.find(
                          entry => entry.bidId && entry.bidId.toString() === bid._id.toString()
                        );
                        if (historyEntry && historyEntry.status === 'pending') {
                          historyEntry.status = 'claimed'; // Mark as claimed/processed (we can't add 'refunded' without schema change)
                          historyEntry.claimedAt = new Date();
                        }
                      }
                      
                      await artistUser.save();
                      console.log(`✅ Reversed escrow from artist ${artistUser.username} balance for bid ${bidId}`);
                    }
                  }
                }
                    }
                }
            }
        } catch (escrowError) {
            console.error('Error reversing escrow allocation:', escrowError);
            // Don't fail the refund if escrow reversal fails - flag for admin review
        }

        // Update metrics (this will recalculate aggregates)
        try {
            await bidMetricsEngine.updateMetricsForBidChange({
                _id: bid._id,
                userId: bid.userId,
                mediaId: bid.mediaId,
                partyId: bid.partyId,
                amount: bid.amount
            }, 'delete');
        } catch (metricsError) {
            console.error('Error updating metrics after bid removal:', metricsError);
            // Don't fail the refund if metrics update fails
        }

        // Remove bid from party media entry if it's the only bid
        const mediaIndex = party.media.findIndex(entry => {
            const entryMediaId = entry.mediaId?._id ? entry.mediaId._id.toString() : entry.mediaId?.toString();
            return entryMediaId === bid.mediaId.toString();
        });

        if (mediaIndex !== -1) {
            const mediaEntry = party.media[mediaIndex];
            // Remove bid ID from partyBids array
            mediaEntry.partyBids = mediaEntry.partyBids.filter(
                bidRef => bidRef.toString() !== bidId
            );
            
            // If no more active bids, we could remove the media entry, but let's keep it for history
            // The metrics engine will handle recalculating aggregates
            await party.save();
        }

        console.log(`✅ User ${user.username} removed their tip of £${(refundAmount / 100).toFixed(2)} for bid ${bidId}`);

        res.json({
            success: true,
            message: 'Tip removed successfully',
            refundAmount: refundAmount,
            refundAmountPounds: refundAmount / 100,
            newBalance: user.balance,
            newBalancePounds: user.balance / 100,
            bidId: bid._id
        });

    } catch (error) {
        console.error('Error removing tip:', error);
        res.status(500).json({ 
            error: 'Failed to remove tip', 
            details: error.message 
        });
    }
});

/**
 * @route   POST /api/parties/:partyId/bids/:bidId/request-refund
 * @desc    Request refund for user's own tip (after 10-minute window)
 * @access  Private (user must own the bid)
 */
router.post('/:partyId/bids/:bidId/request-refund', authMiddleware, resolvePartyId(), async (req, res) => {
    try {
        const { partyId, bidId } = req.params;
        const { reason } = req.body;
        const userId = req.user._id;
        // Bid and User are already required at top of file
        const RefundRequest = require('../models/RefundRequest');
        const Media = require('../models/Media');
        const notificationService = require('../services/notificationService');
        const mongoose = require('mongoose');

        // Validate inputs
        if (!mongoose.isValidObjectId(bidId)) {
            return res.status(400).json({ error: 'Invalid bidId format' });
        }

        if (!reason || !reason.trim()) {
            return res.status(400).json({ error: 'Refund reason is required' });
        }

        // Find the bid
        const bid = await Bid.findById(bidId);
        if (!bid) {
            return res.status(404).json({ error: 'Bid not found' });
        }

        // Check if user owns this bid
        if (bid.userId.toString() !== userId.toString()) {
            return res.status(403).json({ error: 'You can only request refunds for your own tips' });
        }

        // Check if bid is already refunded or vetoed
        if (bid.status !== 'active') {
            return res.status(400).json({ 
                error: `Bid is already ${bid.status}`,
                currentStatus: bid.status
            });
        }

        // Check if refund already requested
        if (bid.refundRequestedAt) {
            const existingRequest = await RefundRequest.findOne({ bidId: bid._id, status: 'pending' });
            if (existingRequest) {
                return res.status(400).json({ 
                    error: 'Refund request already pending',
                    requestId: existingRequest._id
                });
            }
        }

        // Check time window (must be after 10 minutes)
        const timeSinceBid = Date.now() - new Date(bid.createdAt).getTime();
        const INSTANT_REMOVAL_WINDOW = 10 * 60 * 1000; // 10 minutes

        if (timeSinceBid <= INSTANT_REMOVAL_WINDOW) {
            return res.status(400).json({ 
                error: 'You can remove this tip instantly. Use the remove endpoint instead.',
                timeSinceBid: timeSinceBid,
                windowMs: INSTANT_REMOVAL_WINDOW,
                useInstantRemove: true
            });
        }

        // Get media and party for denormalized fields
        const media = await Media.findById(bid.mediaId);
        if (!media) {
            return res.status(404).json({ error: 'Media not found' });
        }

        const party = await Party.findById(partyId);
        if (!party) {
            return res.status(404).json({ error: 'Party not found' });
        }

        // Create refund request
        const refundRequest = new RefundRequest({
            bidId: bid._id,
            userId: userId,
            partyId: partyId,
            mediaId: bid.mediaId,
            amount: bid.amount, // Already in pence
            reason: reason.trim(),
            status: 'pending',
            username: bid.username,
            partyName: bid.partyName,
            mediaTitle: bid.mediaTitle,
            mediaArtist: bid.mediaArtist
        });

        await refundRequest.save();

        // Update bid to mark refund as requested
        bid.refundRequestedAt = new Date();
        bid.refundRequestReason = reason.trim();
        await bid.save();

        // Notify admins
        try {
            const adminUsers = await User.find({ role: 'admin' }).select('_id');
            for (const admin of adminUsers) {
                await notificationService.createNotification({
                    userId: admin._id,
                    type: 'refund_requested',
                    title: 'New Refund Request',
                    message: `${bid.username} requested a refund of £${(bid.amount / 100).toFixed(2)} for "${bid.mediaTitle}"`,
                    link: `/admin?tab=refunds`,
                    linkText: 'Review Refund Request',
                    relatedBidId: bid._id,
                    relatedMediaId: bid.mediaId
                });
            }
        } catch (notifError) {
            console.error('Failed to send refund request notification:', notifError);
            // Don't fail the request if notification fails
        }

        console.log(`📝 User ${bid.username} requested refund for bid ${bidId}: £${(bid.amount / 100).toFixed(2)}`);

        res.json({
            success: true,
            message: 'Refund request submitted. You will be notified when it is processed.',
            requestId: refundRequest._id,
            bidId: bid._id,
            amount: bid.amount,
            amountPounds: bid.amount / 100,
            reason: reason.trim()
        });

    } catch (error) {
        console.error('Error requesting refund:', error);
        res.status(500).json({ 
            error: 'Failed to request refund', 
            details: error.message 
        });
    }
});

module.exports = router;