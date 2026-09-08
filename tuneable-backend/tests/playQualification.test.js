/**
 * Play qualification + listening-history play counting (no DB).
 * Run: npx jest tests/playQualification.test.js tests/listeningHistoryService.test.js
 */

const {
  computeCompletionPercent,
  isCompletedPlay,
  isQualifiedPlay,
  normalizeClient,
  normalizeSourceType,
  shouldCountAsPlay,
} = require('../utils/playQualification');

describe('isQualifiedPlay', () => {
  it('does not count a skip-through', () => {
    expect(isQualifiedPlay({
      positionSeconds: 8,
      durationSeconds: 210,
      completed: false,
    })).toBe(false);
  });

  it('counts 30 seconds even on a long track', () => {
    expect(isQualifiedPlay({
      positionSeconds: 30,
      durationSeconds: 240,
      completed: false,
    })).toBe(true);
  });

  it('counts 50% of a short track before 30 seconds', () => {
    expect(isQualifiedPlay({
      positionSeconds: 12,
      durationSeconds: 20,
      completed: false,
    })).toBe(true);
  });

  it('counts a completed listen even if position is stale', () => {
    expect(isQualifiedPlay({
      positionSeconds: 0,
      durationSeconds: 180,
      completed: true,
    })).toBe(true);
  });

  it('counts 90% as completed and therefore qualified', () => {
    expect(isCompletedPlay({
      positionSeconds: 162,
      durationSeconds: 180,
    })).toBe(true);
    expect(isQualifiedPlay({
      positionSeconds: 162,
      durationSeconds: 180,
    })).toBe(true);
  });
});

describe('shouldCountAsPlay', () => {
  it('increments only on the first qualifying write', () => {
    expect(shouldCountAsPlay({ alreadyCounted: false, qualified: true })).toBe(true);
    expect(shouldCountAsPlay({ alreadyCounted: true, qualified: true })).toBe(false);
    expect(shouldCountAsPlay({ alreadyCounted: false, qualified: false })).toBe(false);
  });
});

describe('normalize helpers', () => {
  it('falls back to unknown/web for bad values', () => {
    expect(normalizeSourceType('party')).toBe('party');
    expect(normalizeSourceType('hacked')).toBe('unknown');
    expect(normalizeClient('ios')).toBe('ios');
    expect(normalizeClient('desktop')).toBe('web');
  });

  it('rounds completion percent to one decimal', () => {
    expect(computeCompletionPercent(15, 30)).toBe(50);
    expect(computeCompletionPercent(1, 3)).toBe(33.3);
  });
});
