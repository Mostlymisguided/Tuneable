const mongoose = require('mongoose');

// Define the track schema
const trackSchema = new mongoose.Schema({
    title: { type: String, required: true },
    artist: { type: String },
    platform: {
        type: String,
        enum: ['YouTube', 'Spotify', 'SoundCloud', 'Deezer', 'Apple Music', 'Tidal', 'Amazon Music'],
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
});

// Add pre-save validation to trackSchema
trackSchema.pre('save', function (next) {
    if (!this.title || !this.url || !this.platform) {
        return next(new Error('Track must include title, url, and platform.'));
    }
    next();
});

// Define the party schema
const PartySchema = new mongoose.Schema({
    name: { type: String, required: true },
    host: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    attendees: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    songs: [trackSchema],
    currentSong: { type: mongoose.Schema.Types.ObjectId, ref: 'Song' },
    code: { type: String, unique: true, required: true },
}, { timestamps: true });

// Add indexes for performance
//PartySchema.index({ code: 1 }, { unique: true });
//PartySchema.index({ host: 1 });

// Avoid overwriting the model
module.exports = mongoose.models.Party || mongoose.model('Party', PartySchema);
