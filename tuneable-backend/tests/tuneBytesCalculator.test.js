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
  it('awards nothing to a sole tipper — own tip is not growth', () => {
    const only = bid('a', 111);
    const result = computeTuneBytesFromBids('a', [only]);
    expect(result.tuneBytesEarned).toBe(0);
    expect(result.calculation.subsequentGrowth).toBe(0);
    expect(result.calculation.discoveryRank).toBe(1);
  });

  it('does not mint 1016.1 TuneBytes for a sole £1.11 tip', () => {
    const only = bid('a', 111);
    const result = computeTuneBytesFromBids('a', [only]);
    const oldFormula = 111 * Math.cbrt(111) * getDiscoveryBonus(1);
    expect(oldFormula).toBeCloseTo(1016.1, 1);
    expect(result.tuneBytesEarned).not.toBeCloseTo(oldFormula, 1);
  });

  it('pays the earlier tipper when someone else tips later', () => {
    const first = bid('a', 111);
    const second = bid('b', 111);
    const bids = [first, second];

    const forFirst = computeTuneBytesFromBids('a', bids);
    const forSecond = computeTuneBytesFromBids('b', bids);

    expect(forFirst.calculation.subsequentGrowth).toBe(111);
    expect(forFirst.tuneBytesEarned).toBeCloseTo(
      111 * Math.cbrt(111) * getDiscoveryBonus(1),
      6
    );
    expect(forFirst.tuneBytesEarned).toBeCloseTo(1016.14, 1);

    expect(forSecond.calculation.subsequentGrowth).toBe(0);
    expect(forSecond.tuneBytesEarned).toBe(0);
    expect(forSecond.calculation.discoveryRank).toBe(2);
  });

  it('gives a larger bonus to earlier ranks when the same later growth lands', () => {
    const bids = [bid('a', 100), bid('b', 100), bid('c', 200)];
    const first = computeTuneBytesFromBids('a', bids);
    const second = computeTuneBytesFromBids('b', bids);

    expect(first.calculation.subsequentGrowth).toBe(300);
    expect(second.calculation.subsequentGrowth).toBe(200);
    expect(first.tuneBytesEarned).toBeGreaterThan(second.tuneBytesEarned);
    expect(computeTuneBytesFromBids('c', bids).tuneBytesEarned).toBe(0);
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
