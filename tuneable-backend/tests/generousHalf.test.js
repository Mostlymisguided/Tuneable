const {
  generousHalfThreshold,
  generousShareThreshold,
  isInGenerousHalf,
  replayCopyUnlocks,
} = require('../utils/generousHalf');

describe('generousHalfThreshold', () => {
  it('puts the only tipper in the half', () => {
    expect(generousHalfThreshold([250])).toBe(250);
  });

  it('keeps the larger of two tips', () => {
    expect(generousHalfThreshold([1000, 300])).toBe(1000);
    expect(isInGenerousHalf(300, [1000, 300])).toBe(false);
    expect(isInGenerousHalf(1000, [1000, 300])).toBe(true);
  });

  it('includes a tie at the cutoff', () => {
    expect(generousHalfThreshold([1000, 1000])).toBe(1000);
    expect(isInGenerousHalf(1000, [1000, 1000])).toBe(true);
  });

  it('rounds an odd count up', () => {
    expect(generousHalfThreshold([1000, 800, 100])).toBe(800);
  });

  it('ignores zero totals', () => {
    expect(generousHalfThreshold([0, 0])).toBeNull();
  });

  it('lets the artist include every tipper', () => {
    expect(generousShareThreshold([1000, 300, 100], 100)).toBe(100);
  });

  it('lets the artist keep only the top 1%', () => {
    expect(generousShareThreshold([1000, 800, 700, 100], 1)).toBe(1000);
    expect(isInGenerousHalf(800, [1000, 800, 700, 100], 1)).toBe(false);
  });

  it('treats a missing share as the top 50%', () => {
    expect(generousShareThreshold([1000, 300])).toBe(generousHalfThreshold([1000, 300]));
  });
});

describe('replayCopyUnlocks', () => {
  it('keeps an early tipper when a larger tip raises the line', () => {
    const unlocks = replayCopyUnlocks([
      { at: 1, type: 'tip', userId: 'a', amount: 200 },
      { at: 2, type: 'tip', userId: 'b', amount: 5000 },
    ]);
    const byUser = Object.fromEntries(unlocks.map((row) => [row.userId, row]));
    expect(byUser.a.thresholdAtGrant).toBe(200);
    expect(byUser.b.thresholdAtGrant).toBe(5000);
  });

  it('drops the copy when their own tip is reversed under the line they cleared', () => {
    const unlocks = replayCopyUnlocks([
      { at: 1, type: 'tip', userId: 'a', amount: 200 },
      { at: 2, type: 'tip', userId: 'b', amount: 5000 },
      { at: 3, type: 'reverse', userId: 'a', amount: 200 },
    ]);
    expect(unlocks.map((row) => row.userId)).toEqual(['b']);
  });

  it('keeps them when a later refund still leaves them over the line they cleared', () => {
    const unlocks = replayCopyUnlocks([
      { at: 1, type: 'tip', userId: 'a', amount: 500 },
      { at: 2, type: 'tip', userId: 'a', amount: 200 },
      { at: 3, type: 'tip', userId: 'b', amount: 5000 },
      { at: 4, type: 'reverse', userId: 'a', amount: 100 },
    ]);
    const early = unlocks.find((row) => row.userId === 'a');
    expect(early.thresholdAtGrant).toBe(500);
    expect(early.totalAtGrant).toBe(500);
  });

  it('lets a later tip pull someone into the half without taking the early copy away', () => {
    const unlocks = replayCopyUnlocks([
      { at: 1, type: 'tip', userId: 'a', amount: 1000 },
      { at: 2, type: 'tip', userId: 'b', amount: 100 },
      { at: 3, type: 'tip', userId: 'c', amount: 100 },
    ]);
    expect(unlocks.map((row) => row.userId).sort()).toEqual(['a', 'b', 'c']);
  });
});
