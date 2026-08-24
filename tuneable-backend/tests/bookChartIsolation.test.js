/**
 * Books chart vs Global Party / music chart filters (no DB).
 * Run: npx jest tests/bookChartIsolation.test.js
 */

const { BOOK_CATALOG_QUERY, isWrittenMedia } = require('../utils/mediaKinds');
const { GLOBAL_PARTY_TUNES_FILTER } = require('../utils/globalPartyChart');
const { isMediaPlayable } = require('../utils/mediaPlayability');

describe('books vs music chart isolation', () => {
  it('keeps Global Party charts on music + tune', () => {
    expect(GLOBAL_PARTY_TUNES_FILTER.contentType).toEqual({ $in: ['music'] });
    expect(GLOBAL_PARTY_TUNES_FILTER.contentForm).toEqual({ $in: ['tune'] });
  });

  it('keeps the books chart on written + book', () => {
    expect(BOOK_CATALOG_QUERY.contentType).toEqual({ $in: ['written'] });
    expect(BOOK_CATALOG_QUERY.contentForm).toEqual({ $in: ['book'] });
  });

  it('does not overlap book catalog rows with the music chart filter', () => {
    const musicTypes = GLOBAL_PARTY_TUNES_FILTER.contentType.$in;
    const musicForms = GLOBAL_PARTY_TUNES_FILTER.contentForm.$in;
    expect(musicTypes).not.toEqual(expect.arrayContaining(BOOK_CATALOG_QUERY.contentType.$in));
    expect(musicForms).not.toEqual(expect.arrayContaining(BOOK_CATALOG_QUERY.contentForm.$in));
  });

  it('treats catalog books as non-playable', () => {
    const book = {
      contentType: ['written'],
      contentForm: ['book'],
      sources: { openLibrary: 'https://openlibrary.org/works/OL45883W' },
      rightsStatus: 'cleared',
      rightsCleared: true,
    };
    expect(isWrittenMedia(book)).toBe(true);
    expect(isMediaPlayable(book)).toBe(false);
  });
});
