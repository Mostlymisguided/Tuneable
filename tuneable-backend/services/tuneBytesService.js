/**
 * TuneBytes Service
 *
 * Reward currency for tipping media, plus extra for discovering media that later attracts more tips.
 *
 * One seat per tipper. TuneBytes = tips in pence + growth.
 *   growth += opposing tip × ∛(stake already committed) × discoveryBonus(seat rank)
 * Discovery bonus: 1 + e^(−rank / 10). Rank is first-tipper order.
 *
 * A tip credits its value in pence immediately. A later top-up raises the stake
 * that faces the next opposing tip and does not resize growth already earned.
 * Awards are recalculated whenever a track's active tips change.
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

/**
 * One TuneBytes notice per user per settlement. A user can have several bids
 * on the same tune; those deltas are one earn, not one alert each.
 */
function collectTuneBytesNotice(notices, { user, media, delta, discoveryRank }) {
  if (!user?._id || !(delta >= NOTIFY_DELTA_THRESHOLD)) return;
  const key = String(user._id);
  const existing = notices.get(key);
  if (!existing) {
    notices.set(key, { user, media, delta, discoveryRank });
    return;
  }
  existing.delta += delta;
  if (discoveryReason(discoveryRank) === 'discovery') {
    existing.discoveryRank = discoveryRank;
  }
}

class TuneBytesService {
  constructor() {
    this.cache = new Map();
    this.cacheTimeout = 5 * 60 * 1000;
    // Tail of the in-process settle chain for each media. Overlapping
    // award, recovery, and refund recalcs otherwise each read a stale
    // balance and each send a TuneBytes notification.
    this.mediaSettleQueues = new Map();
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
   * The tip itself credits its value in pence. Opposing tips grow the seat once, at the stake committed before that tip.
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
      growthTuneBytes: snap.growthTuneBytes || 0,
      committedStake: snap.committedStake || 0,
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

  /**
   * Credit the change from the stored history row to `earned`.
   * The write matches only when that row is still outside the new total, so
   * a second settler cannot $inc or notify the same earn. A missing row is
   * inserted only when no element has this bidId (`$ne` on an array matches
   * when any other element differs, which used to insert a duplicate).
   */
  async applyUserDelta({ user, bidId, media, earned, delta, discoveryRank }, attempt = 0) {
    if (!user?._id || Math.abs(delta) < CREDIT_EPSILON) {
      return { didCredit: false, notifyDelta: 0, tunebytesBefore: user?.tuneBytes || 0 };
    }

    const fresh = await User.findById(user._id).select('tuneBytes tuneBytesHistory');
    const before = fresh?.tuneBytes || 0;
    const history = (fresh?.tuneBytesHistory || []).find(
      (entry) => entry.bidId && String(entry.bidId) === String(bidId)
    );
    // History wins over the caller's delta. The caller read the user once
    // for the whole media, so its delta is stale after an earlier bid in
    // the same pass, and after a settler that already committed.
    const applied = history ? earned - (history.earnedAmount || 0) : delta;
    if (Math.abs(applied) < CREDIT_EPSILON) {
      return { didCredit: false, notifyDelta: 0, tunebytesBefore: before };
    }

    const reason = discoveryReason(discoveryRank);
    const eps = CREDIT_EPSILON;

    if (history) {
      const updated = await User.findOneAndUpdate(
        {
          _id: user._id,
          tuneBytesHistory: {
            $elemMatch: {
              bidId,
              $or: [
                { earnedAmount: { $lte: earned - eps } },
                { earnedAmount: { $gte: earned + eps } },
                { earnedAmount: null },
                { earnedAmount: { $exists: false } },
              ],
            },
          },
        },
        {
          $inc: { tuneBytes: applied },
          $set: {
            'tuneBytesHistory.$.earnedAmount': earned,
            'tuneBytesHistory.$.discoveryRank': discoveryRank,
            'tuneBytesHistory.$.reason': reason,
          },
        },
        { new: false }
      );
      if (!updated) {
        return { didCredit: false, notifyDelta: 0, tunebytesBefore: before };
      }
      await User.updateOne({ _id: user._id, tuneBytes: { $lt: 0 } }, { $set: { tuneBytes: 0 } });
      return { didCredit: true, notifyDelta: applied, tunebytesBefore: updated.tuneBytes || 0 };
    }

    const inserted = await User.findOneAndUpdate(
      {
        _id: user._id,
        tuneBytesHistory: { $not: { $elemMatch: { bidId } } },
      },
      {
        $inc: { tuneBytes: applied },
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
      return { didCredit: true, notifyDelta: applied, tunebytesBefore: inserted.tuneBytes || 0 };
    }

    // Another settler inserted this bid between the read and the insert.
    if (attempt >= 1) {
      return { didCredit: false, notifyDelta: 0, tunebytesBefore: before };
    }
    return this.applyUserDelta(
      { user, bidId, media, earned, delta, discoveryRank },
      attempt + 1
    );
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

    const { didCredit, notifyDelta, tunebytesBefore } = await this.applyUserDelta({
      user,
      bidId: bid?._id || bidId,
      media,
      earned,
      delta,
      discoveryRank,
    });
    const appliedDelta = didCredit ? notifyDelta || 0 : 0;

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
      delta: appliedDelta,
      credited,
      tunebytesBefore,
      user,
      bid,
      media,
      discoveryRank,
      calculation,
    });

    if (didCredit && Math.abs(appliedDelta) >= CREDIT_EPSILON) {
      const sign = appliedDelta > 0 ? '+' : '';
      console.log(
        `✅ TuneBytes ${sign}${appliedDelta.toFixed(2)} for ${user.username} on "${media?.title || 'media'}" (now ${earned.toFixed(2)})`
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
      delta: appliedDelta,
      notifyDelta: notify ? appliedDelta : 0,
      user: notify ? user : null,
      media,
      discoveryRank,
      transaction: savedTransaction,
    };
  }

  /**
   * Recalculate TuneBytes for every tip on a media item.
   * Active bids earn their tip in pence. The seat bid also keeps growth from opposing tips. Refunded/vetoed bids are clawed back to 0.
   */
  enqueueMediaSettle(mediaId, task) {
    const key = String(mediaId);
    const previous = this.mediaSettleQueues.get(key) || Promise.resolve();
    const run = previous.catch(() => {}).then(task);
    const tracked = run.finally(() => {
      if (this.mediaSettleQueues.get(key) === tracked) {
        this.mediaSettleQueues.delete(key);
      }
    });
    this.mediaSettleQueues.set(key, tracked);
    return run;
  }

  async recalculateTuneBytesForMedia(mediaId, options = {}) {
    if (!mediaId) {
      throw new Error('mediaId is required');
    }
    return this.enqueueMediaSettle(mediaId, () =>
      this.recalculateTuneBytesForMediaNow(mediaId, options)
    );
  }

  async recalculateTuneBytesForMediaNow(mediaId, { skipLedgerEntry = false, notify = true, updateRankings = true } = {}) {
    const activeBids = await this.loadActiveBidsForMedia(mediaId);
    const transactions = await TuneBytesTransaction.find({ mediaId });
    const txByBidId = new Map(
      transactions.map((tx) => [tx.bidId.toString(), tx])
    );

    const results = [];
    const notices = new Map();
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
      collectTuneBytesNotice(notices, settled);
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

    for (const notice of notices.values()) {
      await this.notifyIfNeeded(
        notice.user,
        notice.media,
        notice.delta,
        notice.delta,
        notice.discoveryRank
      );
    }

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
module.exports.collectTuneBytesNotice = collectTuneBytesNotice;
module.exports.getDiscoveryBonus = require('./tuneBytesCalculator').getDiscoveryBonus;
