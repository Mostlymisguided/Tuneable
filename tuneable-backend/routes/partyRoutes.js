const express = require('express');
const mongoose = require('mongoose'); // Added mongoose import
const crypto = require('crypto'); // For hashing dev-user into ObjectId
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const Party = require('../models/Party'); // Import the Party model
const Playlist = require('../models/Playlist'); // Import the Playlist model
const { broadcast } = require('../utils/broadcast'); // Import broadcast function

console.log('Broadcast function:', broadcast);

// Generate a consistent ObjectId for dev-user
const devUserId = new mongoose.Types.ObjectId(
  crypto.createHash('md5').update('dev-user').digest('hex').substring(0, 24)
);

// Centralized error handler
const handleError = (res, err, message, status = 500) => {
  console.error(`${message}:`, err.message);
  res.status(status).json({ error: message, details: err.message });
};

// Helper function to generate unique codes
const generateUniqueCode = async () => {
  let code;
  let exists;
  do {
    code = Math.random().toString(36).substring(2, 8).toUpperCase();
    exists = await Party.findOne({ code });
  } while (exists);
  return code;
};

// Create a new party (and its playlist)
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { name } = req.body;
    const code = await generateUniqueCode(); // Ensure unique code

    const userId = req.user.userId === 'dev-user' ? devUserId : req.user.userId;
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ error: 'Invalid userId format' });
    }

    const playlist = new Playlist({
      name: `${name} Playlist`,
      description: `Playlist for ${name}`,
      user: userId,
      tracks: [],
    });

    await playlist.save();

    const party = new Party({
      name,
      code,
      host: userId,
      playlist: playlist._id,
    });

    await party.save();

    broadcast(party._id, { message: 'New party created', party });
    res.status(201).json({ message: 'Party created successfully', party });
  } catch (err) {
    handleError(res, err, 'Error creating party');
  }
});

// Update the playlist for a specific party
router.post('/:id/playlist', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { tracks } = req.body;

    const party = await Party.findById(id);
    if (!party) return res.status(404).json({ error: 'Party not found' });

    const playlist = await Playlist.findByIdAndUpdate(
      party.playlist,
      { $addToSet: { tracks: { $each: tracks } } },
      { new: true }
    );

    if (!playlist) return res.status(404).json({ error: 'Playlist not found' });

    res.status(200).json({ message: 'Playlist updated successfully', playlist });
  } catch (err) {
    handleError(res, err, 'Error updating playlist');
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

// Place or increase a bid on a track
router.post('/:id/playlist/bid', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { trackId, bidAmount } = req.body;
    const userId = req.user.userId;

    if (bidAmount <= 0) {
      return res.status(400).json({ error: 'Bid amount must be greater than zero' });
    }

    const party = await Party.findById(id).populate('playlist');
    if (!party) return res.status(404).json({ error: 'Party not found' });

    const track = party.playlist.tracks.id(trackId);
    if (!track) return res.status(404).json({ error: 'Track not found' });

    const existingBidder = track.bidders.find((bid) => bid.userId === userId);
    if (existingBidder) {
      existingBidder.amount = Math.max(existingBidder.amount, bidAmount);
    } else {
      track.bidders.push({ userId, amount: bidAmount });
    }

    track.bid = Math.max(track.bid, bidAmount);
    await party.playlist.save();

    broadcast(party._id, {
      type: 'BID_UPDATED',
      trackId,
      bidAmount,
      userId,
      playlist: party.playlist,
    });

    res.status(200).json({ message: 'Bid placed successfully!', track, playlist: party.playlist });
  } catch (err) {
    handleError(res, err, 'Error placing bid');
  }
});

// Fetch party details and playlist sorted by bids
router.get('/:id/details', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    const party = await Party.findById(id).populate({
      path: 'playlist',
      select: 'name tracks',
      populate: {
        path: 'tracks',
        select: 'title bid',
        options: { sort: { bid: -1 } },
      },
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

module.exports = router;
