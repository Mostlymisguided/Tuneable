/**
 * Language normalize for Media.language / MongoDB text indexes.
 * Run: npx jest tests/language.test.js
 */

const { normalizeLanguageInput } = require('../utils/language');

describe('normalizeLanguageInput', () => {
  it('maps Open Library MARC / ISO-639-2 codes to ISO-639-1', () => {
    expect(normalizeLanguageInput('eng')).toBe('en');
    expect(normalizeLanguageInput('ENG')).toBe('en');
    expect(normalizeLanguageInput('fra')).toBe('fr');
    expect(normalizeLanguageInput('deu')).toBe('de');
  });

  it('keeps two-letter codes and language names', () => {
    expect(normalizeLanguageInput('en')).toBe('en');
    expect(normalizeLanguageInput('English')).toBe('en');
    expect(normalizeLanguageInput('en-US')).toBe('en');
  });

  it('does not persist unknown three-letter codes that MongoDB rejects', () => {
    expect(normalizeLanguageInput('und')).toBe('en');
    expect(normalizeLanguageInput('')).toBe('en');
    expect(normalizeLanguageInput(null)).toBe('en');
  });
});
