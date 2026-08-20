/**
 * Unit tests for tag profile matching helpers (no DB).
 * Run: npx jest tests/tagProfileService.test.js
 */

const {
  collectTagVariants,
  collectTagLabels,
  itemMatchesTag,
  parseContentScope,
  computeRelatedTags,
} = require('../services/tagProfileService');

describe('parseContentScope', () => {
  it('defaults to music', () => {
    expect(parseContentScope(undefined)).toBe('music');
    expect(parseContentScope('music')).toBe('music');
    expect(parseContentScope('video')).toBe('music');
  });

  it('accepts podcast aliases', () => {
    expect(parseContentScope('podcast')).toBe('podcast');
    expect(parseContentScope('spoken')).toBe('podcast');
    expect(parseContentScope(['podcast'])).toBe('podcast');
  });
});

describe('collectTagVariants', () => {
  it('includes ampersand forms for two-word catalog categories', () => {
    const variants = collectTagVariants('Society Culture', 'societyculture');
    expect(variants).toEqual(
      expect.arrayContaining(['Society Culture', 'Society & Culture', 'society & culture'])
    );
  });

  it('includes the un-amped form when the display name has an ampersand', () => {
    const variants = collectTagVariants('Society & Culture', 'societyculture');
    expect(variants).toEqual(
      expect.arrayContaining(['Society & Culture', 'Society Culture'])
    );
  });
});

describe('itemMatchesTag', () => {
  it('matches music on tip tags only by default', () => {
    const track = { tags: ['House'], genres: ['Society & Culture'] };
    expect(itemMatchesTag(track, 'House')).toBe(true);
    expect(itemMatchesTag(track, 'Society & Culture')).toBe(false);
  });

  it('matches podcast catalog genres, categories, and series labels', () => {
    const episode = {
      tags: [],
      genres: [],
      category: null,
      podcastSeries: { genres: ['Society & Culture'], tags: [] },
    };
    expect(
      itemMatchesTag(episode, 'Society Culture', { includeCatalogFields: true })
    ).toBe(true);
    expect(itemMatchesTag(episode, 'Society Culture')).toBe(false);
  });
});

describe('collectTagLabels', () => {
  it('includes series genres when catalog fields are enabled', () => {
    const labels = collectTagLabels(
      {
        tags: ['Interview'],
        genres: ['Comedy'],
        podcastSeries: { genres: ['Society & Culture'] },
      },
      { includeCatalogFields: true }
    );
    expect(labels).toEqual(
      expect.arrayContaining(['Interview', 'Comedy', 'Society & Culture'])
    );
  });
});

describe('computeRelatedTags', () => {
  it('can pull related chips from series genres for podcasts', () => {
    const related = computeRelatedTags(
      [
        {
          globalMediaAggregate: 100,
          tags: [],
          podcastSeries: { genres: ['Society & Culture', 'Comedy'] },
        },
      ],
      'Society & Culture',
      { includeCatalogFields: true }
    );
    expect(related.map((tag) => tag.name)).toContain('Comedy');
    expect(related.map((tag) => tag.name)).not.toContain('Society & Culture');
  });
});
