/**
 * Unit tests for welcome promo escrow split helpers (no DB).
 * Run: node tuneable-backend/tests/welcomePromoEscrow.test.js
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
  assert.strictEqual(ARTIST_SHARE_PERCENTAGE, 0.7);
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
  assert.strictEqual(split.artistSharePence, 78);
  assert.strictEqual(split.promoArtistSharePence, 78);
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
  assert.strictEqual(split.paidArtistSharePence, 78);
  assert.strictEqual(split.promoEscrowStatus, 'none');
  assert.strictEqual(split.promoEscrowExpiresAt, null);
}

function testMixedTip() {
  const split = splitArtistShare({
    bidAmountPence: 111,
    welcomeCreditAppliedPence: 50,
  });
  assert.strictEqual(split.artistSharePence, 78);
  assert.strictEqual(split.promoArtistSharePence, Math.round(78 * (50 / 111)));
  assert.strictEqual(split.promoArtistSharePence, 35);
  assert.strictEqual(split.paidArtistSharePence, 43);
}

function testPaidOnlyTip() {
  const split = splitArtistShare({
    bidAmountPence: 200,
    welcomeCreditAppliedPence: 0,
  });
  assert.strictEqual(split.artistSharePence, 140);
  assert.strictEqual(split.promoArtistSharePence, 0);
  assert.strictEqual(split.paidArtistSharePence, 140);
  assert.strictEqual(split.promoEscrowStatus, 'none');
}

function testOwnerSplitAllPromo() {
  const bidSplit = splitArtistShare({
    bidAmountPence: 111,
    welcomeCreditAppliedPence: 111,
  });
  const ownerA = splitOwnerShare(Math.round(78 * 0.7), bidSplit);
  const ownerB = splitOwnerShare(Math.round(78 * 0.3), bidSplit);
  assert.strictEqual(ownerA.paidPence, 0);
  assert.strictEqual(ownerA.promoPence, 55);
  assert.strictEqual(ownerB.paidPence, 0);
  assert.strictEqual(ownerB.promoPence, 23);
  assert.strictEqual(ownerA.promoPence + ownerB.promoPence, bidSplit.promoArtistSharePence);
}

function testOwnerSplitMixed() {
  const bidSplit = splitArtistShare({
    bidAmountPence: 111,
    welcomeCreditAppliedPence: 50,
  });
  const ownerA = splitOwnerShare(55, bidSplit);
  const ownerB = splitOwnerShare(23, bidSplit);
  assert.strictEqual(ownerA.promoPence + ownerB.promoPence, bidSplit.promoArtistSharePence);
  assert.strictEqual(ownerA.paidPence + ownerA.promoPence, 55);
  assert.strictEqual(ownerB.paidPence + ownerB.promoPence, 23);
}

function testExpiryDate() {
  const from = new Date('2026-01-15T12:00:00.000Z');
  const expires = computePromoEscrowExpiryDate(from);
  assert.strictEqual(expires.toISOString().slice(0, 10), '2026-04-15');
}

function run() {
  testConstants();
  testPaidMethods();
  testFullWelcomeTip();
  testPayingUserTreatsWelcomeAsPaid();
  testMixedTip();
  testPaidOnlyTip();
  testOwnerSplitAllPromo();
  testOwnerSplitMixed();
  testExpiryDate();
  console.log('✅ welcomePromoEscrow.test.js passed');
}

run();
