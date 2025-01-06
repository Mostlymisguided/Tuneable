const mongoose = require('mongoose');

const bidSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    partyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Party', required: true },
    songId: { type: mongoose.Schema.Types.ObjectId, ref: 'Song', required: true },
    amount: { type: Number, required: true }, // Bid amount
    createdAt: { type: Date, default: Date.now }, // Time of bid creation
});

module.exports = mongoose.model('Bid', bidSchema);
