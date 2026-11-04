/**
 * TuneBytes Calculator tests (no DB).
 * Run: npx jest tests/tuneBytesCalculator.test.js
 */

const {
  getDiscoveryBonus,
  computeTuneBytesFromBids,
  discoveryReason,
} = require('../services/tuneBytesCalculator');

function bid(id, amount, createdAt = new Date()) {
  return { _id: id, amount, createdAt };
}

describe('getDiscoveryBonus', () => {
  it('is ~1.90× for the first tipper and decays toward 1', () => {
    expect(getDiscoveryBonus(1)).toBeCloseTo(1 + Math.exp(-0.1), 10);
    expect(getDiscoveryBonus(2)).toBeLessThan(getDiscoveryBonus(1));
    expect(getDiscoveryBonus(100)).toBeCloseTo(1, 2);
  });
});

describe('computeTuneBytesFromBids', () => {
  it('awards a sole tipper their tip in pence immediately', () => {
    const only = bid('a', 111);
    const result = computeTuneBytesFromBids('a', [only]);
    expect(result.calculation.subsequentGrowth).toBe(0);
    expect(result.calculation.discoveryRank).toBe(1);
    expect(result.tuneBytesEarned).toBe(111);
  });

  it('does not mint 1016.1 TuneBytes for a sole £1.11 tip', () => {
    const only = bid('a', 111);
    const result = computeTuneBytesFromBids('a', [only]);
    const oldFormula = 111 * Math.cbrt(111) * getDiscoveryBonus(1);
    expect(oldFormula).toBeCloseTo(1016.1, 1);
    expect(result.tuneBytesEarned).toBe(111);
    expect(result.tuneBytesEarned).not.toBeCloseTo(oldFormula, 1);
  });

  it('pays the earlier tipper growth when someone else tips later', () => {
    const first = bid('a', 111);
    const second = bid('b', 111);
    const bids = [first, second];

    const forFirst = computeTuneBytesFromBids('a', bids);
    const forSecond = computeTuneBytesFromBids('b', bids);

    expect(forFirst.calculation.subsequentGrowth).toBe(111);
    expect(forFirst.tuneBytesEarned).toBeCloseTo(
      111 + 111 * Math.cbrt(111) * getDiscoveryBonus(1),
      6
    );

    expect(forSecond.calculation.subsequentGrowth).toBe(0);
    expect(forSecond.tuneBytesEarned).toBe(111);
    expect(forSecond.calculation.discoveryRank).toBe(2);
  });

  it('gives a larger bonus to earlier ranks when the same later growth lands', () => {
    const bids = [bid('a', 100), bid('b', 100), bid('c', 200)];
    const first = computeTuneBytesFromBids('a', bids);
    const second = computeTuneBytesFromBids('b', bids);
    const third = computeTuneBytesFromBids('c', bids);

    expect(first.calculation.subsequentGrowth).toBe(300);
    expect(second.calculation.subsequentGrowth).toBe(200);
    expect(third.calculation.subsequentGrowth).toBe(0);
    expect(first.tuneBytesEarned).toBeGreaterThan(second.tuneBytesEarned);
    expect(third.tuneBytesEarned).toBe(200);
  });

  it('does not pay growth when the same tipper adds another tip', () => {
    const bids = [
      { ...bid('a', 55), userId: 'misguided' },
      { ...bid('b', 56), userId: 'misguided' },
    ];

    const first = computeTuneBytesFromBids('a', bids);
    const second = computeTuneBytesFromBids('b', bids);

    expect(first.calculation.subsequentGrowth).toBe(0);
    expect(first.tuneBytesEarned).toBe(55);
    expect(second.calculation.subsequentGrowth).toBe(0);
    expect(second.tuneBytesEarned).toBe(56);
    expect(first.tuneBytesEarned + second.tuneBytesEarned).toBe(111);
  });

  it('treats a populated user document as the same tipper', () => {
    const bids = [
      { ...bid('a', 11), userId: { _id: 'u1', username: 'sabinbags' } },
      { ...bid('b', 11), userId: { _id: 'u1', username: 'sabinbags' } },
    ];

    expect(computeTuneBytesFromBids('a', bids).tuneBytesEarned).toBe(11);
    expect(computeTuneBytesFromBids('b', bids).tuneBytesEarned).toBe(11);
  });

  it('pays opposing growth once, against the stake already committed', () => {
    const bids = [
      { ...bid('a', 55), userId: 'user-1' },
      { ...bid('b', 56), userId: 'user-1' },
      { ...bid('c', 100), userId: 'user-2' },
    ];

    const first = computeTuneBytesFromBids('a', bids);
    const second = computeTuneBytesFromBids('b', bids);
    const third = computeTuneBytesFromBids('c', bids);

    expect(first.calculation.subsequentGrowth).toBe(100);
    expect(first.calculation.discoveryRank).toBe(1);
    expect(first.calculation.committedStake).toBe(111);
    expect(first.tuneBytesEarned).toBeCloseTo(
      55 + 100 * Math.cbrt(111) * getDiscoveryBonus(1),
      6
    );

    expect(second.tuneBytesEarned).toBe(56);
    expect(second.calculation.subsequentGrowth).toBe(0);
    expect(second.calculation.discoveryRank).toBe(1);

    expect(third.tuneBytesEarned).toBe(100);
    expect(third.calculation.discoveryRank).toBe(2);
  });

  it('does not let a later top-up resize growth already earned', () => {
    const before = [
      { ...bid('a', 100), userId: 'A' },
      { ...bid('b', 150), userId: 'B' },
    ];
    const after = [...before, { ...bid('a2', 60), userId: 'A' }];
    const growth = 150 * Math.cbrt(100) * getDiscoveryBonus(1);

    expect(computeTuneBytesFromBids('a', before).tuneBytesEarned).toBeCloseTo(100 + growth, 6);
    expect(computeTuneBytesFromBids('a', after).tuneBytesEarned).toBeCloseTo(100 + growth, 6);
    expect(computeTuneBytesFromBids('a2', after).tuneBytesEarned).toBe(60);
    expect(computeTuneBytesFromBids('b', after).tuneBytesEarned).toBeCloseTo(
      150 + 60 * Math.cbrt(150) * getDiscoveryBonus(2),
      6
    );
  });

  it('scales each wave of a tip battle by the stake committed before that wave', () => {
    const bids = [
      { ...bid('a1', 100), userId: 'A' },
      { ...bid('b1', 150), userId: 'B' },
      { ...bid('a2', 60), userId: 'A' },
      { ...bid('b2', 20), userId: 'B' },
    ];

    const a1 = computeTuneBytesFromBids('a1', bids);
    const a2 = computeTuneBytesFromBids('a2', bids);
    const b1 = computeTuneBytesFromBids('b1', bids);
    const b2 = computeTuneBytesFromBids('b2', bids);

    const aFromBFirst = 150 * Math.cbrt(100) * getDiscoveryBonus(1);
    const aFromBSecond = 20 * Math.cbrt(160) * getDiscoveryBonus(1);
    expect(a1.tuneBytesEarned).toBeCloseTo(100 + aFromBFirst + aFromBSecond, 6);
    expect(a1.calculation.subsequentGrowth).toBe(170);
    expect(a1.calculation.discoveryRank).toBe(1);
    expect(a2.tuneBytesEarned).toBe(60);
    expect(a2.calculation.discoveryRank).toBe(1);

    const bFromAComeback = 60 * Math.cbrt(150) * getDiscoveryBonus(2);
    expect(b1.tuneBytesEarned).toBeCloseTo(150 + bFromAComeback, 6);
    expect(b1.calculation.discoveryRank).toBe(2);
    expect(b2.tuneBytesEarned).toBe(20);
    expect(b2.calculation.discoveryRank).toBe(2);

    const doubleCountedLastWave = 20 * Math.cbrt(60) * getDiscoveryBonus(3);
    expect(a1.tuneBytesEarned + a2.tuneBytesEarned).not.toBeCloseTo(
      160 + aFromBFirst + aFromBSecond + doubleCountedLastWave,
      0
    );
  });

  it('returns zero for a bid that is no longer in the active set', () => {
    const result = computeTuneBytesFromBids('refunded', [bid('a', 111)]);
    expect(result.tuneBytesEarned).toBe(0);
    expect(result.calculation.inactiveReason).toBe('bid_not_active');
  });

  it('tags the first three tippers as discovery', () => {
    expect(discoveryReason(1)).toBe('discovery');
    expect(discoveryReason(3)).toBe('discovery');
    expect(discoveryReason(4)).toBe('popularity_growth');
  });
});
