const mongoose = require('mongoose');

const championPodiumEventSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  mediaId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Media',
    required: true,
  },
  kind: { type: String, enum: ['earned', 'lost'], required: true },
  /** Rank taken, or the rank that was lost. */
  rank: { type: Number, required: true, min: 1, max: 3 },
  previousRank: { type: Number, default: null },
  nextRank: { type: Number, default: null },
  occurredAt: { type: Date, default: Date.now },
}, { timestamps: true });

championPodiumEventSchema.index({ userId: 1, occurredAt: -1 });
championPodiumEventSchema.index({ mediaId: 1, occurredAt: -1 });

module.exports = mongoose.model('ChampionPodiumEvent', championPodiumEventSchema);
