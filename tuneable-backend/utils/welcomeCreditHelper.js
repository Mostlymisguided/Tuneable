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

/**
 * Restore welcome credit remaining after a refund of spend that used it.
 * Mutates user in memory; caller must save.
 */
function restoreWelcomeCredit(user, welcomeCreditAppliedPence) {
  const amount = Math.max(0, Math.round(Number(welcomeCreditAppliedPence)) || 0);
  if (amount <= 0) return;
  user.welcomeCreditRemainingPence = getWelcomeCreditRemaining(user) + amount;
}

/**
 * Build Mongo $inc fields for a balance refund that also restores welcome credit.
 */
function balanceRefundInc(balancePence, welcomeCreditAppliedPence = 0) {
  const inc = { balance: balancePence };
  const welcome = Math.max(0, Math.round(Number(welcomeCreditAppliedPence)) || 0);
  if (welcome > 0) {
    inc.welcomeCreditRemainingPence = welcome;
  }
  return inc;
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
  restoreWelcomeCredit,
  balanceRefundInc,
  sumWelcomeCreditAppliedForBids,
  revokeUnspentWelcomeCredit,
};
