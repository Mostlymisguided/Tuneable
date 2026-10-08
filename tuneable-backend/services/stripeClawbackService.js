/**
 * Reverse wallet credit when Stripe refunds or disputes a top-up.
 * Idempotent on the original top-up: each call debits only the newly
 * refunded portion. A shortfall freezes the wallet instead of driving
 * the balance negative.
 */

const mongoose = require('mongoose');
const WalletTransaction = require('../models/WalletTransaction');
const User = require('../models/User');

function clawbackTargetPence(creditedPence, { refunded = 0, gross = 0, fullyRefunded = false } = {}) {
  const credited = Math.max(0, Math.round(Number(creditedPence) || 0));
  if (credited === 0) return 0;
  const refundedMinor = Math.max(0, Math.round(Number(refunded) || 0));
  const grossMinor = Math.max(0, Math.round(Number(gross) || 0));
  if (fullyRefunded || (grossMinor > 0 && refundedMinor >= grossMinor)) return credited;
  if (grossMinor <= 0 || refundedMinor <= 0) return 0;
  return Math.min(credited, Math.round((credited * refundedMinor) / grossMinor));
}

function disputeClawbackTargetPence(creditedPence, dispute) {
  const credited = Math.max(0, Math.round(Number(creditedPence) || 0));
  if (credited === 0) return 0;
  const currency = String(dispute?.currency || 'gbp').toLowerCase();
  const disputed = Math.max(0, Math.round(Number(dispute?.amount) || 0));
  if (currency !== 'gbp' || disputed <= 0) return credited;
  return Math.min(credited, disputed);
}

function paymentIntentIdFrom(object) {
  const raw = object?.payment_intent;
  if (typeof raw === 'string') return raw;
  return raw?.id || null;
}

async function applyClawback({ paymentIntentId, targetPence, reason, eventId }) {
  if (!paymentIntentId) return { skipped: true, reason: 'missing_payment_intent' };

  const tx = await WalletTransaction.findOne({
    stripePaymentIntentId: paymentIntentId,
    type: 'topup',
    paymentMethod: 'stripe',
  });
  if (!tx) return { skipped: true, reason: 'no_topup' };

  const target = Math.max(0, Math.min(tx.amount, Math.round(Number(targetPence) || 0)));
  const session = await mongoose.startSession();
  let outcome;
  try {
    await session.withTransaction(async () => {
      const fresh = await WalletTransaction.findById(tx._id).session(session);
      const already = Math.max(0, Number(fresh.metadata?.clawedBackPence) || 0);
      const delta = target - already;
      if (delta <= 0) {
        outcome = { alreadyProcessed: true, clawedBackPence: already, userId: fresh.userId };
        return;
      }

      const user = await User.findById(fresh.userId).session(session);
      if (!user) {
        const err = new Error('User not found for Stripe clawback');
        err.retryable = true;
        throw err;
      }

      const balanceBefore = user.balance || 0;
      const debit = Math.min(balanceBefore, delta);
      const shortfall = delta - debit;
      const userUpdate = {};
      if (debit > 0) userUpdate.$inc = { balance: -debit };
      if (shortfall > 0 && !user.walletFrozenAt) {
        userUpdate.$set = {
          walletFrozenAt: new Date(),
          walletFrozenReason: reason || 'Card payment was refunded or disputed after the wallet credit was spent',
        };
      }
      if (userUpdate.$inc || userUpdate.$set) {
        await User.updateOne({ _id: user._id }, userUpdate).session(session);
      }

      if (debit > 0) {
        await WalletTransaction.create([{
          userId: user._id,
          user_uuid: user.uuid,
          username: user.username,
          amount: debit,
          type: 'adjustment',
          status: 'completed',
          paymentMethod: 'stripe',
          stripePaymentIntentId: paymentIntentId,
          balanceBefore,
          balanceAfter: balanceBefore - debit,
          description: reason || 'Stripe refund clawback',
          metadata: {
            stripeClawbackOf: String(fresh._id),
            stripeEventId: eventId || null,
            shortfallPence: shortfall,
            requestedPence: delta,
          },
        }], { session });
      }

      const clawedBackPence = already + delta;
      fresh.metadata = {
        ...(fresh.metadata || {}),
        clawedBackPence,
        clawbackShortfallPence: (Number(fresh.metadata?.clawbackShortfallPence) || 0) + shortfall,
      };
      fresh.markModified('metadata');
      if (clawedBackPence >= fresh.amount) fresh.status = 'refunded';
      await fresh.save({ session });

      outcome = {
        alreadyProcessed: false,
        debitedPence: debit,
        shortfallPence: shortfall,
        clawedBackPence,
        fullyClawed: clawedBackPence >= fresh.amount,
        userId: fresh.userId,
      };
    });
  } finally {
    session.endSession();
  }

  return outcome || { alreadyProcessed: true };
}

async function clawbackFromStripeEvent(event) {
  const object = event?.data?.object || {};
  const paymentIntentId = paymentIntentIdFrom(object);
  let targetPence = 0;
  let reason = 'Stripe payment reversed';

  if (event.type === 'charge.refunded') {
    const tx = paymentIntentId
      ? await WalletTransaction.findOne({
        stripePaymentIntentId: paymentIntentId,
        type: 'topup',
        paymentMethod: 'stripe',
      }).select('amount')
      : null;
    targetPence = clawbackTargetPence(tx?.amount || 0, {
      refunded: object.amount_refunded,
      gross: object.amount,
      fullyRefunded: object.refunded === true,
    });
    reason = 'Stripe refund of a wallet top-up';
  } else if (event.type === 'charge.dispute.created') {
    const tx = paymentIntentId
      ? await WalletTransaction.findOne({
        stripePaymentIntentId: paymentIntentId,
        type: 'topup',
        paymentMethod: 'stripe',
      }).select('amount')
      : null;
    targetPence = disputeClawbackTargetPence(tx?.amount || 0, object);
    reason = 'Stripe dispute on a wallet top-up';
  } else {
    return { skipped: true, reason: 'unhandled_event' };
  }

  const outcome = await applyClawback({
    paymentIntentId,
    targetPence,
    reason,
    eventId: event.id,
  });

  if (outcome.fullyClawed && outcome.userId) {
    try {
      const { unconvertPromoEscrowIfNoPaidTopUp } = require('./welcomePromoEscrowService');
      await unconvertPromoEscrowIfNoPaidTopUp(outcome.userId);
    } catch (promoErr) {
      console.error('Failed to unconvert promo escrow after Stripe clawback:', promoErr);
    }
  }

  return outcome;
}

module.exports = {
  clawbackTargetPence,
  disputeClawbackTargetPence,
  applyClawback,
  clawbackFromStripeEvent,
};
