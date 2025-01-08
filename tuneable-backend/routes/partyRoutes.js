const express = require('express');
const mongoose = require('mongoose');
const crypto = require('crypto');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const Party = require('../models/Party'); // Import the Party model
const Song = require('../models/song'); // Import the Song model
const Bid = require('../models/Bid'); // Import the Bid model
const { isValidObjectId } = require('../utils/validators'); // Utility function to validate ObjectId - Import from utils

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
          attendees: [userId], // Add the host as the first attendee
          bidders: [],         // Initialize bidders as empty
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

// Fetch all parties
router.get('/', authMiddleware, async (req, res) => {
  try {
    const parties = await Party.find()
      .select('-songs') // Exclude songs for performance
      .populate('host', 'username'); // Populate host field with username

    res.status(200).json({ message: 'Parties fetched successfully', parties });
  } catch (err) {
    handleError(res, err, 'Failed to fetch parties');
  }
});


// Fetch party details and its songs sorted by bids
router.get('/:id/details', authMiddleware, async (req, res) => {
  try {
      const { id } = req.params;

      if (!isValidObjectId(id)) {
          return res.status(400).json({ error: 'Invalid Party ID' });
      }

      const party = await Party.findById(id)
          .populate({
              path: 'songs',
              model: 'Song', // Populate the songs array using the Song model
          })
          .populate({
              path: 'attendees',
              model: 'User', // Populate the attendees array using the User model
              select: 'username', // Only include the username field
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

// Join a party
router.post('/:id/join', authMiddleware, async (req, res) => {
  const { id } = req.params; // Party ID
  const userId = req.user.id; // Authenticated user's ID

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

        // Create a new song document
        const newSong = await Song.create({ title, artist, platform, url, bidders: [] });
        
        // Add the song's ObjectId to the party's songs array
        party.songs.push(newSong._id);
        await party.save();

        res.status(201).json({ message: 'Song added successfully', song: newSong });
    } catch (err) {
        handleError(res, err, 'Error adding song to party');
    }
});

// Place or increase a bid on a song
router.post('/:partyId/songs/:songId/bid', authMiddleware, async (req, res) => {
  console.log('Route Hit:', req.originalUrl);
  console.log('Party ID:', req.params.partyId);
  console.log('Song ID:', req.params.songId);
  console.log('Bid Amount:', req.body.bidAmount);
  console.log('User ID:', req.user?.userId);

  try {
    const { partyId, songId } = req.params;
    const { bidAmount } = req.body;
    const userId = req.user.userId;

    if (bidAmount <= 0) {
      return res.status(400).json({ error: 'Bid amount must be greater than zero' });
    }

    if (!mongoose.Types.ObjectId.isValid(userId) || !mongoose.Types.ObjectId.isValid(partyId) || !mongoose.Types.ObjectId.isValid(songId)) {
      return res.status(400).json({ error: 'Invalid ID format' });
    }

    const party = await Party.findById(partyId);
    if (!party) return res.status(404).json({ error: 'Party not found' });

    const song = await Song.findById(songId);
    if (!song) return res.status(404).json({ error: 'Song not found' });

    console.log('Populated song before update:', JSON.stringify(song, null, 2));

    // Add the new bid to the bidders array
    song.bidders.push({ userId, amount: bidAmount });

    // Calculate the new total bids
    const totalBids = song.bidders.reduce((sum, bidder) => sum + bidder.amount, 0);

    // Update the song's bid field to reflect the total
    song.bid = totalBids;

    // Save the updated song document
    await song.save();

    // Re-fetch the song with populated user data
    const updatedSong = await Song.findById(songId).populate({
      path: 'bidders.userId',
      model: 'User',
      select: 'username',
    });

    console.log('Updated song with populated bidders:', JSON.stringify(updatedSong, null, 2));

    // Broadcast the updated bid information
    broadcast(partyId, {
      type: 'BID_UPDATED',
      songId: song._id,
      bidAmount,
      userId,
      currentBid: totalBids,
    });

    res.status(200).json({
      message: 'Bid placed successfully!',
      currentBid: totalBids,
      bidders: updatedSong.bidders,
    });
  } catch (err) {
    console.error('Error placing bid:', err.message);
    res.status(500).json({ error: 'Error placing bid', details: err.message });
  }
});

module.exports = router;
