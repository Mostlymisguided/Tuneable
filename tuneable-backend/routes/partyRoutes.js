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

// Create a new party (and its playlist)
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { name } = req.body;

    // Generate a random unique code for the party
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();

    // Resolve userId
    const userId = req.user.userId === 'dev-user' ? devUserId : req.user.userId;
    if (userId && !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ error: 'Invalid userId format' });
    }

    // Create a new playlist for the party
    const playlist = new Playlist({
      name: `${name} Playlist`,
      description: `Playlist for ${name}`,
      user: userId, // Use the consistent ObjectId for dev-user
      tracks: [],
    });

    await playlist.save();

    // Create a new party
    const party = new Party({
      name,
      code,
      host: userId, // Use the consistent ObjectId for dev-user
      playlist: playlist._id,
    });

    await party.save();

    // Broadcast the new party creation
    broadcast(party._id, { message: 'New party created', party });

    res.status(201).json({ message: 'Party created successfully', party });
  } catch (err) {
    console.error('Error creating party:', err.message);
    res.status(500).json({ error: 'Error creating party', details: err.message });
  }
});

// Update the playlist for a specific party
router.post('/:id/playlist', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params; // Party ID
    const { tracks } = req.body; // Tracks to add

    // Find the party
    const party = await Party.findById(id);
    if (!party) {
      return res.status(404).json({ error: 'Party not found' });
    }

    // Find the associated playlist
    const playlist = await Playlist.findById(party.playlist);
    if (!playlist) {
      return res.status(404).json({ error: 'Playlist not found' });
    }

    // Add new tracks to the playlist
    playlist.tracks = [...playlist.tracks, ...tracks];
    await playlist.save();

    // Respond with the updated playlist
    res.status(200).json({ message: 'Playlist updated successfully', playlist });
  } catch (err) {
    console.error('Error updating playlist:', err.message);
    res.status(500).json({ error: 'Error updating playlist', details: err.message });
  }
});

// Get all parties
router.get('/', authMiddleware, async (req, res) => {
  try {
    const parties = await Party.find(); // Fetch all parties
    res.status(200).json({ message: 'Parties fetched successfully', parties });
  } catch (err) {
    console.error('Error fetching parties:', err.message);
    res.status(500).json({ error: 'Failed to fetch parties', details: err.message });
  }
});

// Place or increase a bid on a track
router.post('/:id/playlist/bid', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params; // Party ID
    const { trackId, bidAmount } = req.body; // Track ID and bid amount

    if (bidAmount <= 0) {
      return res.status(400).json({ error: 'Bid amount must be greater than zero' });
    }

    // Find the party
    const party = await Party.findById(id);
    if (!party) {
      return res.status(404).json({ error: 'Party not found' });
    }

    // Find and update the associated playlist
    const playlist = await Playlist.findById(party.playlist);
    if (!playlist) {
      return res.status(404).json({ error: 'Playlist not found' });
    }

    // Find the track in the playlist
    const track = playlist.tracks.id(trackId);
    if (!track) {
      return res.status(404).json({ error: 'Track not found' });
    }

    // Update the bid
    track.bid = Math.max(track.bid, bidAmount);
    playlist.tracks = playlist.tracks.sort((a, b) => b.bid - a.bid); // Sort tracks by bid
    await playlist.save();

    // Respond with the updated playlist
    res.status(200).json({ message: 'Bid placed successfully', playlist });
  } catch (err) {
    console.error('Error placing bid:', err.message);
    res.status(500).json({ error: 'Error placing bid', details: err.message });
  }
});

// Fetch party details and playlist sorted by bids
router.get('/:id/details', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    const party = await Party.findById(id).populate({
      path: 'playlist',
      populate: { path: 'tracks', options: { sort: { bid: -1 } } }, // Sort tracks by highest bid
    });

    if (!party) {
      return res.status(404).json({ error: 'Party not found' });
    }

    // Replace dev-user with the consistent ObjectId if necessary
    if (party.playlist && party.playlist.user && party.playlist.user.equals(devUserId)) {
      party.playlist.user = devUserId;
    }

    res.status(200).json({
      message: 'Party details fetched successfully',
      party: {
        id: party._id,
        name: party.name,
        code: party.code,
        playlist: party.playlist,
      },
    });
  } catch (err) {
    console.error('Error fetching party details:', err.message);
    res.status(500).json({ error: 'Error fetching party details', details: err.message });
  }
});

module.exports = router;
