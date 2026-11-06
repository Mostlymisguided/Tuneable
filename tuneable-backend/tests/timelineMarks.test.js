/**
 * Timestamp and note rules for tune timeline marks (no DB).
 * Run: npx jest tests/timelineMarks.test.js
 */

const { normalizeNote, clampTimestamp, NOTE_MAX } = require('../utils/timelineMarks');

describe('timeline mark notes', () => {
  it('treats a missing note as empty', () => {
    expect(normalizeNote(undefined)).toBe('');
    expect(normalizeNote(null)).toBe('');
    expect(normalizeNote('   ')).toBe('');
  });

  it('keeps a short note', () => {
    expect(normalizeNote('  the drop  ')).toBe('the drop');
  });

  it('rejects notes over the limit', () => {
    expect(() => normalizeNote('a'.repeat(NOTE_MAX + 1))).toThrow(/140/);
  });
});

describe('timeline mark timestamps', () => {
  it('rounds to a tenth of a second', () => {
    expect(clampTimestamp(12.44, 180)).toBe(12.4);
    expect(clampTimestamp(12.46, 180)).toBe(12.5);
  });

  it('rejects a moment past the tune', () => {
    expect(() => clampTimestamp(200, 180)).toThrow(/past the end/);
  });

  it('allows a moment when duration is unknown', () => {
    expect(clampTimestamp(42, 0)).toBe(42);
    expect(clampTimestamp(42, null)).toBe(42);
  });

  it('rejects negative times', () => {
    expect(() => clampTimestamp(-1, 180)).toThrow(/moment/);
  });
});
