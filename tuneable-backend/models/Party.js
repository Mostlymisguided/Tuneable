const mongoose = require('mongoose');

const partySchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    code: { type: String, unique: true, required: true },
    host: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    playlist: { type: mongoose.Schema.Types.ObjectId, ref: 'Playlist' },
    participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  },
  { timestamps: true }
);

module.exports = mongoose.model('Party', partySchema);
