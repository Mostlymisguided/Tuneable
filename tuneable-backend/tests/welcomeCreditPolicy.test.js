/**
 * Unit tests for welcome credit policy helpers (no DB).
 * Run: node tuneable-backend/tests/welcomeCreditPolicy.test.js
 */

const assert = require('assert');
const {
  getMediaControllerUserIds,
  userControlsMedia,
  remainingSelfMediaWelcomePence,
  getArtistCapTargets,
  MAX_WELCOME_PER_TIP_PENCE,
  MAX_WELCOME_SELF_PER_MEDIA_PENCE,
  MAX_WELCOME_PER_ARTIST_PENCE,
  MAX_WELCOME_MEDIA_PER_ARTIST,
  computeWelcomeExpiryDate,
} = require('../utils/welcomeCreditPolicy');

function testControllers() {
  const ownerId = '507f1f77bcf86cd799439011';
  const artistId = '507f1f77bcf86cd799439012';
  const media = {
    mediaOwners: [{ userId: ownerId, percentage: 100 }],
    artist: [{ name: 'Demo', userId: artistId }],
  };
  const ids = getMediaControllerUserIds(media);
  assert.ok(ids.has(ownerId));
  assert.ok(ids.has(artistId));
}

function testUserControlsMedia() {
  const ownerId = '507f1f77bcf86cd799439011';
  const otherId = '507f1f77bcf86cd799439012';
  const media = {
    mediaOwners: [{ userId: ownerId, percentage: 100 }],
  };

  assert.strictEqual(userControlsMedia({ _id: ownerId, role: ['user'] }, media), true);
  assert.strictEqual(userControlsMedia({ _id: ownerId, role: ['admin'] }, media), true);
  assert.strictEqual(userControlsMedia({ _id: otherId, role: ['user'] }, media), false);
}

function testSelfMediaCapRemaining() {
  assert.strictEqual(remainingSelfMediaWelcomePence(0), 111);
  assert.strictEqual(remainingSelfMediaWelcomePence(50), 61);
  assert.strictEqual(remainingSelfMediaWelcomePence(111), 0);
  assert.strictEqual(remainingSelfMediaWelcomePence(200), 0);
}

function testCapTargetsOwned() {
  const ownerA = '507f1f77bcf86cd799439011';
  const ownerB = '507f1f77bcf86cd799439012';
  const targets = getArtistCapTargets({
    mediaOwners: [
      { userId: ownerA, percentage: 70 },
      { userId: ownerB, percentage: 30 },
    ],
    artist: [{ name: 'Ignored When Owned' }],
  });
  assert.strictEqual(targets.length, 2);
  assert.strictEqual(targets[0].key, `user:${ownerA}`);
  assert.ok(Math.abs(targets[0].weight - 0.7) < 0.001);
  assert.ok(Math.abs(targets[1].weight - 0.3) < 0.001);
}

function testCapTargetsByName() {
  const targets = getArtistCapTargets({
    mediaOwners: [],
    artist: [{ name: '  Arcade Fire  ' }],
  });
  assert.strictEqual(targets.length, 1);
  assert.strictEqual(targets[0].key, 'name:arcade fire');
  assert.strictEqual(targets[0].weight, 1);
}

function testConstantsMatchBrandMaths() {
  assert.strictEqual(MAX_WELCOME_PER_TIP_PENCE, 111);
  assert.strictEqual(MAX_WELCOME_SELF_PER_MEDIA_PENCE, 111);
  assert.strictEqual(MAX_WELCOME_PER_ARTIST_PENCE, 333);
  assert.strictEqual(MAX_WELCOME_MEDIA_PER_ARTIST, 3);
}

function testExpiryMonths() {
  const from = new Date('2026-01-15T12:00:00.000Z');
  const expires = computeWelcomeExpiryDate(from);
  assert.strictEqual(expires.getUTCFullYear(), 2027);
  assert.strictEqual(expires.getUTCMonth(), 0); // January
}

function run() {
  testControllers();
  testUserControlsMedia();
  testSelfMediaCapRemaining();
  testCapTargetsOwned();
  testCapTargetsByName();
  testConstantsMatchBrandMaths();
  testExpiryMonths();
  console.log('✅ welcomeCreditPolicy.test.js passed');
}

run();
