const mongoose = require('mongoose');

/**
 * £-backed community tag claims.
 * Tippers explicitly stake their tip amount behind tags they assert
 * (at tip time, post-tip, or via "agree with top tags").
 * Tips without tags do NOT auto-back existing media tags (hybrid model).
 */
const mediaTagClaimSchema = new mongoose.Schema(
  {
    mediaId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Media',
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    /** Display tag (Title Case / aliased storage form). */
    tag: {
      type: String,
      required: true,
      trim: true,
      maxlength: 32,
    },
    /** Lowercase canonical key for uniqueness + matching. */
    canonicalTag: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 32,
    },
    /** Backing amount in pence (sum of tip stakes attributed to this claim). */
    amountPence: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    lastBidId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Bid',
    },
    lastSource: {
      type: String,
      enum: ['tip', 'post_tip', 'agree'],
      default: 'tip',
    },
  },
  { timestamps: true }
);

mediaTagClaimSchema.index(
  { mediaId: 1, userId: 1, canonicalTag: 1 },
  { unique: true }
);
mediaTagClaimSchema.index({ mediaId: 1, amountPence: -1 });
mediaTagClaimSchema.index({ userId: 1, amountPence: -1 });
mediaTagClaimSchema.index({ canonicalTag: 1, amountPence: -1 });

module.exports = mongoose.model('MediaTagClaim', mediaTagClaimSchema);
