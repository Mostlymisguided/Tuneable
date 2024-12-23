const express = require('express');
const mongoose = require('mongoose');
const crypto = require('crypto'); // For hashing dev-user into ObjectId
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const Playlist = require('../models/Playlist');

// Generate a consistent ObjectId for dev-user
const devUserId = new mongoose.Types.ObjectId(
  crypto.createHash('md5').update('dev-user').digest('hex').substring(0, 24)
);

// Create a new playlist
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { name, description } = req.body;

    // Populate user field with userId from token, replacing dev-user with ObjectId
    const userId = req.user.userId === 'dev-user' ? devUserId : req.user.userId;

    const playlist = new Playlist({
      name,
      description,
      user: userId, // Use consistent ObjectId for dev-user
    });

    await playlist.save();
    res.status(201).json({ message: 'Playlist created successfully!', playlist });
  } catch (err) {
    res.status(400).json({ error: 'Error creating playlist', details: err.message });
  }
});

// Add a track to a playlist
router.post('/:id/tracks', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params; // Playlist ID
    const { title, artist, platform, url } = req.body;

    // Adjust userId for dev-user
    const userId = req.user.userId === 'dev-user' ? devUserId : req.user.userId;

    // Find the playlist and ensure it belongs to the logged-in user
    const playlist = await Playlist.findOne({ _id: id, user: userId });
    if (!playlist) {
      return res.status(404).json({ error: 'Playlist not found or unauthorized' });
    }

    // Append the new track
    const newTrack = { title, artist, platform, url };
    playlist.tracks.push(newTrack);

    // Save the updated playlist
    await playlist.save();
    res.status(200).json({ message: 'Track added successfully!', playlist });
  } catch (err) {
    res.status(400).json({ error: 'Error adding track to playlist', details: err.message });
  }
});

// Fetch all playlists for the logged-in user
router.get('/', authMiddleware, async (req, res) => {
  try {
    console.log('Fetching playlists for user:', req.user.userId); // Debugging log

    // Adjust query logic for dev_user
    const userId = req.user.userId === 'dev-user' ? devUserId : req.user.userId;
    const query = req.user.userId === 'dev_user' ? {} : { user: userId };

    // Find playlists that belong to the logged-in user
    const playlists = await Playlist.find(query).select('-__v');

    // Return playlists in a clean format
    res.status(200).json({
      message: 'Playlists fetched successfully',
      count: playlists.length,
      playlists: playlists.map((playlist) => ({
        id: playlist._id,
        name: playlist.name,
        description: playlist.description,
        tracks: playlist.tracks,
        createdAt: playlist.createdAt,
        updatedAt: playlist.updatedAt,
      })),
    });
  } catch (err) {
    console.error('Error fetching playlists:', err.message); // Log error for debugging
    res.status(500).json({
      error: 'Error fetching playlists',
      details: err.message,
    });
  }
});

module.exports = router;
