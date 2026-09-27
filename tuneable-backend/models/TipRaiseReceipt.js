const mongoose = require('mongoose');

/**
 * One confirm attempt for "bring tips up to".
 * The unique key stops a double-submit from charging the same batch twice.
 */
const tipRaiseReceiptSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  idempotencyKey: {
    type: String,
    required: true,
  },
  status: {
    type: String,
    enum: ['processing', 'completed', 'aborted'],
    required: true,
  },
  result: {
    type: mongoose.Schema.Types.Mixed,
    default: null,
  },
}, { timestamps: true });

tipRaiseReceiptSchema.index({ userId: 1, idempotencyKey: 1 }, { unique: true });
tipRaiseReceiptSchema.index({ userId: 1, status: 1, updatedAt: -1 });

module.exports = mongoose.model('TipRaiseReceipt', tipRaiseReceiptSchema);
