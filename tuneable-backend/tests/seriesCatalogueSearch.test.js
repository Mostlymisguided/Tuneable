const { parseDuration } = require('../utils/podcastRss');
const {
  externalEpisodeMatchesSeries,
  mergeCatalogueEpisodes,
} = require('../services/seriesCatalogueSearchService');

describe('parseDuration', () => {
  it('parses clock and second formats', () => {
    expect(parseDuration('01:02:03')).toBe(3723);
    expect(parseDuration('12:30')).toBe(750);
    expect(parseDuration('90')).toBe(90);
    expect(parseDuration(15)).toBe(15);
    expect(parseDuration('')).toBe(0);
  });
});

describe('externalEpisodeMatchesSeries', () => {
  const ids = { iTunesId: '99', podcastIndexId: '42', taddyUuid: 'tdy', title: 'Add to Playlist' };

  it('keeps episodes from this show and drops other shows when an id is known', () => {
    expect(externalEpisodeMatchesSeries(
      { source: 'apple', collectionId: 99, collectionName: 'Someone else' },
      ids
    )).toBe(true);
    expect(externalEpisodeMatchesSeries(
      { source: 'apple', collectionId: 5, collectionName: 'Add to Playlist' },
      ids
    )).toBe(false);
    expect(externalEpisodeMatchesSeries(
      { source: 'podcastindex', feedId: '42' },
      ids
    )).toBe(true);
    expect(externalEpisodeMatchesSeries(
      { source: 'taddy', podcastSeries: { uuid: 'other', name: 'Add to Playlist' } },
      ids
    )).toBe(false);
  });

  it('falls back to the show title when the series has no external id', () => {
    expect(externalEpisodeMatchesSeries(
      { source: 'apple', collectionName: 'Add to Playlist' },
      { title: 'Add to Playlist' }
    )).toBe(true);
    expect(externalEpisodeMatchesSeries(
      { source: 'apple', collectionName: 'Other Show' },
      { title: 'Add to Playlist' }
    )).toBe(false);
  });
});

describe('mergeCatalogueEpisodes', () => {
  it('dedupes by guid then title and keeps the first source', () => {
    const merged = mergeCatalogueEpisodes([
      [{ title: 'Ada', guid: 'g1', source: 'rss' }],
      [{ title: 'Ada', guid: 'g1', source: 'apple' }, { title: 'Ada live', source: 'podcastindex' }],
    ]);
    expect(merged).toHaveLength(2);
    expect(merged[0].source).toBe('rss');
    expect(merged.map((ep) => ep.title)).toEqual(['Ada', 'Ada live']);
  });

  it('collapses the same episode when RSS and Podcast Index use different ids', () => {
    const merged = mergeCatalogueEpisodes([
      [{ title: 'Britney Spears and The Can-Can', guid: 'https://show.example/ep/1', source: 'rss' }],
      [{ title: 'Britney Spears and The Can-Can', id: 88421, source: 'podcastindex' }],
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].source).toBe('rss');
  });
});
