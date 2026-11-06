const mongoose = require('mongoose');
const { uuidv7 } = require('uuidv7');

const timelineMarkSchema = new mongoose.Schema({
  uuid: { type: String, unique: true, default: uuidv7 },
  mediaId: { type: mongoose.Schema.Types.ObjectId, ref: 'Media', required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  // The tip that paid for this mark. One live mark per tip.
  bidId: { type: mongoose.Schema.Types.ObjectId, ref: 'Bid', required: true },
  timestampSeconds: { type: Number, required: true, min: 0 },
  note: { type: String, maxlength: 140, default: '' },
  // Snapshot of the tip at placement. Reads prefer the live bid amount.
  amountPence: { type: Number, required: true, min: 0 },
  isDeleted: { type: Boolean, default: false },
  deletedAt: { type: Date, default: null },
}, {
  timestamps: true,
});

timelineMarkSchema.index({ mediaId: 1, timestampSeconds: 1 });
timelineMarkSchema.index({ userId: 1 });
timelineMarkSchema.index(
  { bidId: 1 },
  { unique: true, partialFilterExpression: { isDeleted: false } }
);

module.exports = mongoose.models.TimelineMark || mongoose.model('TimelineMark', timelineMarkSchema);
