/**
 * Tune podium rank changes for the home activity feed.
 * Run: npx jest tests/championPodium.test.js
 */

const {
  topPodium,
  shiftTotals,
  diffPodium,
  regainPence,
} = require('../utils/championPodium');

function tipper(id, totalAmount, bidCount = 1) {
  return { userId: id, totalAmount, bidCount };
}

function afterBid(current, userId, deltaPence, deltaBids = 1) {
  const next = shiftTotals(current, userId, deltaPence, deltaBids);
  const previous = shiftTotals(next, userId, -deltaPence, -deltaBids);
  return diffPodium(topPodium(previous), topPodium(next));
}

describe('champion podium changes', () => {
  it('records taking #1 on a first tip', () => {
    const events = afterBid([], 'ada', 100);
    expect(events).toEqual([
      expect.objectContaining({ userId: 'ada', kind: 'earned', rank: 1, previousRank: null }),
    ]);
  });

  it('records a new #1 and the previous #1 dropping to #2', () => {
    const events = afterBid([tipper('ada', 100)], 'bea', 150);
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({ userId: 'bea', kind: 'earned', rank: 1 }),
      expect.objectContaining({ userId: 'ada', kind: 'lost', rank: 1, nextRank: 2 }),
    ]));
    expect(events.find((event) => event.userId === 'ada' && event.kind === 'earned')).toBeUndefined();
  });

  it('records leaving the podium when a fourth tipper takes #3', () => {
    const current = [tipper('a', 100), tipper('b', 80), tipper('c', 70), tipper('d', 60)];
    const events = afterBid(current, 'd', 20, 0);
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({ userId: 'd', kind: 'earned', rank: 3 }),
      expect.objectContaining({ userId: 'c', kind: 'lost', rank: 3, nextRank: null }),
    ]));
  });

  it('records a climb from #3 to #1 as one earned title', () => {
    const events = afterBid(
      [tipper('a', 100), tipper('b', 80), tipper('c', 70)],
      'c',
      40,
      0
    );
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({ userId: 'c', kind: 'earned', rank: 1, previousRank: 3 }),
    ]));
    expect(events.filter((event) => event.userId === 'c')).toHaveLength(1);
  });

  it('prices the tip that takes a lost rank back', () => {
    const standings = [tipper('bea', 1001), tipper('ada', 1000), tipper('cy', 400)];
    expect(regainPence(standings, 'ada', 1)).toBe(2);
    expect(regainPence(standings, 'bea', 1)).toBeNull();
    expect(regainPence(standings, 'cy', 2)).toBe(601);
  });

  it('asks for the minimum tip when the lost rank is empty', () => {
    expect(regainPence([tipper('ada', 50)], 'bea', 2)).toBe(1);
  });
});
