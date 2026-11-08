/**
 * Run: npx jest tests/bidAmountAdjustment.test.js
 */

const {
  validateAdjustmentRequest,
  planOwnerDeltas,
  nextHistoryAmounts,
  scaleAffiliateAmount,
  adjustmentError,
} = require('../utils/bidAmountAdjustment');

describe('validateAdjustmentRequest', () => {
  const base = {
    oldAmountPence: 111,
    newAmountPence: 11,
    balancePence: 500,
    reason: 'Promotional tidy-up',
    status: 'active',
  };

  it('accepts a decrease and returns the signed delta', () => {
    const result = validateAdjustmentRequest(base);
    expect(result.deltaPence).toBe(-100);
    expect(result.newAmountPence).toBe(11);
    expect(result.reason).toBe('Promotional tidy-up');
  });

  it('refuses an increase the wallet cannot cover', () => {
    expect(() => validateAdjustmentRequest({
      ...base,
      newAmountPence: 500,
      balancePence: 100,
    })).toThrow(/wallet/i);
  });

  it('refuses an amount below the welcome credit already used', () => {
    try {
      validateAdjustmentRequest({
        ...base,
        newAmountPence: 50,
        welcomeCreditAppliedPence: 111,
      });
      throw new Error('expected rejection');
    } catch (error) {
      expect(error.code).toBe('BELOW_WELCOME_CREDIT');
    }
  });

  it('refuses zero, which is a veto', () => {
    expect(() => validateAdjustmentRequest({ ...base, newAmountPence: 0 })).toThrow(/Veto/);
  });

  it('refuses a tip that is not active', () => {
    expect(() => validateAdjustmentRequest({ ...base, status: 'vetoed' })).toThrow(/active/);
  });
});

describe('escrow delta planning', () => {
  it('moves 80% of a £1.00 decrease onto a single owner', () => {
    const { plans } = planOwnerDeltas({
      oldAmountPence: 111,
      newAmountPence: 11,
      owners: [{ userId: 'artist', percentage: 100 }],
    });
    expect(plans).toHaveLength(1);
    expect(plans[0].oldShare - plans[0].newShare).toBe(80);
    expect(plans[0].oldPaid - plans[0].newPaid).toBe(80);
    expect(plans[0].newPromo).toBe(0);
  });

  it('updates a pending history row and reports the balance delta', () => {
    const next = nextHistoryAmounts(
      { amount: 78, paidPence: 78, promoPence: 0, promoStatus: 'none' },
      { newPaid: 8, newPromo: 0 }
    );
    expect(next.amount).toBe(8);
    expect(next.deltaWithdrawable).toBe(-70);
    expect(next.deltaPromo).toBe(0);
  });

  it('scales an existing affiliate commission with the paid artist share', () => {
    expect(scaleAffiliateAmount(3, 78, 8)).toBe(0);
    expect(scaleAffiliateAmount(30, 1000, 2000)).toBe(60);
  });

  it('tags thrown errors with a code', () => {
    const error = adjustmentError('PAYOUT_INCLUDED', 'already paid');
    expect(error.code).toBe('PAYOUT_INCLUDED');
    expect(error.status).toBe(400);
  });
});
