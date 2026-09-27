/**
 * Planner tests for "bring tips up to". No database.
 * Run: node tuneable-backend/tests/tipRaisePlanner.test.js
 */

const assert = require('assert');
const { buildTipRaisePlan } = require('../services/tipRaiseService');
const { assessWelcomeMediaSpend } = require('../utils/welcomeCreditPolicy');

function media(id, artistName, extra = {}) {
  return {
    _id: id,
    title: `Tune ${id}`,
    artist: [{ name: artistName }],
    status: 'active',
    minimumBid: null,
    ...extra,
  };
}

function user(balancePence, welcomePence = 0) {
  return {
    _id: 'user-1',
    balance: balancePence,
    welcomeCreditRemainingPence: welcomePence,
    isActive: true,
    role: ['user'],
  };
}

function memoryLedger(seed = {}) {
  const artist = new Map();
  for (const [key, value] of Object.entries(seed)) {
    artist.set(key, {
      pence: value.pence || 0,
      mediaIds: new Set(value.mediaIds || []),
    });
  }
  const self = new Map();
  return {
    async selfUsed(mediaId) {
      return self.get(String(mediaId)) || 0;
    },
    async artistUsage(key) {
      return artist.get(key) || { pence: 0, mediaIds: new Set() };
    },
    note({ mediaId, welcomeAppliedPence, controlsMedia, targets }) {
      const applied = welcomeAppliedPence || 0;
      if (applied <= 0) return;
      if (controlsMedia) {
        const id = String(mediaId);
        self.set(id, (self.get(id) || 0) + applied);
        return;
      }
      for (const target of targets || []) {
        const extra = artist.get(target.key) || { pence: 0, mediaIds: new Set() };
        extra.pence += Math.round(applied * (target.weight || 1));
        extra.mediaIds.add(String(mediaId));
        artist.set(target.key, extra);
      }
    },
  };
}

async function testGapsAndShortfall() {
  const plan = await buildTipRaisePlan({
    user: user(100),
    targetPence: 111,
    entries: [
      { currentPence: 111, media: media('a', 'Ada') },
      { currentPence: 50, media: media('b', 'Bea') },
      { currentPence: 200, media: media('c', 'Cy') },
      { currentPence: 110, media: media('d', 'Dee', { minimumBid: 0.1 }) },
      { currentPence: 10, media: null, mediaId: 'gone', title: 'Gone' },
    ],
    assess: async ({ amountPence }) => ({ ok: true, welcomeAppliedPence: 0, amountPence }),
    ledger: { note() {} },
  });

  assert.strictEqual(plan.already.length, 2);
  assert.strictEqual(plan.willRaise.length, 1);
  assert.strictEqual(plan.willRaise[0].mediaId, 'b');
  assert.strictEqual(plan.willRaise[0].gapPence, 61);
  assert.strictEqual(plan.chargePence, 61);
  assert.strictEqual(plan.canAfford, true);
  assert.strictEqual(plan.shortfallPence, 0);
  assert.ok(plan.skipped.some((item) => item.code === 'below_minimum' && item.mediaId === 'd'));
  assert.ok(plan.skipped.some((item) => item.code === 'unavailable'));
}

async function testWholeSetShortfall() {
  const plan = await buildTipRaisePlan({
    user: user(50),
    targetPence: 100,
    entries: [
      { currentPence: 0, media: media('a', 'Ada') },
      { currentPence: 40, media: media('b', 'Bea') },
    ],
    assess: async () => ({ ok: true, welcomeAppliedPence: 0 }),
    ledger: { note() {} },
  });

  assert.strictEqual(plan.chargePence, 160);
  assert.strictEqual(plan.canAfford, false);
  assert.strictEqual(plan.shortfallPence, 110);
  assert.deepStrictEqual(
    plan.willRaise.map((item) => item.mediaId),
    ['b', 'a']
  );
}

async function testWelcomeArtistCapSkipsFourth() {
  const ledger = memoryLedger();
  const entries = ['m1', 'm2', 'm3', 'm4'].map((id) => ({
    currentPence: 0,
    media: media(id, 'Ada'),
  }));

  const plan = await buildTipRaisePlan({
    user: user(10000, 1111),
    targetPence: 111,
    entries,
    assess: assessWelcomeMediaSpend,
    ledger,
  });

  assert.strictEqual(plan.willRaise.length, 3);
  assert.strictEqual(plan.chargePence, 333);
  assert.strictEqual(plan.skipped.length, 1);
  assert.strictEqual(plan.skipped[0].code, 'WELCOME_ARTIST_CAP_AMOUNT');
  assert.strictEqual(plan.canAfford, true);
}

async function testWelcomeSeededMediaCap() {
  const ledger = memoryLedger({
    'name:ada': { pence: 0, mediaIds: ['old-1', 'old-2', 'old-3'] },
  });
  const plan = await buildTipRaisePlan({
    user: user(500, 111),
    targetPence: 50,
    entries: [{ currentPence: 0, media: media('new-1', 'Ada') }],
    assess: assessWelcomeMediaSpend,
    ledger,
  });

  assert.strictEqual(plan.willRaise.length, 0);
  assert.strictEqual(plan.skipped[0].code, 'WELCOME_ARTIST_CAP_MEDIA');
}

async function testOversizedWelcomeTipIsSkippedWithoutBlockingPaidGap() {
  const ledger = memoryLedger();
  const plan = await buildTipRaisePlan({
    user: user(5000, 111),
    targetPence: 200,
    entries: [
      { currentPence: 0, media: media('big', 'Ada') },
      { currentPence: 150, media: media('small', 'Bea') },
    ],
    assess: assessWelcomeMediaSpend,
    ledger,
  });

  const big = plan.skipped.find((item) => item.mediaId === 'big');
  const small = plan.willRaise.find((item) => item.mediaId === 'small');
  assert.ok(big);
  assert.strictEqual(big.code, 'WELCOME_TIP_TOO_LARGE');
  assert.ok(small);
  assert.strictEqual(small.gapPence, 50);
  assert.strictEqual(small.welcomeAppliedPence, 50);
  assert.strictEqual(plan.chargePence, 50);
}

async function run() {
  await testGapsAndShortfall();
  await testWholeSetShortfall();
  await testWelcomeArtistCapSkipsFourth();
  await testWelcomeSeededMediaCap();
  await testOversizedWelcomeTipIsSkippedWithoutBlockingPaidGap();
  console.log('✅ tipRaisePlanner.test.js passed');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
