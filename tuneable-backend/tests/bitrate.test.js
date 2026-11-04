/**
 * Bitrate unit normalization (no DB).
 * Run: npx jest tests/bitrate.test.js
 */

const { bitrateToKbps } = require('../utils/bitrate');

describe('bitrateToKbps', () => {
  it('converts music-metadata bits/second into kbps', () => {
    expect(bitrateToKbps(320000)).toBe(320);
    expect(bitrateToKbps(128000)).toBe(128);
    expect(bitrateToKbps(319847.6)).toBe(320);
  });

  it('leaves values that are already kbps unchanged', () => {
    expect(bitrateToKbps(320)).toBe(320);
    expect(bitrateToKbps(192)).toBe(192);
    expect(bitrateToKbps(1411)).toBe(1411);
  });

  it('returns null for missing or non-positive values', () => {
    expect(bitrateToKbps(null)).toBeNull();
    expect(bitrateToKbps(undefined)).toBeNull();
    expect(bitrateToKbps('')).toBeNull();
    expect(bitrateToKbps(0)).toBeNull();
    expect(bitrateToKbps(-320)).toBeNull();
  });
});
