const mongoose = require('mongoose');
const { uuidv7 } = require('uuidv7');

/**
 * VerificationHash Model
 * 
 * Separate read-only storage for transaction hashes.
 * This provides an additional layer of security - even if someone
 * modifies a transaction in the main collection, the original
 * hash is preserved here for comparison.
 * 
 * This collection should have restricted write access (admin only).
 */
const verificationHashSchema = new mongoose.Schema({
  uuid: { type: String, unique: true, default: uuidv7 },
  
  // ========================================
  // TRANSACTION REFERENCE
  // ========================================
  transactionId: { 
    type: mongoose.Schema.Types.ObjectId, 
    required: true,
    index: true
  },
  
  transactionType: {
    type: String,
    enum: [
      'WalletTransaction',
      'Bid',
      'TuneBytesTransaction',
      'ArtistEscrowAllocation',
      'PayoutRequest'
    ],
    required: true,
    index: true
  },
  
  transactionUuid: { type: String, index: true },
  
  // ========================================
  // HASH DATA
  // ========================================
  originalHash: { 
    type: String, 
    required: true,
    index: true
  }, // Hash at time of creation (immutable)
  
  lastVerifiedHash: { 
    type: String 
  }, // Hash from last verification check
  
  lastVerifiedAt: { 
    type: Date 
  }, // When last verification was performed
  
  // ========================================
  // VERIFICATION STATUS
  // ========================================
  verificationStatus: {
    type: String,
    enum: ['verified', 'mismatch', 'not_verified'],
    default: 'not_verified',
    index: true
  },
  
  verificationCount: { 
    type: Number, 
    default: 0 
  }, // Number of times verified
  
  mismatchCount: { 
    type: Number, 
    default: 0 
  }, // Number of times hash mismatch detected
  
  // ========================================
  // METADATA
  // ========================================
  createdAt: { 
    type: Date, 
    default: Date.now,
    immutable: true // Prevent modification
  },
  
  notes: { type: String } // Admin notes if mismatch detected
}, {
  timestamps: true
});

// Indexes
verificationHashSchema.index({ transactionType: 1, transactionId: 1 }, { unique: true });
verificationHashSchema.index({ verificationStatus: 1, lastVerifiedAt: -1 });
verificationHashSchema.index({ mismatchCount: -1 }); // Find problematic transactions

/**
 * Update verification status
 */
verificationHashSchema.methods.updateVerification = function(currentHash, isValid) {
  this.lastVerifiedHash = currentHash;
  this.lastVerifiedAt = new Date();
  this.verificationCount += 1;
  
  if (isValid) {
    this.verificationStatus = 'verified';
  } else {
    this.verificationStatus = 'mismatch';
    this.mismatchCount += 1;
  }
  
  return this.save();
};

module.exports = mongoose.model('VerificationHash', verificationHashSchema);

