const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const Playlist = require('../models/Playlist');

// Create a new playlist
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { name, description } = req.body;

    // Populate user field with userId from token
    const playlist = new Playlist({
      name,
      description,
      user: req.user.userId, // Extracted from token
    });

    await playlist.save();
    res.status(201).json({ message: 'Playlist created successfully!', playlist });
  } catch (err) {
    res.status(400).json({ error: 'Error creating playlist', details: err.message });
  }
});

module.exports = router;
