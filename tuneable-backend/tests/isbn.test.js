/**
 * ISBN normalize / extract (no DB).
 * Run: npx jest tests/isbn.test.js
 */

const {
  normalizeIsbn,
  isbn10To13,
  extractIsbns,
  firstIsbn,
} = require('../utils/isbn');

describe('normalizeIsbn', () => {
  it('accepts a hyphenated ISBN-13', () => {
    expect(normalizeIsbn('978-0-306-40615-7')).toBe('9780306406157');
  });

  it('converts a valid ISBN-10 to ISBN-13', () => {
    expect(normalizeIsbn('0-306-40615-2')).toBe('9780306406157');
    expect(isbn10To13('0306406152')).toBe('9780306406157');
  });

  it('rejects invalid checksums and junk', () => {
    expect(normalizeIsbn('9780306406158')).toBeNull();
    expect(normalizeIsbn('0306406153')).toBeNull();
    expect(normalizeIsbn('')).toBeNull();
    expect(normalizeIsbn(null)).toBeNull();
    expect(normalizeIsbn('N/A')).toBeNull();
  });
});

describe('extractIsbns / firstIsbn', () => {
  it('pulls unique ISBN-13s from mixed arrays and identifier objects', () => {
    const found = extractIsbns(
      ['978-0-306-40615-7', '0306406152'],
      { type: 'ISBN_13', identifier: '9780306406157' },
      'garbage'
    );
    expect(found).toEqual(['9780306406157']);
    expect(firstIsbn('nope', '9780306406157')).toBe('9780306406157');
  });
});
