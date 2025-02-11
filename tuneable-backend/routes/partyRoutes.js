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
  
      if (!name || !location) {
        console.log('❌ Missing Name or Location');
        return res.status(400).json({ error: 'Name and location are required.' });
      }
  
      const userId = req.user.userId;
      if (!isValidObjectId(userId)) {
        console.log('❌ Invalid User ID:', userId);
        return res.status(400).json({ error: 'Invalid userId' });
      }
  
      // Generate MongoDB ObjectId manually so we can hash it for partyCode
      const objectId = new mongoose.Types.ObjectId();
      const partyCode = deriveCodeFromPartyId(objectId); // ✅ Hash the unique _id to create partyCode
      const formattedWatershed = watershed === "clean" ? "clean" : "adult"; // ✅ Default to "adult"

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
        watershed: formattedWatershed, // ✅ Stores "adult" instead of "explicit"
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
  
  // Join an existing party
router.post('/:id/join', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.userId;
        const party = await Party.findById(id);
        if (!party) return res.status(404).json({ error: 'Party not found' });

        if (party.attendees.includes(userId))
            return res.status(400).json({ error: 'User already joined the party' });

        party.attendees.push(userId);
        await party.save();

        res.status(200).json({ message: 'Successfully joined the party', party });
    } catch (err) {
        handleError(res, err, 'Failed to join party');
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
                select: 'title artist coverArt sources globalBidValue bids addedBy', // ✅ Added `addedBy`
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
            });

        if (!party) {
            return res.status(404).json({ error: 'Party not found' });
        }

        console.log('Fetched Party Details:', JSON.stringify(party, null, 2));

        // ✅ **Flatten `songId` structure & extract platform URLs**
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
                coverArt: entry.songId.coverArt || '/default-cover.jpg',
                sources: availablePlatforms, // ✅ Store platform data as an array
                globalBidValue: entry.songId.globalBidValue || 0,
                bids: entry.songId.bids,
                addedBy: entry.songId.addedBy, // ✅ Ensures `addedBy` exists
                totalBidValue: entry.songId.bids.reduce((sum, bid) => sum + bid.amount, 0),
            };
        }).filter(Boolean); // ✅ Remove null entries

        // ✅ Sort songs by `totalBidValue` in descending order
        processedSongs.sort((a, b) => (b.totalBidValue || 0) - (a.totalBidValue || 0));

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
        const { songId, url, title, artist, bidAmount, platform } = req.body;
        const userId = req.user.userId;

        if (!mongoose.isValidObjectId(partyId)) {
            return res.status(400).json({ error: 'Invalid partyId format' });
        }

        if (bidAmount <= 0) {
            return res.status(400).json({ error: 'Bid amount must be greater than 0' });
        }

        const party = await Party.findById(partyId).populate('songs.songId');
        if (!party) {
            return res.status(404).json({ error: 'Party not found' });
        }

        let song;
        if (songId) {
            if (!mongoose.isValidObjectId(songId)) {
                return res.status(400).json({ error: 'Invalid songId format' });
            }

            song = await Song.findById(songId).populate({
                path: 'bids',
                populate: {
                    path: 'userId',
                    select: 'username'
                }
            });

            if (!song) {
                return res.status(404).json({ error: 'Song not found' });
            }
        } else if (url && title && artist && platform) {
            song = await Song.findOne({ [`sources.${platform}`]: url });
            if (!song) {
                song = new Song({
                    title,
                    artist,
                    sources: { [platform]: url },
                    addedBy: userId
                });
                await song.save();
            }

            let songEntry = party.songs.find((entry) => entry.songId?.toString() === song._id.toString());
            if (!songEntry) {
                party.songs.push({ songId: song._id, addedBy: userId });
                await party.save();
            }
        } else {
            return res.status(400).json({ error: 'Either songId or song metadata (url, title, artist, platform) must be provided.' });
        }

        const bid = new Bid({
            userId,
            partyId,
            songId: song._id,
            amount: bidAmount,
        });
        await bid.save();

        song.bids.push(bid._id);
        song.globalBidValue = (song.globalBidValue || 0) + bidAmount;
        await song.save();

        const updatedSong = await Song.findById(song._id).populate({
            path: 'bids',
            populate: {
                path: 'userId',
                select: 'username'
            }
        });

        res.status(200).json({
            message: 'Bid placed successfully!',
            song: updatedSong
        });
    } catch (err) {
        handleError(res, err, 'Error placing bid');
    }
});

module.exports = router;