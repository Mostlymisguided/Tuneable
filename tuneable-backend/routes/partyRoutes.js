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
const { 
    calculateUserPartyAggregateBidValue, 
    calculateUserGlobalAggregateBidValue,
    updatePartyBidTracking,
    updateGlobalBidTracking 
} = require('../utils/bidCalculations');
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
        attendees: [userId],
        songs: [],
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

        if (!party.attendees.includes(userId)) {
            party.attendees.push(userId);
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

        const party = await Party.findById(id)
            .populate({
                path: 'media.mediaId',
                model: 'Media',
                select: 'title artist duration coverArt sources globalBidValue bids addedBy tags category topGlobalBidValue topGlobalBidUser topGlobalAggregateBidValue topGlobalAggregateUser', // ✅ Added top bid tracking fields
                populate: {
                    path: 'bids',
                    model: 'Bid',
                    populate: {
                        path: 'userId',
                        select: 'username profilePic uuid',  // ✅ Added profilePic and uuid for top bidders display
                    },
                },
            })
            .populate({
                path: 'attendees',
                model: 'User',
                select: 'username uuid',
            })
            .populate({
                path: 'host',
                model: 'User',
                select: 'username uuid',  // ✅ Include uuid for isHost comparison
            });

        if (!party) {
            return res.status(404).json({ error: 'Party not found' });
        }

        console.log('Fetched Party Details:', JSON.stringify(party, null, 2));

        // ✅ **Flatten `mediaId` structure & extract platform URLs with PARTY-SPECIFIC bid values and status**
        const processedMedia = party.media.map((entry) => {
            if (!entry.mediaId) return null; // Edge case: skip invalid entries

            // ✅ Ensure `sources` is defined to avoid `.map()` errors
            const availablePlatforms = Object.entries(entry.mediaId.sources || {})
                .filter(([key, value]) => value) // Remove null values
                .map(([key, value]) => ({ platform: key, url: value }));

            return {
                _id: entry.mediaId._id,
                id: entry.mediaId.uuid || entry.mediaId._id, // Use UUID for external API, fallback to _id
                uuid: entry.mediaId.uuid || entry.mediaId._id, // Also include uuid field for consistency
                title: entry.mediaId.title,
                artist: entry.mediaId.artist,
                duration: entry.mediaId.duration || '666',
                coverArt: entry.mediaId.coverArt || '/default-cover.jpg',
                sources: availablePlatforms, // ✅ Store platform data as an array
                globalBidValue: entry.mediaId.globalBidValue || 0, // Keep for analytics
                partyBidValue: entry.partyBidValue || 0, // ✅ Use party-specific bid value
                bids: entry.mediaId.bids || [], // ✅ Use populated bids from mediaId with user data
                addedBy: entry.mediaId.addedBy, // ✅ Ensures `addedBy` exists
                totalBidValue: entry.partyBidValue || 0, // ✅ Use party-specific total for queue ordering
                tags: entry.mediaId.tags || [], // ✅ Include tags
                category: entry.mediaId.category || 'Unknown', // ✅ Include category
                
                // Top bid tracking (individual amounts)
                topPartyBidValue: entry.topPartyBidValue || 0,
                topPartyBidUser: entry.topPartyBidUser,
                topGlobalBidValue: entry.mediaId.topGlobalBidValue || 0,
                topGlobalBidUser: entry.mediaId.topGlobalBidUser,
                
                // Top aggregate bid tracking (user totals)
                topPartyAggregateBidValue: entry.topPartyAggregateBidValue || 0,
                topPartyAggregateUser: entry.topPartyAggregateUser,
                topGlobalAggregateBidValue: entry.mediaId.topGlobalAggregateBidValue || 0,
                topGlobalAggregateUser: entry.mediaId.topGlobalAggregateUser,
                
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
            attendees: party.attendees,
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
            globalBidValue: bidAmount,
            contentType: 'music',
            contentForm: 'song'
        });

        await media.save();

        // Calculate queue context
        const queuedMedia = party.media.filter(m => m.status === 'queued');
        const queueSize = queuedMedia.length;
        const queuePosition = queueSize + 1; // This new song will be at the end

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
            
            // User aggregate tracking (first bid, so equals bid amount)
            userPartyAggregateBidValue: userPartyAggregate,
            userGlobalAggregateBidValue: userGlobalAggregate
        });

        await bid.save();

        // Add bid to media's bids array
        media.bids = media.bids || [];
        media.bids.push(bid._id);
        await media.save();

        // Add media to party with bid
        const partyMediaEntry = {
            mediaId: media._id,
            media_uuid: media.uuid,
            addedBy: userId,
            addedBy_uuid: user.uuid,
            partyBidValue: bidAmount,
            partyBids: [bid._id],
            status: 'queued',
            queuedAt: new Date(),
            // Top bid tracking (first bid is automatically the top bid)
            topPartyBidValue: bidAmount,
            topPartyBidUser: userId,
            topPartyAggregateBidValue: userPartyAggregate,
            topPartyAggregateUser: userId
        };

        party.media.push(partyMediaEntry);
        await party.save();

        // Update global bid tracking (first bid is automatically the top bid)
        media.topGlobalBidValue = bidAmount;
        media.topGlobalBidUser = userId;
        media.topGlobalAggregateBidValue = userGlobalAggregate;
        media.topGlobalAggregateUser = userId;
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

        // Calculate user aggregate bid values (before saving the new bid)
        const currentUserPartyAggregate = await calculateUserPartyAggregateBidValue(userId, actualMediaId, partyId);
        const currentUserGlobalAggregate = await calculateUserGlobalAggregateBidValue(userId, actualMediaId);
        
        // Create bid record with denormalized fields and aggregate tracking
        const bid = new Bid({
            userId,
            partyId,
            mediaId: actualMediaId, // Use mediaId instead of songId
            amount: bidAmount,
            status: 'active',
            
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
            platform: detectedPlatform,
            
            // User aggregate tracking (includes this new bid)
            userPartyAggregateBidValue: currentUserPartyAggregate + bidAmount,
            userGlobalAggregateBidValue: currentUserGlobalAggregate + bidAmount
        });

        await bid.save();

        // Update party media entry bid value
        partyMediaEntry.partyBidValue = (partyMediaEntry.partyBidValue || 0) + bidAmount;
        partyMediaEntry.partyBids = partyMediaEntry.partyBids || [];
        partyMediaEntry.partyBids.push(bid._id);
        await party.save();

        // Update media global bid value
        const media = await Media.findById(actualMediaId);
        if (media) {
            media.globalBidValue = (media.globalBidValue || 0) + bidAmount;
            media.bids = media.bids || [];
            media.bids.push(bid._id);
            await media.save();
        }

        // Update all bid tracking fields (top bidders, aggregates, etc.)
        await updatePartyBidTracking(actualMediaId, partyId);
        await updateGlobalBidTracking(actualMediaId);

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

// Mark song as playing (called by web player when song starts)
router.post('/:partyId/songs/:songId/play', authMiddleware, async (req, res) => {
    try {
        const { partyId, songId } = req.params;
        const userId = req.user._id;

        if (!isValidObjectId(partyId) || !isValidObjectId(songId)) {
            return res.status(400).json({ error: 'Invalid partyId or songId format' });
        }

        const party = await Party.findById(partyId);
        if (!party) {
            return res.status(404).json({ error: 'Party not found' });
        }

        // Check if user is the host
        if (party.host.toString() !== userId) {
            return res.status(403).json({ error: 'Only the host can start songs' });
        }

        const songIndex = party.songs.findIndex(song => song.songId.toString() === songId);
        if (songIndex === -1) {
            return res.status(404).json({ error: 'Song not found in this party' });
        }

        const songEntry = party.songs[songIndex];
        
        // Can only play queued songs
        if (songEntry.status !== 'queued') {
            return res.status(400).json({ error: 'Can only play queued songs' });
        }

        // Mark all other songs as queued
        party.songs.forEach((song, index) => {
            if (index !== songIndex && song.status === 'playing') {
                song.status = 'queued';
            }
        });

        // Mark this song as playing
        songEntry.status = 'playing';
        songEntry.playedAt = new Date();

        await party.save();

        // Broadcast play event via WebSocket
        const { broadcastToParty } = require('../utils/broadcast');
        broadcastToParty(partyId, {
            type: 'SONG_STARTED',
            songId: songId,
            playedAt: songEntry.playedAt
        });

        res.json({
            message: 'Song started playing',
            songId: songId,
            playedAt: songEntry.playedAt
        });
    } catch (err) {
        console.error('Error starting song:', err);
        res.status(500).json({ error: 'Error starting song', details: err.message });
    }
});

// Reset all songs to queued status (for testing/development)
router.post('/:partyId/songs/reset', authMiddleware, async (req, res) => {
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
            return res.status(403).json({ error: 'Only the host can reset songs' });
        }

        // Reset all songs to queued status
        party.songs.forEach(song => {
            song.status = 'queued';
            song.playedAt = null;
            song.completedAt = null;
            song.vetoedAt = null;
            song.vetoedBy = null;
        });

        await party.save();

        res.json({
            message: 'All songs reset to queued status',
            songsCount: party.songs.length
        });
    } catch (err) {
        console.error('Error resetting songs:', err);
        res.status(500).json({ error: 'Error resetting songs', details: err.message });
    }
});

// Mark song as played (called by web player when song finishes)
router.post('/:partyId/songs/:songId/complete', authMiddleware, async (req, res) => {
    try {
        const { partyId, songId } = req.params;
        const userId = req.user._id;

        if (!isValidObjectId(partyId) || !isValidObjectId(songId)) {
            return res.status(400).json({ error: 'Invalid partyId or songId format' });
        }

        const party = await Party.findById(partyId);
        if (!party) {
            return res.status(404).json({ error: 'Party not found' });
        }

        // Check if user is the host
        if (party.host.toString() !== userId) {
            return res.status(403).json({ error: 'Only the host can complete songs' });
        }

        const songIndex = party.songs.findIndex(song => song.songId.toString() === songId);
        if (songIndex === -1) {
            return res.status(404).json({ error: 'Song not found in this party' });
        }

        const songEntry = party.songs[songIndex];
        
        console.log(`Attempting to complete song ${songId} with status: ${songEntry.status}`);
        
        // Can complete playing songs or queued songs (for auto-playback)
        if (songEntry.status !== 'playing' && songEntry.status !== 'queued') {
            console.log(`Song ${songId} is in status '${songEntry.status}', cannot complete`);
            return res.status(400).json({ error: 'Can only complete playing or queued songs' });
        }

        // Mark song as played
        songEntry.status = 'played';
        songEntry.completedAt = new Date();

        await party.save();

        // Broadcast completion event via WebSocket
        const { broadcastToParty } = require('../utils/broadcast');
        console.log(`Broadcasting SONG_COMPLETED for song ${songId} in party ${partyId}`);
        broadcastToParty(partyId, {
            type: 'SONG_COMPLETED',
            songId: songId,
            completedAt: songEntry.completedAt
        });

        res.json({
            message: 'Song completed',
            songId: songId,
            completedAt: songEntry.completedAt
        });
    } catch (err) {
        console.error('Error completing song:', err);
        res.status(500).json({ error: 'Error completing song', details: err.message });
    }
});

// Get songs by status
router.get('/:partyId/songs/status/:status', authMiddleware, async (req, res) => {
    try {
        const { partyId, status } = req.params;
        const validStatuses = ['queued', 'playing', 'played', 'vetoed'];

        if (!validStatuses.includes(status)) {
            return res.status(400).json({ error: 'Invalid status. Must be one of: ' + validStatuses.join(', ') });
        }

        const party = await Party.findById(partyId)
            .populate({
                path: 'songs.songId',
                model: 'Song',
                populate: {
                    path: 'bids',
                    model: 'Bid',
                    populate: {
                        path: 'userId',
                        select: 'username profilePic uuid',  // ✅ Added profilePic and uuid for top bidders display
                    },
                },
            })
            .populate('songs.addedBy', 'username');
        if (!party) {
            return res.status(404).json({ error: 'Party not found' });
        }

        const songsWithStatus = party.songs.filter(song => song.status === status);
        
        // Sort by bid value (highest first) for all statuses
        songsWithStatus.sort((a, b) => (b.partyBidValue || 0) - (a.partyBidValue || 0));

        res.json(transformResponse({
            status: status,
            songs: songsWithStatus,
            count: songsWithStatus.length
        }));
    } catch (err) {
        console.error('Error fetching songs by status:', err);
        res.status(500).json({ error: 'Error fetching songs by status', details: err.message });
    }
});

// Veto a song (host only)
router.post('/:partyId/songs/:songId/veto', authMiddleware, async (req, res) => {
    try {
        const { partyId, songId } = req.params;
        const { reason } = req.body;
        const userId = req.user._id;

        if (!isValidObjectId(partyId) || !isValidObjectId(songId)) {
            return res.status(400).json({ error: 'Invalid partyId or songId format' });
        }

        const party = await Party.findById(partyId);
        if (!party) {
            return res.status(404).json({ error: 'Party not found' });
        }

        // Check if user is the host
        if (party.host.toString() !== userId) {
            return res.status(403).json({ error: 'Only the host can veto songs' });
        }

        const songIndex = party.songs.findIndex(song => song.songId.toString() === songId);
        if (songIndex === -1) {
            return res.status(404).json({ error: 'Song not found in this party' });
        }

        const songEntry = party.songs[songIndex];
        
        // Can only veto queued songs
        if (songEntry.status !== 'queued') {
            return res.status(400).json({ error: 'Can only veto queued songs' });
        }

        songEntry.status = 'vetoed';
        songEntry.vetoedAt = new Date();
        songEntry.vetoedBy = userId;

        await party.save();

        // Broadcast veto via WebSocket
        const { broadcastToParty } = require('../utils/broadcast');
        broadcastToParty(partyId, {
            type: 'SONG_VETOED',
            songId: songId,
            vetoedBy: userId,
            reason: reason,
            vetoedAt: songEntry.vetoedAt
        });

        res.json({
            message: 'Song vetoed successfully',
            songId: songId,
            reason: reason
        });
    } catch (err) {
        console.error('Error vetoing song:', err);
        res.status(500).json({ error: 'Error vetoing song', details: err.message });
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

// Skip to next song (remote parties only)
router.post('/:partyId/skip-next', authMiddleware, async (req, res) => {
    try {
        const { partyId } = req.params;
        const userId = req.user._id;

        const party = await Party.findById(partyId).populate('songs.songId');
        if (!party) {
            return res.status(404).json({ error: 'Party not found' });
        }

        // Only allow for remote parties
        if (party.type !== 'remote') {
            return res.status(400).json({ error: 'Skip functionality only available for remote parties' });
        }

        // Find current playing song
        const currentPlayingIndex = party.songs.findIndex(song => song.status === 'playing');
        if (currentPlayingIndex === -1) {
            return res.status(400).json({ error: 'No song currently playing' });
        }

        // Mark current song as played
        party.songs[currentPlayingIndex].status = 'played';
        party.songs[currentPlayingIndex].completedAt = new Date();

        // Find next queued song
        const nextQueuedIndex = party.songs.findIndex((song, index) => 
            index > currentPlayingIndex && song.status === 'queued'
        );

        if (nextQueuedIndex !== -1) {
            // Mark next song as playing
            party.songs[nextQueuedIndex].status = 'playing';
            party.songs[nextQueuedIndex].playedAt = new Date();
        }

        await party.save();

        res.json({ 
            success: true, 
            message: 'Skipped to next song',
            currentSong: nextQueuedIndex !== -1 ? party.songs[nextQueuedIndex] : null
        });

    } catch (error) {
        console.error('Error skipping to next song:', error);
        res.status(500).json({ error: 'Failed to skip to next song' });
    }
});

// Skip to previous song (remote parties only)
router.post('/:partyId/skip-previous', authMiddleware, async (req, res) => {
    try {
        const { partyId } = req.params;
        const userId = req.user._id;

        const party = await Party.findById(partyId).populate('songs.songId');
        if (!party) {
            return res.status(404).json({ error: 'Party not found' });
        }

        // Only allow for remote parties
        if (party.type !== 'remote') {
            return res.status(400).json({ error: 'Skip functionality only available for remote parties' });
        }

        // Find current playing song
        const currentPlayingIndex = party.songs.findIndex(song => song.status === 'playing');
        if (currentPlayingIndex === -1) {
            return res.status(400).json({ error: 'No song currently playing' });
        }

        // Find previous played song
        const previousPlayedIndex = party.songs.findIndex((song, index) => 
            index < currentPlayingIndex && song.status === 'played'
        );

        if (previousPlayedIndex !== -1) {
            // Mark current song as queued
            party.songs[currentPlayingIndex].status = 'queued';
            party.songs[currentPlayingIndex].playedAt = undefined;

            // Mark previous song as playing
            party.songs[previousPlayedIndex].status = 'playing';
            party.songs[previousPlayedIndex].completedAt = undefined;
        }

        await party.save();

        res.json({ 
            success: true, 
            message: 'Skipped to previous song',
            currentSong: previousPlayedIndex !== -1 ? party.songs[previousPlayedIndex] : null
        });

    } catch (error) {
        console.error('Error skipping to previous song:', error);
        res.status(500).json({ error: 'Failed to skip to previous song' });
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

// Remove a song from a party (veto functionality)
router.delete('/:partyId/songs/:songId', authMiddleware, async (req, res) => {
    try {
        const { partyId, songId } = req.params;
        const userId = req.user._id;

        // Validate IDs
        if (!mongoose.isValidObjectId(partyId) || !mongoose.isValidObjectId(songId)) {
            return res.status(400).json({ error: 'Invalid party or song ID format' });
        }

        // Find the party
        const party = await Party.findById(partyId);
        if (!party) {
            return res.status(404).json({ error: 'Party not found' });
        }

        // Check if user is the host (only host can veto)
        if (party.host.toString() !== userId) {
            return res.status(403).json({ error: 'Only the party host can veto songs' });
        }

        // Find the song in the party's queue
        const songIndex = party.songs.findIndex(entry => entry.songId.toString() === songId);
        if (songIndex === -1) {
            return res.status(404).json({ error: 'Song not found in party queue' });
        }

        // Update the song status to vetoed instead of removing it completely
        party.songs[songIndex].status = 'vetoed';
        party.songs[songIndex].vetoedAt = new Date();
        party.songs[songIndex].vetoedBy = userId;

        await party.save();

        // Broadcast the veto event to all party members
        const { broadcastToParty } = require('../utils/broadcast');
        broadcastToParty(partyId, {
            type: 'SONG_VETOED',
            songId: songId,
            vetoedAt: party.songs[songIndex].vetoedAt,
            vetoedBy: userId
        });

        res.json({
            message: 'Song vetoed successfully',
            songId: songId,
            vetoedAt: party.songs[songIndex].vetoedAt
        });

    } catch (err) {
        console.error('Error vetoing song:', err);
        res.status(500).json({ error: 'Error vetoing song', details: err.message });
    }
});

// Get media sorted by bid values within specific time periods
router.get('/:partyId/songs/sorted/:timePeriod', authMiddleware, resolvePartyId(), async (req, res) => {
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
                select: 'title artist duration coverArt sources globalBidValue bids addedBy tags category uuid',
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
        const processedSongs = party.media
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
                    globalBidValue: entry.mediaId.globalBidValue || 0,
                    partyBidValue: entry.partyBidValue || 0, // All-time party bid value
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
            .filter(song => song !== null)
            .sort((a, b) => (b.timePeriodBidValue || 0) - (a.timePeriodBidValue || 0)); // Sort by time period bid value

        res.json(transformResponse({
            timePeriod: timePeriod,
            songs: processedSongs,
            count: processedSongs.length,
            periodStartDate: startDate,
            periodEndDate: now
        }));

    } catch (err) {
        console.error('Error fetching songs sorted by time period:', err);
        res.status(500).json({ 
            error: 'Error fetching songs sorted by time period', 
            details: err.message 
        });
    }
});

// @route   PUT /api/parties/:partyId/songs/:songId/veto
// @desc    Veto a song (host only) - sets status to 'vetoed' and removes from queue
// @access  Private (host only)
router.put('/:partyId/songs/:songId/veto', authMiddleware, async (req, res) => {
    try {
        const { partyId, songId } = req.params;
        
        const party = await Party.findById(partyId);
        if (!party) {
            return res.status(404).json({ error: 'Party not found' });
        }
        
        // Check if user is the host
        if (party.host.toString() !== req.user._id.toString()) {
            return res.status(403).json({ error: 'Only the host can veto songs' });
        }
        
        // Find the song in the party
        const songEntry = party.songs.find(s => 
            (s.songId && s.songId.toString() === songId) || 
            (s.song_uuid === songId) ||
            (s.episodeId && s.episodeId.toString() === songId) ||
            (s.episode_uuid === songId)
        );
        
        if (!songEntry) {
            return res.status(404).json({ error: 'Song not found in party' });
        }
        
        // Update song status to vetoed
        songEntry.status = 'vetoed';
        songEntry.vetoedAt = new Date();
        songEntry.vetoedBy = req.user._id;
        songEntry.vetoedBy_uuid = req.user.uuid;
        
        await party.save();
        
        res.json(transformResponse({
            message: 'Song vetoed successfully',
            party: party
        }));
        
    } catch (err) {
        console.error('Error vetoing song:', err);
        res.status(500).json({ 
            error: 'Error vetoing song', 
            details: err.message 
        });
    }
});

// @route   PUT /api/parties/:partyId/songs/:songId/unveto
// @desc    Un-veto a song (restore to queue) - host only
// @access  Private (host only)
router.put('/:partyId/songs/:songId/unveto', authMiddleware, async (req, res) => {
    try {
        const { partyId, songId } = req.params;
        
        const party = await Party.findById(partyId);
        if (!party) {
            return res.status(404).json({ error: 'Party not found' });
        }
        
        // Check if user is the host
        if (party.host.toString() !== req.user._id.toString()) {
            return res.status(403).json({ error: 'Only the host can un-veto songs' });
        }
        
        // Find the song in the party
        const songEntry = party.songs.find(s => 
            (s.songId && s.songId.toString() === songId) || 
            (s.song_uuid === songId) ||
            (s.episodeId && s.episodeId.toString() === songId) ||
            (s.episode_uuid === songId)
        );
        
        if (!songEntry) {
            return res.status(404).json({ error: 'Song not found in party' });
        }
        
        // Restore song to queued status
        songEntry.status = 'queued';
        songEntry.vetoedAt = null;
        songEntry.vetoedBy = null;
        songEntry.vetoedBy_uuid = null;
        
        await party.save();
        
        res.json(transformResponse({
            message: 'Song restored to queue successfully',
            party: party
        }));
        
    } catch (err) {
        console.error('Error un-vetoing song:', err);
        res.status(500).json({ 
            error: 'Error un-vetoing song', 
            details: err.message 
        });
    }
});

module.exports = router;