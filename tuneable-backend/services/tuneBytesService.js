/**
 * TuneBytes Service
 *
 * Reward currency for discovering media that later attracts more tips.
 *
 * Formula: TuneBytes = subsequentGrowth * ∛(userBidPence) * discoveryBonus
 *   subsequentGrowth = currentTotal − value at (and including) your tip
 * Discovery bonus: 1 + e^(−rank / 10)
 *
 * Awards are recalculated whenever a track's active tips change, so early
 * tippers earn as later people tip, and lose that growth if later tips refund.
 */

const mongoose = require('mongoose');
const Bid = require('../models/Bid');
const Media = require('../models/Media');
const User = require('../models/User');
const TuneBytesTransaction = require('../models/TuneBytesTransaction');
const {
  computeTuneBytesFromBids,
  inactiveTuneBytesResult,
  discoveryReason,
} = require('./tuneBytesCalculator');

const CREDIT_EPSILON = 1e-9;
const NOTIFY_DELTA_THRESHOLD = 0.1;

class TuneBytesService {
  constructor() {
    this.cache = new Map();
    this.cacheTimeout = 5 * 60 * 1000;
  }

  getDiscoveryBonus(rank) {
    return require('./tuneBytesCalculator').getDiscoveryBonus(rank);
  }

  getTimeElapsed(bidTime) {
    const elapsedMs = Date.now() - new Date(bidTime).getTime();
    return Math.round(elapsedMs / (1000 * 60 * 60));
  }

  async loadActiveBidsForMedia(mediaId) {
    return Bid.find({
      mediaId,
      status: 'active',
    })
      .sort({ createdAt: 1, _id: 1 })
      .populate(['userId', 'mediaId']);
  }

  /**
   * Calculate TuneBytes for a specific bid from current active tips.
   * Own tip is not counted as growth — only tips placed after this one.
   */
  async calculateTuneBytesForBid(bidId) {
    const bid = await Bid.findById(bidId).populate('mediaId');
    if (!bid) {
      throw new Error(`Bid ${bidId} not found`);
    }

    const media = bid.mediaId;
    if (!media) {
      throw new Error(`Media for bid ${bidId} not found`);
    }

    const allBids = await this.loadActiveBidsForMedia(media._id);
    return computeTuneBytesFromBids(bidId, allBids);
  }

  creditedAmountForBid(user, bidId, transaction) {
    const history = (user?.tuneBytesHistory || []).find(
      (entry) => entry.bidId && String(entry.bidId) === String(bidId)
    );
    if (history) {
      return history.earnedAmount || 0;
    }
    if (transaction?.status === 'confirmed') {
      return transaction.tuneBytesEarned || 0;
    }
    return 0;
  }

  snapshotForSave(calculation) {
    const snap = calculation?.calculation || {};
    return {
      currentTotalValue: snap.currentTotalValue || 0,
      bidTimeTotalValue: snap.bidTimeTotalValue || 0,
      subsequentGrowth: snap.subsequentGrowth || 0,
      userBidAmount: snap.userBidAmount || 0,
      userBidPence: snap.userBidPence || 0,
      discoveryRank: snap.discoveryRank || 0,
      discoveryBonus: snap.discoveryBonus || 1,
      timeElapsed: snap.timeElapsed || 0,
      totalBidsOnMedia: snap.totalBidsOnMedia || 0,
      formula: snap.formula,
    };
  }

  async upsertTransaction({ user, media, bid, transaction, earned, calculation }) {
    const snapshot = this.snapshotForSave(calculation);

    if (transaction) {
      transaction.tuneBytesEarned = earned;
      transaction.calculationSnapshot = snapshot;
      transaction.status = 'confirmed';
      if (user) {
        transaction.userId = user._id;
        transaction.user_uuid = user.uuid;
        transaction.username = user.username || transaction.username || 'Unknown';
      }
      if (media) {
        transaction.mediaId = media._id;
        transaction.media_uuid = media.uuid;
        transaction.mediaTitle = media.title || transaction.mediaTitle || 'Unknown';
        transaction.mediaArtist =
          Array.isArray(media.artist) && media.artist.length > 0
            ? media.artist[0].name
            : transaction.mediaArtist || 'Unknown';
        transaction.mediaCoverArt = media.coverArt;
      }
      if (!transaction.mediaTitle) {
        transaction.mediaTitle = 'Unknown';
      }
      if (!transaction.username) {
        transaction.username = 'Unknown';
      }
      await transaction.save();
      return transaction;
    }

    if (!bid || !user || !media || earned <= 0) {
      return null;
    }

    transaction = new TuneBytesTransaction({
      userId: user._id,
      mediaId: media._id,
      bidId: bid._id,
      user_uuid: user.uuid,
      media_uuid: media.uuid,
      bid_uuid: bid.uuid,
      username: user.username || 'Unknown',
      mediaTitle: media.title || 'Unknown',
      mediaArtist:
        Array.isArray(media.artist) && media.artist.length > 0
          ? media.artist[0].name
          : 'Unknown',
      mediaCoverArt: media.coverArt,
      tuneBytesEarned: earned,
      calculationSnapshot: snapshot,
      status: 'confirmed',
    });

    try {
      await transaction.save();
      return transaction;
    } catch (error) {
      if (error?.code !== 11000) {
        throw error;
      }
      transaction = await TuneBytesTransaction.findOne({ bidId: bid._id });
      if (!transaction) {
        throw error;
      }
      transaction.tuneBytesEarned = earned;
      transaction.calculationSnapshot = snapshot;
      transaction.status = 'confirmed';
      await transaction.save();
      return transaction;
    }
  }

  async applyUserDelta({ user, bidId, media, earned, delta, discoveryRank }) {
    if (Math.abs(delta) < CREDIT_EPSILON) {
      return { didCredit: false, tunebytesBefore: user.tuneBytes || 0 };
    }

    const tunebytesBefore = user.tuneBytes || 0;
    const reason = discoveryReason(discoveryRank);
    const historyFilter = {
      _id: user._id,
      'tuneBytesHistory.bidId': bidId,
    };

    const updatedExisting = await User.findOneAndUpdate(
      historyFilter,
      {
        $inc: { tuneBytes: delta },
        $set: {
          'tuneBytesHistory.$.earnedAmount': earned,
          'tuneBytesHistory.$.discoveryRank': discoveryRank,
          'tuneBytesHistory.$.reason': reason,
        },
      },
      { new: false }
    );

    if (updatedExisting) {
      await User.updateOne({ _id: user._id, tuneBytes: { $lt: 0 } }, { $set: { tuneBytes: 0 } });
      return { didCredit: true, tunebytesBefore: updatedExisting.tuneBytes || 0 };
    }

    if (earned <= 0 && delta <= 0) {
      if (delta < 0) {
        await User.updateOne({ _id: user._id }, { $inc: { tuneBytes: delta } });
        await User.updateOne({ _id: user._id, tuneBytes: { $lt: 0 } }, { $set: { tuneBytes: 0 } });
        return { didCredit: true, tunebytesBefore };
      }
      return { didCredit: false, tunebytesBefore };
    }

    const inserted = await User.findOneAndUpdate(
      {
        _id: user._id,
        'tuneBytesHistory.bidId': { $ne: bidId },
      },
      {
        $inc: { tuneBytes: delta },
        $push: {
          tuneBytesHistory: {
            mediaId: media?._id,
            earnedAmount: earned,
            earnedAt: new Date(),
            bidId,
            discoveryRank,
            reason,
          },
        },
      },
      { new: false }
    );

    if (inserted) {
      await User.updateOne({ _id: user._id, tuneBytes: { $lt: 0 } }, { $set: { tuneBytes: 0 } });
      return { didCredit: true, tunebytesBefore: inserted.tuneBytes || 0 };
    }

    // History appeared between reads (parallel settle). Apply balance only.
    await User.updateOne({ _id: user._id }, { $inc: { tuneBytes: delta } });
    await User.updateOne({ _id: user._id, tuneBytes: { $lt: 0 } }, { $set: { tuneBytes: 0 } });
    return { didCredit: true, tunebytesBefore };
  }

  async notifyIfNeeded(user, media, earned, delta, discoveryRank) {
    if (delta < NOTIFY_DELTA_THRESHOLD) return;
    try {
      const notificationService = require('./notificationService');
      await notificationService.notifyTuneBytesEarned(
        user._id.toString(),
        delta,
        discoveryReason(discoveryRank),
        media?._id?.toString() || null,
        media?.title || null
      ).catch((err) => console.error('Error sending TuneBytes earned notification:', err));
    } catch (error) {
      console.error('Error setting up TuneBytes notification:', error);
    }
  }

  async ledgerIfNeeded({
    skipLedgerEntry,
    didCredit,
    delta,
    credited,
    tunebytesBefore,
    user,
    bid,
    media,
    discoveryRank,
    calculation,
  }) {
    // Ledger the first credit for a bid. Later growth lives on the TuneBytes transaction.
    if (skipLedgerEntry || !didCredit || credited > 0 || delta <= 0) {
      return;
    }
    try {
      const tuneableLedgerService = require('./tuneableLedgerService');
      const updatedUser = await User.findById(user._id).lean();
      const userAggregatePre = await Bid.sumActiveAmount({ userId: user._id });
      await tuneableLedgerService.createTuneBytesTopUpEntry({
        userId: user._id,
        amount: delta,
        userTuneBytesPre: tunebytesBefore,
        userBalancePre: updatedUser.balance || 0,
        userAggregatePre,
        metadata: {
          source: 'bid_award',
          bidId: bid?._id?.toString(),
          mediaId: media?._id?.toString(),
          mediaTitle: media?.title,
          discoveryRank,
          reason: discoveryReason(discoveryRank),
          calculationSnapshot: calculation.calculation,
        },
      });
    } catch (ledgerError) {
      console.error('⚠️ Failed to create ledger entry for tunebytes award:', ledgerError);
    }
  }

  async settleOneBid({
    bidId,
    bid,
    user,
    media,
    transaction,
    calculation,
    skipLedgerEntry = false,
    notify = true,
    updateRankings = true,
  }) {
    const earned = Math.max(0, calculation.tuneBytesEarned || 0);
    const discoveryRank = calculation.calculation?.discoveryRank || 0;

    if (!user) {
      if (bid?.tuneBytesAwardStatus !== 'completed') {
        await Bid.updateOne(
          { _id: bidId },
          { $set: { tuneBytesAwardStatus: 'completed' } }
        );
      }
      return { bidId, tuneBytesEarned: earned, delta: 0 };
    }

    const credited = this.creditedAmountForBid(user, bidId, transaction);
    const delta = earned - credited;

    if (earned <= 0 && credited <= 0 && !transaction) {
      await Bid.updateOne(
        { _id: bidId },
        { $set: { tuneBytesAwardStatus: 'completed' } }
      );
      return { bidId, tuneBytesEarned: 0, delta: 0 };
    }

    if (Math.abs(delta) < CREDIT_EPSILON && transaction?.status === 'confirmed') {
      await Bid.updateOne(
        { _id: bidId },
        { $set: { tuneBytesAwardStatus: 'completed' } }
      );
      return { bidId, tuneBytesEarned: earned, delta: 0, alreadySettled: true };
    }

    const savedTransaction = await this.upsertTransaction({
      user,
      media,
      bid,
      transaction,
      earned,
      calculation,
    });

    const { didCredit, tunebytesBefore } = await this.applyUserDelta({
      user,
      bidId: bid?._id || bidId,
      media,
      earned,
      delta,
      discoveryRank,
    });

    await Bid.updateOne(
      { _id: bidId },
      { $set: { tuneBytesAwardStatus: 'completed' } }
    );

    if (savedTransaction) {
      try {
        const verificationService = require('./transactionVerificationService');
        await verificationService.storeVerificationHash(savedTransaction, 'TuneBytesTransaction');
      } catch (verifyError) {
        console.error('Failed to store verification hash for TuneBytes transaction:', verifyError);
      }
    }

    await this.ledgerIfNeeded({
      skipLedgerEntry,
      didCredit,
      delta,
      credited,
      tunebytesBefore,
      user,
      bid,
      media,
      discoveryRank,
      calculation,
    });

    if (notify) {
      await this.notifyIfNeeded(user, media, earned, delta, discoveryRank);
    }

    if (didCredit && Math.abs(delta) >= CREDIT_EPSILON) {
      const sign = delta > 0 ? '+' : '';
      console.log(
        `✅ TuneBytes ${sign}${delta.toFixed(2)} for ${user.username} on "${media?.title || 'media'}" (now ${earned.toFixed(2)})`
      );
      if (updateRankings) {
        try {
          const tuneBytesTagRankingsService = require('./tuneBytesTagRankingsService');
          tuneBytesTagRankingsService.invalidateUserTuneBytesTagRankings(user._id).catch(() => {});
        } catch (_) {
          /* non-blocking */
        }
      }
    }

    return {
      bidId,
      tuneBytesEarned: earned,
      delta,
      transaction: savedTransaction,
    };
  }

  /**
   * Recalculate TuneBytes for every tip on a media item.
   * Active bids earn from subsequent tips; refunded/vetoed bids are clawed back to 0.
   */
  async recalculateTuneBytesForMedia(mediaId, { skipLedgerEntry = false, notify = true, updateRankings = true } = {}) {
    if (!mediaId) {
      throw new Error('mediaId is required');
    }

    const activeBids = await this.loadActiveBidsForMedia(mediaId);
    const transactions = await TuneBytesTransaction.find({ mediaId });
    const txByBidId = new Map(
      transactions.map((tx) => [tx.bidId.toString(), tx])
    );

    const results = [];
    let totalAwarded = 0;
    let balancesChanged = 0;

    for (const bid of activeBids) {
      const calculation = computeTuneBytesFromBids(bid._id, activeBids);
      const settled = await this.settleOneBid({
        bidId: bid._id,
        bid,
        user: bid.userId,
        media: bid.mediaId,
        transaction: txByBidId.get(bid._id.toString()) || null,
        calculation,
        skipLedgerEntry,
        notify,
        updateRankings,
      });
      results.push(settled);
      totalAwarded += settled.tuneBytesEarned || 0;
      if (Math.abs(settled.delta || 0) >= CREDIT_EPSILON) {
        balancesChanged += 1;
      }
      txByBidId.delete(bid._id.toString());
    }

    // Claw back TuneBytes for tips that are no longer active (refunded / vetoed).
    for (const [bidId, transaction] of txByBidId.entries()) {
      let user = null;
      let bid = await Bid.findById(bidId).populate('userId');
      if (bid?.userId) {
        user = bid.userId;
      } else if (transaction.userId) {
        user = await User.findById(transaction.userId);
      }
      const settled = await this.settleOneBid({
        bidId,
        bid,
        user,
        media: bid?.mediaId || null,
        transaction,
        calculation: inactiveTuneBytesResult('bid_not_active'),
        skipLedgerEntry: true,
        notify: false,
        updateRankings,
      });
      results.push(settled);
      if (Math.abs(settled.delta || 0) >= CREDIT_EPSILON) {
        balancesChanged += 1;
      }
    }

    await Bid.updateMany(
      { mediaId, status: 'active' },
      { $set: { tuneBytesAwardStatus: 'completed' } }
    );

    return {
      mediaId,
      bidsProcessed: results.length,
      transactionsCreated: results.filter((r) => r.transaction && r.delta > 0).length,
      totalTuneBytesAwarded: totalAwarded,
      balancesChanged,
      bids: results,
    };
  }

  /**
   * Fire-and-forget recalc after a tip, refund, or veto.
   */
  scheduleRecalculateForMedia(mediaId) {
    if (!mediaId) return;
    setImmediate(() => {
      this.recalculateTuneBytesForMedia(mediaId).catch((error) => {
        console.error('Failed to recalculate TuneBytes for media:', mediaId, error);
      });
    });
  }

  /**
   * Backward-compatible entry point used by bid routes.
   * Settles the whole track so earlier tippers receive the new growth.
   */
  async awardTuneBytesForBid(bidId, skipLedgerEntry = false) {
    try {
      const bid = await Bid.findById(bidId).select('mediaId');
      if (!bid) {
        throw new Error(`Bid ${bidId} not found`);
      }
      const result = await this.recalculateTuneBytesForMedia(bid.mediaId, {
        skipLedgerEntry,
      });
      const thisBid = (result.bids || []).find(
        (entry) => String(entry.bidId) === String(bidId)
      );
      return {
        tuneBytesEarned: thisBid?.tuneBytesEarned || 0,
        delta: thisBid?.delta || 0,
        transaction: thisBid?.transaction || null,
        alreadyAwarded: Boolean(thisBid?.alreadySettled),
        result,
      };
    } catch (error) {
      console.error('Error awarding TuneBytes for bid:', bidId, error);
      throw error;
    }
  }

  /**
   * Get user's TuneBytes statistics
   */
  async getUserTuneBytesStats(userId) {
    const user = await User.findById(userId);
    if (!user) {
      throw new Error(`User ${userId} not found`);
    }

    const transactions = await TuneBytesTransaction.find({
      userId: new mongoose.Types.ObjectId(userId),
      status: 'confirmed',
    }).populate('mediaId', 'title artist coverArt');

    const ranks = transactions
      .map((t) => t.calculationSnapshot?.discoveryRank)
      .filter((rank) => typeof rank === 'number' && rank > 0);

    return {
      totalTuneBytes: user.tuneBytes || 0,
      totalTransactions: transactions.length,
      totalMediaDiscovered: new Set(
        transactions
          .filter((t) => t.mediaId)
          .map((t) => t.mediaId._id.toString())
      ).size,
      averageTuneBytesPerTransaction:
        transactions.length > 0
          ? transactions.reduce((sum, t) => sum + t.tuneBytesEarned, 0) /
            transactions.length
          : 0,
      topDiscoveryRank: ranks.length > 0 ? Math.min(...ranks) : null,
      recentTransactions: transactions.slice(0, 10),
    };
  }

  clearCache() {
    this.cache.clear();
  }
}

const service = new TuneBytesService();
module.exports = service;
module.exports.computeTuneBytesFromBids = computeTuneBytesFromBids;
module.exports.getDiscoveryBonus = require('./tuneBytesCalculator').getDiscoveryBonus;
