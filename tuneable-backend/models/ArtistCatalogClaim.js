const mongoose = require('mongoose');

/**
 * One application to claim an entire artist catalog page.
 * Approval links credits. Rights and escrow move only when an admin asks.
 */
const artistCatalogClaimSchema = new mongoose.Schema({
  catalogId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ArtistCatalog',
    required: true,
    index: true,
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  proofText: { type: String, required: true, maxlength: 2000 },
  proofFiles: [{
    filename: String,
    url: String,
    uploadedAt: { type: Date, default: Date.now },
  }],
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending',
    index: true,
  },
  clearRights: { type: Boolean, default: false },
  reviewNotes: { type: String, default: '' },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  reviewedAt: { type: Date, default: null },
}, { timestamps: true });

artistCatalogClaimSchema.index({ catalogId: 1, userId: 1, status: 1 });

module.exports = mongoose.model('ArtistCatalogClaim', artistCatalogClaimSchema);
