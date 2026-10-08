/**
 * Stripe refund / dispute clawback amounts.
 * Run: npx jest tests/stripeClawback.test.js
 */

const {
  clawbackTargetPence,
  disputeClawbackTargetPence,
} = require('../services/stripeClawbackService');

describe('clawbackTargetPence', () => {
  it('reverses the full wallet credit on a full refund', () => {
    expect(clawbackTargetPence(970, { refunded: 1030, gross: 1030, fullyRefunded: true })).toBe(970);
  });

  it('reverses a proportional share of the credit on a partial refund', () => {
    expect(clawbackTargetPence(1000, { refunded: 500, gross: 1000 })).toBe(500);
  });

  it('returns zero when nothing has been refunded', () => {
    expect(clawbackTargetPence(1000, { refunded: 0, gross: 1000 })).toBe(0);
  });
});

describe('disputeClawbackTargetPence', () => {
  it('caps a GBP dispute at the amount credited', () => {
    expect(disputeClawbackTargetPence(970, { amount: 1030, currency: 'gbp' })).toBe(970);
    expect(disputeClawbackTargetPence(1000, { amount: 400, currency: 'gbp' })).toBe(400);
  });

  it('reverses the full credit when the dispute currency is not GBP', () => {
    expect(disputeClawbackTargetPence(800, { amount: 100, currency: 'usd' })).toBe(800);
  });
});
