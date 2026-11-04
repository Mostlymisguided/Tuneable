/**
 * Play qualification + listening-history play counting (no DB).
 * Run: npx jest tests/playQualification.test.js tests/listeningHistoryService.test.js
 */

const {
  computeCompletionPercent,
  credibleListenDelta,
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

  it('does not count a completed flag when almost nothing was heard', () => {
    expect(isQualifiedPlay({
      positionSeconds: 0,
      durationSeconds: 180,
      completed: true,
    })).toBe(false);
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

describe('credibleListenDelta', () => {
  it('caps the first report so opening mid-track does not count as a play', () => {
    expect(credibleListenDelta({
      previousPosition: 0,
      nextPosition: 90,
      elapsedSeconds: null,
    })).toBe(5);
  });

  it('ignores a forward seek that is larger than the time since the last report', () => {
    expect(credibleListenDelta({
      previousPosition: 4,
      nextPosition: 120,
      elapsedSeconds: 1,
    })).toBe(3);
  });

  it('credits playback that moves with the clock', () => {
    expect(credibleListenDelta({
      previousPosition: 10,
      nextPosition: 25,
      elapsedSeconds: 15,
    })).toBe(15);
  });

  it('does not turn a long pause plus a seek into a full play', () => {
    expect(credibleListenDelta({
      previousPosition: 2,
      nextPosition: 90,
      elapsedSeconds: 3600,
    })).toBe(20);
  });

  it('credits nothing when the position moves backward', () => {
    expect(credibleListenDelta({
      previousPosition: 40,
      nextPosition: 5,
      elapsedSeconds: 15,
    })).toBe(0);
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
