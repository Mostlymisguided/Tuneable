const express = require('express');
const mongoose = require('mongoose');
const crypto = require('crypto');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const Party = require('../models/Party'); // Import the Party model
const Song = require('../models/song'); // Import the Song model
const { isValidObjectId } = require('../utils/validators'); // Utility function to validate ObjectId
const { broadcast } = require('../utils/broadcast'); // Utility for real-time updates via WebSocket

// Generate a consistent ObjectId for the dev-user in development mode
const devUserId = new mongoose.Types.ObjectId(
    crypto.createHash('md5').update('dev-user').digest('hex').substring(0, 24)
);

// Centralized error handler to streamline error responses
const handleError = (res, err, message, status = 500) => {
    console.error(`${message}:`, err.message);
    res.status(status).json({ error: message, details: err.message });
};

// Utility function to generate a unique, human-readable party code
const deriveCodeFromPartyId = () => 
    crypto.randomBytes(3).toString('hex').toUpperCase();

/**
 * Route: POST /
 * Create a new party
 * Access: Protected (requires valid token)
 */
router.post('/', authMiddleware, async (req, res) => {
  try {
      const { name } = req.body;
      if (!name) {
          return res.status(400).json({ error: 'Party name is required' });     
      }

      const userId = req.user.userId;
      if (!isValidObjectId(userId)) {
          return res.status(400).json({ error: 'Invalid userId' });
      }

      const objectId = new mongoose.Types.ObjectId();
      const partyCode = deriveCodeFromPartyId();

      const party = new Party({
          _id: objectId,
          name,
          host: userId,
          partyCode,
          songs: [],
          attendees: [userId],
      });

      await party.save();

      broadcast(party._id, { message: 'New party created', party });

      res.status(201).json({ message: 'Party created successfully', party });
  } catch (err) {
      handleError(res, err, 'Error creating party');
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

/**
 * Route: GET /:id/details
 */
router.get('/:id/details', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;

        if (!isValidObjectId(id)) {
            return res.status(400).json({ error: 'Invalid Party ID' });
        }

        const party = await Party.findById(id)
            .populate({
                path: 'songs',
                model: 'Song',
                select: 'title artist platform url totalBidValue globalBidValue bids', // Include necessary fields
                populate: {
                    path: 'bids.userId',
                    select: 'username',
                },
            })
            .populate({
                path: 'attendees',
                model: 'User',
                select: 'username',
            });

        if (!party) return res.status(404).json({ error: 'Party not found' });

        // Debug: Log populated songs
        console.log('Populated Songs:', party.songs);

        // Process songs
        party.songs = party.songs.map((song) => ({
            ...song.toObject(),
            totalBidValue: song.bids.reduce((sum, bid) => sum + bid.amount, 0), // Sum of all bids for this party
        }));

        // Sort songs by totalBidValue in descending order
        party.songs.sort((a, b) => b.totalBidValue - a.totalBidValue);

        res.status(200).json({
            message: 'Party details fetched successfully',
            party,
        });
    } catch (err) {
        console.error('Error fetching party details:', err.message);
        res.status(500).json({ error: 'Failed to fetch party details' });
    }
});

/**
 * Route: POST /:id/join
 * Join an existing party
 * Access: Protected (requires valid token)
 */
router.post('/:id/join', authMiddleware, async (req, res) => {
    const { id } = req.params; // Party ID
    const userId = req.user.userId; // Authenticated user's ID

    try {
        // Find the party by ID
        const party = await Party.findById(id);
        if (!party) {
            return res.status(404).json({ error: 'Party not found' });
        }

        // Check if the user is already in the attendees list
        if (party.attendees.includes(userId)) {
            return res.status(400).json({ error: 'User already joined the party' });
        }

        // Add the user to the attendees array
        party.attendees.push(userId);
        await party.save();

        res.status(200).json({ message: 'Successfully joined the party', party });
    } catch (err) {
        res.status(500).json({ error: 'Failed to join the party' });
    }
});

/**
 * Route: POST /:partyId/songs
 * Add a new song to a party
 * Access: Protected (requires valid token)
 */
router.post('/:partyId/songs', authMiddleware, async (req, res) => {
    try {
        const { partyId } = req.params;
        const { title, artist, platform, url } = req.body;

        // Validate the provided Party ID
        if (!isValidObjectId(partyId)) {
            return res.status(400).json({ error: 'Invalid Party ID' });
        }

        // Check if the party exists
        const party = await Party.findById(partyId);
        if (!party) return res.status(404).json({ error: 'Party not found' });

        // Create a new song document
        const newSong = await Song.create({ title, artist, platform, url, bids: [] });

        // Add the song's ObjectId to the party's songs array
        party.songs.push(newSong._id);
        await party.save();

        broadcast(partyId, { message: 'Song added successfully', song: newSong });

        res.status(201).json({ message: 'Song added successfully', song: newSong });
    } catch (err) {
        handleError(res, err, 'Error adding song to party');
    }
});

/**
 * Route: POST /:partyId/songs/:songId/bid
 * Place or increase a bid on a song
 * Access: Protected (requires valid token)
 */
router.post('/:partyId/songs/:songId/bid', authMiddleware, async (req, res) => {
    try {
        const { partyId, songId } = req.params;
        const { bidAmount } = req.body;
        const userId = req.user.userId;
        const username = req.user.username;

        if (!isValidObjectId(userId) || !isValidObjectId(partyId) || !isValidObjectId(songId)) {
            return res.status(400).json({ error: 'Invalid ID format' });
        }

        if (bidAmount <= 0) {
            return res.status(400).json({ error: 'Bid amount must be greater than zero' });
        }

        const party = await Party.findById(partyId);
        if (!party) return res.status(404).json({ error: 'Party not found' });

        const song = await Song.findById(songId);
        if (!song) return res.status(404).json({ error: 'Song not found' });

        if (!Array.isArray(song.bids)) song.bids = [];
        song.bids.push({ userId, username, amount: bidAmount });
        song.bid = Math.max(song.bid, bidAmount);
        await song.save();

        const sortedBids = song.bids.sort((a, b) => b.amount - a.amount);

        broadcast(partyId, {
            type: 'BID_UPDATED',
            songId: song._id,
            bidAmount,
            userId,
            username,
            currentBid: song.bid,
            sortedBids,
        });

        res.status(200).json({
            message: 'Bid placed successfully!',
            currentBid: song.bid,
            bids: sortedBids,
        });
    } catch (err) {
        handleError(res, err, 'Error placing bid');
    }
});

module.exports = router;
