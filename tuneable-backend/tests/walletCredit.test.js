/**
 * Run: npx jest tests/walletCredit.test.js
 */

const assert = require('assert');
const { isCompletedBalanceCredit } = require('../utils/walletCredit');

function testStripeTopUpCounts() {
  assert.strictEqual(
    isCompletedBalanceCredit({ type: 'topup', status: 'completed', paymentMethod: 'stripe', amount: 500 }),
    true
  );
}

function testAdminAdjustmentCreditCounts() {
  assert.strictEqual(
    isCompletedBalanceCredit({
      type: 'adjustment',
      status: 'completed',
      paymentMethod: 'manual',
      amount: 2000,
      balanceBefore: 0,
      balanceAfter: 2000,
    }),
    true
  );
}

function testClawbackDoesNotCount() {
  assert.strictEqual(
    isCompletedBalanceCredit({
      type: 'adjustment',
      status: 'completed',
      paymentMethod: 'stripe',
      amount: 500,
      balanceBefore: 500,
      balanceAfter: 0,
    }),
    false
  );
}

function testPendingTopUpDoesNotCount() {
  assert.strictEqual(
    isCompletedBalanceCredit({ type: 'topup', status: 'pending', amount: 500 }),
    false
  );
}

describe('isCompletedBalanceCredit', () => {
  it('counts a completed stripe top-up', testStripeTopUpCounts);
  it('counts a manual admin credit stored as an adjustment', testAdminAdjustmentCreditCounts);
  it('ignores a stripe clawback adjustment', testClawbackDoesNotCount);
  it('ignores a pending top-up', testPendingTopUpDoesNotCount);
});
