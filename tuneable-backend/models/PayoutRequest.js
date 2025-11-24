const mongoose = require('mongoose');
const { uuidv7 } = require('uuidv7');

/**
 * PayoutRequest Model
 * 
 * Tracks artist payout requests for manual processing (Phase 1 MVP).
 * In Phase 2, this will integrate with Stripe Connect for automated payouts.
 * 
 * All amounts are stored in PENCE (integer), not pounds.
 */
const payoutRequestSchema = new mongoose.Schema({
  uuid: { 
    type: String, 
    unique: true, 
    default: uuidv7 
  },
  
  // ========================================
  // REFERENCES
  // ========================================
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true,
    index: true
  },
  user_uuid: { type: String }, // UUID reference for user
  
  // ========================================
  // REQUEST DETAILS
  // ========================================
  requestedAmount: { 
    type: Number, 
    required: true,
    min: 0
  }, // Amount requested in PENCE (integer)
  
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
    enum: ['pending', 'processing', 'completed', 'rejected'],
    default: 'pending',
    index: true
  },
  
  // ========================================
  // PAYOUT METHOD & DETAILS
  // ========================================
  payoutMethod: {
    type: String,
    enum: ['bank_transfer', 'paypal', 'stripe', 'manual', 'other'],
    default: 'bank_transfer'
  },
  
  payoutDetails: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }, // Account details, transaction IDs, etc.
  
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
  
  // ========================================
  // METADATA
  // ========================================
  notes: {
    type: String
  }, // Admin notes or rejection reason
  
  // Denormalized fields for quick access
  username: { type: String },
  email: { type: String },
  artistName: { type: String }, // From creatorProfile.artistName
  
  // ========================================
  // SECURITY & VERIFICATION
  // ========================================
  transactionHash: { 
    type: String, 
    index: true 
  }, // SHA-256 hash for tamper detection
}, {
    timestamps: true
});

// Indexes for efficient queries
payoutRequestSchema.index({ userId: 1, status: 1 });
payoutRequestSchema.index({ status: 1, requestedAt: 1 });
payoutRequestSchema.index({ processedBy: 1 });
payoutRequestSchema.index({ transactionHash: 1 }); // Hash lookup for verification

// ========================================
// HASH GENERATION
// ========================================

/**
 * Generate transaction hash for tamper detection
 */
payoutRequestSchema.methods.generateHash = function() {
  const crypto = require('crypto');
  const data = JSON.stringify({
    uuid: this.uuid,
    userId: this.userId?.toString(),
    user_uuid: this.user_uuid,
    requestedAmount: this.requestedAmount,
    status: this.status,
    payoutMethod: this.payoutMethod,
    requestedAt: this.requestedAt?.toISOString() || this.requestedAt,
    processedAt: this.processedAt?.toISOString() || this.processedAt
  });
  return crypto.createHash('sha256').update(data).digest('hex');
};

/**
 * Verify transaction integrity by checking hash
 */
payoutRequestSchema.methods.verifyIntegrity = function() {
  const expectedHash = this.generateHash();
  return this.transactionHash === expectedHash;
};

// Auto-generate hash on save
payoutRequestSchema.pre('save', function(next) {
  if (this.isNew || this.isModified('requestedAmount') || this.isModified('status')) {
    this.transactionHash = this.generateHash();
  }
  next();
});

// Pre-save hook to populate denormalized fields
payoutRequestSchema.pre('save', async function(next) {
  if (this.isNew && !this.username) {
    try {
      const User = require('./User');
      const user = await User.findById(this.userId).select('username email creatorProfile.artistName');
      if (user) {
        this.username = user.username;
        this.email = user.email;
        this.artistName = user.creatorProfile?.artistName || user.username;
        this.user_uuid = user.uuid;
      }
    } catch (error) {
      console.error('Error populating payout request denormalized fields:', error);
    }
  }
  next();
});

module.exports = mongoose.model('PayoutRequest', payoutRequestSchema);

