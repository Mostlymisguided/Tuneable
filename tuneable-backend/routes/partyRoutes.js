const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const Party = require('../models/Party'); // Import the Party model
const Playlist = require('../models/Playlist'); // Import the Playlist model
const { broadcast } = require('../utils/broadcast'); // Import broadcast function

console.log('Broadcast function:', broadcast);


// Create a new party (and its playlist)
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { name } = req.body;

    // Generate a random unique code for the party
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();

    // Create a new playlist for the party
    const playlist = new Playlist({
      name: `${name} Playlist`,
      description: `Playlist for ${name}`,
      user: req.user.userId, // The party host is also the playlist owner
      tracks: [], // Empty playlist
    });
    await playlist.save();

    // Create a new party
    const party = new Party({
      name,
      code,
      host: req.user.userId,
      playlist: playlist._id, // Link the playlist ID to the party
    });

    await party.save();

    // Broadcast the new party creation
    broadcast(party._id, { message: 'New party created', party });

    res.status(201).json({ message: 'Party created successfully', party });
  } catch (err) {
    res.status(500).json({ error: 'Error creating party', details: err.message });
  }
});

// Get the playlist for a specific party
router.get('/:id/playlist', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    // Find the party and populate the playlist
    const party = await Party.findById(id).populate('playlist');
    if (!party) {
      return res.status(404).json({ error: 'Party not found' });
    }

    res.status(200).json({ message: 'Playlist fetched successfully', playlist: party.playlist });
  } catch (err) {
    res.status(500).json({ error: 'Error fetching playlist', details: err.message });
  }
});

// Update the playlist for a specific party
router.post('/:id/playlist', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { tracks } = req.body;

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

    // Update tracks
    playlist.tracks = [...playlist.tracks, ...tracks]; // Add new tracks to the playlist
    await playlist.save();

    // Broadcast the playlist update
    broadcast(party._id, { message: 'Playlist updated', playlist });

    res.status(200).json({ message: 'Playlist updated successfully', playlist });
  } catch (err) {
    res.status(500).json({ error: 'Error updating playlist', details: err.message });
  }
});

// Place or increase a bid on a track
router.post('/:id/playlist/bid', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params; // Party ID
    const { trackId, bidAmount } = req.body; // Track ID and bid amount

    // validate bid amount
    if (bidAmount <= 0) {
        return res.status(400).json({ error: 'Bid amount must be greater than zero' });
      }      

    // Find the party and its associated playlist
    const party = await Party.findById(id);
    if (!party) {
      return res.status(404).json({ error: 'Party not found' });
    }

    const playlist = await Playlist.findById(party.playlist);
    if (!playlist) {
      return res.status(404).json({ error: 'Playlist not found' });
    }

    // Find the track and update its bid
    const track = playlist.tracks.id(trackId);
    if (!track) {
      return res.status(404).json({ error: 'Track not found' });
    }

    track.bid = Math.max(track.bid, bidAmount); // Update bid only if it's higher
    playlist.tracks = playlist.tracks.sort((a, b) => b.bid - a.bid); // Sort tracks by bids
    await playlist.save();

    // Broadcast the updated playlist
    broadcast(party._id, { message: 'Bid placed successfully', playlist });

    res.status(200).json({ message: 'Bid placed successfully', playlist });
  } catch (err) {
    res.status(500).json({ error: 'Error placing bid', details: err.message });
  }
});

// Ensure the router is exported
module.exports = router;
