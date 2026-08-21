const mongoose = require('mongoose');
const { uuidv7 } = require('uuidv7');

/**
 * ArtistEscrowAllocation Model
 * 
 * Stores escrow allocations for unknown/unregistered artists.
 * When an artist registers, these allocations are matched and transferred
 * to their User.artistEscrowBalance.
 * 
 * This allows retroactive payouts for artists who weren't registered
 * when their media received tips/bids.
 */
const artistEscrowAllocationSchema = new mongoose.Schema({
  uuid: { type: String, unique: true, default: uuidv7 },
  
  // ========================================
  // REFERENCES
  // ========================================
  mediaId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Media', 
    required: true,
    index: true
  },
  bidId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Bid', 
    required: true,
    index: true
  },
  
  // Artist reference (null until artist registers and claims)
  artistUserId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    default: null,
    index: true
  },
  
  // ========================================
  // ARTIST IDENTIFICATION (for matching)
  // ========================================
  artistName: { 
    type: String, 
    required: true,
    index: true
  },
  
  // Matching criteria for finding this artist when they register
  matchingCriteria: {
    artistName: { type: String }, // Primary artist name from media
    youtubeChannelId: { type: String }, // From media.sources.youtube
    externalIds: { 
      type: Map, 
      of: String, 
      default: {} 
    }, // ISRC, UPC, etc.
    artistNames: { type: [String] }, // All artist names (for multi-artist tracks)
    _id: false
  },
  
  // ========================================
  // ESCROW ALLOCATION
  // ========================================
  percentage: { 
    type: Number, 
    required: true,
    min: 0,
    max: 100
  }, // Ownership percentage from mediaOwners
  
  allocatedAmount: { 
    type: Number, 
    required: true,
    min: 0
  }, // Amount allocated in PENCE (integer) (paid + promo)
  paidPence: {
    type: Number,
    default: 0,
    min: 0
  },
  promoPence: {
    type: Number,
    default: 0,
    min: 0
  },
  promoStatus: {
    type: String,
    enum: ['none', 'pending', 'converted', 'expired', 'reversed'],
    default: 'none'
  },
  promoEscrowExpiresAt: { type: Date },
  tipperUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
    index: true
  },
  
  // ========================================
  // CLAIM STATUS
  // ========================================
  claimed: { 
    type: Boolean, 
    default: false,
    index: true
  },
  claimedAt: { 
    type: Date 
  },
  claimedBy: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User' 
  },
  
  // ========================================
  // METADATA
  // ========================================
  allocatedAt: { 
    type: Date, 
    default: Date.now,
    index: true
  },
  notes: { 
    type: String 
  }, // Admin notes for manual matching if needed
  
  // ========================================
  // SECURITY & VERIFICATION
  // ========================================
  transactionHash: { 
    type: String
  }, // SHA-256 hash for tamper detection
}, {
    timestamps: true
});

// Indexes for efficient queries
artistEscrowAllocationSchema.index({ mediaId: 1, claimed: 1 });
artistEscrowAllocationSchema.index({ artistName: 1, claimed: 1 });
artistEscrowAllocationSchema.index({ 'matchingCriteria.youtubeChannelId': 1, claimed: 1 });
artistEscrowAllocationSchema.index({ artistUserId: 1, claimed: 1 });
artistEscrowAllocationSchema.index({ transactionHash: 1 }); // Hash lookup for verification
artistEscrowAllocationSchema.index({ promoStatus: 1, promoEscrowExpiresAt: 1 });
artistEscrowAllocationSchema.index({ tipperUserId: 1, promoStatus: 1 });

// ========================================
// HASH GENERATION
// ========================================

/**
 * Generate transaction hash for tamper detection
 */
artistEscrowAllocationSchema.methods.generateHash = function() {
  const crypto = require('crypto');
  const data = JSON.stringify({
    uuid: this.uuid,
    mediaId: this.mediaId?.toString(),
    bidId: this.bidId?.toString(),
    artistUserId: this.artistUserId?.toString(),
    artistName: this.artistName,
    percentage: this.percentage,
    allocatedAmount: this.allocatedAmount,
    claimed: this.claimed,
    allocatedAt: this.allocatedAt?.toISOString() || this.allocatedAt
  });
  return crypto.createHash('sha256').update(data).digest('hex');
};

/**
 * Verify transaction integrity by checking hash
 */
artistEscrowAllocationSchema.methods.verifyIntegrity = function() {
  const expectedHash = this.generateHash();
  return this.transactionHash === expectedHash;
};

// Auto-generate hash on save
artistEscrowAllocationSchema.pre('save', function(next) {
  if (this.isNew || this.isModified('allocatedAmount') || this.isModified('percentage') || this.isModified('claimed')) {
    this.transactionHash = this.generateHash();
  }
  next();
});

// Virtual: Total unclaimed amount for an artist name
artistEscrowAllocationSchema.statics.getUnclaimedTotal = async function(artistName) {
  const result = await this.aggregate([
    {
      $match: {
        artistName: artistName,
        claimed: false
      }
    },
    {
      $group: {
        _id: null,
        total: { $sum: '$allocatedAmount' }
      }
    }
  ]);
  
  return result.length > 0 ? result[0].total : 0;
};

// Method: Claim this allocation for a user
artistEscrowAllocationSchema.methods.claim = async function(userId) {
  if (this.claimed) {
    throw new Error('Allocation already claimed');
  }
  
  this.claimed = true;
  this.claimedAt = new Date();
  this.claimedBy = userId;
  this.artistUserId = userId;
  
  await this.save();
  
  const paid = Math.max(0, this.paidPence || 0);
  const promo = Math.max(0, this.promoPence || 0);
  const hasSplit = paid > 0 || promo > 0;
  let creditPaid = hasSplit ? paid : this.allocatedAmount;
  let creditPromo = 0;
  let historyPromoStatus = hasSplit ? (this.promoStatus || 'none') : 'none';

  if (hasSplit) {
    if (this.promoStatus === 'pending') {
      creditPromo = promo;
    } else if (this.promoStatus === 'converted') {
      creditPaid = paid + promo;
    }
  }

  const User = require('./User');
  await User.findByIdAndUpdate(userId, {
    $inc: {
      artistEscrowBalance: creditPaid,
      artistPromoEscrowBalance: creditPromo,
      totalEscrowEarned: creditPaid,
    },
    $push: {
      artistEscrowHistory: {
        mediaId: this.mediaId,
        bidId: this.bidId,
        amount: this.allocatedAmount,
        paidPence: hasSplit ? paid : creditPaid,
        promoPence: hasSplit ? promo : 0,
        promoStatus: historyPromoStatus,
        allocatedAt: this.allocatedAt,
        claimedAt: this.claimedAt,
        status: 'claimed'
      }
    }
  });
  
  return this;
};

module.exports = mongoose.model('ArtistEscrowAllocation', artistEscrowAllocationSchema);

