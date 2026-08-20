/**
 * Unit tests for welcome credit claim / offer helpers (no DB).
 * Run: node tuneable-backend/tests/welcomeCreditClaim.test.js
 */

const assert = require('assert');
const {
  OFFER_STATUS,
  isBetaModeEnabled,
  hasVerifiedIdentity,
  hasReceivedWelcomeCredit,
  getWelcomeCreditOffer,
} = require('../utils/betaCreditHelper');

function withEnv(value, fn) {
  const prev = process.env.VITE_BETA_MODE;
  if (value === undefined) {
    delete process.env.VITE_BETA_MODE;
  } else {
    process.env.VITE_BETA_MODE = value;
  }
  try {
    fn();
  } finally {
    if (prev === undefined) delete process.env.VITE_BETA_MODE;
    else process.env.VITE_BETA_MODE = prev;
  }
}

function testBetaMode() {
  withEnv('true', () => assert.strictEqual(isBetaModeEnabled(), true));
  withEnv('TRUE', () => assert.strictEqual(isBetaModeEnabled(), true));
  withEnv('1', () => assert.strictEqual(isBetaModeEnabled(), true));
  withEnv('yes', () => assert.strictEqual(isBetaModeEnabled(), true));
  withEnv('false', () => assert.strictEqual(isBetaModeEnabled(), false));
  withEnv(undefined, () => assert.strictEqual(isBetaModeEnabled(), false));
}

function testVerifiedIdentity() {
  assert.strictEqual(hasVerifiedIdentity({ emailVerified: true }), true);
  assert.strictEqual(hasVerifiedIdentity({ emailVerified: false, oauthVerified: { apple: true } }), true);
  assert.strictEqual(hasVerifiedIdentity({ emailVerified: false, oauthVerified: { google: false } }), false);
  assert.strictEqual(hasVerifiedIdentity({ emailVerified: false }), false);
}

function testReceivedCredit() {
  assert.strictEqual(hasReceivedWelcomeCredit({ welcomeCreditGrantedAt: new Date() }), true);
  assert.strictEqual(hasReceivedWelcomeCredit({ welcomeCreditRemainingPence: 500 }), true);
  assert.strictEqual(hasReceivedWelcomeCredit({ welcomeCreditRemainingPence: 0 }), false);
  assert.strictEqual(hasReceivedWelcomeCredit({}), false);
}

function testOfferStatuses() {
  withEnv('true', () => {
    const eligible = getWelcomeCreditOffer({ emailVerified: true });
    assert.strictEqual(eligible.status, OFFER_STATUS.ELIGIBLE);
    assert.strictEqual(eligible.amountPence, 1111);

    const needsVerify = getWelcomeCreditOffer({ emailVerified: false });
    assert.strictEqual(needsVerify.status, OFFER_STATUS.NEEDS_VERIFICATION);

    const oauth = getWelcomeCreditOffer({
      emailVerified: false,
      oauthVerified: { google: true },
    });
    assert.strictEqual(oauth.status, OFFER_STATUS.ELIGIBLE);

    const claimed = getWelcomeCreditOffer({
      emailVerified: true,
      welcomeCreditGrantedAt: new Date(),
      welcomeCreditRemainingPence: 200,
    });
    assert.strictEqual(claimed.status, OFFER_STATUS.CLAIMED);
    assert.strictEqual(claimed.remainingPence, 200);
  });

  withEnv('false', () => {
    const unavailable = getWelcomeCreditOffer({ emailVerified: true });
    assert.strictEqual(unavailable.status, OFFER_STATUS.UNAVAILABLE);
  });
}

function run() {
  testBetaMode();
  testVerifiedIdentity();
  testReceivedCredit();
  testOfferStatuses();
  console.log('✅ welcomeCreditClaim.test.js passed');
}

run();
