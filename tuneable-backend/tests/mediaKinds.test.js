/**
 * Written / book kind helpers (no DB).
 * Run: npx jest tests/mediaKinds.test.js
 */

const {
  isWrittenMedia,
  isBookMedia,
  isPodcastEpisode,
  isPodcastSeries,
  BOOK_CATALOG_QUERY,
  WRITTEN_FORMS,
} = require('../utils/mediaKinds');

describe('isWrittenMedia / isBookMedia', () => {
  it('detects written books by type or form', () => {
    expect(
      isWrittenMedia({ contentType: ['written'], contentForm: ['book'] })
    ).toBe(true);
    expect(isWrittenMedia({ contentForm: ['book'] })).toBe(true);
    expect(isWrittenMedia({ contentForm: ['article'] })).toBe(true);
    expect(isBookMedia({ contentForm: ['book'] })).toBe(true);
    expect(isBookMedia({ contentForm: ['article'] })).toBe(false);
  });

  it('does not treat music or podcasts as written', () => {
    expect(isWrittenMedia({ contentType: ['music'], contentForm: ['tune'] })).toBe(false);
    expect(
      isWrittenMedia({ contentType: ['spoken'], contentForm: ['podcastepisode'] })
    ).toBe(false);
  });
});

describe('isPodcastEpisode / isPodcastSeries', () => {
  it('splits episodes from series containers', () => {
    expect(isPodcastEpisode({ contentForm: ['podcastepisode'] })).toBe(true);
    expect(isPodcastEpisode({ contentForm: ['podcastseries'] })).toBe(false);
    expect(isPodcastSeries({ contentForm: ['podcastseries'] })).toBe(true);
  });
});

describe('BOOK_CATALOG_QUERY', () => {
  it('scopes the books catalogue to active written books', () => {
    expect(WRITTEN_FORMS).toEqual(['book', 'article']);
    expect(BOOK_CATALOG_QUERY).toEqual({
      status: 'active',
      contentType: { $in: ['written'] },
      contentForm: { $in: ['book'] },
    });
  });
});
