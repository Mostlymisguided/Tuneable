/**
 * Wallet rows that add spendable balance.
 * Admin top-ups used to be stored as manual adjustments, so those credits
 * count here as well as type "topup". Stripe clawbacks are also adjustments,
 * but they reduce balance and must not count.
 */
function isCompletedBalanceCredit(tx) {
  if (!tx || (tx.status && tx.status !== 'completed')) return false;
  if (tx.type === 'topup') return true;
  if (tx.type !== 'adjustment' || tx.paymentMethod !== 'manual') return false;
  if (tx.balanceAfter == null || tx.balanceBefore == null) return true;
  return Number(tx.balanceAfter) >= Number(tx.balanceBefore);
}

module.exports = { isCompletedBalanceCredit };
