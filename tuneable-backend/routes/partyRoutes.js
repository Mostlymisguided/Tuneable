const express = require('express');
const mongoose = require('mongoose');
const crypto = require('crypto');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const Party = require('../models/Party'); // Import the Party model
const { broadcast } = require('../utils/broadcast');

// Generate a consistent ObjectId for dev-user
const devUserId = new mongoose.Types.ObjectId(
    crypto.createHash('md5').update('dev-user').digest('hex').substring(0, 24)
);

// Centralized error handler
const handleError = (res, err, message, status = 500) => {
    console.error(`${message}:`, err.message);
    console.error('Request Body:', res.req.body);
    res.status(status).json({ error: message, details: err.message });
};

// Utility function to validate ObjectId
const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

// Utility function to derive a unique code from partyId
const deriveCodeFromPartyId = (partyId) => {
    return crypto
        .createHash('sha256') // Use a hash function like SHA-256
        .update(partyId)
        .digest('base64') // Encode the hash as Base64
        .replace(/[^a-zA-Z0-9]/g, '') // Remove non-alphanumeric characters
        .substring(0, 6) // Limit to 6 characters
        .toUpperCase(); // Make it uppercase
};

// Create a new party
router.post('/', authMiddleware, async (req, res) => {
  try {
      const { name, devUserId: explicitDevUserId } = req.body;

      // Determine the host ID
      let userId;
      if (explicitDevUserId) {
          userId = explicitDevUserId;
      } else if (req.user.userId === 'dev-user') {
          userId = devUserId;
      } else {
          userId = req.user.userId;
      }

      if (!isValidObjectId(userId)) {
          return res.status(400).json({ error: 'Invalid userId format' });
      }

      // Manually create an ObjectId
      const objectId = new mongoose.Types.ObjectId();

      // Derive the partyCode from the manually created ObjectId
      const partyCode = deriveCodeFromPartyId(objectId.toString());

      // Create the Party object with the manually created ObjectId
      const party = new Party({
          _id: objectId, // Set the _id explicitly
          name,
          host: userId,
          partyCode, // Include the partyCode during creation
          songs: [],
      });

      // Save the party
      await party.save();

      console.log(`Generated partyCode: ${partyCode}`);
      broadcast(party._id, { message: 'New party created', party });

      res.status(201).json({ message: 'Party created successfully', party });
  } catch (err) {
      handleError(res, err, 'Error creating party');
  }
});

// Fetch party details and its songs sorted by bids
router.get('/:id/details', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;

        if (!isValidObjectId(id)) {
            return res.status(400).json({ error: 'Invalid Party ID' });
        }

        const party = await Party.findById(id).select('name songs').populate({
            path: 'songs.bidders.userId',
            select: 'name',
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

// Add a song to a party
router.post('/:partyId/songs', authMiddleware, async (req, res) => {
    try {
        const { partyId } = req.params;
        const { title, artist, platform, url } = req.body;

        if (!isValidObjectId(partyId)) {
            return res.status(400).json({ error: 'Invalid Party ID' });
        }

        const party = await Party.findById(partyId);
        if (!party) return res.status(404).json({ error: 'Party not found' });

        const newSong = { title, artist, platform, url, bidders: [] };
        party.songs.push(newSong);
        await party.save();

        res.status(201).json({ message: 'Song added successfully', party });
    } catch (err) {
        handleError(res, err, 'Error adding song to party');
    }
});

// Place or increase a bid on a song
router.post('/:partyId/songs/:songId/bid', authMiddleware, async (req, res) => {
    try {
        const { partyId, songId } = req.params;
        const { bidAmount } = req.body;
        const userId = req.user.userId;

        if (bidAmount <= 0) {
            return res.status(400).json({ error: 'Bid amount must be greater than zero' });
        }

        if (!isValidObjectId(userId) || !isValidObjectId(partyId) || !isValidObjectId(songId)) {
            return res.status(400).json({ error: 'Invalid ID format' });
        }

        const party = await Party.findById(partyId);
        if (!party) return res.status(404).json({ error: 'Party not found' });

        const song = party.songs.id(songId);
        if (!song) return res.status(404).json({ error: 'Song not found' });

        const existingBidder = song.bidders.find(
            (bid) => bid.userId.toString() === userId.toString()
        );

        if (existingBidder) {
            existingBidder.amount = Math.max(existingBidder.amount, bidAmount);
        } else {
            song.bidders.push({ userId, amount: bidAmount });
        }

        song.bid = Math.max(song.bid || 0, bidAmount);

        await party.save();
        broadcast(party._id, {
            type: 'BID_UPDATED',
            songId,
            bidAmount,
            userId,
            songs: party.songs,
        });

        res.status(200).json({ message: 'Bid placed successfully!', song });
    } catch (err) {
        handleError(res, err, 'Error placing bid');
    }
});

// Get all parties
router.get('/', authMiddleware, async (req, res) => {
    try {
        const parties = await Party.find();
        res.status(200).json({ message: 'Parties fetched successfully', parties });
    } catch (err) {
        handleError(res, err, 'Failed to fetch parties');
    }
});

module.exports = router;