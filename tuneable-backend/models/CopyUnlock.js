const mongoose = require('mongoose');

const copyUnlockSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  mediaId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Media',
    required: true,
  },
  // The generous-half line, in pence, when this tipper first cleared it.
  thresholdAtGrant: {
    type: Number,
    required: true,
    min: 0,
  },
  totalAtGrant: {
    type: Number,
    required: true,
    min: 0,
  },
  unlockedAt: {
    type: Date,
    default: Date.now,
  },
}, { timestamps: true });

copyUnlockSchema.index({ userId: 1, mediaId: 1 }, { unique: true });
copyUnlockSchema.index({ mediaId: 1 });

module.exports = mongoose.model('CopyUnlock', copyUnlockSchema);
