const express = require('express');
const mongoose = require('mongoose');
const crypto = require('crypto');
const axios = require('axios');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const Party = require('../models/Party');
const Song = require('../models/Song');
const Bid = require('../models/Bid');
const { isValidObjectId } = require('../utils/validators');
const { broadcast } = require('../utils/broadcast');
require('dotenv').config(); // Load .env variables

//const { What3words } = require('@what3words/api');

//const w3w = new What3words({ apiKey: process.env.WHAT3WORDS_API_KEY });
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
  
      const { name, venue, location, startTime, endTime, type, watershed } = req.body;
  
      if (!name ) {
        console.log('❌ Missing Name');
        return res.status(400).json({ error: 'Name is required' });
      }

      if (!location ) {
        return res.status(400).json({ message: "Location is required" });
      }
  
      const userId = req.user.userId;
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
        venue,
        location,
        host: userId,
        partyCode,
        attendees: [userId],
        songs: [],
        bids: [],
        startTime,
        endTime,
        type: type || 'public',
        status: 'scheduled',
        watershed,
      });
  
      await party.save();
      console.log('✅ Party Created Successfully:', party);
  
      broadcast(party._id, { message: 'New party created', party });
      res.status(201).json({ message: 'Party created successfully', party });
  
    } catch (err) {
      console.error('🔥 Error creating party:', err);
      res.status(500).json({ error: 'Server error', details: err.message });
    }
  });
  
 /* // Join an existing party - defunct route?
router.post('/:id/join', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.userId;
        const party = await Party.findById(id);
        if (!party) return res.status(404).json({ error: 'Party not found' });

       if (party.type === 'private' & FormData.partycode !=== partyCode)
            return res.status(444).json({ error: 'Party Code incorrect' });

        if (party.attendees.includes(userId))
            return res.status(400).json({ error: 'User already joined the party' });

        party.attendees.push(userId);
        await party.save();

        res.status(200).json({ message: 'Successfully joined the party', party });
    } catch (err) {
        handleError(res, err, 'Failed to join party');
    }
}); */

router.post("/join/:partyId", authMiddleware, async (req, res) => {
    const { partyId } = req.params;
    const { inviteCode, location } = req.body;
    const userId = req.user.userId;

    try {
        const party = await Party.findById(partyId);
        if (!party) return res.status(404).json({ message: "Party not found" });

        if (party.type === "private" && party.inviteCode !== inviteCode) {
            return res.status(403).json({ message: "Invalid invite code" });
        }

        if (party.type === "geocoded") {
            const distance = calculateDistance(location, party.location);
            if (distance > party.allowedRadius) {
                return res.status(403).json({ message: "You're too far away to join" });
            }
        }

        if (!party.attendees.includes(userId)) {
            party.attendees.push(userId);
            await party.save();
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
            .select('-songs') // Exclude songs for better performance
            .populate('host', 'username'); // Populate the host field with the username only

        res.status(200).json({ message: 'Parties fetched successfully', parties });
    } catch (err) {
        handleError(res, err, 'Failed to fetch parties');
    }
});

// FETCH PARTY DETAILS
router.get('/:id/details', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({ error: 'Invalid Party ID format' });
        }

        const party = await Party.findById(id)
            .populate({
                path: 'songs.songId',
                model: 'Song',
                select: 'title artist duration coverArt sources globalBidValue bids addedBy', // ✅ Added `addedBy`
                populate: {
                    path: 'bids',
                    model: 'Bid',
                    populate: {
                        path: 'userId',
                        select: 'username',
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
            venue: party.venue,
            location: party.location,
            host: party.host,
            partyCode: party.partyCode,
            attendees: party.attendees,
            startTime: party.startTime,
            endTime: party.endTime,
            watershed: party.watershed,
            availability: party.type,
            status: party.status,
            createdAt: party.createdAt,
            updatedAt: party.updatedAt,
            songs: processedSongs, // ✅ Return flattened, sorted songs
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

// What3words: Convert lat/lon to a 3-word address
router.post('/convert-to-3wa', async (req, res) => {
    const { lat, lon } = req.body;
    try {
        const response = await w3w.convertTo3wa({ lat, lon });
        res.json({ what3words: response.words });
    } catch (error) {
        handleError(res, error, 'Error converting to What3words');
    }
});

// What3words: Convert 3-word address to lat/lon
router.post('/convert-to-coordinates', async (req, res) => {
    const { words } = req.body;
    try {
        const response = await w3w.convertToCoordinates({ words });
        res.json({ lat: response.coordinates.lat, lon: response.coordinates.lng });
    } catch (error) {
        handleError(res, error, 'Error converting from What3words');
    }
});

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
router.post('/:partyId/songs/bid', authMiddleware, async (req, res) => {
    try {
        const { partyId } = req.params;
        const { songId, url, title, artist, bidAmount, platform, duration, coverArt } = req.body;
        const userId = req.user.userId;

        if (!mongoose.isValidObjectId(partyId)) {
            return res.status(400).json({ error: 'Invalid partyId format' });
        }

        if (bidAmount <= 0) {
            return res.status(400).json({ error: 'Bid amount must be greater than 0' });
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

        let song;
        if (songId) {
            // ✅ Check if song exists in DB
            if (!mongoose.isValidObjectId(songId)) {
                return res.status(400).json({ error: 'Invalid songId format' });
            }

            song = await Song.findById(songId).populate({
                path: 'bids',
                populate: { path: 'userId', select: 'username' }
            });

            if (!song) {
                return res.status(404).json({ error: 'Song not found' });
            }
        } else if (url && title && artist && platform) {
            // ✅ Try finding the song by platform URL
            song = await Song.findOne({ [`sources.${platform}`]: url });

            if (!song) {
                // ✅ Create a new song if it doesn’t exist
                song = new Song({
                    title,
                    artist,
                    coverArt: extractedCoverArt,
                    duration: extractedDuration || 777, // ✅ Store duration correctly
                    sources: { [platform]: url },
                    addedBy: userId
                });

                console.log("🎵 Saving song to database:", JSON.stringify(song, null, 2)); // ✅ Proper log
                await song.save();
            }

            // ✅ Ensure song is added to the party's playlist if not already
            if (!party.songs.some(entry => entry.songId?.toString() === song._id.toString())) {
                party.songs.push({ songId: song._id, addedBy: userId });
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

        // ✅ Update the song with bid info
        song.bids.push(bid._id);
        song.globalBidValue = (song.globalBidValue || 0) + bidAmount;
        await song.save();

        // ✅ Fetch updated song with populated bid info
        const updatedSong = await Song.findById(song._id).populate({
            path: 'bids',
            populate: { path: 'userId', select: 'username' }
        });

        res.status(200).json({
            message: 'Bid placed successfully!',
            song: updatedSong
        });
    } catch (err) {
        console.error("❌ Error placing bid:", err);
        res.status(500).json({ error: 'Error placing bid', details: err.message });
    }
});

// test bid route from songcard
// Place a bid on an existing song
router.post('/:partyId/songcardbid', authMiddleware, async (req, res) => {
    try {
        const { partyId } = req.params;
        const { songId, url, title, artist, bidAmount, platform, duration } = req.body;
        const userId = req.user.userId;

        if (!mongoose.isValidObjectId(partyId)) {
            return res.status(400).json({ error: 'Invalid partyId format' });
        }

        if (bidAmount <= 0) {
            return res.status(400).json({ error: 'Bid amount must be greater than 0' });
        }

        // ✅ Convert duration to integer & validate
        const extractedDuration = duration && !isNaN(duration) ? parseInt(duration, 10) : 888;
        const extractedCoverArt = req.body.coverArt && req.body.coverArt.includes("http")
            ? req.body.coverArt 
            : `https://img.youtube.com/vi/${req.body.url.split("v=")[1]}/hqdefault.jpg`;

        // ✅ Fetch party with populated songs
        const party = await Party.findById(partyId).populate('songs.songId');
        if (!party) {
            return res.status(404).json({ error: 'Party not found' });
        }

        let song;
        let partySongEntry = null;

        if (songId) {
            // ✅ Check if song exists in DB
            if (!mongoose.isValidObjectId(songId)) {
                return res.status(400).json({ error: 'Invalid songId format' });
            }

            song = await Song.findById(songId);
            if (!song) {
                return res.status(404).json({ error: 'Song not found' });
            }

            // Find the party-specific song entry
            partySongEntry = party.songs.find(entry => entry.songId._id.toString() === songId);
            if (!partySongEntry) {
                return res.status(404).json({ error: 'Song not found in this party' });
            }
        } else if (url && title && artist && platform) {
            // ✅ Try finding the song by platform URL
            song = await Song.findOne({ [`sources.${platform}`]: url });

            if (!song) {
                // ✅ Create a new song if it doesn't exist
                song = new Song({
                    title,
                    artist,
                    coverArt: extractedCoverArt,
                    duration: extractedDuration || 777,
                    sources: { [platform]: url },
                    addedBy: userId
                });
                await song.save();
            }

            // Find or create party-specific song entry
            partySongEntry = party.songs.find(entry => entry.songId._id.toString() === song._id.toString());
            if (!partySongEntry) {
                // Add song to party with initial party-specific bid values
                partySongEntry = {
                    songId: song._id,
                    addedBy: userId,
                    partyBidValue: 0,
                    partyBids: []
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

        res.status(200).json({
            message: 'Bid placed successfully!',
            song: {
                ...updatedSong.toObject(),
                partyBidValue: partySongEntry.partyBidValue,
                partyBids: partyBids
            }
        });
    } catch (err) {
        console.error("❌ Error placing bid:", err);
        res.status(500).json({ error: 'Error placing bid', details: err.message });
    }
});

// Mark song as playing (called by web player when song starts)
router.post('/:partyId/songs/:songId/play', authMiddleware, async (req, res) => {
    try {
        const { partyId, songId } = req.params;
        const userId = req.user.userId;

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
        const userId = req.user.userId;

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
        const userId = req.user.userId;

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

        res.json({
            status: status,
            songs: songsWithStatus,
            count: songsWithStatus.length
        });
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
        const userId = req.user.userId;

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

module.exports = router;