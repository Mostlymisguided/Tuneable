/**
 * Tag normalization: compound splitting, aliases, list de-duplication.
 * Run: npx jest tests/tagNormalizer.test.js
 */

const {
  splitCompoundTag,
  normalizeTagList,
  normalizeTagForStorage,
} = require('../utils/tagNormalizer');

describe('splitCompoundTag', () => {
  it.each([
    ['Hip-Hop & Rap', ['Hip-Hop', 'Rap']],
    ['Hip-Hop/Rap', ['Hip-Hop', 'Rap']],
    ['Rap / Hip Hop', ['Rap', 'Hip Hop']],
    ['R&B/Soul', ['R&B', 'Soul']],
    ['Hip Hop & R&B', ['Hip Hop', 'R&B']],
    ['Drum & Bass / Jungle', ['Drum & Bass', 'Jungle']],
    ['House, Techno; Garage', ['House', 'Techno', 'Garage']],
    ['Pop + Rock', ['Pop', 'Rock']],
  ])('splits %s', (input, expected) => {
    expect(splitCompoundTag(input)).toEqual(expected);
  });

  it.each([
    'Drum & Bass',
    'Drum and Bass',
    'R & B',
    'R&B',
    'D&B',
    'Singer/Songwriter',
    'Rock & Roll',
    'Rhythm & Blues',
    'Country & Western',
    'Stage & Screen',
    'Deep House',
  ])('keeps %s whole', (input) => {
    expect(splitCompoundTag(input)).toEqual([input]);
  });

  it('does not split on the word "and" for unknown tags', () => {
    expect(splitCompoundTag('Bits and Pieces')).toEqual(['Bits and Pieces']);
  });

  it('handles empty and non-string input', () => {
    expect(splitCompoundTag('')).toEqual([]);
    expect(splitCompoundTag('   ')).toEqual([]);
    expect(splitCompoundTag(null)).toEqual([]);
    expect(splitCompoundTag(42)).toEqual([]);
    expect(splitCompoundTag(' / ')).toEqual([]);
  });
});

describe('normalizeTagList', () => {
  it.each([
    [['Hip-Hop & Rap'], ['Hip Hop', 'Rap']],
    [['Hip-Hop/Rap'], ['Hip Hop', 'Rap']],
    [['R&B/Soul'], ['R&B', 'Soul']],
    [['Drum & Bass'], ['DnB']],
    [['R & B'], ['R&B']],
    [['Singer/Songwriter'], ['Singer Songwriter']],
    [['rock & roll'], ['Rock & Roll']],
    [['Hip Hop & R&B'], ['Hip Hop', 'R&B']],
  ])('normalizes %j', (input, expected) => {
    expect(normalizeTagList(input)).toEqual(expected);
  });

  it('de-duplicates across compound and plain tags', () => {
    expect(normalizeTagList(['Hip Hop', 'Hip-Hop & Rap', 'rap'])).toEqual(['Hip Hop', 'Rap']);
  });

  it('applies the limit after splitting', () => {
    expect(normalizeTagList(['Hip-Hop & Rap', 'House'], 2)).toEqual(['Hip Hop', 'Rap']);
  });

  it('is idempotent', () => {
    const once = normalizeTagList(['Hip-Hop & Rap', 'Rock & Roll', 'R&B/Soul', 'Drum & Bass']);
    expect(normalizeTagList(once)).toEqual(once);
  });

  it('returns [] for non-arrays', () => {
    expect(normalizeTagList(null)).toEqual([]);
    expect(normalizeTagList('Hip Hop')).toEqual([]);
  });
});

describe('normalizeTagForStorage aliases', () => {
  it('maps new "&" genre aliases to canonical display forms', () => {
    expect(normalizeTagForStorage('Rock n Roll')).toBe('Rock & Roll');
    expect(normalizeTagForStorage('Rhythm and Blues')).toBe('R&B');
    expect(normalizeTagForStorage('country and western')).toBe('Country & Western');
  });
});
