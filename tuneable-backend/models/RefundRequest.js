const mongoose = require('mongoose');
const { uuidv7 } = require('uuidv7');

/**
 * RefundRequest Model
 * 
 * Tracks refund requests for bids that are outside the instant removal window (10 minutes).
 * Users can request refunds for their own bids, which are then processed by admins.
 * 
 * All amounts are stored in PENCE (integer), not pounds.
 */
const refundRequestSchema = new mongoose.Schema({
  uuid: { 
    type: String, 
    unique: true, 
    default: uuidv7 
  },
  
  // ========================================
  // REFERENCES
  // ========================================
  bidId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Bid', 
    required: true,
    index: true
  },
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true,
    index: true
  },
  partyId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Party', 
    required: true,
    index: true
  },
  mediaId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Media', 
    required: true,
    index: true
  },
  
  // ========================================
  // REQUEST DETAILS
  // ========================================
  amount: { 
    type: Number, 
    required: true,
    min: 0
  }, // Bid amount in PENCE (integer)
  
  reason: {
    type: String,
    required: true,
    trim: true
  }, // User's reason for requesting refund
  
  requestedAt: { 
    type: Date, 
    default: Date.now,
    index: true
  },
  
  // ========================================
  // STATUS TRACKING
  // ========================================
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending',
    index: true
  },
  
  // ========================================
  // PROCESSING INFORMATION
  // ========================================
  processedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  
  processedAt: {
    type: Date,
    default: null
  },
  
  rejectionReason: {
    type: String
  }, // Admin's reason for rejection (if rejected)
  
  // ========================================
  // DENORMALIZED FIELDS (for quick access)
  // ========================================
  username: { type: String },
  partyName: { type: String },
  mediaTitle: { type: String },
  mediaArtist: { type: String },
  
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
refundRequestSchema.index({ userId: 1, status: 1 });
refundRequestSchema.index({ status: 1, requestedAt: 1 });
refundRequestSchema.index({ processedBy: 1 });
refundRequestSchema.index({ transactionHash: 1 });

// ========================================
// HASH GENERATION
// ========================================

/**
 * Generate transaction hash for tamper detection
 */
refundRequestSchema.methods.generateHash = function() {
  const crypto = require('crypto');
  const data = JSON.stringify({
    uuid: this.uuid,
    bidId: this.bidId?.toString(),
    userId: this.userId?.toString(),
    partyId: this.partyId?.toString(),
    mediaId: this.mediaId?.toString(),
    amount: this.amount,
    status: this.status,
    requestedAt: this.requestedAt?.toISOString() || this.requestedAt,
    processedAt: this.processedAt?.toISOString() || this.processedAt
  });
  return crypto.createHash('sha256').update(data).digest('hex');
};

/**
 * Verify transaction integrity by checking hash
 */
refundRequestSchema.methods.verifyIntegrity = function() {
  const expectedHash = this.generateHash();
  return this.transactionHash === expectedHash;
};

// Auto-generate hash on save
refundRequestSchema.pre('save', function(next) {
  if (this.isNew || this.isModified('amount') || this.isModified('status')) {
    this.transactionHash = this.generateHash();
  }
  next();
});

// Pre-save hook to populate denormalized fields
refundRequestSchema.pre('save', async function(next) {
  if (this.isNew && (!this.username || !this.partyName || !this.mediaTitle)) {
    try {
      const Bid = require('./Bid');
      const Party = require('./Party');
      const Media = require('./Media');
      
      const bid = await Bid.findById(this.bidId).select('username partyName mediaTitle mediaArtist');
      if (bid) {
        this.username = bid.username || this.username;
        this.partyName = bid.partyName || this.partyName;
        this.mediaTitle = bid.mediaTitle || this.mediaTitle;
        this.mediaArtist = bid.mediaArtist || this.mediaArtist;
      }
    } catch (error) {
      console.error('Error populating refund request denormalized fields:', error);
    }
  }
  next();
});

module.exports = mongoose.model('RefundRequest', refundRequestSchema);

