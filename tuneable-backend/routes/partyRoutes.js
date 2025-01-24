const express = require('express');
const mongoose = require('mongoose');
const crypto = require('crypto');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const Party = require('../models/Party'); // Import the Party model
const Song = require('../models/song'); // Import the Song model
const Bid = require('../models/Bid'); // Import the Bid model
const { isValidObjectId } = require('../utils/validators'); // Utility function to validate ObjectId
const { broadcast } = require('../utils/broadcast'); // Utility for real-time updates via WebSocket

// Generate a consistent ObjectId for the dev-user in development mode
const devUserId = new mongoose.Types.ObjectId(
    crypto.createHash('md5').update('dev-user').digest('hex').substring(0, 24)
);

// Centralized error handler to streamline error responses
const handleError = (res, err, message, status = 500) => {
    console.error(`${message}:`, err.message);
    console.error('Request Body:', res.req.body);
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
      const { name } = req.body; // Extract only the name from the request body

      // Validate the party name
      if (!name) {
          return res.status(400).json({ error: 'Party name is required' });     
      
        }

      // Use the userId from the token
      const userId = req.user.userId;

      console.log (userId);

      // Validate the userId from the token
      if (!isValidObjectId(userId)) {
          return res.status(400).json({ error: 'Invalid userId' });
      }

      // Generate a unique ObjectId and party code
      const objectId = new mongoose.Types.ObjectId();
      const partyCode = deriveCodeFromPartyId();

      // Create and save the new party document
      const party = new Party({
          _id: objectId,
          name,
          host: userId,
          partyCode,
          songs: [],
          attendees: [userId], // Add the host as the first attendee
          bids: [],
      });

      await party.save();

      // Broadcast the creation of the new party
      try {
          broadcast(party._id, { message: 'New party created', party });
      } catch (broadcastErr) {
          console.error('Error broadcasting party creation:', broadcastErr.message);
      }

      res.status(201).json({ message: 'Party created successfully', party });
  } catch (err) {
      console.error('Error creating party:', err.message);
      res.status(500).json({ error: 'Error creating party', details: err.message });
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
 * Fetch party details and its songs sorted by bids
 * Access: Protected (requires valid token)
 */
router.get('/:id/details', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;

        // Validate the provided Party ID
        if (!isValidObjectId(id)) {
            return res.status(400).json({ error: 'Invalid Party ID' });
        }

        // Fetch the party and populate its fields
        const party = await Party.findById(id)
            .populate({ path: 'songs', model: 'Song' }) // Populate the songs array
            .populate({ 
                path: 'attendees',
                model: 'User',
                select: 'username', // Include only the username field
            });

        if (!party) return res.status(404).json({ error: 'Party not found' });

        res.status(200).json({
            message: 'Party details fetched successfully',
            party,
        });
    } catch (err) {
        handleError(res, err, 'Error fetching party details');
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
    console.log('Route Hit:', req.originalUrl);

    try {
        const { partyId, songId } = req.params;
        const { bidAmount } = req.body;
        const userId = req.user.userId;
        const username = req.user.username; // Assuming username is available in `req.user`

        // Validate IDs and bid amount
        if (!isValidObjectId(userId) || !isValidObjectId(partyId) || !isValidObjectId(songId)) {
            return res.status(400).json({ error: 'Invalid ID format' });
        }

        if (bidAmount <= 0) {
            return res.status(400).json({ error: 'Bid amount must be greater than zero' });
        }

        // Fetch the party and song
        const party = await Party.findById(partyId);
        if (!party) return res.status(404).json({ error: 'Party not found' });

        const song = await Song.findById(songId);
        if (!song) return res.status(404).json({ error: 'Song not found' });

        // Initialize the `bids` array if undefined (shouldn't happen with schema changes)
        if (!Array.isArray(song.bids)) song.bids = [];

        // Add the new bid to the `bids` array
        song.bids.push({ userId, username, amount: bidAmount });

        // Calculate the highest bid
        song.bid = Math.max(song.bid, bidAmount);
        await song.save();

        // Sort the bids array by bid amount (descending)
        const sortedBids = song.bids.sort((a, b) => b.amount - a.amount);
        console.log('Aggregated and Sorted Bids:', sortedBids);

        // Broadcast the updated bid information
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
        console.error('Error placing bid:', err.message);
        res.status(500).json({ error: 'Error placing bid', details: err.message });
    }
});

module.exports = router;
