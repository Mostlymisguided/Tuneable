// models/song.js
const mongoose = require('mongoose');

const songSchema = new mongoose.Schema({
    title: { type: String, required: true },
    artist: { type: String },
    platform: {
        type: String,
        enum: [
            'YouTube', 'youtube',
            'Spotify', 'spotify',
            'SoundCloud', 'soundcloud',
            'Deezer', 'deezer',
            'Apple Music', 'applemusic',
            'Tidal', 'tidal',
            'Amazon Music', 'amazonmusic',
        ],
        required: true,
    },
    url: { type: String, required: true },
    bid: { type: Number, default: 0 },
    bidders: [
        {
            userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
            amount: { type: Number, required: true },
        },
    ],
    addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Song', songSchema);
