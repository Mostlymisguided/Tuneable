const TuneableLedger = require('../models/TuneableLedger');
const User = require('../models/User');
const Media = require('../models/Media');
const Bid = require('../models/Bid');

/**
 * TuneableLedgerService
 * 
 * Service for creating ledger entries for all financial transactions.
 * Ensures consistent balance snapshot capture across all transaction types.
 */
class TuneableLedgerService {
  /**
   * Create a ledger entry for a TIP transaction (bid placement)
   * @param {Object} params
   * @param {ObjectId} params.userId - User ID
   * @param {ObjectId} params.mediaId - Media ID
   * @param {ObjectId} params.partyId - Party ID (optional)
   * @param {ObjectId} params.bidId - Bid ID
   * @param {number} params.amount - Amount in pence
   * @param {number} params.userBalancePre - User balance BEFORE transaction (in pence)
   * @param {number} params.userAggregatePre - User aggregate BEFORE transaction (in pence)
   * @param {number} params.mediaAggregatePre - Media aggregate BEFORE transaction (in pence)
   * @param {ObjectId} params.referenceTransactionId - Bid ID
   * @param {Object} params.metadata - Additional metadata
   * @returns {Promise<Object>} Created ledger entry
   */
  async createTipEntry({
    userId,
    mediaId,
    partyId = null,
    bidId,
    amount,
    userBalancePre,
    userAggregatePre,
    mediaAggregatePre,
    referenceTransactionId = null,
    metadata = {}
  }) {
    try {
      // Fetch user/media for other fields (uuid, username, etc.) but use passed PRE balances
      const user = await User.findById(userId).lean();
      const media = await Media.findById(mediaId).lean();
      
      if (!user) {
        throw new Error(`User ${userId} not found`);
      }
      if (!media) {
        throw new Error(`Media ${mediaId} not found`);
      }
      
      // Calculate POST balances using passed PRE values
      const userBalancePost = userBalancePre - amount; // Deduct for tip
      const userAggregatePost = userAggregatePre + amount;
      const mediaAggregatePost = mediaAggregatePre + amount;
      
      // Calculate global aggregate PRE and POST
      const globalAggregatePre = await this._calculateGlobalAggregate();
      // For TIP: global aggregate increases by amount (new active bid)
      const globalAggregatePost = globalAggregatePre + amount;
      
      // Get denormalized fields
      const username = user.username;
      const mediaTitle = media.title;
      const partyName = partyId ? await this._getPartyName(partyId) : null;
      
      const ledgerEntry = new TuneableLedger({
        userId,
        mediaId,
        partyId,
        bidId,
        user_uuid: user.uuid,
        media_uuid: media.uuid,
        transactionType: 'TIP',
        amount,
        userBalancePre,
        userBalancePost,
        userAggregatePre,
        userAggregatePost,
        mediaAggregatePre,
        mediaAggregatePost,
        globalAggregatePre,
        globalAggregatePost,
        referenceTransactionId: referenceTransactionId || bidId,
        referenceTransactionType: 'Bid',
        username,
        mediaTitle,
        partyName,
        description: `Tip of £${(amount / 100).toFixed(2)} on "${mediaTitle}"`,
        metadata
      });
      
      await ledgerEntry.save();
      
      // Store verification hash
      try {
        const verificationService = require('./transactionVerificationService');
        await verificationService.storeVerificationHash(ledgerEntry, 'TuneableLedger');
      } catch (verifyError) {
        console.error('Failed to store verification hash for ledger entry:', verifyError);
        // Don't fail the transaction if verification storage fails
      }
      
      return ledgerEntry;
    } catch (error) {
      console.error('Error creating TIP ledger entry:', error);
      throw error;
    }
  }
  
  /**
   * Create a ledger entry for a REFUND transaction
   * @param {Object} params
   * @param {ObjectId} params.userId - User ID
   * @param {ObjectId} params.mediaId - Media ID
   * @param {ObjectId} params.partyId - Party ID (optional)
   * @param {ObjectId} params.bidId - Bid ID being refunded
   * @param {number} params.amount - Refund amount in pence
   * @param {number} params.userBalancePre - User balance BEFORE transaction (in pence)
   * @param {number} params.userAggregatePre - User aggregate BEFORE transaction (in pence)
   * @param {number} params.mediaAggregatePre - Media aggregate BEFORE transaction (in pence)
   * @param {ObjectId} params.referenceTransactionId - RefundRequest ID (optional)
   * @param {Object} params.metadata - Additional metadata
   * @returns {Promise<Object>} Created ledger entry
   */
  async createRefundEntry({
    userId,
    mediaId,
    partyId = null,
    bidId,
    amount,
    userBalancePre,
    userAggregatePre,
    mediaAggregatePre,
    referenceTransactionId = null,
    metadata = {}
  }) {
    try {
      // Fetch user/media for other fields (uuid, username, etc.) but use passed PRE balances
      const user = await User.findById(userId).lean();
      const media = await Media.findById(mediaId).lean();
      
      if (!user) {
        throw new Error(`User ${userId} not found`);
      }
      if (!media) {
        throw new Error(`Media ${mediaId} not found`);
      }
      
      // Calculate POST balances using passed PRE values
      const userBalancePost = userBalancePre + amount; // Refund adds back
      const userAggregatePost = Math.max(0, userAggregatePre - amount); // Refund reduces aggregate
      const mediaAggregatePost = Math.max(0, mediaAggregatePre - amount); // Refund reduces aggregate
      
      // Calculate global aggregate PRE and POST
      const globalAggregatePre = await this._calculateGlobalAggregate();
      // For REFUND: global aggregate decreases by amount (bid becomes inactive)
      const globalAggregatePost = Math.max(0, globalAggregatePre - amount);
      
      // Get denormalized fields
      const username = user.username;
      const mediaTitle = media.title;
      const partyName = partyId ? await this._getPartyName(partyId) : null;
      
      const ledgerEntry = new TuneableLedger({
        userId,
        mediaId,
        partyId,
        bidId,
        user_uuid: user.uuid,
        media_uuid: media.uuid,
        transactionType: 'REFUND',
        amount,
        userBalancePre,
        userBalancePost,
        userAggregatePre,
        userAggregatePost,
        mediaAggregatePre,
        mediaAggregatePost,
        globalAggregatePre,
        globalAggregatePost,
        referenceTransactionId,
        referenceTransactionType: referenceTransactionId ? 'RefundRequest' : 'Bid',
        username,
        mediaTitle,
        partyName,
        description: `Refund of £${(amount / 100).toFixed(2)} for tip on "${mediaTitle}"`,
        metadata
      });
      
      await ledgerEntry.save();
      
      // Store verification hash
      try {
        const verificationService = require('./transactionVerificationService');
        await verificationService.storeVerificationHash(ledgerEntry, 'TuneableLedger');
      } catch (verifyError) {
        console.error('Failed to store verification hash for ledger entry:', verifyError);
      }
      
      return ledgerEntry;
    } catch (error) {
      console.error('Error creating REFUND ledger entry:', error);
      throw error;
    }
  }
  
  /**
   * Create a ledger entry for a TOP_UP transaction
   * @param {Object} params
   * @param {ObjectId} params.userId - User ID
   * @param {number} params.amount - Top-up amount in pence
   * @param {number} params.userBalancePre - User balance BEFORE transaction (in pence)
   * @param {number} params.userAggregatePre - User aggregate BEFORE transaction (in pence)
   * @param {ObjectId} params.referenceTransactionId - WalletTransaction ID
   * @param {Object} params.metadata - Additional metadata (Stripe session ID, etc.)
   * @returns {Promise<Object>} Created ledger entry
   */
  async createTopUpEntry({
    userId,
    amount,
    userBalancePre,
    userAggregatePre,
    userTuneBytesPre = null,
    referenceTransactionId,
    metadata = {}
  }) {
    try {
      // Fetch user for other fields (uuid, username, etc.) but use passed PRE balances
      const user = await User.findById(userId).lean();
      
      if (!user) {
        throw new Error(`User ${userId} not found`);
      }
      
      // Calculate POST balances using passed PRE values
      const userBalancePost = userBalancePre + amount; // Top-up adds
      const userAggregatePost = userAggregatePre; // Top-up doesn't change aggregate
      // Tunebytes don't change for balance top-ups (unless explicitly provided in metadata)
      const userTuneBytesPost = userTuneBytesPre !== null ? (metadata.tuneBytesChange ? userTuneBytesPre + metadata.tuneBytesChange : userTuneBytesPre) : null;
      
      // Calculate global aggregate PRE and POST
      const globalAggregatePre = await this._calculateGlobalAggregate();
      // For TOP_UP: global aggregate doesn't change (no bid activity)
      const globalAggregatePost = globalAggregatePre;
      
      // Get denormalized fields
      const username = user.username;
      
      const ledgerEntry = new TuneableLedger({
        userId,
        mediaId: null,
        partyId: null,
        bidId: null,
        user_uuid: user.uuid,
        transactionType: 'TOP_UP',
        amount,
        userBalancePre,
        userBalancePost,
        userTuneBytesPre,
        userTuneBytesPost,
        userAggregatePre,
        userAggregatePost,
        mediaAggregatePre: null,
        mediaAggregatePost: null,
        globalAggregatePre,
        globalAggregatePost,
        referenceTransactionId,
        referenceTransactionType: 'WalletTransaction',
        username,
        description: `Top-up of £${(amount / 100).toFixed(2)}`,
        metadata
      });
      
      console.log(`💾 Saving ledger entry to database: userId=${userId}, amount=${amount}, type=TOP_UP`);
      await ledgerEntry.save();
      console.log(`✅ Ledger entry saved successfully: ${ledgerEntry._id}`);
      
      // Store verification hash
      try {
        const verificationService = require('./transactionVerificationService');
        await verificationService.storeVerificationHash(ledgerEntry, 'TuneableLedger');
        console.log(`✅ Verification hash stored for ledger entry: ${ledgerEntry._id}`);
      } catch (verifyError) {
        console.error('⚠️ Failed to store verification hash for ledger entry:', verifyError);
        // Don't throw - hash storage failure shouldn't prevent ledger entry creation
      }
      
      return ledgerEntry;
    } catch (error) {
      console.error('❌ Error creating TOP_UP ledger entry:', error);
      console.error('Error details:', {
        userId,
        amount,
        userBalancePre,
        userAggregatePre,
        errorMessage: error.message,
        errorName: error.name,
        errorStack: error.stack
      });
      throw error;
    }
  }
  
  /**
   * Create a ledger entry for a TUNEBYTES_TOP_UP transaction (admin tunebytes adjustment)
   * @param {Object} params
   * @param {ObjectId} params.userId - User ID
   * @param {number} params.amount - Tunebytes amount added
   * @param {number} params.userTuneBytesPre - User tunebytes BEFORE transaction
   * @param {number} params.userBalancePre - User balance BEFORE transaction (in pence) - optional
   * @param {number} params.userAggregatePre - User aggregate BEFORE transaction (in pence) - optional
   * @param {Object} params.metadata - Additional metadata (admin info, description, etc.)
   * @returns {Promise<Object>} Created ledger entry
   */
  async createTuneBytesTopUpEntry({
    userId,
    amount,
    userTuneBytesPre,
    userBalancePre = null,
    userAggregatePre = null,
    metadata = {}
  }) {
    try {
      // Fetch user for other fields (uuid, username, etc.)
      const user = await User.findById(userId).lean();
      
      if (!user) {
        throw new Error(`User ${userId} not found`);
      }
      
      // Calculate POST balances
      const userTuneBytesPost = userTuneBytesPre + amount;
      // For tunebytes-only top-ups, balance and aggregate don't change
      const userBalancePost = userBalancePre !== null ? userBalancePre : null;
      const userAggregatePost = userAggregatePre !== null ? userAggregatePre : null;
      
      // Calculate global aggregate PRE and POST
      const globalAggregatePre = await this._calculateGlobalAggregate();
      // For TUNEBYTES_TOP_UP: global aggregate doesn't change (no bid activity)
      const globalAggregatePost = globalAggregatePre;
      
      // Get denormalized fields
      const username = user.username;
      
      const ledgerEntry = new TuneableLedger({
        userId,
        mediaId: null,
        partyId: null,
        bidId: null,
        user_uuid: user.uuid,
        transactionType: 'TOP_UP', // Use TOP_UP type but track tunebytes separately
        amount: 0, // No balance change, amount is 0
        userBalancePre: userBalancePre !== null ? userBalancePre : 0,
        userBalancePost: userBalancePost !== null ? userBalancePost : 0,
        userTuneBytesPre,
        userTuneBytesPost,
        userAggregatePre: userAggregatePre !== null ? userAggregatePre : 0,
        userAggregatePost: userAggregatePost !== null ? userAggregatePost : 0,
        mediaAggregatePre: null,
        mediaAggregatePost: null,
        globalAggregatePre,
        globalAggregatePost,
        referenceTransactionId: null,
        referenceTransactionType: null,
        username,
        description: `TuneBytes top-up of ${amount.toLocaleString()} tunebytes${metadata.description ? `: ${metadata.description}` : ''}`,
        metadata: {
          ...metadata,
          tunebytesAmount: amount,
          isTuneBytesOnly: true
        }
      });
      
      await ledgerEntry.save();
      
      // Store verification hash
      try {
        const verificationService = require('./transactionVerificationService');
        await verificationService.storeVerificationHash(ledgerEntry, 'TuneableLedger');
      } catch (verifyError) {
        console.error('Failed to store verification hash for ledger entry:', verifyError);
      }
      
      return ledgerEntry;
    } catch (error) {
      console.error('Error creating TUNEBYTES_TOP_UP ledger entry:', error);
      throw error;
    }
  }
  
  /**
   * Create a ledger entry for a PAY_OUT transaction (artist payout)
   * @param {Object} params
   * @param {ObjectId} params.userId - Artist user ID
   * @param {number} params.amount - Payout amount in pence
   * @param {number} params.escrowBalancePre - Artist escrow balance BEFORE transaction (in pence)
   * @param {number} params.userAggregatePre - User aggregate BEFORE transaction (in pence)
   * @param {ObjectId} params.referenceTransactionId - PayoutRequest ID
   * @param {Object} params.metadata - Additional metadata
   * @returns {Promise<Object>} Created ledger entry
   */
  async createPayoutEntry({
    userId,
    amount,
    escrowBalancePre,
    userAggregatePre,
    referenceTransactionId,
    metadata = {}
  }) {
    try {
      // Fetch user for other fields (uuid, username, etc.) but use passed PRE balances
      const user = await User.findById(userId).lean();
      
      if (!user) {
        throw new Error(`User ${userId} not found`);
      }
      
      // Calculate POST balances using passed PRE values
      // For payout, we track escrow balance in userBalance fields
      // (since it's the artist's "balance" being paid out)
      const userBalancePre = escrowBalancePre;
      const userBalancePost = Math.max(0, escrowBalancePre - amount);
      const userAggregatePost = userAggregatePre; // Payout doesn't change tip aggregate
      
      const artistEscrowBalancePost = userBalancePost;
      
      // Calculate global aggregate PRE and POST
      const globalAggregatePre = await this._calculateGlobalAggregate();
      // For PAY_OUT: global aggregate doesn't change (no bid activity)
      const globalAggregatePost = globalAggregatePre;
      
      // Get denormalized fields
      const username = user.username;
      
      const ledgerEntry = new TuneableLedger({
        userId,
        mediaId: null,
        partyId: null,
        bidId: null,
        user_uuid: user.uuid,
        transactionType: 'PAY_OUT',
        amount,
        userBalancePre,
        userBalancePost,
        userAggregatePre,
        userAggregatePost,
        mediaAggregatePre: null,
        mediaAggregatePost: null,
        globalAggregatePre,
        globalAggregatePost,
        referenceTransactionId,
        referenceTransactionType: 'PayoutRequest',
        username,
        description: `Artist payout of £${(amount / 100).toFixed(2)}`,
        metadata: {
          ...metadata,
          escrowBalancePre: escrowBalancePre,
          escrowBalancePost: artistEscrowBalancePost
        }
      });
      
      await ledgerEntry.save();
      
      // Store verification hash
      try {
        const verificationService = require('./transactionVerificationService');
        await verificationService.storeVerificationHash(ledgerEntry, 'TuneableLedger');
      } catch (verifyError) {
        console.error('Failed to store verification hash for ledger entry:', verifyError);
      }
      
      return ledgerEntry;
    } catch (error) {
      console.error('Error creating PAY_OUT ledger entry:', error);
      throw error;
    }
  }
  
  /**
   * Calculate global aggregate (sum of all active bids across platform)
   * @private
   * @returns {Promise<number>} Total amount in pence
   */
  async _calculateGlobalAggregate() {
    try {
      const result = await Bid.aggregate([
        {
          $match: {
            status: 'active' // Only count active bids
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
    } catch (error) {
      console.error('Error calculating global aggregate:', error);
      // Return 0 on error to avoid blocking ledger entry creation
      return 0;
    }
  }
  
  /**
   * Helper to get party name
   * @private
   */
  async _getPartyName(partyId) {
    try {
      const Party = require('../models/Party');
      const party = await Party.findById(partyId).select('name').lean();
      return party?.name || null;
    } catch (error) {
      console.error('Error getting party name:', error);
      return null;
    }
  }
}

module.exports = new TuneableLedgerService();


