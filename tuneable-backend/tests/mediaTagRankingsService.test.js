/**
 * Unit tests for media tag ranking helpers (no DB).
 * Run: npx jest tests/mediaTagRankingsService.test.js
 */

const {
  collectRankingTags,
  uniqueTagLabels,
  isPodcastMedia,
  isPodcastSeries,
} = require('../services/mediaTagRankingsService');

describe('isPodcastMedia / isPodcastSeries', () => {
  it('detects podcast episodes and series', () => {
    expect(
      isPodcastMedia({ contentForm: ['podcastepisode'], contentType: ['spoken'] })
    ).toBe(true);
    expect(isPodcastSeries({ contentForm: ['podcastseries'] })).toBe(true);
    expect(isPodcastSeries({ contentForm: ['podcastepisode'] })).toBe(false);
    expect(isPodcastMedia({ contentForm: ['tune'], contentType: ['music'] })).toBe(false);
  });
});

describe('uniqueTagLabels', () => {
  it('dedupes by canonical tag and keeps first display form', () => {
    expect(uniqueTagLabels(['Comedy', 'comedy', 'Society & Culture'])).toEqual([
      'Comedy',
      'Society & Culture',
    ]);
  });
});

describe('collectRankingTags', () => {
  it('uses tip tags only for music', () => {
    expect(
      collectRankingTags({
        contentType: ['music'],
        contentForm: ['tune'],
        tags: ['House'],
        genres: ['Society & Culture'],
      })
    ).toEqual(['House']);
  });

  it('includes podcast genres, category, tags, and series labels', () => {
    expect(
      collectRankingTags({
        contentType: ['spoken'],
        contentForm: ['podcastepisode'],
        tags: ['Interview'],
        genres: ['Comedy'],
        category: 'News',
        podcastSeries: { genres: ['Society & Culture'], tags: ['Weekly'] },
      })
    ).toEqual(['Comedy', 'Society & Culture', 'News', 'Interview', 'Weekly']);
  });

  it('uses series catalog fields for a show', () => {
    expect(
      collectRankingTags({
        contentType: ['spoken'],
        contentForm: ['podcastseries'],
        tags: ['Interview'],
        genres: ['Society & Culture'],
      })
    ).toEqual(['Society & Culture', 'Interview']);
  });
});
