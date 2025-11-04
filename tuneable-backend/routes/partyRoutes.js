const express = require('express');
const mongoose = require('mongoose');
const crypto = require('crypto');
const axios = require('axios');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const adminMiddleware = require('../middleware/adminMiddleware');
const Party = require('../models/Party');
const Media = require('../models/Media');
const Bid = require('../models/Bid');
const User = require('../models/User');
const { getVideoDetails } = require('../services/youtubeService');
const { isValidObjectId } = require('../utils/validators');
const { broadcast } = require('../utils/broadcast');
// const { transformResponse } = require('../utils/uuidTransform'); // Removed - using ObjectIds directly
// const { resolvePartyId } = require('../utils/idResolver'); // Removed - using ObjectIds directly
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
  
      broadcast(party._id, { message: 'New party created', party });
      res.status(201).json({ message: 'Party created successfully', party });
  
    } catch (err) {
      console.error('🔥 Error creating party:', err);
      res.status(500).json({ error: 'Server error', details: err.message });
    }
  });


router.post("/join/:partyId", authMiddleware, async (req, res) => {
    const { partyId } = req.params;
    const { inviteCode, location } = req.body;
    const userId = req.user._id;

    try {
        const party = await Party.findById(partyId);
        if (!party) return res.status(404).json({ message: "Party not found" });

        // Check if user is the host (host can always join without code)
        const isHost = party.host.toString() === userId.toString();
        
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

        if (!party.partiers.includes(userId)) {
            // Add user to party's partiers array
            party.partiers.push(userId);
            await party.save();
            
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
        }

        res.json({ message: "Joined successfully", party });

    } catch (error) {
        res.status(500).json({ message: "Server error", error });
    }
});


/**
 * Route: GET /
 * Fetch all parties
 * Access: Protected (requires valid token)
 */
router.get('/', authMiddleware, async (req, res) => {
    try {
        const parties = await Party.find()
            .select('-media') // Exclude media for better performance
            .populate('host', 'username uuid'); // ✅ Include uuid for consistent host identification

        res.status(200).json({ message: 'Parties fetched successfully', parties });
    } catch (err) {
        handleError(res, err, 'Failed to fetch parties');
    }
});

// FETCH PARTY DETAILS
router.get('/:id/details', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;

        // Check if this is the Global Party
        const isGlobalParty = await Party.getGlobalParty();
        const isRequestingGlobalParty = isGlobalParty && isGlobalParty._id.toString() === id;

        let party;
        
        if (isRequestingGlobalParty) {
            // For Global Party, we need to aggregate ALL media with ANY bids
            console.log('🌍 Fetching Global Party - aggregating all media with bids...');
            
            // Performance monitoring for Global Party
            const startTime = Date.now();
            
            // Get the Global Party object
            party = isGlobalParty;
            
            // Find ALL media that has ANY bids (party or global)
            const Media = require('../models/Media');
            const Bid = require('../models/Bid');
            
            const allMediaWithBids = await Media.find({
                bids: { $exists: true, $ne: [] }
            })
            .populate({
                path: 'bids',
                model: 'Bid',
                populate: {
                    path: 'userId',
                    select: 'username profilePic uuid homeLocation secondaryLocation'
                }
            })
            .populate('globalMediaBidTopUser', 'username profilePic uuid homeLocation secondaryLocation')
            .populate('globalMediaAggregateTopUser', 'username profilePic uuid homeLocation secondaryLocation')
            .populate('addedBy', 'username profilePic uuid homeLocation secondaryLocation');

            // Convert to party media format for consistent frontend handling
            party.media = allMediaWithBids.map(media => ({
                mediaId: media,
                media_uuid: media.uuid,
                addedBy: media.addedBy,
                addedBy_uuid: media.addedBy?.uuid,
                partyMediaAggregate: media.globalMediaAggregate || 0,
                partyBids: media.bids || [],
                status: 'queued',
                queuedAt: media.createdAt || new Date(),
                partyMediaBidTop: media.globalMediaBidTop || 0,
                partyMediaBidTopUser: media.globalMediaBidTopUser,
                partyMediaAggregateTop: media.globalMediaAggregateTop || 0,
                partyMediaAggregateTopUser: media.globalMediaAggregateTopUser
            }));
            
            // Populate partiers and host for Global Party
            const User = require('../models/User');
            // Use actual partiers who joined, not all users
            party.partiers = await User.find({ _id: { $in: party.partiers } }).select('username uuid');
            party.host = await User.findOne({ username: 'Tuneable' }).select('username uuid');
            
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
            
        } else {
            // Regular party fetching logic
            party = await Party.findById(id)
            .populate({
                path: 'media.mediaId',
                model: 'Media',
                select: 'title artist duration coverArt sources globalMediaAggregate bids addedBy tags category globalMediaBidTop globalMediaBidTopUser globalMediaAggregateTop globalMediaAggregateTopUser', // ✅ Updated to schema grammar field names
                populate: [
                    {
                        path: 'bids',
                        model: 'Bid',
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
                path: 'partiers',
                model: 'User',
                select: 'username uuid',
            })
            .populate({
                path: 'host',
                model: 'User',
                select: 'username uuid',  // ✅ Include uuid for isHost comparison
            });
        }

        if (!party) {
            return res.status(404).json({ error: 'Party not found' });
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
                artist: entry.mediaId.artist,
                duration: entry.mediaId.duration || '666',
                coverArt: entry.mediaId.coverArt || '/default-cover.jpg',
                sources: sourcesObj, // ✅ Store sources as object { youtube: '...', upload: '...' }
                globalMediaAggregate: entry.mediaId.globalMediaAggregate || 0, // Global total (schema grammar)
                partyMediaAggregate: entry.partyMediaAggregate || 0, // ✅ Party-media aggregate (schema grammar)
                bids: entry.mediaId.bids || [], // ✅ Use populated bids from mediaId with user data
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
                status: entry.status || 'queued',
                queuedAt: entry.queuedAt,
                playedAt: entry.playedAt,
                completedAt: entry.completedAt,
                vetoedAt: entry.vetoedAt,
                vetoedBy: entry.vetoedBy,
            };
        }).filter(Boolean); // ✅ Remove null entries

        // ✅ Sort media by status and then by bid value
        processedMedia.sort((a, b) => {
            // First sort by status priority: playing > queued > played > vetoed
            const statusPriority = { playing: 0, queued: 1, played: 2, vetoed: 3 };
            const statusDiff = statusPriority[a.status] - statusPriority[b.status];
            
            if (statusDiff !== 0) return statusDiff;
            
            // Within same status, sort by bid value (highest first)
            return (b.totalBidValue || 0) - (a.totalBidValue || 0);
        });

        // ✅ **Return a cleaned response (don’t overwrite `party.songs`)**
        const responseParty = {
            _id: party._id,
            name: party.name,
            location: party.location,
            host: party.host,
            partyCode: party.partyCode,
            partiers: party.partiers,
            startTime: party.startTime,
            endTime: party.endTime,
            watershed: party.watershed,
            type: party.type,
            status: party.status,
            mediaSource: party.mediaSource,
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
router.get('/:partyId/search', authMiddleware, async (req, res) => {
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
        
        if (isRequestingGlobalParty) {
            // For Global Party, search through ALL media with ANY bids
            console.log('🌍 Searching Global Party - searching all media with bids...');
            
            const Media = require('../models/Media');
            const allMediaWithBids = await Media.find({
                bids: { $exists: true, $ne: [] }
            }).select('title artist duration coverArt sources globalMediaAggregate tags category uuid contentType contentForm');
            
            // Convert to party format for consistent handling
            party = {
                media: allMediaWithBids.map(media => ({
                    mediaId: media
                }))
            };
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
router.post('/:partyId/media/add', authMiddleware, async (req, res) => {
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

        const userBalancePence = Math.round(user.balance * 100);
        const bidAmountPence = Math.round(bidAmount * 100);

        if (userBalancePence < bidAmountPence) {
            return res.status(400).json({ 
                error: 'Insufficient balance',
                required: bidAmount,
                available: user.balance
            });
        }

        // Extract cover art and duration
        let extractedCoverArt = '/default-cover.jpg';
        let extractedDuration = duration || 180;

        if (platform === 'youtube' && url) {
            const videoId = url.split('v=')[1]?.split('&')[0];
            if (videoId) {
                extractedCoverArt = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
                
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
        let videoTags = Array.isArray(tags) ? tags : [];
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
            console.log(`✅ Using existing media: "${media.title}" (${media._id})`);
        } else {
            // Create new media item
            media = new Media({
                title,
                artist: [{ name: artist, userId: null, verified: false }],
                coverArt: extractedCoverArt,
                duration: extractedDuration,
                sources: { [platform]: url },
                tags: videoTags,
                category: videoCategory,
                addedBy: userId,
                globalMediaAggregate: bidAmount, // Updated to schema grammar
                contentType: 'music',
                contentForm: 'tune'
            });
            
            await media.save();
            console.log(`✅ Created new media: "${media.title}" (${media._id})`);
        }

        // Calculate queue context
        const queuedMedia = party.media.filter(m => m.status === 'queued');
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
            bidScope: party.type === 'global' ? 'global' : 'party', // Set bidScope based on party type
            
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

        // Add bid to media's bids array
        media.bids = media.bids || [];
        media.bids.push(bid._id);
        
        // Also add to globalBids array if this is a global bid
        if (party.type === 'global') {
            media.globalBids = media.globalBids || [];
            media.globalBids.push(bid._id);
        }
        
        await media.save();

        // Add media to party with bid
        const partyMediaEntry = {
            mediaId: media._id,
            media_uuid: media.uuid,
            addedBy: userId,
            addedBy_uuid: user.uuid,
            partyMediaAggregate: bidAmount, // First bid becomes the aggregate
            partyBids: [bid._id],
            status: 'queued',
            queuedAt: new Date(),
            // Top bid tracking (first bid is automatically the top bid) - schema grammar
            partyMediaBidTop: bidAmount,
            partyMediaBidTopUser: userId,
            partyMediaAggregateTop: userPartyAggregate,
            partyMediaAggregateTopUser: userId
        };

        party.media.push(partyMediaEntry);
        await party.save();

        // Update global bid tracking (first bid is automatically the top bid) - schema grammar
        // Store in pence
        media.globalMediaBidTop = bidAmountPence;
        media.globalMediaBidTopUser = userId;
        media.globalMediaAggregateTop = userGlobalAggregate;
        media.globalMediaAggregateTopUser = userId;
        await media.save();

        // Note: For first bid on new media, the bidder is typically the owner, so no bid_received notification needed

        // Update user balance (already in pence, no conversion needed)
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
            message: 'Media added to party successfully',
            media: populatedMedia,
            bid: bid,
            updatedBalance: user.balance
        });

    } catch (err) {
        console.error('Error adding media to party:', err);
        res.status(500).json({ error: 'Failed to add media to party', details: err.message });
    }
});

// Route 2: Place bid on existing media in party
router.post('/:partyId/media/:mediaId/bid', authMiddleware, async (req, res) => {
    try {
        const { partyId, mediaId } = req.params;
        const { bidAmount } = req.body;
        const userId = req.user._id;

        if (!mongoose.isValidObjectId(partyId)) {
            return res.status(400).json({ error: 'Invalid partyId format' });
        }

        if (bidAmount <= 0) {
            return res.status(400).json({ error: 'Bid amount must be greater than 0' });
        }

        // Get party and check if media exists in party
        const party = await Party.findById(partyId).populate('media.mediaId');
        if (!party) {
            return res.status(404).json({ error: 'Party not found' });
        }

        // Check if this is the Global Party
        const isGlobalParty = await Party.getGlobalParty();
        const isRequestingGlobalParty = isGlobalParty && isGlobalParty._id.toString() === partyId;

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

            // Create a virtual party media entry for Global Party
            partyMediaEntry = {
                mediaId: populatedMedia._id,
                media_uuid: populatedMedia.uuid,
                partyMediaAggregate: populatedMedia.globalMediaAggregate || 0,
                partyBids: populatedMedia.bids || [],
                status: 'queued'
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

        const userBalancePence = Math.round(user.balance * 100);
        const bidAmountPence = Math.round(bidAmount * 100);

        if (userBalancePence < bidAmountPence) {
            return res.status(400).json({ 
                error: 'Insufficient balance',
                required: bidAmount,
                available: user.balance
            });
        }

        // actualMediaId and populatedMedia are now set above based on party type

        // Calculate queue context
        let queuedMedia, queueSize, queuePosition;
        
        if (isRequestingGlobalParty) {
            // For Global Party, all media is considered "queued" and we get it from Media collection
            const Media = require('../models/Media');
            queuedMedia = await Media.find({ bids: { $exists: true, $ne: [] } });
            queueSize = queuedMedia.length;
            queuePosition = queuedMedia.findIndex(m => m._id.toString() === actualMediaId.toString()) + 1;
        } else {
            // Regular party logic
            queuedMedia = party.media.filter(m => m.status === 'queued' && m.mediaId); // Filter out null mediaId entries
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
            amount: bidAmount,
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
        if (isRequestingGlobalParty) {
            // For Global Party, we don't update the party.media array since it's virtual
            // The media aggregate is updated in the Media model below
            console.log('🌍 Global Party bidding - skipping party.media update (virtual)');
        } else {
            // Regular party logic - update party media entry
            partyMediaEntry.partyMediaAggregate = (partyMediaEntry.partyMediaAggregate || 0) + bidAmount;
            partyMediaEntry.partyBids = partyMediaEntry.partyBids || [];
            partyMediaEntry.partyBids.push(bid._id);
            await party.save();
        }

        // Update media global bid value
        const media = await Media.findById(actualMediaId);
        if (media) {
            // Store previous top bid info for outbid notification
            const previousTopBidAmount = media.globalMediaBidTop || 0;
            const previousTopBidderId = media.globalMediaBidTopUser;
            const wasNewTopBid = bidAmount > previousTopBidAmount;
            
            media.globalMediaAggregate = (media.globalMediaAggregate || 0) + bidAmount; // Updated to schema grammar
            media.bids = media.bids || [];
            media.bids.push(bid._id);
            
            // Update top bid if this is higher
            if (wasNewTopBid) {
                media.globalMediaBidTop = bidAmount;
                media.globalMediaBidTopUser = userId;
            }
            
            // Also add to globalBids array if this is a global bid
            if (party.type === 'global') {
                media.globalBids = media.globalBids || [];
                media.globalBids.push(bid._id);
            }
            
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
                        actualMediaId.toString(),
                        bid._id.toString(),
                        bidAmount,
                        populatedMedia.title
                    ).catch(err => console.error('Error sending bid received notification:', err));
                }
                
                // Notify previous top bidder if they were outbid (and it's not the same user)
                if (wasNewTopBid && previousTopBidderId && previousTopBidderId.toString() !== userId.toString()) {
                    notificationService.notifyOutbid(
                        previousTopBidderId.toString(),
                        actualMediaId.toString(),
                        bid._id.toString(),
                        bidAmount,
                        populatedMedia.title
                    ).catch(err => console.error('Error sending outbid notification:', err));
                }
            } catch (error) {
                console.error('Error setting up notifications:', error);
            }
        }

        // Note: Bid tracking is now handled automatically by BidMetricsEngine
        // via the Bid model's post('save') hook - no need to call manually

        // Update user balance
        // Update balance (already in pence, no conversion needed)
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
router.post('/:partyId/media/:mediaId/play', authMiddleware, async (req, res) => {
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
        
        // Can only play queued media
        if (mediaEntry.status !== 'queued') {
            return res.status(400).json({ error: 'Can only play queued media' });
        }

        // Mark all other media as queued
        party.media.forEach((media, index) => {
            if (index !== mediaIndex && media.status === 'playing') {
                media.status = 'queued';
            }
        });

        // Mark this media as playing
        mediaEntry.status = 'playing';
        mediaEntry.playedAt = new Date();

        await party.save();

        // Broadcast play event via WebSocket
        const { broadcastToParty } = require('../utils/broadcast');
        broadcastToParty(partyId, {
            type: 'MEDIA_STARTED',
            mediaId: mediaId,
            playedAt: songEntry.playedAt
        });

        res.json({
            message: 'Media started playing',
            mediaId: mediaId,
            playedAt: songEntry.playedAt
        });
    } catch (err) {
        console.error('Error starting media:', err);
        res.status(500).json({ error: 'Error starting media', details: err.message });
    }
});

// Reset all media to queued status (for testing/development)
router.post('/:partyId/media/reset', authMiddleware, async (req, res) => {
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

        // Reset all media to queued status
        party.media.forEach(media => {
            media.status = 'queued';
            media.playedAt = null;
            media.completedAt = null;
            media.vetoedAt = null;
            media.vetoedBy = null;
        });

        await party.save();

        res.json({
            message: 'All media reset to queued status',
            mediaCount: party.media.length
        });
    } catch (err) {
        console.error('Error resetting media:', err);
        res.status(500).json({ error: 'Error resetting media', details: err.message });
    }
});

// Mark media as played (called by web player when media finishes)
router.post('/:partyId/media/:mediaId/complete', authMiddleware, async (req, res) => {
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
        
        // Can complete playing media or queued media (for auto-playback)
        if (mediaEntry.status !== 'playing' && mediaEntry.status !== 'queued') {
            console.log(`Media ${mediaId} is in status '${mediaEntry.status}', cannot complete`);
            return res.status(400).json({ error: 'Can only complete playing or queued media' });
        }

        // Mark media as played
        mediaEntry.status = 'played';
        mediaEntry.completedAt = new Date();

        await party.save();

        // Broadcast completion event via WebSocket
        const { broadcastToParty } = require('../utils/broadcast');
        console.log(`Broadcasting MEDIA_COMPLETED for media ${mediaId} in party ${partyId}`);
        broadcastToParty(partyId, {
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
router.get('/:partyId/media/status/:status', authMiddleware, async (req, res) => {
    try {
        const { partyId, status } = req.params;
        const validStatuses = ['queued', 'playing', 'played', 'vetoed'];

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

// Veto a media item (host or admin) - DEPRECATED: Use PUT route instead
// This route is kept for backward compatibility but delegates to the PUT route logic
router.post('/:partyId/media/:mediaId/veto', authMiddleware, async (req, res) => {
    try {
        const { partyId, mediaId } = req.params;
        const { reason } = req.body;
        const Bid = require('../models/Bid');
        const User = require('../models/User');
        const Media = require('../models/Media');
        const mongoose = require('mongoose');
        
        const party = await Party.findById(partyId);
        if (!party) {
            return res.status(404).json({ error: 'Party not found' });
        }
        
        // Check if user is the host OR admin
        const isHost = party.host.toString() === req.user._id.toString();
        const isAdmin = req.user.role && req.user.role.includes('admin');
        
        if (!isHost && !isAdmin) {
            return res.status(403).json({ error: 'Only the host or admin can veto' });
        }

        const mediaIndex = party.media.findIndex(media => 
            (media.mediaId && media.mediaId.toString() === mediaId) || 
            (media.media_uuid === mediaId)
        );
        if (mediaIndex === -1) {
            return res.status(404).json({ error: 'Media not found in this party' });
        }

        const mediaEntry = party.media[mediaIndex];
        
        // Can only veto queued media
        if (mediaEntry.status !== 'queued') {
            return res.status(400).json({ error: 'Can only veto queued media' });
        }

        // Resolve actual mediaId (handle both ObjectId and UUID)
        let actualMediaId = mediaId;
        if (!mongoose.isValidObjectId(mediaId)) {
            const mediaDoc = await Media.findOne({ uuid: mediaId });
            if (!mediaDoc) {
                return res.status(404).json({ error: 'Media not found' });
            }
            actualMediaId = mediaDoc._id.toString();
        }
        
        // Find all active bids for this media in this party
        const bidsToRefund = await Bid.find({
            mediaId: actualMediaId,
            partyId: partyId,
            status: 'active'
        }).populate('userId', 'balance uuid username');
        
        console.log(`🔄 Found ${bidsToRefund.length} bids to refund for vetoed media ${mediaId}`);
        
        // Group bids by userId for efficient refunds
        const refundsByUser = new Map();
        
        for (const bid of bidsToRefund) {
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
            // Refund user balance (add back the amount)
            refundPromises.push(
                User.findByIdAndUpdate(userId, {
                    $inc: { balance: refund.totalAmount }
                })
            );
            
            console.log(`💰 Refunding £${refund.totalAmount.toFixed(2)} to user ${refund.user.username}`);
            
            // Update all bids for this user to 'vetoed' status
            refundPromises.push(
                Bid.updateMany(
                    { _id: { $in: refund.bidIds } },
                    { 
                        $set: { 
                            status: 'vetoed'
                        } 
                    }
                )
            );
        }
        
        await Promise.all(refundPromises);

        mediaEntry.status = 'vetoed';
        mediaEntry.vetoedAt = new Date();
        mediaEntry.vetoedBy = req.user._id;
        mediaEntry.vetoedBy_uuid = req.user.uuid;

        await party.save();

        // Broadcast veto via WebSocket
        const { broadcastToParty } = require('../utils/broadcast');
        broadcastToParty(partyId, {
            type: 'MEDIA_VETOED',
            mediaId: mediaId,
            vetoedBy: req.user._id,
            vetoedBy_uuid: req.user.uuid,
            reason: reason,
            vetoedAt: mediaEntry.vetoedAt,
            refundedBidsCount: bidsToRefund.length,
            refundedUsersCount: refundsByUser.size
        });

        const totalRefunded = Array.from(refundsByUser.values()).reduce((sum, r) => sum + r.totalAmount, 0);

        res.json({
            message: 'Media vetoed successfully',
            mediaId: mediaId,
            reason: reason,
            refundedBidsCount: bidsToRefund.length,
            refundedUsersCount: refundsByUser.size,
            refundedAmount: totalRefunded
        });
    } catch (err) {
        console.error('Error vetoing media:', err);
        res.status(500).json({ error: 'Error vetoing media', details: err.message });
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
router.post('/:partyId/skip-next', authMiddleware, async (req, res) => {
    try {
        const { partyId } = req.params;
        const userId = req.user._id;

        const party = await Party.findById(partyId).populate('media.mediaId');
        if (!party) {
            return res.status(404).json({ error: 'Party not found' });
        }

        // Only allow for remote parties
        if (party.type !== 'remote') {
            return res.status(400).json({ error: 'Skip functionality only available for remote parties' });
        }

        // Find current playing media
        const currentPlayingIndex = party.media.findIndex(media => media.status === 'playing');
        if (currentPlayingIndex === -1) {
            return res.status(400).json({ error: 'No media currently playing' });
        }

        // Mark current media as played
        party.media[currentPlayingIndex].status = 'played';
        party.media[currentPlayingIndex].completedAt = new Date();

        // Find next queued media
        const nextQueuedIndex = party.media.findIndex((media, index) => 
            index > currentPlayingIndex && media.status === 'queued'
        );

        if (nextQueuedIndex !== -1) {
            // Mark next media as playing
            party.media[nextQueuedIndex].status = 'playing';
            party.media[nextQueuedIndex].playedAt = new Date();
        }

        await party.save();

        res.json({ 
            success: true, 
            message: 'Skipped to next media',
            currentMedia: nextQueuedIndex !== -1 ? party.media[nextQueuedIndex] : null
        });

    } catch (error) {
        console.error('Error skipping to next media:', error);
        res.status(500).json({ error: 'Failed to skip to next media' });
    }
});

// Skip to previous media (remote parties only)
router.post('/:partyId/skip-previous', authMiddleware, async (req, res) => {
    try {
        const { partyId } = req.params;
        const userId = req.user._id;

        const party = await Party.findById(partyId).populate('media.mediaId');
        if (!party) {
            return res.status(404).json({ error: 'Party not found' });
        }

        // Only allow for remote parties
        if (party.type !== 'remote') {
            return res.status(400).json({ error: 'Skip functionality only available for remote parties' });
        }

        // Find current playing media
        const currentPlayingIndex = party.media.findIndex(media => media.status === 'playing');
        if (currentPlayingIndex === -1) {
            return res.status(400).json({ error: 'No media currently playing' });
        }

        // Find previous played media
        const previousPlayedIndex = party.media.findIndex((media, index) => 
            index < currentPlayingIndex && media.status === 'played'
        );

        if (previousPlayedIndex !== -1) {
            // Mark current media as queued
            party.media[currentPlayingIndex].status = 'queued';
            party.media[currentPlayingIndex].playedAt = undefined;

            // Mark previous media as playing
            party.media[previousPlayedIndex].status = 'playing';
            party.media[previousPlayedIndex].completedAt = undefined;
        }

        await party.save();

        res.json({ 
            success: true, 
            message: 'Skipped to previous media',
            currentMedia: previousPlayedIndex !== -1 ? party.media[previousPlayedIndex] : null
        });

    } catch (error) {
        console.error('Error skipping to previous media:', error);
        res.status(500).json({ error: 'Failed to skip to previous media' });
    }
});

// End a party (host only)
router.post('/:partyId/end', authMiddleware, async (req, res) => {
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
        const { broadcastToParty } = require('../utils/broadcast');
        broadcastToParty(partyId, {
            type: 'PARTY_ENDED',
            partyId: partyId,
            endedAt: party.endTime
        });

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

// Remove a media item from a party (veto functionality with refunds)
router.delete('/:partyId/media/:mediaId', authMiddleware, async (req, res) => {
    try {
        const { partyId, mediaId } = req.params;
        const Bid = require('../models/Bid');
        const User = require('../models/User');
        const Media = require('../models/Media');
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
            return res.status(403).json({ error: 'Only the party host or admin can veto' });
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

        // Resolve actual mediaId (handle both ObjectId and UUID)
        let actualMediaId = mediaId;
        if (!mongoose.isValidObjectId(mediaId)) {
            const mediaDoc = await Media.findOne({ uuid: mediaId });
            if (!mediaDoc) {
                return res.status(404).json({ error: 'Media not found' });
            }
            actualMediaId = mediaDoc._id.toString();
        }
        
        // Find all active bids for this media in this party
        const bidsToRefund = await Bid.find({
            mediaId: actualMediaId,
            partyId: partyId,
            status: 'active'
        }).populate('userId', 'balance uuid username');
        
        console.log(`🔄 Found ${bidsToRefund.length} bids to refund for vetoed media ${mediaId}`);
        
        // Group bids by userId for efficient refunds
        const refundsByUser = new Map();
        
        for (const bid of bidsToRefund) {
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
            // Refund user balance (add back the amount)
            refundPromises.push(
                User.findByIdAndUpdate(userId, {
                    $inc: { balance: refund.totalAmount }
                })
            );
            
            console.log(`💰 Refunding £${refund.totalAmount.toFixed(2)} to user ${refund.user.username}`);
            
            // Update all bids for this user to 'vetoed' status
            refundPromises.push(
                Bid.updateMany(
                    { _id: { $in: refund.bidIds } },
                    { 
                        $set: { 
                            status: 'vetoed'
                        } 
                    }
                )
            );
        }
        
        await Promise.all(refundPromises);

        // Update the media status to vetoed instead of removing it completely
        mediaEntry.status = 'vetoed';
        mediaEntry.vetoedAt = new Date();
        mediaEntry.vetoedBy = req.user._id;
        mediaEntry.vetoedBy_uuid = req.user.uuid;

        await party.save();

        // Broadcast the veto event to all party members
        const { broadcastToParty } = require('../utils/broadcast');
        broadcastToParty(partyId, {
            type: 'MEDIA_VETOED',
            mediaId: mediaId,
            vetoedAt: mediaEntry.vetoedAt,
            vetoedBy: req.user._id,
            vetoedBy_uuid: req.user.uuid,
            refundedBidsCount: bidsToRefund.length,
            refundedUsersCount: refundsByUser.size
        });

        const totalRefunded = Array.from(refundsByUser.values()).reduce((sum, r) => sum + r.totalAmount, 0);

        res.json({
            message: 'Media vetoed successfully',
            mediaId: mediaId,
            vetoedAt: mediaEntry.vetoedAt,
            refundedBidsCount: bidsToRefund.length,
            refundedUsersCount: refundsByUser.size,
            refundedAmount: totalRefunded
        });

    } catch (err) {
        console.error('Error vetoing media:', err);
        res.status(500).json({ error: 'Error vetoing media', details: err.message });
    }
});

// Get media sorted by bid values within specific time periods
router.get('/:partyId/media/sorted/:timePeriod', authMiddleware, async (req, res) => {
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
                    select: 'title artist duration coverArt sources globalMediaAggregate bids addedBy tags category uuid', // Updated to schema grammar
                    populate: {
                        path: 'bids',
                        model: 'Bid',
                        populate: {
                            path: 'userId',
                            select: 'username profilePic uuid',
                        },
                    },
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
                populate: {
                    path: 'userId',
                    select: 'username profilePic uuid homeLocation secondaryLocation'
                }
            })
            .populate('globalMediaBidTopUser', 'username profilePic uuid homeLocation secondaryLocation')
            .populate('globalMediaAggregateTopUser', 'username profilePic uuid homeLocation secondaryLocation')
            .populate('addedBy', 'username profilePic uuid homeLocation secondaryLocation');

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
                        artist: artistName, // Transform for frontend compatibility
                        duration: media.duration,
                        coverArt: media.coverArt,
                        sources: media.sources,
                        availablePlatforms,
                        globalMediaAggregate: media.globalMediaAggregate || 0, // Schema grammar
                        partyMediaAggregate: media.globalMediaAggregate || 0, // For Global Party, use global aggregate
                        timePeriodBidValue, // Bid value for the specific time period
                        bids: media.bids || [], // Include populated bids for TopBidders component
                        tags: media.tags || [], // Include tags for display
                        category: media.category || null, // Include category for display
                        addedBy: media.addedBy,
                        status: 'queued', // Global Party media is always considered queued
                        queuedAt: media.createdAt || new Date(),
                        playedAt: null,
                        completedAt: null,
                        vetoedAt: null,
                        vetoedBy: null,
                        contentType: media.contentType || 'music'
                    };
                })
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
                        artist: artistName, // Transform for frontend compatibility
                        duration: entry.mediaId.duration,
                        coverArt: entry.mediaId.coverArt,
                        sources: entry.mediaId.sources,
                        availablePlatforms,
                        globalMediaAggregate: entry.mediaId.globalMediaAggregate || 0, // Schema grammar
                        partyMediaAggregate: entry.partyMediaAggregate || 0, // All-time party-media aggregate (schema grammar)
                        timePeriodBidValue, // Bid value for the specific time period
                        bids: entry.mediaId.bids || [], // Include populated bids for TopBidders component
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

// @route   PUT /api/parties/:partyId/media/:mediaId/veto
// @desc    Veto a media item (host or admin) - sets status to 'vetoed', removes from queue, and refunds all bids
// @access  Private (host or admin only)
router.put('/:partyId/media/:mediaId/veto', authMiddleware, async (req, res) => {
    try {
        const { partyId, mediaId } = req.params;
        const Bid = require('../models/Bid');
        const User = require('../models/User');
        const Media = require('../models/Media');
        const mongoose = require('mongoose');
        
        const party = await Party.findById(partyId);
        if (!party) {
            return res.status(404).json({ error: 'Party not found' });
        }
        
        // Check if user is the host OR admin
        const isHost = party.host.toString() === req.user._id.toString();
        const isAdmin = req.user.role && req.user.role.includes('admin');
        
        if (!isHost && !isAdmin) {
            return res.status(403).json({ error: 'Only the host or admin can veto' });
        }
        
        // Find the media in the party
        const mediaEntry = party.media.find(m => 
            (m.mediaId && m.mediaId.toString() === mediaId) || 
            (m.media_uuid === mediaId)
        );
        
        if (!mediaEntry) {
            return res.status(404).json({ error: 'Media not found in party' });
        }
        
        // Resolve actual mediaId (handle both ObjectId and UUID)
        let actualMediaId = mediaId;
        if (!mongoose.isValidObjectId(mediaId)) {
            const mediaDoc = await Media.findOne({ uuid: mediaId });
            if (!mediaDoc) {
                return res.status(404).json({ error: 'Media not found' });
            }
            actualMediaId = mediaDoc._id.toString();
        }
        
        // Find all active bids for this media in this party
        const bidsToRefund = await Bid.find({
            mediaId: actualMediaId,
            partyId: partyId,
            status: 'active'
        }).populate('userId', 'balance uuid username');
        
        console.log(`🔄 Found ${bidsToRefund.length} bids to refund for vetoed media ${mediaId}`);
        
        // Group bids by userId for efficient refunds
        const refundsByUser = new Map();
        
        for (const bid of bidsToRefund) {
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
            // Refund user balance (add back the amount)
            refundPromises.push(
                User.findByIdAndUpdate(userId, {
                    $inc: { balance: refund.totalAmount }
                })
            );
            
            console.log(`💰 Refunding £${refund.totalAmount.toFixed(2)} to user ${refund.user.username}`);
            
            // Update all bids for this user to 'vetoed' status
            refundPromises.push(
                Bid.updateMany(
                    { _id: { $in: refund.bidIds } },
                    { 
                        $set: { 
                            status: 'vetoed'
                        } 
                    }
                )
            );
        }
        
        await Promise.all(refundPromises);
        
        // Update media status to vetoed
        mediaEntry.status = 'vetoed';
        mediaEntry.vetoedAt = new Date();
        mediaEntry.vetoedBy = req.user._id;
        mediaEntry.vetoedBy_uuid = req.user.uuid;
        
        await party.save();
        
        // Broadcast veto via WebSocket
        const { broadcastToParty } = require('../utils/broadcast');
        broadcastToParty(partyId, {
            type: 'MEDIA_VETOED',
            mediaId: mediaId,
            vetoedBy: req.user._id,
            vetoedBy_uuid: req.user.uuid,
            vetoedAt: mediaEntry.vetoedAt,
            refundedBidsCount: bidsToRefund.length,
            refundedUsersCount: refundsByUser.size
        });
        
        const totalRefunded = Array.from(refundsByUser.values()).reduce((sum, r) => sum + r.totalAmount, 0);
        
        res.json({
            message: 'Media vetoed successfully',
            refundedBidsCount: bidsToRefund.length,
            refundedUsersCount: refundsByUser.size,
            refundedAmount: totalRefunded,
            party: party
        });
        
    } catch (err) {
        console.error('Error vetoing media:', err);
        res.status(500).json({ 
            error: 'Error vetoing media', 
            details: err.message 
        });
    }
});

// @route   PUT /api/parties/:partyId/media/:mediaId/unveto
// @desc    Un-veto a media item (restore to queue) - host only
// @access  Private (host only)
router.put('/:partyId/media/:mediaId/unveto', authMiddleware, async (req, res) => {
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
        
        // Restore media to queued status
        mediaEntry.status = 'queued';
        mediaEntry.vetoedAt = null;
        mediaEntry.vetoedBy = null;
        mediaEntry.vetoedBy_uuid = null;
        
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

module.exports = router;