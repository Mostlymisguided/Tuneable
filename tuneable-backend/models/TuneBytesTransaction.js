const mongoose = require('mongoose');
const { uuidv7 } = require('uuidv7');

const tuneBytesTransactionSchema = new mongoose.Schema({
  uuid: { type: String, unique: true, default: uuidv7 },
    
  // ========================================
  // REFERENCES (ObjectIds)
  // ========================================
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  mediaId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Media', 
    required: true 
  },
  bidId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Bid', 
    required: true 
  },
  
  // ========================================
  // UUID REFERENCES (for external API)
  // ========================================
  user_uuid: { type: String },
  media_uuid: { type: String },
  bid_uuid: { type: String },
  
  // ========================================
  // DENORMALIZED DISPLAY FIELDS
  // ========================================
  username: { type: String, required: true },
  mediaTitle: { type: String, required: true },
  mediaArtist: { type: String },
  mediaCoverArt: { type: String },
  
  // ========================================
  // TUNEBYTES CALCULATION DATA
  // ========================================
  tuneBytesEarned: { 
    type: Number, 
    required: true,
    min: [0, 'TuneBytes earned cannot be negative']
  },
  
  calculationSnapshot: {
    currentTotalValue: { type: Number, required: true },
    bidTimeTotalValue: { type: Number, required: true },
    userBidAmount: { type: Number, required: true },
    userBidPence: { type: Number, required: true },
    discoveryRank: { type: Number, required: true },
    discoveryBonus: { type: Number, required: true },
    timeElapsed: { type: Number }, // hours since bid
    formula: { type: String, default: '(currentTotal - bidTimeTotal) * ∛(userBidPence) * discoveryBonus' }
  },
  
  // ========================================
  // TRANSACTION STATUS
  // ========================================
  status: { 
    type: String, 
    enum: ['pending', 'confirmed', 'redeemed'], 
    default: 'confirmed' 
  },
  
  // ========================================
  // SECURITY & VERIFICATION
  // ========================================
  transactionHash: { 
    type: String, 
    index: true 
  }, // SHA-256 hash for tamper detection
  
  // ========================================
  // REDEMPTION DATA (for future use)
  // ========================================
  redemptionData: {
    redemptionType: { 
      type: String, 
      enum: ['merchandise', 'concert_tickets', 'meet_greet', 'exclusive_content'] 
    },
    itemId: String,
    fulfillmentData: mongoose.Schema.Types.Mixed,
    redeemedAt: Date
  }
}, { 
  timestamps: true,
  toJSON: { virtuals: true }, 
  toObject: { virtuals: true } 
});

// Indexes for efficient queries
tuneBytesTransactionSchema.index({ userId: 1, createdAt: -1 }); // User's TuneBytes history
tuneBytesTransactionSchema.index({ mediaId: 1, createdAt: -1 }); // Media's TuneBytes transactions
tuneBytesTransactionSchema.index({ bidId: 1 }); // Unique per bid
tuneBytesTransactionSchema.index({ status: 1 }); // Filter by status
tuneBytesTransactionSchema.index({ transactionHash: 1 }); // Hash lookup for verification

// ========================================
// HASH GENERATION
// ========================================

/**
 * Generate transaction hash for tamper detection
 */
tuneBytesTransactionSchema.methods.generateHash = function() {
  const crypto = require('crypto');
  const data = JSON.stringify({
    uuid: this.uuid,
    userId: this.userId?.toString(),
    user_uuid: this.user_uuid,
    mediaId: this.mediaId?.toString(),
    media_uuid: this.media_uuid,
    bidId: this.bidId?.toString(),
    bid_uuid: this.bid_uuid,
    tuneBytesEarned: this.tuneBytesEarned,
    status: this.status,
    createdAt: this.createdAt?.toISOString() || this.createdAt
  });
  return crypto.createHash('sha256').update(data).digest('hex');
};

/**
 * Verify transaction integrity by checking hash
 */
tuneBytesTransactionSchema.methods.verifyIntegrity = function() {
  const expectedHash = this.generateHash();
  return this.transactionHash === expectedHash;
};

// Auto-generate hash on save
tuneBytesTransactionSchema.pre('save', function(next) {
  if (this.isNew || this.isModified('tuneBytesEarned') || this.isModified('status')) {
    this.transactionHash = this.generateHash();
  }
  next();
});
tuneBytesTransactionSchema.index({ 'calculationSnapshot.discoveryRank': 1 }); // Discovery analytics

// Compound indexes
tuneBytesTransactionSchema.index({ userId: 1, status: 1, createdAt: -1 });
tuneBytesTransactionSchema.index({ mediaId: 1, 'calculationSnapshot.discoveryRank': 1 });

// Virtual for total TuneBytes earned by user
tuneBytesTransactionSchema.virtual('totalTuneBytesEarned').get(function() {
  return this.tuneBytesEarned;
});

// Static method to get user's total TuneBytes
tuneBytesTransactionSchema.statics.getUserTotalTuneBytes = async function(userId) {
  const result = await this.aggregate([
    { $match: { userId: new mongoose.Types.ObjectId(userId), status: 'confirmed' } },
    { $group: { _id: null, total: { $sum: '$tuneBytesEarned' } } }
  ]);
  
  return result.length > 0 ? result[0].total : 0;
};

// Static method to get user's TuneBytes history
tuneBytesTransactionSchema.statics.getUserTuneBytesHistory = async function(userId, limit = 50) {
  return this.find({ userId, status: 'confirmed' })
    .populate('mediaId', 'title artist coverArt')
    .populate('bidId', 'amount createdAt')
    .sort({ createdAt: -1 })
    .limit(limit);
};

// Static method to get discovery statistics
tuneBytesTransactionSchema.statics.getDiscoveryStats = async function(mediaId) {
  return this.aggregate([
    { $match: { mediaId: new mongoose.Types.ObjectId(mediaId) } },
    {
      $group: {
        _id: '$calculationSnapshot.discoveryRank',
        count: { $sum: 1 },
        totalTuneBytes: { $sum: '$tuneBytesEarned' },
        avgTuneBytes: { $avg: '$tuneBytesEarned' }
      }
    },
    { $sort: { _id: 1 } }
  ]);
};

module.exports = mongoose.model('TuneBytesTransaction', tuneBytesTransactionSchema);
