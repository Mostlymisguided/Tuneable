// Updated Party Model
const mongoose = require('mongoose');

// Define the track schema (integrated from Playlist.js)
const trackSchema = new mongoose.Schema({
    title: { type: String, required: true },
    artist: { type: String },
    platform: {
        type: String,
        enum: ['YouTube', 'Spotify', 'SoundCloud', 'Deezer', 'Apple Music'],
        required: true,
    },
    url: { type: String, required: true },
    bid: { type: Number, default: 0 }, // Track highest bid
    bidders: [
        {
            userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // Reference to user
            amount: { type: Number, required: true }, // Bid amount
        },
    ],
    addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
});

const PartySchema = new mongoose.Schema({
    name: { type: String, required: true },
    host: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    attendees: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    songs: [trackSchema], // Embed the track schema as "songs"
    currentSong: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Song', // Or simply refer to the object within the songs array
    },
}, { timestamps: true });

module.exports = mongoose.model('Party', PartySchema);

// Updated Party Routes
const express = require('express');
const router = express.Router();
const Party = require('../models/party');
const auth = require('../middleware/auth');

// Add a song to the party
router.post('/:partyId/songs', auth, async (req, res) => {
    try {
        const { title, artist, platform, url } = req.body;
        const party = await Party.findById(req.params.partyId);

        if (!party) return res.status(404).send('Party not found');

        const newSong = {
            title,
            artist,
            platform,
            url,
            bidders: [],
            addedBy: req.user._id,
        };

        party.songs.push(newSong);
        await party.save();
        res.status(201).send(party);
    } catch (error) {
        res.status(500).send({ message: error.message });
    }
});

// Bid on a song
router.post('/:partyId/songs/:songId/bid', auth, async (req, res) => {
    try {
        const { amount } = req.body;
        const party = await Party.findById(req.params.partyId);

        if (!party) return res.status(404).send('Party not found');

        const song = party.songs.id(req.params.songId);
        if (!song) return res.status(404).send('Song not found');

        song.bidders.push({ userId: req.user._id, amount });
        song.bid = Math.max(song.bid, amount);
        await party.save();
        res.status(201).send(party);
    } catch (error) {
        res.status(500).send({ message: error.message });
    }
});

// Remove a song from the party
router.delete('/:partyId/songs/:songId', auth, async (req, res) => {
    try {
        const party = await Party.findById(req.params.partyId);

        if (!party) return res.status(404).send('Party not found');

        const song = party.songs.id(req.params.songId);
        if (!song) return res.status(404).send('Song not found');

        song.remove();
        await party.save();
        res.status(200).send(party);
    } catch (error) {
        res.status(500).send({ message: error.message });
    }
});

module.exports = router;
