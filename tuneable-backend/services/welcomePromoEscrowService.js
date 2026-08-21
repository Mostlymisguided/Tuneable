/**
 * Welcome-credit promotional artist escrow.
 *
 * Welcome-funded artist share sits in User.artistPromoEscrowBalance until the
 * tipper completes a real top-up (Stripe / Apple / Google). Tips stay on
 * charts either way. Unconverted pending escrow expires after 90 days.
 */

const Bid = require('../models/Bid');
const User = require('../models/User');
const Media = require('../models/Media');
const WalletTransaction = require('../models/WalletTransaction');
const ArtistEscrowAllocation = require('../models/ArtistEscrowAllocation');
const notificationService = require('./notificationService');
const {
  PAID_TOPUP_METHODS,
  PROMO_ESCROW_STATUS,
  isPaidTopUpMethod,
} = require('../utils/welcomePromoEscrow');

function idStr(value) {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (value._id) return String(value._id);
  return String(value);
}

function findHistoryEntry(user, bidId) {
  if (!user?.artistEscrowHistory?.length || !bidId) return null;
  const bidIdStr = idStr(bidId);
  return user.artistEscrowHistory.find(
    (entry) => entry.bidId && idStr(entry.bidId) === bidIdStr
  );
}

async function hasCompletedPaidTopUp(userId) {
  if (!userId) return false;
  const found = await WalletTransaction.exists({
    userId,
    type: 'topup',
    status: 'completed',
    paymentMethod: { $in: PAID_TOPUP_METHODS },
  });
  return Boolean(found);
}

async function notifyArtist(userId, { title, message, mediaId, bidId }) {
  if (!userId) return;
  try {
    await notificationService.createNotification({
      userId,
      type: 'escrow_allocated',
      title,
      message,
      link: mediaId ? `/tune/${mediaId}` : '/artist-escrow',
      linkText: mediaId ? 'View Media' : 'View Escrow',
      relatedMediaId: mediaId || undefined,
      relatedBidId: bidId || undefined,
      groupKey: `promo_escrow_${userId}_${title}_${Date.now()}`,
    });
  } catch (err) {
    console.error('Failed to send promo escrow notification:', err);
  }
}

/**
 * Move pending promo pence for one history entry into withdrawable escrow.
 * Caller must save the user.
 */
function applyConvertToUser(user, bidId) {
  const entry = findHistoryEntry(user, bidId);
  if (!entry || entry.promoStatus !== PROMO_ESCROW_STATUS.PENDING) {
    return { moved: 0 };
  }
  const promo = Math.max(0, entry.promoPence || 0);
  const available = Math.max(0, user.artistPromoEscrowBalance || 0);
  const move = Math.min(available, promo);
  user.artistPromoEscrowBalance = available - move;
  user.artistEscrowBalance = (user.artistEscrowBalance || 0) + move;
  user.totalEscrowEarned = (user.totalEscrowEarned || 0) + move;
  entry.promoStatus = PROMO_ESCROW_STATUS.CONVERTED;
  user.markModified('artistEscrowHistory');
  return { moved: move, artistUserId: user._id, mediaId: entry.mediaId };
}

/**
 * Expire pending promo pence (drop it). Caller must save the user.
 */
function applyExpireToUser(user, bidId) {
  const entry = findHistoryEntry(user, bidId);
  if (!entry || entry.promoStatus !== PROMO_ESCROW_STATUS.PENDING) {
    return { dropped: 0 };
  }
  const promo = Math.max(0, entry.promoPence || 0);
  const available = Math.max(0, user.artistPromoEscrowBalance || 0);
  const drop = Math.min(available, promo);
  user.artistPromoEscrowBalance = available - drop;
  entry.promoStatus = PROMO_ESCROW_STATUS.EXPIRED;
  user.markModified('artistEscrowHistory');
  return { dropped: drop, artistUserId: user._id, mediaId: entry.mediaId };
}

/**
 * Move converted promo back to pending (chargeback). Caller must save.
 */
function applyUnconvertToUser(user, bidId, { expireInstead = false } = {}) {
  const entry = findHistoryEntry(user, bidId);
  if (!entry || entry.promoStatus !== PROMO_ESCROW_STATUS.CONVERTED) {
    return { moved: 0, dropped: 0 };
  }
  const promo = Math.max(0, entry.promoPence || 0);
  const availablePaid = Math.max(0, user.artistEscrowBalance || 0);
  const reverse = Math.min(availablePaid, promo);
  user.artistEscrowBalance = availablePaid - reverse;
  user.totalEscrowEarned = Math.max(0, (user.totalEscrowEarned || 0) - reverse);

  if (expireInstead) {
    entry.promoStatus = PROMO_ESCROW_STATUS.EXPIRED;
    user.markModified('artistEscrowHistory');
    return { moved: 0, dropped: reverse, artistUserId: user._id };
  }

  user.artistPromoEscrowBalance = (user.artistPromoEscrowBalance || 0) + reverse;
  entry.promoStatus = PROMO_ESCROW_STATUS.PENDING;
  user.markModified('artistEscrowHistory');
  return { moved: reverse, dropped: 0, artistUserId: user._id };
}

async function loadArtistUsersForBid(bid) {
  const usersById = new Map();

  const allocations = await ArtistEscrowAllocation.find({ bidId: bid._id });
  for (const alloc of allocations) {
    if (alloc.claimed && alloc.artistUserId) {
      const id = idStr(alloc.artistUserId);
      if (id && !usersById.has(id)) {
        const user = await User.findById(alloc.artistUserId);
        if (user) usersById.set(id, user);
      }
    }
  }

  if (allocations.length === 0 && bid.mediaId) {
    const media = await Media.findById(bid.mediaId).select('mediaOwners');
    for (const owner of media?.mediaOwners || []) {
      if (!owner.userId) continue;
      const id = idStr(owner.userId);
      if (id && !usersById.has(id)) {
        const user = await User.findById(owner.userId);
        if (user) usersById.set(id, user);
      }
    }
  }

  return { usersById, allocations };
}

async function claimBidPromoStatus(bidId, fromStatus, toStatus) {
  return Bid.findOneAndUpdate(
    { _id: bidId, promoEscrowStatus: fromStatus },
    { $set: { promoEscrowStatus: toStatus } },
    { new: true }
  );
}

async function convertOneBid(bid, artistTotals) {
  const claimed = await claimBidPromoStatus(
    bid._id,
    PROMO_ESCROW_STATUS.PENDING,
    PROMO_ESCROW_STATUS.CONVERTED
  );
  if (!claimed) return { converted: false, moved: 0 };

  const { usersById, allocations } = await loadArtistUsersForBid(claimed);
  let moved = 0;

  for (const alloc of allocations) {
    if (alloc.promoStatus !== PROMO_ESCROW_STATUS.PENDING) continue;
    alloc.promoStatus = PROMO_ESCROW_STATUS.CONVERTED;
    await alloc.save();
  }

  for (const user of usersById.values()) {
    const result = applyConvertToUser(user, claimed._id);
    if (result.moved > 0) {
      await user.save();
      moved += result.moved;
      const key = idStr(user._id);
      artistTotals.set(key, (artistTotals.get(key) || 0) + result.moved);
    } else if (findHistoryEntry(user, claimed._id)) {
      await user.save();
    }
  }

  return { converted: true, moved };
}

async function expireOneBid(bid, artistTotals) {
  const claimed = await claimBidPromoStatus(
    bid._id,
    PROMO_ESCROW_STATUS.PENDING,
    PROMO_ESCROW_STATUS.EXPIRED
  );
  if (!claimed) return { expired: false, dropped: 0 };

  const { usersById, allocations } = await loadArtistUsersForBid(claimed);
  let dropped = 0;

  for (const alloc of allocations) {
    if (alloc.promoStatus !== PROMO_ESCROW_STATUS.PENDING) continue;
    alloc.promoStatus = PROMO_ESCROW_STATUS.EXPIRED;
    await alloc.save();
  }

  for (const user of usersById.values()) {
    const result = applyExpireToUser(user, claimed._id);
    if (result.dropped > 0 || findHistoryEntry(user, claimed._id)) {
      await user.save();
    }
    if (result.dropped > 0) {
      dropped += result.dropped;
      const key = idStr(user._id);
      artistTotals.set(key, (artistTotals.get(key) || 0) + result.dropped);
    }
  }

  return { expired: true, dropped };
}

async function unconvertOneBid(bid, { expireInstead = false } = {}, artistTotals) {
  const nextStatus = expireInstead
    ? PROMO_ESCROW_STATUS.EXPIRED
    : PROMO_ESCROW_STATUS.PENDING;
  const claimed = await claimBidPromoStatus(
    bid._id,
    PROMO_ESCROW_STATUS.CONVERTED,
    nextStatus
  );
  if (!claimed) return { unconverted: false, moved: 0 };

  const { usersById, allocations } = await loadArtistUsersForBid(claimed);
  let moved = 0;

  for (const alloc of allocations) {
    if (alloc.promoStatus !== PROMO_ESCROW_STATUS.CONVERTED) continue;
    alloc.promoStatus = nextStatus;
    await alloc.save();
  }

  for (const user of usersById.values()) {
    const result = applyUnconvertToUser(user, claimed._id, { expireInstead });
    await user.save();
    moved += result.moved;
    if (result.moved > 0 || result.dropped > 0) {
      const key = idStr(user._id);
      artistTotals.set(key, (artistTotals.get(key) || 0) + result.moved + result.dropped);
    }
  }

  return { unconverted: true, moved };
}

async function convertPromoEscrowForTipper(userId, { walletTransaction } = {}) {
  if (!userId) return { converted: false, bidCount: 0, movedPence: 0 };

  const paying = await hasCompletedPaidTopUp(userId);
  if (!paying) {
    return { converted: false, bidCount: 0, movedPence: 0, reason: 'no_paid_topup' };
  }

  const bids = await Bid.find({
    userId,
    promoEscrowStatus: PROMO_ESCROW_STATUS.PENDING,
    status: { $ne: 'refunded' },
  }).select('_id mediaId userId promoArtistSharePence promoEscrowExpiresAt');

  const artistTotals = new Map();
  let bidCount = 0;
  let movedPence = 0;

  for (const bid of bids) {
    const result = await convertOneBid(bid, artistTotals);
    if (result.converted) {
      bidCount += 1;
      movedPence += result.moved;
    }
  }

  if (bidCount > 0 || walletTransaction) {
    await User.findByIdAndUpdate(userId, {
      $set: {
        welcomePromoConvertedAt: new Date(),
        ...(walletTransaction?._id
          ? { welcomePromoConvertedByTxId: walletTransaction._id }
          : {}),
      },
    });
  }

  for (const [artistId, amount] of artistTotals.entries()) {
    if (amount <= 0) continue;
    await notifyArtist(artistId, {
      title: 'Promotional tips converted',
      message: `£${(amount / 100).toFixed(2)} from welcome-credit tips is now in your withdrawable escrow because the fan topped up.`,
    });
  }

  if (bidCount > 0) {
    console.log(
      `✅ Converted promo escrow for tipper ${userId}: ${bidCount} tip(s), £${(movedPence / 100).toFixed(2)}`
    );
  }

  return { converted: bidCount > 0, bidCount, movedPence };
}

/**
 * After a real top-up: convert any pending promo escrow from this tipper.
 */
async function afterPaidTopUp(userId, walletTransaction) {
  if (!userId || !isPaidTopUpMethod(walletTransaction?.paymentMethod)) {
    return { converted: false };
  }
  try {
    return await convertPromoEscrowForTipper(userId, { walletTransaction });
  } catch (err) {
    console.error('Failed to convert promo escrow after paid top-up:', err);
    return { converted: false, error: err.message };
  }
}

async function expireDuePromoEscrow({ now = new Date(), limit = 200 } = {}) {
  const due = await Bid.find({
    promoEscrowStatus: PROMO_ESCROW_STATUS.PENDING,
    promoEscrowExpiresAt: { $lte: now },
    status: { $ne: 'refunded' },
  })
    .select('_id userId mediaId promoArtistSharePence promoEscrowExpiresAt')
    .limit(limit);

  const artistTotals = new Map();
  let expiredBids = 0;
  let convertedInstead = 0;
  let droppedPence = 0;

  const tipperCache = new Map();

  for (const bid of due) {
    const tipperId = idStr(bid.userId);
    let paying = false;
    if (tipperId) {
      if (!tipperCache.has(tipperId)) {
        tipperCache.set(tipperId, await hasCompletedPaidTopUp(bid.userId));
      }
      paying = tipperCache.get(tipperId);
    }

    if (paying) {
      const result = await convertOneBid(bid, artistTotals);
      if (result.converted) convertedInstead += 1;
      continue;
    }

    const result = await expireOneBid(bid, artistTotals);
    if (result.expired) {
      expiredBids += 1;
      droppedPence += result.dropped;
    }
  }

  for (const [artistId, amount] of artistTotals.entries()) {
    if (amount <= 0) continue;
    await notifyArtist(artistId, {
      title: expiredBids > 0 && convertedInstead === 0
        ? 'Promotional tips expired'
        : 'Promotional escrow updated',
      message:
        expiredBids > 0 && convertedInstead === 0
          ? `£${(amount / 100).toFixed(2)} of welcome-credit tips expired because the fan did not top up within 90 days. Chart positions were not changed.`
          : `£${(amount / 100).toFixed(2)} of welcome-credit escrow was updated.`,
    });
  }

  if (expiredBids > 0 || convertedInstead > 0) {
    console.log(
      `✅ Promo escrow expiry: expired ${expiredBids} tip(s) (£${(droppedPence / 100).toFixed(2)}), converted ${convertedInstead} instead`
    );
  }

  return { expiredBids, convertedInstead, droppedPence };
}

async function expireDuePromoEscrowForArtist(artistUserId) {
  if (!artistUserId) return { expiredBids: 0 };
  const user = await User.findById(artistUserId).select('artistEscrowHistory');
  if (!user?.artistEscrowHistory?.length) return { expiredBids: 0 };

  const pendingBidIds = user.artistEscrowHistory
    .filter((entry) => entry.promoStatus === PROMO_ESCROW_STATUS.PENDING && entry.bidId)
    .map((entry) => entry.bidId);

  if (!pendingBidIds.length) return { expiredBids: 0 };

  const due = await Bid.find({
    _id: { $in: pendingBidIds },
    promoEscrowStatus: PROMO_ESCROW_STATUS.PENDING,
    promoEscrowExpiresAt: { $lte: new Date() },
  }).select('_id userId mediaId');

  const artistTotals = new Map();
  let expiredBids = 0;
  for (const bid of due) {
    if (await hasCompletedPaidTopUp(bid.userId)) {
      await convertOneBid(bid, artistTotals);
      continue;
    }
    const result = await expireOneBid(bid, artistTotals);
    if (result.expired) expiredBids += 1;
  }
  return { expiredBids };
}

async function unconvertPromoEscrowIfNoPaidTopUp(userId) {
  if (!userId) return { unconverted: false };
  const stillPaying = await hasCompletedPaidTopUp(userId);
  if (stillPaying) {
    return { unconverted: false, reason: 'still_has_paid_topup' };
  }

  const bids = await Bid.find({
    userId,
    promoEscrowStatus: PROMO_ESCROW_STATUS.CONVERTED,
    status: { $ne: 'refunded' },
  }).select('_id mediaId userId promoEscrowExpiresAt');

  const artistTotals = new Map();
  let bidCount = 0;
  const now = new Date();

  for (const bid of bids) {
    const expireInstead = bid.promoEscrowExpiresAt && new Date(bid.promoEscrowExpiresAt) <= now;
    const result = await unconvertOneBid(bid, { expireInstead }, artistTotals);
    if (result.unconverted) bidCount += 1;
  }

  await User.findByIdAndUpdate(userId, {
    $unset: { welcomePromoConvertedAt: 1, welcomePromoConvertedByTxId: 1 },
  });

  if (bidCount > 0) {
    console.log(
      `⚠️ Unconverted promo escrow for tipper ${userId} after paid top-up reversal: ${bidCount} tip(s)`
    );
  }

  return { unconverted: bidCount > 0, bidCount };
}

/**
 * Reverse escrow for a refunded/vetoed tip, including pending promo balances.
 */
async function reverseEscrowForBid(bid, refundAmount) {
  try {
    if (!bid?._id) return;

    if (
      bid.promoEscrowStatus === PROMO_ESCROW_STATUS.PENDING ||
      bid.promoEscrowStatus === PROMO_ESCROW_STATUS.CONVERTED
    ) {
      await Bid.updateOne(
        { _id: bid._id },
        { $set: { promoEscrowStatus: PROMO_ESCROW_STATUS.REVERSED } }
      );
    }

    const allocations = await ArtistEscrowAllocation.find({ bidId: bid._id });

    if (allocations.length > 0) {
      for (const alloc of allocations) {
        if (!alloc.claimed) {
          await alloc.deleteOne();
          continue;
        }
        if (alloc.artistUserId) {
          await reverseFromArtistUser(alloc.artistUserId, bid._id, {
            paidPence: alloc.paidPence,
            promoPence: alloc.promoPence,
            promoStatus: alloc.promoStatus,
            fallbackAmount: alloc.allocatedAmount,
          });
        }
      }
      return;
    }

    const mediaWithOwners = await Media.findById(bid.mediaId).select('mediaOwners');
    if (!mediaWithOwners?.mediaOwners?.length) return;

    const fallbackShare = Math.round((refundAmount || bid.amount || 0) * 0.7);
    for (const owner of mediaWithOwners.mediaOwners) {
      if (!owner.userId) continue;
      const ownerShare = Math.round(fallbackShare * ((owner.percentage || 0) / 100));
      await reverseFromArtistUser(owner.userId, bid._id, {
        fallbackAmount: ownerShare,
      });
    }
  } catch (error) {
    console.error(`Error reversing escrow for bid ${bid?._id}:`, error);
  }
}

async function reverseFromArtistUser(artistUserId, bidId, {
  paidPence,
  promoPence,
  promoStatus,
  fallbackAmount = 0,
} = {}) {
  const artistUser = await User.findById(artistUserId);
  if (!artistUser) return;

  const entry = findHistoryEntry(artistUser, bidId);
  const status = entry?.promoStatus || promoStatus || PROMO_ESCROW_STATUS.NONE;
  const paid = entry?.paidPence ?? paidPence;
  const promo = entry?.promoPence ?? promoPence ?? 0;

  let paidToReverse = 0;
  let promoToReverse = 0;

  if (typeof paid === 'number' || typeof promo === 'number') {
    const paidAmt = Math.max(0, paid || 0);
    const promoAmt = Math.max(0, promo || 0);
    if (status === PROMO_ESCROW_STATUS.PENDING) {
      paidToReverse = paidAmt;
      promoToReverse = promoAmt;
    } else if (status === PROMO_ESCROW_STATUS.CONVERTED || status === PROMO_ESCROW_STATUS.NONE) {
      paidToReverse = paidAmt + promoAmt;
    } else if (status === PROMO_ESCROW_STATUS.EXPIRED) {
      paidToReverse = paidAmt;
    }
  } else {
    paidToReverse = Math.max(0, fallbackAmount);
  }

  const paidDec = Math.min(Math.max(0, artistUser.artistEscrowBalance || 0), paidToReverse);
  const promoDec = Math.min(Math.max(0, artistUser.artistPromoEscrowBalance || 0), promoToReverse);

  artistUser.artistEscrowBalance = (artistUser.artistEscrowBalance || 0) - paidDec;
  artistUser.artistPromoEscrowBalance = (artistUser.artistPromoEscrowBalance || 0) - promoDec;
  artistUser.totalEscrowEarned = Math.max(
    0,
    (artistUser.totalEscrowEarned || 0) - paidDec
  );

  if (entry) {
    entry.status = 'claimed';
    entry.claimedAt = new Date();
    entry.promoStatus = PROMO_ESCROW_STATUS.REVERSED;
    artistUser.markModified('artistEscrowHistory');
  }

  await artistUser.save();
}

function startPromoEscrowExpiryCron() {
  const cron = require('node-cron');
  const expression = process.env.PROMO_ESCROW_EXPIRY_CRON || '0 15 3 * * *';
  if (!cron.validate(expression)) {
    console.error(`Invalid PROMO_ESCROW_EXPIRY_CRON expression: ${expression}`);
    return null;
  }
  const task = cron.schedule(expression, () => {
    expireDuePromoEscrow().catch((err) => {
      console.error('Promo escrow expiry cron failed:', err);
    });
  });
  console.log(`⏳ Promo escrow expiry cron enabled (${expression})`);
  return { task, stop: () => task.stop() };
}

module.exports = {
  hasCompletedPaidTopUp,
  convertPromoEscrowForTipper,
  afterPaidTopUp,
  expireDuePromoEscrow,
  expireDuePromoEscrowForArtist,
  unconvertPromoEscrowIfNoPaidTopUp,
  reverseEscrowForBid,
  startPromoEscrowExpiryCron,
};
