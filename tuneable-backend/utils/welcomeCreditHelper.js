/**
 * Welcome credit tracking helpers.
 *
 * Welcome credit is promotional and tracked separately from paid balance so
 * unspent credit can be revoked without touching Stripe top-ups.
 * Spends are promo-first: welcome credit remaining is consumed before paid funds.
 */

const WalletTransaction = require('../models/WalletTransaction');
const notificationService = require('../services/notificationService');

const WELCOME_CREDIT_PENCE = 1111; // £11.11

function getWelcomeCreditRemaining(user) {
  return Math.max(0, user.welcomeCreditRemainingPence || 0);
}

/**
 * How much of an upcoming spend would come from welcome credit (promo-first).
 * Does not mutate the user.
 */
function peekWelcomeCreditApplied(user, amountPence) {
  const amount = Math.max(0, Math.round(Number(amountPence)) || 0);
  return Math.min(getWelcomeCreditRemaining(user), amount);
}

/**
 * Deduct wallet balance, consuming welcome credit first.
 * Mutates user in memory; caller must save.
 * @returns {{ welcomeCreditAppliedPence: number, paidPence: number }}
 */
function applyWalletSpend(user, amountPence) {
  const amount = Math.max(0, Math.round(Number(amountPence)) || 0);
  const welcomeCreditAppliedPence = peekWelcomeCreditApplied(user, amount);
  user.welcomeCreditRemainingPence = getWelcomeCreditRemaining(user) - welcomeCreditAppliedPence;
  user.balance = (user.balance || 0) - amount;
  return {
    welcomeCreditAppliedPence,
    paidPence: amount - welcomeCreditAppliedPence,
  };
}

function insufficientBalanceError(available) {
  const err = new Error('Insufficient balance');
  err.status = 400;
  err.code = 'INSUFFICIENT_BALANCE';
  err.available = available || 0;
  return err;
}

/**
 * Debit balance and welcome credit in one conditional update.
 * Overlapping spends cannot both succeed against the same balance.
 * Syncs the in-memory user and unmarks those paths so a later save cannot
 * write a stale balance back.
 */
async function commitWalletSpend(user, amountPence) {
  const User = require('../models/User');
  const amount = Math.max(0, Math.round(Number(amountPence)) || 0);
  const userId = user._id || user;
  if (amount <= 0) {
    return {
      welcomeCreditAppliedPence: 0,
      paidPence: 0,
      balance: user.balance || 0,
    };
  }

  for (let attempt = 0; attempt < 3; attempt++) {
    const current = attempt === 0
      ? user
      : await User.findById(userId).select('balance welcomeCreditRemainingPence');
    if (!current) {
      const err = new Error('User not found');
      err.status = 404;
      throw err;
    }

    const balance = current.balance || 0;
    if (balance < amount) throw insufficientBalanceError(balance);

    const welcomeCreditAppliedPence = peekWelcomeCreditApplied(current, amount);
    const filter = { _id: userId, balance: { $gte: amount } };
    const inc = { balance: -amount };
    if (welcomeCreditAppliedPence > 0) {
      filter.welcomeCreditRemainingPence = { $gte: welcomeCreditAppliedPence };
      inc.welcomeCreditRemainingPence = -welcomeCreditAppliedPence;
    }

    const updated = await User.findOneAndUpdate(filter, { $inc: inc }, { new: true });
    if (!updated) continue;

    user.balance = updated.balance;
    user.welcomeCreditRemainingPence = updated.welcomeCreditRemainingPence;
    if (typeof user.unmarkModified === 'function') {
      user.unmarkModified('balance');
      user.unmarkModified('welcomeCreditRemainingPence');
    }
    return {
      welcomeCreditAppliedPence,
      paidPence: amount - welcomeCreditAppliedPence,
      balance: updated.balance,
    };
  }

  throw insufficientBalanceError(0);
}

/** Put a committed spend back. Used when the action it paid for did not save. */
async function releaseWalletSpend(user, amountPence, welcomeCreditAppliedPence) {
  const User = require('../models/User');
  const amount = Math.max(0, Math.round(Number(amountPence)) || 0);
  const welcome = Math.max(0, Math.round(Number(welcomeCreditAppliedPence)) || 0);
  if (!user?._id || amount <= 0) return;
  const inc = { balance: amount };
  if (welcome > 0) inc.welcomeCreditRemainingPence = welcome;
  const updated = await User.findByIdAndUpdate(user._id, { $inc: inc }, { new: true });
  if (!updated) return;
  user.balance = updated.balance;
  user.welcomeCreditRemainingPence = updated.welcomeCreditRemainingPence;
  if (typeof user.unmarkModified === 'function') {
    user.unmarkModified('balance');
    user.unmarkModified('welcomeCreditRemainingPence');
  }
}

async function voidUnpaidBid(bid) {
  if (!bid?._id) return;
  const Bid = require('../models/Bid');
  const Media = require('../models/Media');
  await Bid.updateOne({ _id: bid._id, status: 'active' }, { status: 'refunded' });
  if (bid.mediaId) {
    await Media.updateOne({ _id: bid.mediaId }, { $pull: { bids: bid._id } });
  }
}

/**
 * Persist a wallet spend. If the balance lost a race, mark the bid refunded
 * so it does not stay active unpaid.
 */
async function persistWalletSpend(user, amountPence, bid) {
  try {
    const spend = await commitWalletSpend(user, amountPence);
    if (bid && Number(bid.welcomeCreditAppliedPence || 0) !== spend.welcomeCreditAppliedPence) {
      const Bid = require('../models/Bid');
      bid.welcomeCreditAppliedPence = spend.welcomeCreditAppliedPence;
      await Bid.updateOne(
        { _id: bid._id },
        { welcomeCreditAppliedPence: spend.welcomeCreditAppliedPence }
      );
    }
    return spend;
  } catch (err) {
    if (err.code === 'INSUFFICIENT_BALANCE') await voidUnpaidBid(bid);
    throw err;
  }
}

/**
 * Historically restored welcome credit on refund. That enabled promo recycle /
 * chart loops, so refunds now return as paid balance only.
 * Kept as a no-op so existing callers remain safe.
 */
function restoreWelcomeCredit(_user, _welcomeCreditAppliedPence) {
  // Intentionally no-op — do not restore promotional credit on refund.
}

/**
 * Build Mongo $inc fields for a balance refund.
 * Refunded funds return as paid wallet balance; welcome credit is not restored.
 */
function balanceRefundInc(balancePence, _welcomeCreditAppliedPence = 0) {
  return { balance: balancePence };
}

/**
 * Sum welcome-credit portions recorded on bids (for bulk refunds).
 */
async function sumWelcomeCreditAppliedForBids(bidIds) {
  if (!bidIds || bidIds.length === 0) return 0;
  const Bid = require('../models/Bid');
  const bids = await Bid.find({ _id: { $in: bidIds } })
    .select('welcomeCreditAppliedPence')
    .lean();
  return bids.reduce((sum, b) => sum + (b.welcomeCreditAppliedPence || 0), 0);
}

/**
 * Revoke all unspent welcome credit from a user.
 * Deducts min(remaining, balance) and zeroes remaining.
 */
async function revokeUnspentWelcomeCredit(user, { adminUser, reason } = {}) {
  const remaining = getWelcomeCreditRemaining(user);
  if (remaining <= 0) {
    return { revoked: false, amountPence: 0, message: 'No unspent welcome credit to revoke' };
  }

  const balanceBefore = user.balance || 0;
  const revokeAmount = Math.min(remaining, balanceBefore);

  user.balance = balanceBefore - revokeAmount;
  user.welcomeCreditRemainingPence = 0;
  await user.save();

  let transaction = null;
  if (revokeAmount > 0) {
    try {
      transaction = await WalletTransaction.create({
        userId: user._id,
        user_uuid: user.uuid,
        amount: revokeAmount,
        type: 'beta_credit_revoke',
        status: 'completed',
        paymentMethod: 'manual',
        balanceBefore,
        balanceAfter: user.balance,
        description: reason
          ? `Welcome credit revoked: ${reason}`
          : 'Welcome credit revoked',
        username: user.username,
        metadata: {
          adminUserId: adminUser?._id?.toString(),
          adminUsername: adminUser?.username,
          reason: reason || 'Admin revoke',
          remainingBeforeRevoke: remaining,
        },
      });
    } catch (txError) {
      console.error('Failed to create wallet transaction for welcome credit revoke:', txError);
    }
  }

  try {
    const amountLabel = `£${(revokeAmount / 100).toFixed(2)}`;
    await notificationService.createNotification({
      userId: user._id,
      type: 'admin_announcement',
      title: 'Welcome Credit Revoked',
      message: revokeAmount > 0
        ? `Your unused welcome credit (${amountLabel}) has been removed from your wallet.`
        : 'Your unused welcome credit tracking has been cleared.',
      link: '/wallet',
      linkText: 'View Wallet',
      groupKey: `welcome_credit_revoke_${user._id}_${Date.now()}`,
    });
  } catch (notificationError) {
    console.error('Failed to create welcome credit revoke notification:', notificationError);
  }

  console.log(
    `✅ Revoked welcome credit for ${user.username}: £${(revokeAmount / 100).toFixed(2)} ` +
    `(remaining was £${(remaining / 100).toFixed(2)}). New balance: £${(user.balance / 100).toFixed(2)}` +
    (adminUser ? ` by admin ${adminUser.username}` : '')
  );

  return {
    revoked: true,
    amountPence: revokeAmount,
    remainingBefore: remaining,
    balanceBefore,
    balanceAfter: user.balance,
    transaction,
  };
}

module.exports = {
  WELCOME_CREDIT_PENCE,
  getWelcomeCreditRemaining,
  peekWelcomeCreditApplied,
  applyWalletSpend,
  commitWalletSpend,
  persistWalletSpend,
  releaseWalletSpend,
  restoreWelcomeCredit,
  balanceRefundInc,
  sumWelcomeCreditAppliedForBids,
  revokeUnspentWelcomeCredit,
};
