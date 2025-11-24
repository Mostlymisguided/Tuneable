const mongoose = require('mongoose');
const { uuidv7 } = require('uuidv7');

const walletTransactionSchema = new mongoose.Schema({
  uuid: { type: String, unique: true, default: uuidv7 },
  
  // ========================================
  // REFERENCES (ObjectIds)
  // ========================================
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  
  // ========================================
  // UUID REFERENCES (for external API)
  // ========================================
  user_uuid: { type: String },
  
  // ========================================
  // TRANSACTION DETAILS
  // ========================================
  amount: { 
    type: Number, 
    required: true,
    min: [0, 'Transaction amount cannot be negative']
    // NOTE: Amount is stored in PENCE (integer), not pounds
    // Example: 500 represents £5.00, 1000 represents £10.00
  },
  
  type: { 
    type: String, 
    enum: ['topup', 'refund', 'adjustment', 'beta_credit', 'gift'],
    required: true 
  },
  
  status: { 
    type: String, 
    enum: ['pending', 'completed', 'failed', 'refunded'],
    default: 'completed'
  },
  
  // ========================================
  // PAYMENT METHOD DETAILS
  // ========================================
  paymentMethod: { 
    type: String, 
    enum: ['stripe', 'manual', 'beta', 'gift'],
    default: 'stripe'
  },
  
  stripeSessionId: { type: String }, // Stripe checkout session ID
  stripePaymentIntentId: { type: String }, // Stripe payment intent ID
  
  // ========================================
  // BALANCE TRACKING
  // ========================================
  balanceBefore: { type: Number }, // Balance before transaction (in pence)
  balanceAfter: { type: Number }, // Balance after transaction (in pence)
  
  // ========================================
  // METADATA
  // ========================================
  description: { type: String },
  metadata: { type: mongoose.Schema.Types.Mixed }, // For additional data (currency, customer email, etc.)
  
  // ========================================
  // DENORMALIZED FIELDS
  // ========================================
  username: { type: String }, // For quick lookups without populating
  
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

// ========================================
// INDEXES
// ========================================
walletTransactionSchema.index({ userId: 1, createdAt: -1 }); // User's transaction history (most recent first)
walletTransactionSchema.index({ stripeSessionId: 1 }); // Lookup by Stripe session
walletTransactionSchema.index({ stripePaymentIntentId: 1 }); // Lookup by Stripe payment intent
walletTransactionSchema.index({ type: 1, status: 1 }); // Filter by type and status
walletTransactionSchema.index({ userId: 1, type: 1, createdAt: -1 }); // User's transactions by type
walletTransactionSchema.index({ transactionHash: 1 }); // Hash lookup for verification

// ========================================
// HASH GENERATION
// ========================================

/**
 * Generate transaction hash for tamper detection
 * Hash includes all critical financial fields
 */
walletTransactionSchema.methods.generateHash = function() {
  const crypto = require('crypto');
  const data = JSON.stringify({
    uuid: this.uuid,
    userId: this.userId?.toString(),
    user_uuid: this.user_uuid,
    amount: this.amount,
    type: this.type,
    status: this.status,
    balanceBefore: this.balanceBefore,
    balanceAfter: this.balanceAfter,
    paymentMethod: this.paymentMethod,
    stripeSessionId: this.stripeSessionId,
    stripePaymentIntentId: this.stripePaymentIntentId,
    createdAt: this.createdAt?.toISOString() || this.createdAt
  });
  return crypto.createHash('sha256').update(data).digest('hex');
};

/**
 * Verify transaction integrity by checking hash
 */
walletTransactionSchema.methods.verifyIntegrity = function() {
  const expectedHash = this.generateHash();
  return this.transactionHash === expectedHash;
};

// Auto-generate hash on save
walletTransactionSchema.pre('save', function(next) {
  if (this.isNew || this.isModified('amount') || this.isModified('status') || this.isModified('balanceBefore') || this.isModified('balanceAfter')) {
    this.transactionHash = this.generateHash();
  }
  next();
});

// ========================================
// STATIC METHODS
// ========================================

/**
 * Get user's total top-ups (completed topup transactions only)
 * @param {ObjectId} userId - User ID
 * @returns {Promise<number>} Total top-ups in pence
 */
walletTransactionSchema.statics.getUserTotalTopUps = async function(userId) {
  const result = await this.aggregate([
    {
      $match: {
        userId: userId,
        type: 'topup',
        status: 'completed'
      }
    },
    {
      $group: {
        _id: null,
        total: { $sum: '$amount' }
      }
    }
  ]);
  
  return result.length > 0 ? result[0].total : 0;
};

/**
 * Get user's wallet transaction history
 * @param {ObjectId} userId - User ID
 * @param {number} limit - Number of transactions to return
 * @returns {Promise<Array>} Array of transactions
 */
walletTransactionSchema.statics.getUserWalletHistory = async function(userId, limit = 50) {
  return this.find({ userId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();
};

module.exports = mongoose.model('WalletTransaction', walletTransactionSchema);

