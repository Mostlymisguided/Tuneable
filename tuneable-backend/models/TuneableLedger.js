const mongoose = require('mongoose');
const { uuidv7 } = require('uuidv7');

/**
 * TuneableLedger Model
 * 
 * Centralized immutable ledger for all financial transactions in Tuneable.
 * Provides complete audit trail for compliance and debugging.
 * 
 * Uses sequence-based ordering (no hash chaining) to avoid race conditions
 * with high-volume async transactions.
 */
const tuneableLedgerSchema = new mongoose.Schema({
  uuid: { type: String, unique: true, default: uuidv7 },
  
  // ========================================
  // SEQUENCE NUMBER (for ordering)
  // ========================================
  sequence: {
    type: Number,
    unique: true,
    index: true
  }, // Auto-incrementing sequence number for ordering
  
  // ========================================
  // REFERENCES (ObjectIds)
  // ========================================
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true,
    index: true
  },
  mediaId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Media',
    index: true
    // Required for TIP/REFUND, null for TOP_UP/PAY_OUT
  },
  partyId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Party',
    index: true
    // Optional - null for global tips
  },
  bidId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Bid',
    index: true
    // Optional - null for top-ups/payouts
  },
  
  // ========================================
  // UUID REFERENCES (for external API)
  // ========================================
  user_uuid: { type: String, index: true },
  media_uuid: { type: String },
  party_uuid: { type: String },
  bid_uuid: { type: String },
  
  // ========================================
  // TRANSACTION DETAILS
  // ========================================
  transactionType: {
    type: String,
    enum: ['TIP', 'REFUND', 'TOP_UP', 'PAY_OUT'],
    required: true,
    index: true
  },
  
  amount: {
    type: Number,
    required: true,
    min: [0, 'Amount cannot be negative']
    // Amount in PENCE (integer)
  },
  
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  },
  
  // ========================================
  // BALANCE SNAPSHOTS (PRE)
  // ========================================
  userBalancePre: {
    type: Number,
    required: true
    // User's wallet balance before transaction (in pence)
  },
  
  userTuneBytesPre: {
    type: Number,
    default: null
    // User's tunebytes balance before transaction
    // Null for transactions that don't affect tunebytes
  },
  
  userAggregatePre: {
    type: Number,
    required: true,
    default: 0
    // User's total tips/aggregate before transaction (in pence)
  },
  
  mediaAggregatePre: {
    type: Number,
    default: null
    // Media's total aggregate before transaction (in pence)
    // Null for non-media transactions (TOP_UP, PAY_OUT)
  },
  
  globalAggregatePre: {
    type: Number,
    default: null
    // Platform-wide total of all active bids before transaction (in pence)
    // This is the sum of all active bids across the entire platform
  },
  
  // ========================================
  // BALANCE SNAPSHOTS (POST)
  // ========================================
  userBalancePost: {
    type: Number,
    required: true
    // User's wallet balance after transaction (in pence)
  },
  
  userTuneBytesPost: {
    type: Number,
    default: null
    // User's tunebytes balance after transaction
    // Null for transactions that don't affect tunebytes
  },
  
  userAggregatePost: {
    type: Number,
    required: true,
    default: 0
    // User's total tips/aggregate after transaction (in pence)
  },
  
  mediaAggregatePost: {
    type: Number,
    default: null
    // Media's total aggregate after transaction (in pence)
    // Null for non-media transactions (TOP_UP, PAY_OUT)
  },
  
  globalAggregatePost: {
    type: Number,
    default: null
    // Platform-wide total of all active bids after transaction (in pence)
    // This is the sum of all active bids across the entire platform
  },
  
  // ========================================
  // VERIFICATION
  // ========================================
  transactionHash: {
    type: String,
    index: true
  }, // SHA-256 hash for tamper detection (includes sequence)
  
  // ========================================
  // STATUS (for future block reconciliation)
  // ========================================
  status: {
    type: String,
    enum: ['confirmed', 'pending'],
    default: 'confirmed',
    index: true
  },
  
  // ========================================
  // METADATA & REFERENCES
  // ========================================
  description: {
    type: String
  }, // Human-readable description
  
  metadata: {
    type: mongoose.Schema.Types.Mixed
  }, // Additional context (Stripe session ID, etc.)
  
  // Link to source transaction (WalletTransaction, Bid, etc.)
  referenceTransactionId: {
    type: mongoose.Schema.Types.ObjectId,
    index: true
  },
  referenceTransactionType: {
    type: String,
    enum: ['WalletTransaction', 'Bid', 'PayoutRequest', 'RefundRequest']
  },
  
  // ========================================
  // DENORMALIZED FIELDS (for quick queries)
  // ========================================
  username: { type: String },
  mediaTitle: { type: String },
  partyName: { type: String },
  
}, {
  timestamps: true
});

// ========================================
// INDEXES
// ========================================
tuneableLedgerSchema.index({ userId: 1, timestamp: -1 }); // User's transaction history
tuneableLedgerSchema.index({ mediaId: 1, timestamp: -1 }); // Media's transaction history
tuneableLedgerSchema.index({ partyId: 1, timestamp: -1 }); // Party's transaction history
tuneableLedgerSchema.index({ transactionType: 1, timestamp: -1 }); // Filter by type
tuneableLedgerSchema.index({ sequence: 1 }); // Sequence ordering
tuneableLedgerSchema.index({ transactionHash: 1 }); // Hash lookup for verification
tuneableLedgerSchema.index({ status: 1, timestamp: -1 }); // Status filtering

// ========================================
// HASH GENERATION
// ========================================

/**
 * Generate transaction hash for tamper detection
 * Hash includes all critical financial fields + sequence number
 */
tuneableLedgerSchema.methods.generateHash = function() {
  const crypto = require('crypto');
  const data = JSON.stringify({
    uuid: this.uuid,
    sequence: this.sequence,
    userId: this.userId?.toString(),
    mediaId: this.mediaId?.toString(),
    partyId: this.partyId?.toString(),
    bidId: this.bidId?.toString(),
    transactionType: this.transactionType,
    amount: this.amount,
    timestamp: this.timestamp?.toISOString() || this.timestamp,
    userBalancePre: this.userBalancePre,
    userBalancePost: this.userBalancePost,
    userTuneBytesPre: this.userTuneBytesPre,
    userTuneBytesPost: this.userTuneBytesPost,
    userAggregatePre: this.userAggregatePre,
    userAggregatePost: this.userAggregatePost,
    mediaAggregatePre: this.mediaAggregatePre,
    mediaAggregatePost: this.mediaAggregatePost,
    globalAggregatePre: this.globalAggregatePre,
    globalAggregatePost: this.globalAggregatePost,
    status: this.status,
    referenceTransactionId: this.referenceTransactionId?.toString(),
    referenceTransactionType: this.referenceTransactionType
  });
  return crypto.createHash('sha256').update(data).digest('hex');
};

/**
 * Verify transaction integrity by checking hash
 */
tuneableLedgerSchema.methods.verifyIntegrity = function() {
  const expectedHash = this.generateHash();
  return this.transactionHash === expectedHash;
};

// ========================================
// PRE-SAVE HOOKS
// ========================================

/**
 * Counter model for sequence generation
 * Defined at module level to ensure proper registration
 */
let Counter;
try {
  Counter = mongoose.model('Counter');
} catch (error) {
  // Model doesn't exist yet, create it
  const counterSchema = new mongoose.Schema({
    _id: { type: String, required: true },
    sequence: { type: Number, default: 0 }
  }, { collection: 'counters' });
  Counter = mongoose.model('Counter', counterSchema);
}

/**
 * Get next sequence number atomically using MongoDB counter pattern
 * This prevents race conditions in high-volume async scenarios
 */
async function getNextSequence() {
  try {
    const result = await Counter.findByIdAndUpdate(
      'tuneableLedgerSequence',
      { $inc: { sequence: 1 } },
      { new: true, upsert: true }
    );
    
    return result.sequence;
  } catch (error) {
    console.error('Error generating sequence number:', error);
    // Fallback: if counter fails, use timestamp-based sequence
    // This ensures ledger entries can still be created
    throw new Error(`Failed to generate sequence number: ${error.message}`);
  }
}

/**
 * Auto-generate sequence number and hash before save
 */
tuneableLedgerSchema.pre('save', async function(next) {
  try {
    // Generate sequence number if new document
    if (this.isNew && !this.sequence) {
      // Use atomic counter to prevent race conditions
      this.sequence = await getNextSequence();
    }
    
    // Generate/regenerate hash if critical fields changed
    if (this.isNew || 
        this.isModified('amount') || 
        this.isModified('userBalancePre') || 
        this.isModified('userBalancePost') ||
        this.isModified('userTuneBytesPre') ||
        this.isModified('userTuneBytesPost') ||
        this.isModified('userAggregatePre') ||
        this.isModified('userAggregatePost') ||
        this.isModified('mediaAggregatePre') ||
        this.isModified('mediaAggregatePost') ||
        this.isModified('globalAggregatePre') ||
        this.isModified('globalAggregatePost') ||
        this.isModified('sequence')) {
      // Hash will be set after sequence is determined
      if (this.sequence) {
        this.transactionHash = this.generateHash();
      }
    }
    
    next();
  } catch (error) {
    next(error);
  }
});

/**
 * Set hash after sequence is determined (post-save if needed)
 */
tuneableLedgerSchema.post('save', async function() {
  // If hash wasn't set (shouldn't happen, but safety check)
  if (!this.transactionHash && this.sequence) {
    this.transactionHash = this.generateHash();
    await this.constructor.findByIdAndUpdate(this._id, {
      transactionHash: this.transactionHash
    });
  }
});

// ========================================
// STATIC METHODS
// ========================================

/**
 * Get user's ledger history
 * @param {ObjectId} userId - User ID
 * @param {number} limit - Number of entries to return
 * @returns {Promise<Array>} Array of ledger entries
 */
tuneableLedgerSchema.statics.getUserLedger = async function(userId, limit = 100) {
  return this.find({ userId })
    .sort({ sequence: -1 })
    .limit(limit)
    .lean();
};

/**
 * Get media's ledger history
 * @param {ObjectId} mediaId - Media ID
 * @param {number} limit - Number of entries to return
 * @returns {Promise<Array>} Array of ledger entries
 */
tuneableLedgerSchema.statics.getMediaLedger = async function(mediaId, limit = 100) {
  return this.find({ mediaId })
    .sort({ sequence: -1 })
    .limit(limit)
    .lean();
};

/**
 * Verify ledger integrity (check all hashes)
 * @param {number} limit - Number of recent entries to verify
 * @returns {Promise<Object>} Verification result
 */
tuneableLedgerSchema.statics.verifyLedgerIntegrity = async function(limit = 1000) {
  const entries = await this.find()
    .sort({ sequence: -1 })
    .limit(limit)
    .lean();
  
  let validCount = 0;
  let invalidCount = 0;
  const invalidEntries = [];
  
  for (const entry of entries) {
    const doc = new this(entry);
    const isValid = doc.verifyIntegrity();
    
    if (isValid) {
      validCount++;
    } else {
      invalidCount++;
      invalidEntries.push({
        sequence: entry.sequence,
        uuid: entry.uuid,
        transactionType: entry.transactionType,
        timestamp: entry.timestamp
      });
    }
  }
  
  return {
    totalChecked: entries.length,
    valid: validCount,
    invalid: invalidCount,
    invalidEntries
  };
};

module.exports = mongoose.model('TuneableLedger', tuneableLedgerSchema);


