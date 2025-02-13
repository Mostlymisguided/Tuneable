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
        required: true 
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

// Indexes
bidSchema.index({ userId: 1 });
bidSchema.index({ partyId: 1 });
bidSchema.index({ songId: 1 });


// Populate references for convenience
bidSchema.pre(/^find/, function(next) {
    this.populate('userId').populate('partyId').populate('songId');
    next();
});

module.exports = mongoose.model('Bid', bidSchema);
