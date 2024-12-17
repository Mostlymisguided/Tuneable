const express = require('express');
const Playlist = require('../models/Playlist');

const router = express.Router();

// Create a new playlist
router.post('/', async (req, res) => {
    try {
        const { name, description, tracks, userId } = req.body;
        const playlist = new Playlist({ name, description, tracks, user: userId });
        await playlist.save();
        res.status(201).json({ message: 'Playlist created successfully', playlist });
    } catch (error) {
        res.status(500).json({ error: 'Error creating playlist', details: error.message });
    }
});

// Get all playlists for a user
router.get('/user/:userId', async (req, res) => {
    const { userId } = req.params;
    const playlists = await Playlist.find({ user: userId });
    res.json(playlists);
});

module.exports = router;