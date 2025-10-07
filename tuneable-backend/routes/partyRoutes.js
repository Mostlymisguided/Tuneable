const express = require('express');
const mongoose = require('mongoose');
const crypto = require('crypto');
const axios = require('axios');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const Party = require('../models/Party');
const Song = require('../models/Song');
const Bid = require('../models/Bid');
const User = require('../models/User');
const { getVideoDetails } = require('../services/youtubeService');
const { isValidObjectId } = require('../utils/validators');
const { broadcast } = require('../utils/broadcast');
const { transformResponse } = require('../utils/uuidTransform');
const { resolvePartyId } = require('../utils/idResolver');
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
            .select('-songs') // Exclude songs for better performance
            .populate('host', 'username'); // Populate the host field with the username only

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
                path: 'songs.songId',
                model: 'Song',
                select: 'title artist duration coverArt sources globalBidValue bids addedBy tags category', // ✅ Added `addedBy`, `tags`, `category`
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
                select: 'username',
            })
            .populate({
                path: 'host',
                model: 'User',
                select: 'username',
            });

        if (!party) {
            return res.status(404).json({ error: 'Party not found' });
        }

        console.log('Fetched Party Details:', JSON.stringify(party, null, 2));

        // ✅ **Flatten `songId` structure & extract platform URLs with PARTY-SPECIFIC bid values and status**
        const processedSongs = party.songs.map((entry) => {
            if (!entry.songId) return null; // Edge case: skip invalid entries

            // ✅ Ensure `sources` is defined to avoid `.map()` errors
            const availablePlatforms = Object.entries(entry.songId.sources || {})
                .filter(([key, value]) => value) // Remove null values
                .map(([key, value]) => ({ platform: key, url: value }));

            return {
                _id: entry.songId._id,
                id: entry.songId.uuid || entry.songId._id, // Use UUID for external API, fallback to _id
                uuid: entry.songId.uuid || entry.songId._id, // Also include uuid field for consistency
                title: entry.songId.title,
                artist: entry.songId.artist,
                duration: entry.songId.duration || '666',
                coverArt: entry.songId.coverArt || '/default-cover.jpg',
                sources: availablePlatforms, // ✅ Store platform data as an array
                globalBidValue: entry.songId.globalBidValue || 0, // Keep for analytics
                partyBidValue: entry.partyBidValue || 0, // ✅ Use party-specific bid value
                bids: entry.partyBids || [], // ✅ Use party-specific bids
                addedBy: entry.songId.addedBy, // ✅ Ensures `addedBy` exists
                totalBidValue: entry.partyBidValue || 0, // ✅ Use party-specific total for queue ordering
                tags: entry.songId.tags || [], // ✅ Include tags
                category: entry.songId.category || 'Unknown', // ✅ Include category
                
                // ✅ NEW: Song status and timing information
                status: entry.status || 'queued',
                queuedAt: entry.queuedAt,
                playedAt: entry.playedAt,
                completedAt: entry.completedAt,
                vetoedAt: entry.vetoedAt,
                vetoedBy: entry.vetoedBy,
            };
        }).filter(Boolean); // ✅ Remove null entries

        // ✅ Sort songs by status and then by bid value
        processedSongs.sort((a, b) => {
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
            songs: processedSongs, // ✅ Return flattened, sorted songs
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

// Place a bid on an existing song or add a new song with a bid
router.post('/:partyId/songs/bid', authMiddleware, resolvePartyId(), async (req, res) => {
    try {
        console.log("🎯 SONGS/BID ENDPOINT CALLED");
        console.log("🎯 Request body:", JSON.stringify(req.body, null, 2));
        const { partyId } = req.params;
        const { songId, url, title, artist, bidAmount, platform, duration, coverArt, tags, category } = req.body;
        console.log("🎯 Tags received:", tags);
        console.log("🎯 Category received:", category);
        const userId = req.user._id;

        // Note: partyId validation handled by resolvePartyId() middleware

        if (bidAmount <= 0) {
            return res.status(400).json({ error: 'Bid amount must be greater than 0' });
        }

        // ✅ Check minimum bid for boost bids on existing songs (£0.01 minimum)
        if (bidAmount < 0.01) {
            return res.status(400).json({ 
                error: 'Bid amount must be at least £0.01 for boost bids',
                minimumBid: 0.01,
                providedBid: bidAmount
            });
        }

        // ✅ Check user balance before processing bid
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Convert to pence to avoid floating point precision issues
        const userBalancePence = Math.round(user.balance * 100);
        const bidAmountPence = Math.round(bidAmount * 100);

        if (userBalancePence < bidAmountPence) {
            return res.status(400).json({ 
                error: 'Insufficient funds', 
                currentBalance: user.balance,
                requiredAmount: bidAmount 
            });
        }

        // ✅ Convert duration to integer & validate
        const extractedDuration = duration && !isNaN(duration) ? parseInt(duration, 10) : 888;
        const extractedCoverArt = req.body.coverArt && req.body.coverArt.includes("http")
    ? req.body.coverArt 
    : `https://img.youtube.com/vi/${req.body.url.split("v=")[1]}/hqdefault.jpg`; // ✅ Generate from video ID

        // ✅ Fetch party only once
        const party = await Party.findById(partyId).populate('songs.songId');
        if (!party) {
            return res.status(404).json({ error: 'Party not found' });
        }

        // ✅ Ensure all existing songs have contentType set (migration for old data)
        let needsSave = false;
        for (const songEntry of party.songs) {
            if (!songEntry.contentType) {
                songEntry.contentType = 'song'; // Default to 'song' for existing entries
                needsSave = true;
            }
        }
        if (needsSave) {
            await party.save();
            console.log("✅ Migrated existing songs to include  (songs/bid)");
        }

        let song;
        if (songId && mongoose.isValidObjectId(songId)) {
            // ✅ Check if song exists in DB (only if songId is a valid MongoDB ObjectId)

            song = await Song.findById(songId).populate({
                path: 'bids',
                populate: { path: 'userId', select: 'username' }
            });

            if (!song) {
                return res.status(404).json({ error: 'Song not found' });
            }

            // ✅ Check if song is already in the party's queue
            console.log("🔍 Checking for duplicate song in party queue...");
            console.log("🔍 Looking for songId:", songId);
            console.log("🔍 Party has", party.songs.length, "songs");
            party.songs.forEach((entry, index) => {
                console.log(`🔍 Song ${index}:`, entry.songId?.toString(), "matches?", entry.songId?.toString() === songId);
            });
            
            const existingPartySong = party.songs.find(entry => entry.songId?.toString() === songId);
            if (existingPartySong) {
                // Song already exists in party - just add the bid amount to existing song
                console.log("🎵 Song already in party queue, adding bid to existing song");
                
                // Create a new bid for the existing song
                const bid = new Bid({
                    userId,
                    partyId,
                    songId: song._id,
                    amount: bidAmount,
                });
                await bid.save();

                // ✅ Deduct bid amount from user balance (using pence to avoid floating point issues)
                user.balance = (userBalancePence - bidAmountPence) / 100;
                await user.save();

                // Update the song with bid info
                song.bids.push(bid._id);
                song.globalBidValue = (song.globalBidValue || 0) + bidAmount;
                await song.save();

                // Update the party-specific bid value
                existingPartySong.partyBids = existingPartySong.partyBids || [];
                existingPartySong.partyBids.push(bid._id);
                existingPartySong.partyBidValue = (existingPartySong.partyBidValue || 0) + bidAmount;
                await party.save();

                // Fetch updated song with populated bid info
                const updatedSong = await Song.findById(song._id).populate({
                    path: 'bids',
                    populate: { path: 'userId', select: 'username' }
                });

                return res.status(200).json({
                    message: 'Bid added to existing song in queue!',
                    song: updatedSong,
                    isDuplicate: true
                });
            }
        } else if (url && title && artist && platform) {
            // ✅ Try finding the song by platform URL
            song = await Song.findOne({ [`sources.${platform}`]: url });

            if (!song) {
                // ✅ Create a new song if it doesn't exist
                console.log("🎵 Creating new song with tags:", tags, "and category:", category);
                
                // For YouTube videos, fetch detailed info (tags, category) only when adding to party
                let videoTags = Array.isArray(tags) ? tags : [];
                let videoCategory = category || 'Unknown';
                
                if (platform === 'youtube') {
                    console.log("🎵 Fetching detailed video info for YouTube video...");
                    console.log("🎵 Platform:", platform, "URL:", url);
                    try {
                        const videoId = url.split('v=')[1]?.split('&')[0];
                        console.log("🎵 Extracted video ID:", videoId);
                        if (videoId) {
                            console.log("🎵 Calling getVideoDetails with videoId:", videoId);
                            const videoDetails = await getVideoDetails(videoId);
                            console.log("🎵 Video details response:", videoDetails);
                            videoTags = videoDetails.tags || [];
                            videoCategory = videoDetails.category || 'Unknown';
                            console.log("🎵 Fetched video details - Tags:", videoTags.length, "Category:", videoCategory);
                        } else {
                            console.log("❌ Could not extract video ID from URL:", url);
                        }
                    } catch (error) {
                        console.error("❌ Error fetching video details:", error);
                        console.log("🎵 Continuing with default values due to error");
                        // Continue with default values if API call fails
                        videoTags = [];
                        videoCategory = 'Unknown';
                    }
                } else {
                    console.log("🎵 Not YouTube platform, skipping video details fetch. Platform:", platform);
                }
                
                song = new Song({
                    title,
                    artist,
                    coverArt: extractedCoverArt,
                    duration: extractedDuration || 777, // ✅ Store duration correctly
                    sources: { [platform]: url },
                    tags: videoTags,
                    category: videoCategory,
                    addedBy: userId
                });

                console.log("🎵 Saving song to database:", JSON.stringify(song, null, 2)); // ✅ Proper log
                try {
                    await song.save();
                    console.log("✅ Song saved successfully");
                } catch (saveError) {
                    console.error("❌ Error saving song:", saveError);
                    throw saveError;
                }
            }

            // ✅ Check if song is already in the party's queue
            console.log("🔍 Checking for duplicate song in party queue (URL path)...");
            console.log("🔍 Looking for song._id:", song._id.toString());
            console.log("🔍 Party has", party.songs.length, "songs");
            party.songs.forEach((entry, index) => {
                console.log(`🔍 Song ${index}:`, entry.songId?.toString(), "matches?", entry.songId?.toString() === song._id.toString());
            });
            
            const existingPartySong = party.songs.find(entry => entry.songId?.toString() === song._id.toString());
            if (existingPartySong) {
                // Song already exists in party - just add the bid amount to existing song
                console.log("🎵 Song already in party queue, adding bid to existing song");
                
                // Create a new bid for the existing song
                const bid = new Bid({
                    userId,
                    partyId,
                    songId: song._id,
                    amount: bidAmount,
                });
                await bid.save();

                // ✅ Deduct bid amount from user balance (using pence to avoid floating point issues)
                user.balance = (userBalancePence - bidAmountPence) / 100;
                await user.save();

                // Update the song with bid info
                song.bids.push(bid._id);
                song.globalBidValue = (song.globalBidValue || 0) + bidAmount;
                await song.save();

                // Update the party-specific bid value
                existingPartySong.partyBids = existingPartySong.partyBids || [];
                existingPartySong.partyBids.push(bid._id);
                existingPartySong.partyBidValue = (existingPartySong.partyBidValue || 0) + bidAmount;
                await party.save();

                // Fetch updated song with populated bid info
                const updatedSong = await Song.findById(song._id).populate({
                    path: 'bids',
                    populate: { path: 'userId', select: 'username' }
                });

                return res.status(200).json({
                    message: 'Bid added to existing song in queue!',
                    song: updatedSong,
                    isDuplicate: true
                });
            } else {
                // ✅ Song not in party yet - add it to the party's playlist
                party.songs.push({ 
                    songId: song._id, 
                    addedBy: userId,
                    contentType: 'song'
                });
                await party.save();
            }
        } else if (url && title && artist && platform) {
            // ✅ Handle case where songId is not a valid MongoDB ObjectId (e.g., YouTube video ID)
            // Try finding the song by platform URL
            song = await Song.findOne({ [`sources.${platform}`]: url });

            if (!song) {
                // ✅ Create a new song if it doesn't exist
                console.log("🎵 Creating new song (songs/bid) with tags:", tags, "and category:", category);
                
                // For YouTube videos, fetch detailed info (tags, category) only when adding to party
                let videoTags = Array.isArray(tags) ? tags : [];
                let videoCategory = category || 'Unknown';
                
                if (platform === 'youtube') {
                    console.log("🎵 Fetching detailed video info for YouTube video (songs/bid)...");
                    console.log("🎵 Platform (songs/bid):", platform, "URL:", url);
                    try {
                        const videoId = url.split('v=')[1]?.split('&')[0];
                        console.log("🎵 Extracted video ID (songs/bid):", videoId);
                        if (videoId) {
                            console.log("🎵 Calling getVideoDetails with videoId (songs/bid):", videoId);
                            const videoDetails = await getVideoDetails(videoId);
                            console.log("🎵 Video details response (songs/bid):", videoDetails);
                            videoTags = videoDetails.tags || [];
                            videoCategory = videoDetails.category || 'Unknown';
                            console.log("🎵 Fetched video details (songs/bid) - Tags:", videoTags.length, "Category:", videoCategory);
                        } else {
                            console.log("❌ Could not extract video ID from URL (songs/bid):", url);
                        }
                    } catch (error) {
                        console.error("❌ Error fetching video details (songs/bid):", error);
                        console.log("🎵 Continuing with default values due to error (songs/bid)");
                        // Continue with default values if API call fails
                        videoTags = [];
                        videoCategory = 'Unknown';
                    }
                } else {
                    console.log("🎵 Not YouTube platform, skipping video details fetch (songs/bid). Platform:", platform);
                }
                
                song = new Song({
                    title,
                    artist,
                    coverArt: extractedCoverArt,
                    duration: extractedDuration || 777,
                    sources: { [platform]: url },
                    tags: videoTags,
                    category: videoCategory,
                    addedBy: userId
                });
                try {
                    await song.save();
                    console.log("✅ Song saved successfully (songs/bid)");
                } catch (saveError) {
                    console.error("❌ Error saving song (songs/bid):", saveError);
                    throw saveError;
                }
            }

            // Add song to party if not already there
            const existingPartySong = party.songs.find(entry => entry.songId?.toString() === song._id.toString());
            if (!existingPartySong) {
                party.songs.push({ 
                    songId: song._id, 
                    addedBy: userId,
                    contentType: 'song'
                });
                await party.save();
            }
        } else {
            return res.status(400).json({ error: 'Either songId or song metadata (url, title, artist, platform) must be provided.' });
        }

        // ✅ Create a new bid for the song
        const bid = new Bid({
            userId,
            partyId,
            songId: song._id,
            amount: bidAmount,
        });
        await bid.save();

        // ✅ Deduct bid amount from user balance (using pence to avoid floating point issues)
        user.balance = (userBalancePence - bidAmountPence) / 100;
        await user.save();

        // ✅ Update the song with bid info
        song.bids.push(bid._id);
        song.globalBidValue = (song.globalBidValue || 0) + bidAmount;
        await song.save();

        // ✅ Update party-specific song entry with bid info
        const partySongEntry = party.songs.find(entry => entry.songId?.toString() === song._id.toString());
        if (partySongEntry) {
            partySongEntry.partyBids = partySongEntry.partyBids || [];
            partySongEntry.partyBids.push(bid._id);
            partySongEntry.partyBidValue = (partySongEntry.partyBidValue || 0) + bidAmount;
            await party.save();
        }

        // ✅ Fetch updated song with populated bid info
        const updatedSong = await Song.findById(song._id).populate({
            path: 'bids',
            populate: { path: 'userId', select: 'username' }
        });

        res.status(200).json(transformResponse({
            message: 'Bid placed successfully!',
            song: updatedSong
        }));
    } catch (err) {
        console.error("❌ Error placing bid:", err);
        res.status(500).json({ error: 'Error placing bid', details: err.message });
    }
});

// test bid route from songcard
// Place a bid on an existing song
router.post('/:partyId/songcardbid', authMiddleware, resolvePartyId(), async (req, res) => {
    try {
        const { partyId } = req.params;
        const { songId, url, title, artist, bidAmount, platform, duration, tags, category } = req.body;
        const userId = req.user._id;

        if (!mongoose.isValidObjectId(partyId)) {
            return res.status(400).json({ error: 'Invalid partyId format' });
        }

        if (bidAmount <= 0) {
            return res.status(400).json({ error: 'Bid amount must be greater than 0' });
        }

        // ✅ Fetch party with populated songs and check minimum bid requirement
        const party = await Party.findById(partyId).populate('songs.songId');
        if (!party) {
            return res.status(404).json({ error: 'Party not found' });
        }

        // ✅ Ensure all existing songs have contentType set (migration for old data)
        let needsSave = false;
        for (const songEntry of party.songs) {
            if (!songEntry.contentType) {
                songEntry.contentType = 'song'; // Default to 'song' for existing entries
                needsSave = true;
            }
        }
        if (needsSave) {
            await party.save();
            console.log("✅ Migrated existing songs to include contentType");
        }

        // ✅ Check minimum bid for songcardbid (initial song additions)
        if (bidAmount < party.minimumBid) {
            return res.status(400).json({ 
                error: `Bid amount must be at least £${party.minimumBid}`,
                minimumBid: party.minimumBid,
                providedBid: bidAmount
            });
        }

        // ✅ Check user balance before processing bid
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Convert to pence to avoid floating point precision issues
        const userBalancePence = Math.round(user.balance * 100);
        const bidAmountPence = Math.round(bidAmount * 100);

        if (userBalancePence < bidAmountPence) {
            return res.status(400).json({ 
                error: 'Insufficient funds', 
                currentBalance: user.balance,
                requiredAmount: bidAmount 
            });
        }

        // ✅ Convert duration to integer & validate
        const extractedDuration = duration && !isNaN(duration) ? parseInt(duration, 10) : 888;
        const extractedCoverArt = req.body.coverArt && req.body.coverArt.includes("http")
            ? req.body.coverArt 
            : `https://img.youtube.com/vi/${req.body.url.split("v=")[1]}/hqdefault.jpg`;

        let song;
        let partySongEntry = null;

        if (songId) {
            // ✅ Check if song exists in DB - handle both ObjectId and UUID
            if (mongoose.isValidObjectId(songId)) {
                // Handle MongoDB ObjectId
                song = await Song.findById(songId);
                if (!song) {
                    return res.status(404).json({ error: 'Song not found' });
                }

                // Find the party-specific song entry
                partySongEntry = party.songs.find(entry => entry.songId._id.toString() === songId);
                if (!partySongEntry) {
                    return res.status(404).json({ error: 'Song not found in this party' });
                }
            } else {
                // Handle UUID
                song = await Song.findOne({ uuid: songId });
                if (!song) {
                    return res.status(404).json({ error: 'Song not found' });
                }

                // Find the party-specific song entry by UUID
                partySongEntry = party.songs.find(entry => entry.song_uuid === songId || entry.songId.uuid === songId);
                if (!partySongEntry) {
                    return res.status(404).json({ error: 'Song not found in this party' });
                }
            }
        } else if (url && title && artist && platform) {
            // ✅ Try finding the song by platform URL
            song = await Song.findOne({ [`sources.${platform}`]: url });

            if (!song) {
                // ✅ Create a new song if it doesn't exist
                console.log("🎵 Creating new song (songcardbid) with tags:", tags, "and category:", category);
                
                // For YouTube videos, fetch detailed info (tags, category) only when adding to party
                let videoTags = Array.isArray(tags) ? tags : [];
                let videoCategory = category || 'Unknown';
                
                if (platform === 'youtube') {
                    console.log("🎵 Fetching detailed video info for YouTube video (songcardbid)...");
                    console.log("🎵 Platform (songcardbid):", platform, "URL:", url);
                    try {
                        const videoId = url.split('v=')[1]?.split('&')[0];
                        console.log("🎵 Extracted video ID (songcardbid):", videoId);
                        if (videoId) {
                            console.log("🎵 Calling getVideoDetails with videoId (songcardbid):", videoId);
                            const videoDetails = await getVideoDetails(videoId);
                            console.log("🎵 Video details response (songcardbid):", videoDetails);
                            videoTags = videoDetails.tags || [];
                            videoCategory = videoDetails.category || 'Unknown';
                            console.log("🎵 Fetched video details (songcardbid) - Tags:", videoTags.length, "Category:", videoCategory);
                        } else {
                            console.log("❌ Could not extract video ID from URL (songcardbid):", url);
                        }
                    } catch (error) {
                        console.error("❌ Error fetching video details (songcardbid):", error);
                        console.log("🎵 Continuing with default values due to error (songcardbid)");
                        // Continue with default values if API call fails
                        videoTags = [];
                        videoCategory = 'Unknown';
                    }
                } else {
                    console.log("🎵 Not YouTube platform, skipping video details fetch (songcardbid). Platform:", platform);
                }
                
                song = new Song({
                    title,
                    artist,
                    coverArt: extractedCoverArt,
                    duration: extractedDuration || 777,
                    sources: { [platform]: url },
                    tags: videoTags,
                    category: videoCategory,
                    addedBy: userId
                });
                try {
                    await song.save();
                    console.log("✅ Song saved successfully (songcardbid)");
                } catch (saveError) {
                    console.error("❌ Error saving song (songcardbid):", saveError);
                    throw saveError;
                }
            }

            // Find or create party-specific song entry
            partySongEntry = party.songs.find(entry => entry.songId._id.toString() === song._id.toString());
            if (!partySongEntry) {
                // Add song to party with initial party-specific bid values
                partySongEntry = {
                    songId: song._id,
                    addedBy: userId,
                    partyBidValue: 0,
                    partyBids: [],
                    contentType: 'song'
                };
                party.songs.push(partySongEntry);
            }
        } else {
            return res.status(400).json({ error: 'Either songId or song metadata (url, title, artist, platform) must be provided.' });
        }

        // ✅ Create a new bid
        const bid = new Bid({
            userId,
            partyId,
            songId: song._id,
            amount: bidAmount,
        });
        await bid.save();

        // ✅ Deduct bid amount from user balance (using pence to avoid floating point issues)
        user.balance = (userBalancePence - bidAmountPence) / 100;
        await user.save();

        // ✅ Update GLOBAL song bid info (for analytics)
        song.globalBids = song.globalBids || [];
        song.globalBids.push(bid._id);
        song.globalBidValue = (song.globalBidValue || 0) + bidAmount;
        
        // Keep legacy bids field for backward compatibility
        song.bids = song.bids || [];
        song.bids.push(bid._id);
        
        await song.save();

        // ✅ Update PARTY-SPECIFIC song bid info (for queue ordering)
        partySongEntry.partyBids = partySongEntry.partyBids || [];
        partySongEntry.partyBids.push(bid._id);
        partySongEntry.partyBidValue = (partySongEntry.partyBidValue || 0) + bidAmount;
        
        await party.save();

        // ✅ Fetch updated song with populated bid info for response
        const updatedSong = await Song.findById(song._id).populate({
            path: 'globalBids',
            populate: { path: 'userId', select: 'username' }
        });

        // ✅ Get party-specific bid info
        const partyBids = await Bid.find({ 
            _id: { $in: partySongEntry.partyBids } 
        }).populate('userId', 'username');

        res.status(200).json(transformResponse({
            message: 'Bid placed successfully!',
            song: {
                ...updatedSong.toObject(),
                partyBidValue: partySongEntry.partyBidValue,
                partyBids: partyBids
            },
            updatedBalance: user.balance
        }));
    } catch (err) {
        console.error("❌ Error placing bid:", err);
        res.status(500).json({ error: 'Error placing bid', details: err.message });
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

        const party = await Party.findById(partyId).populate('songs.songId').populate('songs.addedBy', 'username');
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

// Get songs sorted by bid values within specific time periods
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
                path: 'songs.songId',
                model: 'Song',
                select: 'title artist duration coverArt sources globalBidValue bids addedBy tags category'
            })
            .populate('songs.addedBy', 'username');

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

        const bids = await Bid.find(bidQuery).select('songId episodeId amount createdAt');

        // Calculate bid values for each song within the time period
        const songBidValues = {};
        bids.forEach(bid => {
            const songId = bid.songId?.toString() || bid.episodeId?.toString();
            if (songId) {
                songBidValues[songId] = (songBidValues[songId] || 0) + bid.amount;
            }
        });

        // Process and sort songs by their bid values within the time period
        const processedSongs = party.songs
            .map((entry) => {
                if (!entry.songId) return null;

                const availablePlatforms = Object.entries(entry.songId.sources || {})
                    .filter(([key, value]) => value)
                    .map(([key, value]) => ({ platform: key, url: value }));

                const timePeriodBidValue = songBidValues[entry.songId._id.toString()] || 0;

                return {
                    _id: entry.songId._id,
                    id: entry.songId.uuid || entry.songId._id, // Use UUID for external API, fallback to _id
                    uuid: entry.songId.uuid || entry.songId._id, // Also include uuid field for consistency
                    title: entry.songId.title,
                    artist: entry.songId.artist,
                    duration: entry.songId.duration,
                    coverArt: entry.songId.coverArt,
                    sources: entry.songId.sources,
                    availablePlatforms,
                    globalBidValue: entry.songId.globalBidValue || 0,
                    partyBidValue: entry.partyBidValue || 0, // All-time party bid value
                    timePeriodBidValue, // Bid value for the specific time period
                    addedBy: entry.addedBy,
                    status: entry.status,
                    queuedAt: entry.queuedAt,
                    playedAt: entry.playedAt,
                    completedAt: entry.completedAt,
                    vetoedAt: entry.vetoedAt,
                    vetoedBy: entry.vetoedBy,
                    contentType: entry.contentType || 'song'
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

module.exports = router;