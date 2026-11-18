const mongoose = require('mongoose');

const rankSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  totalAmount: { type: Number, required: true },
  bidCount: { type: Number, default: 0 },
  rank: { type: Number, required: true },
}, { _id: false });

const mediaPodiumSnapshotSchema = new mongoose.Schema({
  mediaId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Media',
    required: true,
    unique: true,
  },
  ranks: { type: [rankSchema], default: [] },
}, { timestamps: true });

module.exports = mongoose.model('MediaPodiumSnapshot', mediaPodiumSnapshotSchema);
