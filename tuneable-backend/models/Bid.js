const mongoose = require('mongoose');

const bidSchema = new mongoose.Schema({
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

// Validation to ensure either songId or episodeId is provided
bidSchema.pre('validate', function(next) {
    if (!this.songId && !this.episodeId) {
        return next(new Error('Either songId or episodeId must be provided'));
    }
    if (this.songId && this.episodeId) {
        return next(new Error('Cannot have both songId and episodeId'));
    }
    next();
});

// Indexes
bidSchema.index({ userId: 1 });
bidSchema.index({ partyId: 1 });
bidSchema.index({ songId: 1 });
bidSchema.index({ episodeId: 1 });


// Populate references for convenience
bidSchema.pre(/^find/, function(next) {
    this.populate('userId').populate('partyId');
    if (this.songId) {
        this.populate('songId');
    }
    if (this.episodeId) {
        this.populate('episodeId');
    }
    next();
});

module.exports = mongoose.model('Bid', bidSchema);
