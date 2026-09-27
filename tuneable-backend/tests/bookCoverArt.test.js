const {
  resolveBookCoverArt,
  DEFAULT_BOOK_COVER_ART,
} = require('../utils/coverArtUtils');

describe('resolveBookCoverArt', () => {
  it('keeps a stored http(s) jacket', () => {
    expect(resolveBookCoverArt('https://covers.openlibrary.org/b/id/1-L.jpg')).toBe(
      'https://covers.openlibrary.org/b/id/1-L.jpg'
    );
  });

  it('uses the book placeholder when artwork is missing or unusable', () => {
    expect(resolveBookCoverArt(null)).toBe(DEFAULT_BOOK_COVER_ART);
    expect(resolveBookCoverArt('')).toBe(DEFAULT_BOOK_COVER_ART);
    expect(resolveBookCoverArt('   ')).toBe(DEFAULT_BOOK_COVER_ART);
    expect(resolveBookCoverArt('[object Object]')).toBe(DEFAULT_BOOK_COVER_ART);
    expect(resolveBookCoverArt('not-a-url')).toBe(DEFAULT_BOOK_COVER_ART);
  });
});
