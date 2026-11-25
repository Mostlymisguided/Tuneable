/**
 * Unit tests for welcome credit claim / offer helpers (no DB).
 * Run: npx jest tests/welcomeCreditClaim.test.js
 */

const assert = require('assert');
const {
  OFFER_STATUS,
  isBetaModeEnabled,
  hasVerifiedIdentity,
  hasReceivedWelcomeCredit,
  hasAttachedInvite,
  getWelcomeCreditOffer,
  claimWelcomeCredit,
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

function testAttachedInvite() {
  assert.strictEqual(hasAttachedInvite({ parentInviteCode: 'ABCDE' }), true);
  assert.strictEqual(hasAttachedInvite({ parentInviteCode: '  abcde  ' }), true);
  assert.strictEqual(hasAttachedInvite({ invitedByUserId: 'user-1' }), true);
  assert.strictEqual(hasAttachedInvite({ parentInviteCode: '   ' }), false);
  assert.strictEqual(hasAttachedInvite({ emailVerified: true }), false);
  assert.strictEqual(hasAttachedInvite(null), false);
}

function testOfferStatuses() {
  withEnv('true', () => {
    const needsInvite = getWelcomeCreditOffer({ emailVerified: true });
    assert.strictEqual(needsInvite.status, OFFER_STATUS.NEEDS_INVITE);

    const eligible = getWelcomeCreditOffer({
      emailVerified: true,
      parentInviteCode: 'ABCDE',
    });
    assert.strictEqual(eligible.status, OFFER_STATUS.ELIGIBLE);
    assert.strictEqual(eligible.amountPence, 1111);

    const invitedByUser = getWelcomeCreditOffer({
      emailVerified: true,
      invitedByUserId: 'user-1',
    });
    assert.strictEqual(invitedByUser.status, OFFER_STATUS.ELIGIBLE);

    const needsVerify = getWelcomeCreditOffer({
      emailVerified: false,
      parentInviteCode: 'ABCDE',
    });
    assert.strictEqual(needsVerify.status, OFFER_STATUS.NEEDS_VERIFICATION);

    const inviteBeforeVerify = getWelcomeCreditOffer({ emailVerified: false });
    assert.strictEqual(inviteBeforeVerify.status, OFFER_STATUS.NEEDS_INVITE);

    const oauth = getWelcomeCreditOffer({
      emailVerified: false,
      parentInviteCode: 'ABCDE',
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
    const unavailable = getWelcomeCreditOffer({
      emailVerified: true,
      parentInviteCode: 'ABCDE',
    });
    assert.strictEqual(unavailable.status, OFFER_STATUS.UNAVAILABLE);
  });
}

async function testClaimRequiresInvite() {
  const prev = process.env.VITE_BETA_MODE;
  process.env.VITE_BETA_MODE = 'true';
  try {
    const result = await claimWelcomeCredit(
      { emailVerified: true },
      { acceptedPromoTerms: true }
    );
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.status, 403);
    assert.strictEqual(result.code, 'NEEDS_INVITE');
  } finally {
    if (prev === undefined) delete process.env.VITE_BETA_MODE;
    else process.env.VITE_BETA_MODE = prev;
  }
}

describe('welcome credit claim helpers', () => {
  it('reads beta mode from env', testBetaMode);
  it('detects verified identity', testVerifiedIdentity);
  it('detects previously received credit', testReceivedCredit);
  it('detects an attached invite code', testAttachedInvite);
  it('reports offer statuses', testOfferStatuses);
  it('requires an invite code before welcome credit can be claimed', testClaimRequiresInvite);
});
