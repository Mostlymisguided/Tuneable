/**
 * Admin edit of an active tip's amount.
 *
 * The bid stays the same document: tipper, place snapshot, and createdAt
 * are left alone. The original TIP ledger row and its verification hash
 * are not rewritten. The difference is appended as an ADJUSTMENT ledger
 * entry with its own hash. Wallet and artist escrow move by that difference.
 */

const mongoose = require('mongoose');
const Bid = require('../models/Bid');
const User = require('../models/User');
const Media = require('../models/Media');
const ArtistEscrowAllocation = require('../models/ArtistEscrowAllocation');
const TuneableLedger = require('../models/TuneableLedger');
const VerificationHash = require('../models/VerificationHash');
const {
  adjustmentError,
  validateAdjustmentRequest,
  normaliseOwners,
  planOwnerDeltas,
  nextHistoryAmounts,
  scaleAffiliateAmount,
} = require('../utils/bidAmountAdjustment');

function sameId(a, b) {
  if (!a || !b) return false;
  const left = a._id ? a._id : a;
  const right = b._id ? b._id : b;
  return String(left) === String(right);
}

function historyEntryForBid(entry, bidId) {
  return entry?.bidId && sameId(entry.bidId, bidId);
}

function snapshotUser(user) {
  const plain = typeof user.toObject === 'function' ? user.toObject() : user;
  return {
    _id: user._id,
    artistEscrowBalance: plain.artistEscrowBalance || 0,
    artistPromoEscrowBalance: plain.artistPromoEscrowBalance || 0,
    totalEscrowEarned: plain.totalEscrowEarned || 0,
    referralCommissionEarned: plain.referralCommissionEarned || 0,
    artistEscrowHistory: plain.artistEscrowHistory || [],
  };
}

function snapshotAllocation(alloc) {
  return {
    _id: alloc._id,
    allocatedAmount: alloc.allocatedAmount,
    paidPence: alloc.paidPence || 0,
    promoPence: alloc.promoPence || 0,
    notes: alloc.notes || '',
  };
}

async function restoreUsers(snapshots) {
  for (const snap of snapshots) {
    await User.findByIdAndUpdate(snap._id, {
      $set: {
        artistEscrowBalance: snap.artistEscrowBalance,
        artistPromoEscrowBalance: snap.artistPromoEscrowBalance,
        totalEscrowEarned: snap.totalEscrowEarned,
        referralCommissionEarned: snap.referralCommissionEarned,
        artistEscrowHistory: snap.artistEscrowHistory,
      },
    });
  }
}

async function restoreAllocations(snapshots) {
  for (const snap of snapshots) {
    const alloc = await ArtistEscrowAllocation.findById(snap._id);
    if (!alloc) continue;
    alloc.allocatedAmount = snap.allocatedAmount;
    alloc.paidPence = snap.paidPence;
    alloc.promoPence = snap.promoPence;
    alloc.notes = snap.notes;
    await alloc.save();
  }
}

async function deleteLedgerEntry(ledgerEntry) {
  if (!ledgerEntry?._id) return;
  await TuneableLedger.deleteOne({ _id: ledgerEntry._id });
  await VerificationHash.deleteOne({
    transactionId: ledgerEntry._id,
    transactionType: 'TuneableLedger',
  });
}

function nextPromoFields(bid, newSplit, treatWelcomeAsPaid) {
  if (['converted', 'expired', 'reversed'].includes(bid.promoEscrowStatus)) {
    return null;
  }
  if (newSplit.promoArtistSharePence > 0 && !treatWelcomeAsPaid) {
    return {
      promoArtistSharePence: newSplit.promoArtistSharePence,
      promoEscrowStatus: 'pending',
      promoEscrowExpiresAt: bid.promoEscrowExpiresAt || newSplit.promoEscrowExpiresAt,
    };
  }
  return {
    promoArtistSharePence: 0,
    promoEscrowStatus: 'none',
    promoEscrowExpiresAt: null,
  };
}

/**
 * Plan escrow balance changes and mutate the loaded documents in memory.
 * Throws before any save when a payout already included the tip or a
 * balance would go negative.
 */
function planEscrowMutations({ bid, holders, allocations, ownerPlan }) {
  const { plans, oldSplit, newSplit } = ownerPlan;
  const balanceDeltas = new Map();

  const addDelta = (userId, patch) => {
    const key = String(userId);
    const current = balanceDeltas.get(key) || { paid: 0, promo: 0, earned: 0, referral: 0 };
    current.paid += patch.paid || 0;
    current.promo += patch.promo || 0;
    current.earned += patch.earned || 0;
    current.referral += patch.referral || 0;
    balanceDeltas.set(key, current);
  };

  for (const user of holders) {
    for (const entry of user.artistEscrowHistory || []) {
      if (!historyEntryForBid(entry, bid._id)) continue;
      if (entry.status === 'claimed') {
        throw adjustmentError(
          'PAYOUT_INCLUDED',
          `Escrow from this tip was included in a payout for ${user.username || 'an artist'}. The amount cannot be edited.`
        );
      }
    }
  }

  for (const alloc of allocations) {
    if (alloc.claimed) {
      throw adjustmentError(
        'PAYOUT_INCLUDED',
        `The escrow allocation for ${alloc.artistName || 'this artist'} has already been claimed. The amount cannot be edited.`
      );
    }
  }

  if (bid.promoEscrowStatus === 'reversed') {
    throw adjustmentError(
      'ESCROW_REVERSED',
      'Escrow for this tip was already reversed. Use Veto if the tip should be removed.'
    );
  }

  const matchedOwnerIds = new Set();

  for (const user of holders) {
    for (const entry of user.artistEscrowHistory || []) {
      if (!historyEntryForBid(entry, bid._id)) continue;

      if (entry.source === 'affiliate') {
        const target = scaleAffiliateAmount(
          entry.amount,
          oldSplit.paidArtistSharePence,
          newSplit.paidArtistSharePence
        );
        const delta = target - (entry.amount || 0);
        addDelta(user._id, { paid: delta, earned: delta, referral: delta });
        entry.amount = target;
        entry.paidPence = target;
        entry.promoPence = 0;
        continue;
      }

      const plan = plans.find((row) => row.userId && sameId(row.userId, user._id));
      if (plan) matchedOwnerIds.add(String(plan.userId._id || plan.userId));
      const next = nextHistoryAmounts(entry, {
        newPaid: plan ? plan.newPaid : entry.paidPence,
        newPromo: plan ? plan.newPromo : entry.promoPence,
      });
      if (!plan) {
        const scaled = oldSplit.artistSharePence > 0
          ? Math.round((entry.amount || 0) * newSplit.artistSharePence / oldSplit.artistSharePence)
          : (entry.amount || 0);
        const scaledNext = nextHistoryAmounts(
          { ...entry.toObject?.() || entry, amount: entry.amount, paidPence: entry.paidPence, promoPence: entry.promoPence, promoStatus: entry.promoStatus },
          { newPaid: scaled, newPromo: 0 }
        );
        addDelta(user._id, {
          paid: scaledNext.deltaWithdrawable,
          promo: scaledNext.deltaPromo,
          earned: scaledNext.deltaWithdrawable,
        });
        entry.amount = scaledNext.amount;
        entry.paidPence = scaledNext.paidPence;
        entry.promoPence = scaledNext.promoPence;
        continue;
      }

      addDelta(user._id, {
        paid: next.deltaWithdrawable,
        promo: next.deltaPromo,
        earned: next.deltaWithdrawable,
      });
      entry.amount = next.amount;
      entry.paidPence = next.paidPence;
      entry.promoPence = next.promoPence;
    }
    if (typeof user.markModified === 'function') {
      user.markModified('artistEscrowHistory');
    }
  }

  const holdersById = new Map(holders.map((user) => [String(user._id), user]));

  for (const plan of plans) {
    if (!plan.userId) continue;
    const key = String(plan.userId._id || plan.userId);
    if (matchedOwnerIds.has(key)) continue;
    const hasTipEntry = (holdersById.get(key)?.artistEscrowHistory || []).some(
      (entry) => historyEntryForBid(entry, bid._id) && entry.source !== 'affiliate'
    );
    if (hasTipEntry) continue;

    const deltaPaid = plan.newPaid - plan.oldPaid;
    const deltaPromo = plan.newPromo - plan.oldPromo;
    addDelta(plan.userId, { paid: deltaPaid, promo: deltaPromo, earned: deltaPaid });
  }

  for (const [userId, delta] of balanceDeltas) {
    const user = holdersById.get(userId);
    if (!user) continue;
    const balance = user.artistEscrowBalance || 0;
    const promoBalance = user.artistPromoEscrowBalance || 0;
    if (balance + delta.paid < 0 || promoBalance + delta.promo < 0) {
      const name = user?.username || 'an artist';
      throw adjustmentError(
        'ESCROW_SHORTFALL',
        `Reducing this tip would take ${name}'s escrow below zero. The amount cannot be edited.`,
        400,
        { userId, deltaPaid: delta.paid, deltaPromo: delta.promo, balance, promoBalance }
      );
    }
  }

  const allocationPlans = allocations.map((alloc) => {
    const plan = plans.find(
      (row) => !row.userId && Math.abs(row.percentage - (alloc.percentage || 0)) < 0.05
    );
    const newShare = plan
      ? plan.newShare
      : Math.round((alloc.allocatedAmount || 0) * (ownerPlan.newAmountPence / ownerPlan.oldAmountPence));
    const paidPence = plan ? plan.newPaid : newShare;
    const promoPence = plan ? plan.newPromo : (alloc.promoPence || 0);
    return { alloc, newShare, paidPence, promoPence };
  });

  return { balanceDeltas, allocationPlans, newSplit, oldSplit };
}

async function loadMissingHolders(balanceDeltas, holders) {
  const known = new Set(holders.map((user) => String(user._id)));
  const missingIds = [...balanceDeltas.keys()].filter((id) => !known.has(id) && mongoose.isValidObjectId(id));
  if (!missingIds.length) return holders;
  const extra = await User.find({ _id: { $in: missingIds } });
  return holders.concat(extra);
}

async function applyEscrowMutations({ bid, media, oldAmount, newAmount, treatWelcomeAsPaid }) {
  const owners = normaliseOwners(media);
  const ownerPlan = planOwnerDeltas({
    oldAmountPence: oldAmount,
    newAmountPence: newAmount,
    welcomeCreditAppliedPence: bid.welcomeCreditAppliedPence || 0,
    treatWelcomeAsPaid,
    owners,
  });
  ownerPlan.oldAmountPence = oldAmount;
  ownerPlan.newAmountPence = newAmount;

  let holders = await User.find({ 'artistEscrowHistory.bidId': bid._id });
  const allocations = await ArtistEscrowAllocation.find({ bidId: bid._id });
  const userSnapshots = holders.map(snapshotUser);
  const allocationSnapshots = allocations.map(snapshotAllocation);
  const planned = planEscrowMutations({ bid, holders, allocations, ownerPlan });
  const withMissing = await loadMissingHolders(planned.balanceDeltas, holders);

  for (const user of withMissing) {
    if (userSnapshots.some((snap) => sameId(snap._id, user._id))) continue;
    const delta = planned.balanceDeltas.get(String(user._id));
    if (delta && ((user.artistEscrowBalance || 0) + delta.paid < 0 || (user.artistPromoEscrowBalance || 0) + delta.promo < 0)) {
      throw adjustmentError(
        'ESCROW_SHORTFALL',
        `Reducing this tip would take ${user.username || 'an artist'}'s escrow below zero. The amount cannot be edited.`
      );
    }
    userSnapshots.push(snapshotUser(user));
    holders.push(user);
  }

  const stillMissing = [...planned.balanceDeltas.keys()].filter(
    (userId) => !holders.some((user) => sameId(user._id, userId))
  );
  if (stillMissing.length) {
    throw adjustmentError('ESCROW_ARTIST_MISSING', 'An artist on this tip could not be loaded.');
  }

  const apply = async () => {
    for (const user of holders) {
      const delta = planned.balanceDeltas.get(String(user._id));
      if (delta) {
        user.artistEscrowBalance = (user.artistEscrowBalance || 0) + delta.paid;
        user.artistPromoEscrowBalance = (user.artistPromoEscrowBalance || 0) + delta.promo;
        user.totalEscrowEarned = Math.max(0, (user.totalEscrowEarned || 0) + delta.earned);
        user.referralCommissionEarned = Math.max(0, (user.referralCommissionEarned || 0) + delta.referral);
      }
      const plan = ownerPlan.plans.find((row) => row.userId && sameId(row.userId, user._id));
      const hasTipEntry = (user.artistEscrowHistory || []).some(
        (entry) => historyEntryForBid(entry, bid._id) && entry.source !== 'affiliate'
      );
      const shareDelta = plan ? plan.newShare - plan.oldShare : 0;
      if (plan && !hasTipEntry && shareDelta > 0) {
        user.artistEscrowHistory = user.artistEscrowHistory || [];
        user.artistEscrowHistory.push({
          mediaId: bid.mediaId,
          bidId: bid._id,
          amount: shareDelta,
          paidPence: Math.max(0, plan.newPaid - plan.oldPaid),
          promoPence: Math.max(0, plan.newPromo - plan.oldPromo),
          promoStatus: (plan.newPromo - plan.oldPromo) > 0 ? 'pending' : 'none',
          allocatedAt: new Date(),
          status: 'pending',
          source: 'tip',
        });
        user.markModified('artistEscrowHistory');
      }
      await user.save();
    }

    for (const row of planned.allocationPlans) {
      row.alloc.allocatedAmount = row.newShare;
      row.alloc.paidPence = row.paidPence;
      row.alloc.promoPence = row.promoPence;
      const note = `Admin amount adjustment ${oldAmount}p -> ${newAmount}p.`;
      row.alloc.notes = row.alloc.notes ? `${row.alloc.notes} ${note}` : note;
      await row.alloc.save();
      await VerificationHash.updateOne(
        { transactionType: 'ArtistEscrowAllocation', transactionId: row.alloc._id },
        {
          $set: {
            notes: `Authorised admin tip edit. Original hash kept. Allocation is now ${row.newShare}p (was recorded at creation).`,
          },
        }
      );
    }
  };

  return {
    apply,
    userSnapshots,
    allocationSnapshots,
    promoFields: nextPromoFields(bid, ownerPlan.newSplit, treatWelcomeAsPaid),
    escrowTouched: planned.balanceDeltas.size > 0 || planned.allocationPlans.length > 0,
  };
}

async function adjustBidAmount({ bidId, newAmountPence, reason, adminUser }) {
  if (!mongoose.isValidObjectId(bidId)) {
    throw adjustmentError('INVALID_BID', 'Invalid bid ID.');
  }

  const bid = await Bid.findById(bidId);
  if (!bid) {
    throw adjustmentError('BID_NOT_FOUND', 'Bid not found.', 404);
  }

  const tipper = await User.findById(bid.userId);
  if (!tipper) {
    throw adjustmentError('TIPPER_NOT_FOUND', 'The tipper on this bid could not be found.', 404);
  }

  const media = await Media.findById(bid.mediaId);
  if (!media) {
    throw adjustmentError('MEDIA_NOT_FOUND', 'The media on this bid could not be found.', 404);
  }

  const request = validateAdjustmentRequest({
    oldAmountPence: bid.amount,
    newAmountPence,
    welcomeCreditAppliedPence: bid.welcomeCreditAppliedPence || 0,
    balancePence: tipper.balance || 0,
    reason,
    status: bid.status,
  });

  const { hasCompletedPaidTopUp } = require('./welcomePromoEscrowService');
  const treatWelcomeAsPaid = bid.userId ? await hasCompletedPaidTopUp(bid.userId) : false;
  const frozenPromo = ['converted', 'expired', 'reversed'].includes(bid.promoEscrowStatus);
  const escrow = await applyEscrowMutations({
    bid,
    media,
    oldAmount: request.oldAmountPence,
    newAmount: request.newAmountPence,
    treatWelcomeAsPaid: treatWelcomeAsPaid || frozenPromo,
  });

  const userBids = await Bid.find({ userId: tipper._id, status: 'active' }).select('amount').lean();
  const userAggregatePre = userBids.reduce((sum, row) => sum + (row.amount || 0), 0);
  const userBalancePre = tipper.balance || 0;
  const mediaAggregatePre = media.globalMediaAggregate || 0;

  const tuneableLedgerService = require('./tuneableLedgerService');
  let ledgerEntry = null;
  let walletApplied = false;
  let escrowApplied = false;

  try {
    ledgerEntry = await tuneableLedgerService.createAdjustmentEntry({
      userId: tipper._id,
      mediaId: media._id,
      partyId: bid.partyId || null,
      bidId: bid._id,
      oldAmountPence: request.oldAmountPence,
      newAmountPence: request.newAmountPence,
      userBalancePre,
      userAggregatePre,
      mediaAggregatePre,
      reason: request.reason,
      adjustedBy: adminUser?._id,
      metadata: {
        adjustedByUsername: adminUser?.username || null,
      },
    });

    const walletQuery = request.deltaPence > 0
      ? { _id: tipper._id, balance: { $gte: request.deltaPence } }
      : { _id: tipper._id };
    const walletUpdated = await User.findOneAndUpdate(
      walletQuery,
      { $inc: { balance: -request.deltaPence } },
      { new: true, select: 'balance username' }
    );
    if (!walletUpdated) {
      throw adjustmentError(
        'INSUFFICIENT_BALANCE',
        'The tipper\'s wallet changed before this edit could be saved. Refresh and try again.'
      );
    }
    walletApplied = true;

    await escrow.apply();
    escrowApplied = true;

    bid.amount = request.newAmountPence;
    if (escrow.promoFields) {
      bid.promoArtistSharePence = escrow.promoFields.promoArtistSharePence;
      bid.promoEscrowStatus = escrow.promoFields.promoEscrowStatus;
      bid.promoEscrowExpiresAt = escrow.promoFields.promoEscrowExpiresAt;
    }
    bid.amountAdjustments = bid.amountAdjustments || [];
    bid.amountAdjustments.push({
      at: new Date(),
      by: adminUser?._id,
      fromPence: request.oldAmountPence,
      toPence: request.newAmountPence,
      reason: request.reason,
      ledgerId: ledgerEntry._id,
    });
    await bid.save();

    try {
      const tuneBytesService = require('./tuneBytesService');
      tuneBytesService.scheduleRecalculateForMedia(bid.mediaId);
    } catch (tuneBytesError) {
      console.error('Failed to schedule TuneBytes recalc after tip edit:', tuneBytesError);
    }

    return {
      bid,
      previousAmountPence: request.oldAmountPence,
      amountPence: request.newAmountPence,
      deltaPence: request.deltaPence,
      walletDeltaPence: -request.deltaPence,
      ledgerId: ledgerEntry._id,
      escrowTouched: escrow.escrowTouched,
      tipper: {
        _id: tipper._id,
        username: tipper.username,
        balancePence: walletUpdated.balance,
      },
    };
  } catch (error) {
    if (escrowApplied) {
      try {
        await restoreUsers(escrow.userSnapshots);
        await restoreAllocations(escrow.allocationSnapshots);
      } catch (restoreError) {
        console.error('Failed to restore escrow after tip edit error:', restoreError);
      }
    }
    if (walletApplied) {
      try {
        await User.findByIdAndUpdate(tipper._id, { $inc: { balance: request.deltaPence } });
      } catch (restoreError) {
        console.error('Failed to restore tipper wallet after tip edit error:', restoreError);
      }
    }
    if (ledgerEntry && !walletApplied) {
      try {
        await deleteLedgerEntry(ledgerEntry);
      } catch (restoreError) {
        console.error('Failed to remove adjustment ledger row after tip edit error:', restoreError);
      }
    } else if (ledgerEntry && walletApplied) {
      try {
        await deleteLedgerEntry(ledgerEntry);
      } catch (restoreError) {
        console.error('Failed to remove adjustment ledger row after tip edit error:', restoreError);
      }
    }
    throw error;
  }
}

module.exports = {
  adjustBidAmount,
};
