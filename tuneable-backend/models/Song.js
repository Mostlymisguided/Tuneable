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
    bids: [
        {
            userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
            username: { type: String, required: true }, // Add username to bids array
            amount: { type: Number, required: true },
            timestamp: { type: Date, default: Date.now }, // Add timestamp for bids
        },
    ],
    globalBidValue: { type: Number, default: 0 }, // Tracks total bids globally
    addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdAt: { type: Date, default: Date.now },
});

// Use the existing model if it is already compiled, otherwise define it
module.exports = mongoose.models.Song || mongoose.model('Song', songSchema);
