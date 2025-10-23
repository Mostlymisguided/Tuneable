const express = require('express');
const mongoose = require('mongoose');
const crypto = require('crypto');
const axios = require('axios');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const Party = require('../models/Party');
const Media = require('../models/Media');
const Bid = require('../models/Bid');
const User = require('../models/User');
const { getVideoDetails } = require('../services/youtubeService');
const { isValidObjectId } = require('../utils/validators');
const { broadcast } = require('../utils/broadcast');
const { transformResponse } = require('../utils/uuidTransform');
const { resolvePartyId } = require('../utils/idResolver');
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
 * Access: Protected (requires valid token)
 */
router.post('/', authMiddleware, async (req, res) => {
    try {
      console.log('🔥 Create Party Request Received:', req.body);
      console.log('🔑 Authenticated User:', req.user);
  
      const { name, location, startTime, privacy, type, musicSource, minimumBid } = req.body;
  
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
        musicSource: musicSource || 'youtube',
        minimumBid: minimumBid || 0.33,
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
      res.status(201).json(transformResponse({ message: 'Party created successfully', party }));
  
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
            party.partiers.push(userId);
            await party.save();
        }

        res.json(transformResponse({ message: "Joined successfully", party }));

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

        res.status(200).json(transformResponse({ message: 'Parties fetched successfully', parties }));
    } catch (err) {
        handleError(res, err, 'Failed to fetch parties');
    }
});

// FETCH PARTY DETAILS
router.get('/:id/details', authMiddleware, resolvePartyId(), async (req, res) => {
    try {
        const { id } = req.params;

        // Check if this is the Global Party
        const isGlobalParty = await Party.getGlobalParty();
        const isRequestingGlobalParty = isGlobalParty && isGlobalParty._id.toString() === id;

        let party;
        
        if (isRequestingGlobalParty) {
            // For Global Party, we need to aggregate ALL media with ANY bids
            console.log('🌍 Fetching Global Party - aggregating all media with bids...');
            
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
                    select: 'username profilePic uuid homeLocation'
                }
            })
            .populate('globalMediaBidTopUser', 'username profilePic uuid homeLocation')
            .populate('globalMediaAggregateTopUser', 'username profilePic uuid homeLocation')
            .populate('addedBy', 'username profilePic uuid homeLocation');

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
            party.partiers = await User.find({}).select('username uuid');
            party.host = await User.findOne({ username: 'Tuneable' }).select('username uuid');
            
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
                            select: 'username profilePic uuid homeLocation',  // ✅ Added profilePic, uuid, and location for top bidders display
                        },
                    },
                    {
                        path: 'globalMediaBidTopUser',
                        model: 'User',
                        select: 'username profilePic uuid homeLocation'
                    },
                    {
                        path: 'globalMediaAggregateTopUser',
                        model: 'User',
                        select: 'username profilePic uuid homeLocation'
                    }
                ]
            })
            .populate({
                path: 'media.partyMediaBidTopUser',
                model: 'User',
                select: 'username profilePic uuid homeLocation'
            })
            .populate({
                path: 'media.partyMediaAggregateTopUser',
                model: 'User',
                select: 'username profilePic uuid homeLocation'
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
                id: entry.mediaId.uuid || entry.mediaId._id, // Use UUID for external API, fallback to _id
                uuid: entry.mediaId.uuid || entry.mediaId._id, // Also include uuid field for consistency
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
            musicSource: party.musicSource,
            createdAt: party.createdAt,
            updatedAt: party.updatedAt,
            media: processedMedia, // ✅ Return flattened, sorted media
        };

        res.status(200).json(transformResponse({
            message: 'Party details fetched successfully',
            party: responseParty,
        }));
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

        res.json(transformResponse({
            success: true,
            results: matchingMedia,
            count: matchingMedia.length,
            query: q
        }));

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
                } catch (error) {
                    console.error('Error fetching video details:', error);
                }
            }
        }

        // Get video tags and category for YouTube
        let videoTags = Array.isArray(tags) ? tags : [];
        let videoCategory = category || 'Unknown';
        
        if (platform === 'youtube') {
            try {
                const videoId = url.split('v=')[1]?.split('&')[0];
                if (videoId) {
                    const videoDetails = await getVideoDetails(videoId);
                    videoTags = videoDetails.tags || [];
                    videoCategory = videoDetails.category || 'Unknown';
                }
            } catch (error) {
                console.error('Error fetching video details:', error);
            }
        }
        
        // Create new media item
        const media = new Media({
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
        const userPartyAggregate = bidAmount; // First bid in this party
        const userGlobalAggregate = bidAmount; // First bid globally
        
        // Create bid record with denormalized fields and aggregate tracking
        const bid = new Bid({
            userId,
            partyId,
            mediaId: media._id, // Use mediaId instead of songId
            amount: bidAmount,
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
        media.globalMediaBidTop = bidAmount;
        media.globalMediaBidTopUser = userId;
        media.globalMediaAggregateTop = userGlobalAggregate;
        media.globalMediaAggregateTopUser = userId;
        await media.save();

        // Update user balance
        user.balance = (userBalancePence - bidAmountPence) / 100;
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

        res.status(201).json(transformResponse({
            message: 'Media added to party successfully',
            media: populatedMedia,
            bid: bid,
            updatedBalance: user.balance
        }));

    } catch (err) {
        console.error('Error adding media to party:', err);
        res.status(500).json({ error: 'Failed to add media to party', details: err.message });
    }
});

// Route 2: Place bid on existing media in party
router.post('/:partyId/media/:mediaId/bid', authMiddleware, resolvePartyId(), async (req, res) => {
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

        // Find media by either ObjectId or UUID
        let partyMediaEntry;
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

        // Get the actual media ObjectId
        const actualMediaId = partyMediaEntry.mediaId._id || partyMediaEntry.mediaId;
        
        // Get full media object for denormalized fields (from populated party)
        const populatedMedia = partyMediaEntry.mediaId;

        // Calculate queue context
        const queuedMedia = party.media.filter(m => m.status === 'queued');
        const queueSize = queuedMedia.length;
        // Find position of this media in the queue
        const queuePosition = queuedMedia.findIndex(m => 
            (m.mediaId._id || m.mediaId).toString() === actualMediaId.toString()
        ) + 1; // +1 for 1-indexed position

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

        // Send email notification for high-value bids
        try {
          await sendHighValueBidNotification(bid, populatedMedia, user, 10);
        } catch (emailError) {
          console.error('Failed to send high-value bid notification email:', emailError);
          // Don't fail the request if email fails
        }

        // Update party media entry bid aggregate (schema grammar)
        partyMediaEntry.partyMediaAggregate = (partyMediaEntry.partyMediaAggregate || 0) + bidAmount;
        partyMediaEntry.partyBids = partyMediaEntry.partyBids || [];
        partyMediaEntry.partyBids.push(bid._id);
        await party.save();

        // Update media global bid value
        const media = await Media.findById(actualMediaId);
        if (media) {
            media.globalMediaAggregate = (media.globalMediaAggregate || 0) + bidAmount; // Updated to schema grammar
            media.bids = media.bids || [];
            media.bids.push(bid._id);
            
            // Also add to globalBids array if this is a global bid
            if (party.type === 'global') {
                media.globalBids = media.globalBids || [];
                media.globalBids.push(bid._id);
            }
            
            await media.save();
        }

        // Note: Bid tracking is now handled automatically by BidMetricsEngine
        // via the Bid model's post('save') hook - no need to call manually

        // Update user balance
        user.balance = (userBalancePence - bidAmountPence) / 100;
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

        res.status(201).json(transformResponse({
            message: 'Bid placed successfully',
            media: updatedMedia,
            bid: bid,
            updatedBalance: user.balance
        }));

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

        res.json(transformResponse({
            status: status,
            media: mediaWithStatus,
            count: mediaWithStatus.length
        }));
    } catch (err) {
        console.error('Error fetching media by status:', err);
        res.status(500).json({ error: 'Error fetching media by status', details: err.message });
    }
});

// Veto a media item (host only)
router.post('/:partyId/media/:mediaId/veto', authMiddleware, async (req, res) => {
    try {
        const { partyId, mediaId } = req.params;
        const { reason } = req.body;
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
            return res.status(403).json({ error: 'Only the host can veto' });
        }

        const mediaIndex = party.media.findIndex(media => media.mediaId.toString() === mediaId);
        if (mediaIndex === -1) {
            return res.status(404).json({ error: 'Media not found in this party' });
        }

        const mediaEntry = party.media[mediaIndex];
        
        // Can only veto queued media
        if (mediaEntry.status !== 'queued') {
            return res.status(400).json({ error: 'Can only veto queued media' });
        }

        mediaEntry.status = 'vetoed';
        mediaEntry.vetoedAt = new Date();
        mediaEntry.vetoedBy = userId;

        await party.save();

        // Broadcast veto via WebSocket
        const { broadcastToParty } = require('../utils/broadcast');
        broadcastToParty(partyId, {
            type: 'MEDIA_VETOED',
            mediaId: mediaId,
            vetoedBy: userId,
            reason: reason,
            vetoedAt: mediaEntry.vetoedAt
        });

        res.json({
            message: 'Media vetoed successfully',
            mediaId: mediaId,
            reason: reason
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

// Remove a media item from a party (veto functionality)
router.delete('/:partyId/media/:mediaId', authMiddleware, async (req, res) => {
    try {
        const { partyId, mediaId } = req.params;
        const userId = req.user._id;

        // Validate IDs
        if (!mongoose.isValidObjectId(partyId) || !mongoose.isValidObjectId(mediaId)) {
            return res.status(400).json({ error: 'Invalid party or media ID format' });
        }

        // Find the party
        const party = await Party.findById(partyId);
        if (!party) {
            return res.status(404).json({ error: 'Party not found' });
        }

        // Check if user is the host (only host can veto)
        if (party.host.toString() !== userId) {
            return res.status(403).json({ error: 'Only the party host can veto' });
        }

        // Find the media in the party's queue
        const mediaIndex = party.media.findIndex(entry => entry.mediaId.toString() === mediaId);
        if (mediaIndex === -1) {
            return res.status(404).json({ error: 'Media not found in party queue' });
        }

        // Update the media status to vetoed instead of removing it completely
        party.media[mediaIndex].status = 'vetoed';
        party.media[mediaIndex].vetoedAt = new Date();
        party.media[mediaIndex].vetoedBy = userId;

        await party.save();

        // Broadcast the veto event to all party members
        const { broadcastToParty } = require('../utils/broadcast');
        broadcastToParty(partyId, {
            type: 'MEDIA_VETOED',
            mediaId: mediaId,
            vetoedAt: party.media[mediaIndex].vetoedAt,
            vetoedBy: userId
        });

        res.json({
            message: 'Media vetoed successfully',
            mediaId: mediaId,
            vetoedAt: party.media[mediaIndex].vetoedAt
        });

    } catch (err) {
        console.error('Error vetoing media:', err);
        res.status(500).json({ error: 'Error vetoing media', details: err.message });
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

        const party = await Party.findById(partyId)
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

        // Get all bids for this party within the time period
        let bidQuery = { 
            partyId: party._id,
            status: { $in: ['active', 'played'] } // Only count active and played bids
        };

        if (startDate) {
            bidQuery.createdAt = { $gte: startDate };
        }

        const bids = await Bid.find(bidQuery).select('mediaId amount createdAt');

        // Calculate bid values for each media within the time period
        const mediaBidValues = {};
        bids.forEach(bid => {
            const mediaId = bid.mediaId?.toString();
            if (mediaId) {
                mediaBidValues[mediaId] = (mediaBidValues[mediaId] || 0) + bid.amount;
            }
        });

        // Process and sort media by their bid values within the time period
        const processedMedia = party.media
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
                    id: entry.mediaId.uuid || entry.mediaId._id, // Use UUID for external API, fallback to _id
                    uuid: entry.mediaId.uuid || entry.mediaId._id, // Also include uuid field for consistency
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

        res.json(transformResponse({
            timePeriod: timePeriod,
            media: processedMedia,
            count: processedMedia.length,
            periodStartDate: startDate,
            periodEndDate: now
        }));

    } catch (err) {
        console.error('Error fetching media sorted by time period:', err);
        res.status(500).json({ 
            error: 'Error fetching media sorted by time period', 
            details: err.message 
        });
    }
});

// @route   PUT /api/parties/:partyId/media/:mediaId/veto
// @desc    Veto a media item (host only) - sets status to 'vetoed' and removes from queue
// @access  Private (host only)
router.put('/:partyId/media/:mediaId/veto', authMiddleware, async (req, res) => {
    try {
        const { partyId, mediaId } = req.params;
        
        const party = await Party.findById(partyId);
        if (!party) {
            return res.status(404).json({ error: 'Party not found' });
        }
        
        // Check if user is the host
        if (party.host.toString() !== req.user._id.toString()) {
            return res.status(403).json({ error: 'Only the host can veto' });
        }
        
        // Find the media in the party
        const mediaEntry = party.media.find(m => 
            (m.mediaId && m.mediaId.toString() === mediaId) || 
            (m.media_uuid === mediaId)
        );
        
        if (!mediaEntry) {
            return res.status(404).json({ error: 'Media not found in party' });
        }
        
        // Update media status to vetoed
        mediaEntry.status = 'vetoed';
        mediaEntry.vetoedAt = new Date();
        mediaEntry.vetoedBy = req.user._id;
        mediaEntry.vetoedBy_uuid = req.user.uuid;
        
        await party.save();
        
        res.json(transformResponse({
            message: 'Media vetoed successfully',
            party: party
        }));
        
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
        
        res.json(transformResponse({
            message: 'Media restored to queue successfully',
            party: party
        }));
        
    } catch (err) {
        console.error('Error un-vetoing media:', err);
        res.status(500).json({ 
            error: 'Error un-vetoing media', 
            details: err.message 
        });
    }
});

module.exports = router;