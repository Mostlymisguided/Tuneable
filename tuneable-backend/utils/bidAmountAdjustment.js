/**
 * Pure checks and escrow maths for an admin tip-amount edit.
 *
 * The original TIP ledger row stays as written. The edit changes the live bid
 * amount and records the difference as a new ADJUSTMENT ledger entry.
 */

const { splitArtistShare, splitOwnerShare } = require('./welcomePromoEscrow');

const MIN_TIP_PENCE = 1;
const MAX_TIP_PENCE = 111100; // £1,111.00, same ceiling as a wallet top-up

function adjustmentError(code, message, status = 400, details = {}) {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  err.details = details;
  return err;
}

function validateAdjustmentRequest({
  oldAmountPence,
  newAmountPence,
  welcomeCreditAppliedPence = 0,
  balancePence = 0,
  reason,
  status = 'active',
} = {}) {
  const oldAmount = Math.round(Number(oldAmountPence));
  const newAmount = Math.round(Number(newAmountPence));
  const welcome = Math.max(0, Math.round(Number(welcomeCreditAppliedPence) || 0));
  const balance = Math.round(Number(balancePence) || 0);
  const trimmedReason = typeof reason === 'string' ? reason.trim() : '';

  if (!Number.isInteger(oldAmount) || oldAmount < 0) {
    throw adjustmentError('INVALID_AMOUNT', 'This tip has no valid current amount.');
  }
  if (!Number.isInteger(newAmount)) {
    throw adjustmentError('INVALID_AMOUNT', 'Enter the new amount in pounds, to the penny.');
  }
  if (status !== 'active') {
    throw adjustmentError(
      'BID_NOT_ACTIVE',
      `This tip is ${status}. Only an active tip can have its amount edited.`
    );
  }
  if (newAmount < MIN_TIP_PENCE) {
    throw adjustmentError(
      'AMOUNT_TOO_SMALL',
      'The edited amount has to be at least £0.01. Use Veto to remove a tip.'
    );
  }
  if (newAmount > MAX_TIP_PENCE) {
    throw adjustmentError(
      'AMOUNT_TOO_LARGE',
      `The edited amount cannot be more than £${(MAX_TIP_PENCE / 100).toFixed(2)}.`
    );
  }
  if (newAmount === oldAmount) {
    throw adjustmentError('AMOUNT_UNCHANGED', 'That is already the tip amount.');
  }
  if (newAmount < welcome) {
    throw adjustmentError(
      'BELOW_WELCOME_CREDIT',
      `This tip used £${(welcome / 100).toFixed(2)} of welcome credit. The new amount has to cover that.`,
      400,
      { welcomeCreditAppliedPence: welcome }
    );
  }
  if (trimmedReason.length < 3) {
    throw adjustmentError('REASON_REQUIRED', 'Add a short reason (at least 3 characters).');
  }
  if (trimmedReason.length > 500) {
    throw adjustmentError('REASON_TOO_LONG', 'Keep the reason under 500 characters.');
  }

  const deltaPence = newAmount - oldAmount;
  if (deltaPence > 0 && balance < deltaPence) {
    throw adjustmentError(
      'INSUFFICIENT_BALANCE',
      `This increase needs £${(deltaPence / 100).toFixed(2)} more in the tipper's wallet. They have £${(balance / 100).toFixed(2)}.`,
      400,
      { requiredPence: deltaPence, balancePence: balance }
    );
  }

  return {
    oldAmountPence: oldAmount,
    newAmountPence: newAmount,
    deltaPence,
    reason: trimmedReason,
  };
}

/**
 * Ownership rows normalised so percentages sum to 100.
 * @returns {{ userId: *, percentage: number }[]}
 */
function normaliseOwners(media) {
  const owners = (media?.mediaOwners || []).filter((owner) => (Number(owner?.percentage) || 0) > 0);
  const total = owners.reduce((sum, owner) => sum + (Number(owner.percentage) || 0), 0);
  if (total <= 0) return [];
  return owners.map((owner) => ({
    userId: owner.userId || null,
    percentage: ((Number(owner.percentage) || 0) / total) * 100,
  }));
}

function planOwnerDeltas({ oldAmountPence, newAmountPence, welcomeCreditAppliedPence = 0, treatWelcomeAsPaid = false, owners = [] }) {
  const oldSplit = splitArtistShare({
    bidAmountPence: oldAmountPence,
    welcomeCreditAppliedPence,
    treatWelcomeAsPaid,
  });
  const newSplit = splitArtistShare({
    bidAmountPence: newAmountPence,
    welcomeCreditAppliedPence,
    treatWelcomeAsPaid,
  });

  const plans = owners.map((owner) => {
    const oldShare = Math.round(oldSplit.artistSharePence * (owner.percentage / 100));
    const newShare = Math.round(newSplit.artistSharePence * (owner.percentage / 100));
    const oldOwner = splitOwnerShare(oldShare, oldSplit);
    const newOwner = splitOwnerShare(newShare, newSplit);
    return {
      userId: owner.userId || null,
      percentage: owner.percentage,
      oldShare,
      newShare,
      oldPaid: oldOwner.paidPence,
      oldPromo: oldOwner.promoPence,
      newPaid: newOwner.paidPence,
      newPromo: newOwner.promoPence,
    };
  });

  return { oldSplit, newSplit, plans };
}

function recordedBuckets(entry) {
  const paid = Math.max(0, Number(entry?.paidPence) || 0);
  const promo = Math.max(0, Number(entry?.promoPence) || 0);
  const status = entry?.promoStatus || 'none';
  const hasSplit = paid > 0 || promo > 0;

  if (!hasSplit) {
    return { withdrawable: Math.max(0, Number(entry?.amount) || 0), promo: 0 };
  }
  if (status === 'pending') return { withdrawable: paid, promo };
  if (status === 'expired' || status === 'reversed') {
    return { withdrawable: status === 'reversed' ? 0 : paid, promo: 0 };
  }
  return { withdrawable: paid + promo, promo: 0 };
}

function targetBuckets(newPaid, newPromo, status) {
  const paid = Math.max(0, Math.round(Number(newPaid) || 0));
  const promo = Math.max(0, Math.round(Number(newPromo) || 0));
  if (status === 'pending') return { withdrawable: paid, promo };
  if (status === 'expired') return { withdrawable: paid, promo: 0 };
  if (status === 'reversed') return { withdrawable: 0, promo: 0 };
  return { withdrawable: paid + promo, promo: 0 };
}

/**
 * Next stored history fields, plus the balance deltas to apply.
 */
function nextHistoryAmounts(entry, { newPaid, newPromo }) {
  const status = entry?.promoStatus || 'none';
  const current = recordedBuckets(entry);
  const target = targetBuckets(newPaid, newPromo, status);
  const stored = status === 'pending'
    ? {
      amount: target.withdrawable + target.promo,
      paidPence: target.withdrawable,
      promoPence: target.promo,
    }
    : {
      amount: target.withdrawable,
      paidPence: target.withdrawable,
      promoPence: 0,
    };

  return {
    ...stored,
    promoStatus: status,
    deltaWithdrawable: target.withdrawable - current.withdrawable,
    deltaPromo: target.promo - current.promo,
  };
}

function scaleAffiliateAmount(currentAmount, oldPaidArtistShare, newPaidArtistShare) {
  const current = Math.max(0, Math.round(Number(currentAmount) || 0));
  const oldPaid = Math.max(0, Math.round(Number(oldPaidArtistShare) || 0));
  const newPaid = Math.max(0, Math.round(Number(newPaidArtistShare) || 0));
  if (oldPaid <= 0) return current;
  return Math.round(current * newPaid / oldPaid);
}

module.exports = {
  MIN_TIP_PENCE,
  MAX_TIP_PENCE,
  adjustmentError,
  validateAdjustmentRequest,
  normaliseOwners,
  planOwnerDeltas,
  recordedBuckets,
  targetBuckets,
  nextHistoryAmounts,
  scaleAffiliateAmount,
};
