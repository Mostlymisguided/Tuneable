const mongoose = require('mongoose');
const { uuidv7 } = require('uuidv7');

const bidSchema = new mongoose.Schema({
  uuid: { type: String, unique: true, default: uuidv7 },
    userId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User', 
        required: true 
    },
    partyId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Party', 
        required: true 
    },
    // New unified Media reference
    mediaId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Media', 
        required: false 
    },
    // Legacy references (for backward compatibility)
    songId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Song', 
        required: false 
    },
    episodeId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'PodcastEpisode', 
        required: false 
    },
    // UUID references for external API usage
    user_uuid: { type: String },
    party_uuid: { type: String },
    media_uuid: { type: String }, // New unified UUID reference
    song_uuid: { type: String }, // Legacy
    episode_uuid: { type: String }, // Legacy
    amount: { 
        type: Number, 
        required: true, 
        min: [0, 'Bid amount cannot be negative'] 
    },
    createdAt: { 
        type: Date, 
        default: Date.now 
    },
    status: {
        type: String,
        enum: ['requested', 'active', 'played', 'vetoed', 'refunded'],
        default: 'active'
    },
});

// Validation to ensure either mediaId, songId, or episodeId is provided
bidSchema.pre('validate', function(next) {
    if (!this.mediaId && !this.songId && !this.episodeId) {
        return next(new Error('Either mediaId, songId, or episodeId must be provided'));
    }
    // Count how many are set
    const refCount = [this.mediaId, this.songId, this.episodeId].filter(Boolean).length;
    if (refCount > 1) {
        return next(new Error('Cannot have multiple content references (mediaId, songId, episodeId)'));
    }
    next();
});

// Indexes
bidSchema.index({ userId: 1 });
bidSchema.index({ partyId: 1 });
bidSchema.index({ mediaId: 1 }); // New unified index
bidSchema.index({ songId: 1 }); // Legacy
bidSchema.index({ episodeId: 1 }); // Legacy


// Populate references for convenience
// NOTE: Disabled auto-populate to prevent issues with Media model population
// Use explicit .populate() calls in routes instead
// bidSchema.pre(/^find/, function(next) {
//     this.populate('userId').populate('partyId');
//     if (this.mediaId) {
//         this.populate('mediaId');
//     }
//     if (this.songId) {
//         this.populate('songId');
//     }
//     if (this.episodeId) {
//         this.populate('episodeId');
//     }
//     next();
// });

module.exports = mongoose.model('Bid', bidSchema);
