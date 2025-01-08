const mongoose = require('mongoose');

const PartySchema = new mongoose.Schema({
  name: { type: String, required: true },
  host: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  partyCode: { type: String, required: true, unique: true },
  attendees: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], // Track attendees
  bidders: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],   // Track bidders
  songs: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Song' }],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Party', PartySchema);
