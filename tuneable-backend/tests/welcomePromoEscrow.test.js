/**
 * Unit tests for welcome promo escrow split helpers (no DB).
 * Run: npx jest tests/welcomePromoEscrow.test.js
 */

const assert = require('assert');
const {
  ARTIST_SHARE_PERCENTAGE,
  PROMO_ESCROW_EXPIRY_DAYS,
  PROMO_ESCROW_STATUS,
  computePromoEscrowExpiryDate,
  isPaidTopUpMethod,
  splitArtistShare,
  splitOwnerShare,
} = require('../utils/welcomePromoEscrow');

function testConstants() {
  assert.strictEqual(ARTIST_SHARE_PERCENTAGE, 0.8);
  assert.strictEqual(PROMO_ESCROW_EXPIRY_DAYS, 90);
  assert.strictEqual(PROMO_ESCROW_STATUS.PENDING, 'pending');
}

function testPaidMethods() {
  assert.strictEqual(isPaidTopUpMethod('stripe'), true);
  assert.strictEqual(isPaidTopUpMethod('apple_iap'), true);
  assert.strictEqual(isPaidTopUpMethod('google_play'), true);
  assert.strictEqual(isPaidTopUpMethod('manual'), false);
  assert.strictEqual(isPaidTopUpMethod('beta'), false);
  assert.strictEqual(isPaidTopUpMethod('gift'), false);
}

function testFullWelcomeTip() {
  const split = splitArtistShare({
    bidAmountPence: 111,
    welcomeCreditAppliedPence: 111,
  });
  assert.strictEqual(split.artistSharePence, 89);
  assert.strictEqual(split.promoArtistSharePence, 89);
  assert.strictEqual(split.paidArtistSharePence, 0);
  assert.strictEqual(split.promoEscrowStatus, 'pending');
  assert.ok(split.promoEscrowExpiresAt instanceof Date);
}

function testPayingUserTreatsWelcomeAsPaid() {
  const split = splitArtistShare({
    bidAmountPence: 111,
    welcomeCreditAppliedPence: 111,
    treatWelcomeAsPaid: true,
  });
  assert.strictEqual(split.promoArtistSharePence, 0);
  assert.strictEqual(split.paidArtistSharePence, 89);
  assert.strictEqual(split.promoEscrowStatus, 'none');
  assert.strictEqual(split.promoEscrowExpiresAt, null);
}

function testMixedTip() {
  const split = splitArtistShare({
    bidAmountPence: 111,
    welcomeCreditAppliedPence: 50,
  });
  assert.strictEqual(split.artistSharePence, 89);
  assert.strictEqual(split.promoArtistSharePence, Math.round(89 * (50 / 111)));
  assert.strictEqual(split.promoArtistSharePence, 40);
  assert.strictEqual(split.paidArtistSharePence, 49);
}

function testPaidOnlyTip() {
  const split = splitArtistShare({
    bidAmountPence: 200,
    welcomeCreditAppliedPence: 0,
  });
  assert.strictEqual(split.artistSharePence, 160);
  assert.strictEqual(split.promoArtistSharePence, 0);
  assert.strictEqual(split.paidArtistSharePence, 160);
  assert.strictEqual(split.promoEscrowStatus, 'none');
}

function testOwnerSplitAllPromo() {
  const bidSplit = splitArtistShare({
    bidAmountPence: 111,
    welcomeCreditAppliedPence: 111,
  });
  const ownerA = splitOwnerShare(Math.round(89 * 0.7), bidSplit);
  const ownerB = splitOwnerShare(Math.round(89 * 0.3), bidSplit);
  assert.strictEqual(ownerA.paidPence, 0);
  assert.strictEqual(ownerA.promoPence, 62);
  assert.strictEqual(ownerB.paidPence, 0);
  assert.strictEqual(ownerB.promoPence, 27);
  assert.strictEqual(ownerA.promoPence + ownerB.promoPence, bidSplit.promoArtistSharePence);
}

function testOwnerSplitMixed() {
  const bidSplit = splitArtistShare({
    bidAmountPence: 111,
    welcomeCreditAppliedPence: 50,
  });
  const ownerA = splitOwnerShare(62, bidSplit);
  const ownerB = splitOwnerShare(27, bidSplit);
  assert.strictEqual(ownerA.promoPence + ownerB.promoPence, bidSplit.promoArtistSharePence);
  assert.strictEqual(ownerA.paidPence + ownerA.promoPence, 62);
  assert.strictEqual(ownerB.paidPence + ownerB.promoPence, 27);
}

function testExpiryDate() {
  const from = new Date('2026-01-15T12:00:00.000Z');
  const expires = computePromoEscrowExpiryDate(from);
  assert.strictEqual(expires.toISOString().slice(0, 10), '2026-04-15');
}

describe('welcomePromoEscrow', () => {
  it('exposes the expected constants', testConstants);
  it('classifies paid top-up methods', testPaidMethods);
  it('splits a fully welcome-funded tip', testFullWelcomeTip);
  it('treats welcome credit as paid for paying users', testPayingUserTreatsWelcomeAsPaid);
  it('splits a mixed tip', testMixedTip);
  it('splits a paid-only tip', testPaidOnlyTip);
  it('splits owner share when all promo', testOwnerSplitAllPromo);
  it('splits owner share when mixed', testOwnerSplitMixed);
  it('computes the escrow expiry date', testExpiryDate);
});
