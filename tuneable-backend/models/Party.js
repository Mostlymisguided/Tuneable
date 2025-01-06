// models/party.js
const mongoose = require('mongoose');

// Define the party schema
const PartySchema = new mongoose.Schema({
    name: { type: String, required: true },
    host: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    attendees: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    songs: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Song' }], // Reference songs instead of embedding
    currentSong: { type: mongoose.Schema.Types.ObjectId, ref: 'Song' },
    partyCode: { type: String, unique: true, required: true }, // Renamed from 'code' to 'partyCode'
}, { timestamps: true });

module.exports = mongoose.models.Party || mongoose.model('Party', PartySchema);
