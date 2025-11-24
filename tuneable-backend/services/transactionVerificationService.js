const WalletTransaction = require('../models/WalletTransaction');
const Bid = require('../models/Bid');
const TuneBytesTransaction = require('../models/TuneBytesTransaction');
const ArtistEscrowAllocation = require('../models/ArtistEscrowAllocation');
const PayoutRequest = require('../models/PayoutRequest');
const VerificationHash = require('../models/VerificationHash');

/**
 * Transaction Verification Service
 * 
 * Provides tamper detection and integrity verification for financial transactions.
 * Uses separate VerificationHash storage for additional security layer.
 */
class TransactionVerificationService {
  /**
   * Store verification hash for a transaction
   * Called when transaction is created
   */
  async storeVerificationHash(transaction, transactionType) {
    try {
      const hash = transaction.transactionHash || transaction.generateHash();
      
      // Store in separate verification collection
      await VerificationHash.findOneAndUpdate(
        {
          transactionType,
          transactionId: transaction._id
        },
        {
          transactionType,
          transactionId: transaction._id,
          transactionUuid: transaction.uuid,
          originalHash: hash,
          verificationStatus: 'not_verified'
        },
        {
          upsert: true,
          new: true
        }
      );
      
      return { success: true, hash };
    } catch (error) {
      console.error('Error storing verification hash:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Verify a single transaction
   */
  async verifyTransaction(transactionId, transactionType) {
    try {
      // Get transaction
      const TransactionModel = this.getModelForType(transactionType);
      const transaction = await TransactionModel.findById(transactionId);
      
      if (!transaction) {
        return { valid: false, error: 'Transaction not found' };
      }

      // Get stored verification hash
      const verification = await VerificationHash.findOne({
        transactionType,
        transactionId: transaction._id
      });

      if (!verification) {
        return { 
          valid: false, 
          error: 'No verification hash found',
          warning: 'Transaction may be older than verification system'
        };
      }

      // Generate current hash
      const currentHash = transaction.generateHash();
      const isValid = currentHash === verification.originalHash;

      // Update verification record
      await verification.updateVerification(currentHash, isValid);

      return {
        valid: isValid,
        transactionId: transaction._id,
        transactionUuid: transaction.uuid,
        originalHash: verification.originalHash,
        currentHash: currentHash,
        matches: isValid,
        verificationCount: verification.verificationCount,
        mismatchCount: verification.mismatchCount
      };
    } catch (error) {
      console.error('Error verifying transaction:', error);
      return { valid: false, error: error.message };
    }
  }

  /**
   * Verify all transactions of a specific type
   */
  async verifyAllTransactions(transactionType, options = {}) {
    const { limit = 1000, skip = 0 } = options;
    const TransactionModel = this.getModelForType(transactionType);
    
    const transactions = await TransactionModel.find()
      .skip(skip)
      .limit(limit)
      .lean();

    const results = {
      total: transactions.length,
      verified: 0,
      mismatches: 0,
      missing: 0,
      errors: 0,
      anomalies: []
    };

    for (const tx of transactions) {
      try {
        // Get verification hash
        const verification = await VerificationHash.findOne({
          transactionType,
          transactionId: tx._id
        });

        if (!verification) {
          results.missing++;
          continue;
        }

        // Generate current hash (need to instantiate model for method)
        const txModel = new TransactionModel(tx);
        const currentHash = txModel.generateHash();
        const isValid = currentHash === verification.originalHash;

        if (isValid) {
          results.verified++;
        } else {
          results.mismatches++;
          results.anomalies.push({
            transactionId: tx._id,
            transactionUuid: tx.uuid,
            transactionType,
            originalHash: verification.originalHash,
            currentHash: currentHash,
            detectedAt: new Date()
          });
        }

        // Update verification record
        await verification.updateVerification(currentHash, isValid);
      } catch (error) {
        results.errors++;
        console.error(`Error verifying transaction ${tx._id}:`, error.message);
      }
    }

    return results;
  }

  /**
   * Verify all financial transactions (all types)
   */
  async verifyAllFinancialTransactions(options = {}) {
    const transactionTypes = [
      'WalletTransaction',
      'Bid',
      'TuneBytesTransaction',
      'ArtistEscrowAllocation',
      'PayoutRequest'
    ];

    const overallResults = {
      timestamp: new Date(),
      byType: {},
      summary: {
        total: 0,
        verified: 0,
        mismatches: 0,
        missing: 0,
        errors: 0
      },
      anomalies: []
    };

    for (const type of transactionTypes) {
      const results = await this.verifyAllTransactions(type, options);
      overallResults.byType[type] = results;
      overallResults.summary.total += results.total;
      overallResults.summary.verified += results.verified;
      overallResults.summary.mismatches += results.mismatches;
      overallResults.summary.missing += results.missing;
      overallResults.summary.errors += results.errors;
      overallResults.anomalies.push(...results.anomalies);
    }

    return overallResults;
  }

  /**
   * Get model for transaction type
   */
  getModelForType(transactionType) {
    const models = {
      'WalletTransaction': WalletTransaction,
      'Bid': Bid,
      'TuneBytesTransaction': TuneBytesTransaction,
      'ArtistEscrowAllocation': ArtistEscrowAllocation,
      'PayoutRequest': PayoutRequest
    };

    return models[transactionType];
  }

  /**
   * Get transactions with hash mismatches
   */
  async getAnomalies(limit = 100) {
    const anomalies = await VerificationHash.find({
      verificationStatus: 'mismatch'
    })
      .sort({ mismatchCount: -1, lastVerifiedAt: -1 })
      .limit(limit)
      .lean();

    return anomalies;
  }

  /**
   * Get verification statistics
   */
  async getVerificationStats() {
    const stats = await VerificationHash.aggregate([
      {
        $group: {
          _id: '$verificationStatus',
          count: { $sum: 1 },
          totalMismatches: { $sum: '$mismatchCount' }
        }
      }
    ]);

    const total = await VerificationHash.countDocuments();
    const byType = await VerificationHash.aggregate([
      {
        $group: {
          _id: '$transactionType',
          count: { $sum: 1 },
          verified: {
            $sum: { $cond: [{ $eq: ['$verificationStatus', 'verified'] }, 1, 0] }
          },
          mismatches: {
            $sum: { $cond: [{ $eq: ['$verificationStatus', 'mismatch'] }, 1, 0] }
          }
        }
      }
    ]);

    return {
      total,
      byStatus: stats,
      byType
    };
  }
}

module.exports = new TransactionVerificationService();

