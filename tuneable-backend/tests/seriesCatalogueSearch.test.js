const { parseDuration } = require('../utils/podcastRss');
const { mergeCatalogueEpisodes } = require('../services/seriesCatalogueSearchService');

describe('parseDuration', () => {
  it('parses clock and second formats', () => {
    expect(parseDuration('01:02:03')).toBe(3723);
    expect(parseDuration('12:30')).toBe(750);
    expect(parseDuration('90')).toBe(90);
    expect(parseDuration(15)).toBe(15);
    expect(parseDuration('')).toBe(0);
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
});
