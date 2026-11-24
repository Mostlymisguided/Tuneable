const {
  MIN_SERIES_EPISODE_SEARCH_LENGTH,
  escapeRegex,
  normalizeSeriesEpisodeSearch,
  normalizeEpisodeTitle,
  dedupeIncomingEpisodes,
  dedupeSeriesEpisodes,
  seriesEpisodeMatch,
  buildSeriesEpisodeMatch,
  readSeriesExternalIds,
  catalogueEpisodeMatchesSearch,
  selectCatalogueSearchMatches,
} = require('../utils/podcastSeriesQuery');

describe('normalizeSeriesEpisodeSearch', () => {
  it('requires at least two characters', () => {
    expect(MIN_SERIES_EPISODE_SEARCH_LENGTH).toBe(2);
    expect(normalizeSeriesEpisodeSearch('')).toBe('');
    expect(normalizeSeriesEpisodeSearch(' a ')).toBe('');
    expect(normalizeSeriesEpisodeSearch('ab')).toBe('ab');
    expect(normalizeSeriesEpisodeSearch('  Guest  ')).toBe('Guest');
  });

  it('ignores non-strings', () => {
    expect(normalizeSeriesEpisodeSearch(undefined)).toBe('');
    expect(normalizeSeriesEpisodeSearch(12)).toBe('');
  });
});

describe('escapeRegex', () => {
  it('escapes regex metacharacters so user input is literal', () => {
    expect(escapeRegex('C++ (live)')).toBe('C\\+\\+ \\(live\\)');
    expect(escapeRegex('a.b*c?')).toBe('a\\.b\\*c\\?');
  });
});

describe('buildSeriesEpisodeMatch', () => {
  const seriesId = '64b000000000000000000001';

  it('returns the unfiltered series match when there is no query', () => {
    expect(buildSeriesEpisodeMatch(seriesId, '')).toEqual({
      match: seriesEpisodeMatch(seriesId),
      query: '',
    });
    expect(buildSeriesEpisodeMatch(seriesId, 'x').query).toBe('');
  });

  it('scopes title/description/host search to the series', () => {
    const { match, query } = buildSeriesEpisodeMatch(seriesId, '  Interview ');
    expect(query).toBe('Interview');
    expect(match.podcastSeries).toBe(seriesId);
    expect(match.contentForm).toEqual({ $in: ['podcastepisode'] });
    expect(match.$or).toEqual([
      { title: { $regex: 'Interview', $options: 'i' } },
      { description: { $regex: 'Interview', $options: 'i' } },
      { 'host.name': { $regex: 'Interview', $options: 'i' } },
      { creatorNames: { $regex: 'Interview', $options: 'i' } },
    ]);
  });

  it('does not treat regex metacharacters as a pattern', () => {
    const { match } = buildSeriesEpisodeMatch(seriesId, 'Part 1.');
    expect(match.$or[0].title.$regex).toBe('Part 1\\.');
  });
});

describe('readSeriesExternalIds', () => {
  it('reads Map and plain object IDs', () => {
    expect(readSeriesExternalIds({
      externalIds: new Map([['podcastIndex', '123'], ['iTunes', '99']]),
    })).toEqual({
      taddyUuid: null,
      podcastIndexId: '123',
      iTunesId: '99',
    });
    expect(readSeriesExternalIds({
      externalIds: { taddy: 'abc' },
    })).toEqual({
      taddyUuid: 'abc',
      podcastIndexId: null,
      iTunesId: null,
    });
  });
});

describe('normalizeEpisodeTitle', () => {
  it('treats case, spacing, and simple entities as the same title', () => {
    expect(normalizeEpisodeTitle('  Britney &amp; The Can-Can  ')).toBe(
      normalizeEpisodeTitle('britney & the can-can')
    );
  });
});

describe('dedupeIncomingEpisodes', () => {
  it('collapses the same title when source ids differ and keeps the first row', () => {
    const merged = dedupeIncomingEpisodes([
      { title: 'Britney Spears and The Can-Can', guid: 'rss-guid', source: 'rss' },
      { title: 'Britney Spears and The Can-Can', guid: '4991', source: 'podcastindex' },
      { title: 'A different episode', guid: 'other' },
    ]);
    expect(merged).toHaveLength(2);
    expect(merged[0].source).toBe('rss');
    expect(merged.map((ep) => ep.title)).toEqual([
      'Britney Spears and The Can-Can',
      'A different episode',
    ]);
  });

  it('lets a later source replace the earlier row when asked', () => {
    const merged = dedupeIncomingEpisodes([
      { title: 'Ada', guid: 'rss-1', source: 'rss' },
      { title: 'Ada', guid: 'pi-9', source: 'podcastindex' },
    ], { preferLast: true });
    expect(merged).toEqual([
      { title: 'Ada', guid: 'pi-9', source: 'podcastindex' },
    ]);
  });
});

describe('dedupeSeriesEpisodes', () => {
  it('keeps one row per title and prefers the copy with tips', () => {
    const episodes = dedupeSeriesEpisodes([
      { _id: 'a', title: 'Britney Spears and The Can-Can', globalMediaAggregate: 0, duration: 2518 },
      { _id: 'b', title: 'Britney Spears and The Can-Can', globalMediaAggregate: 250, duration: 2518 },
      { _id: 'c', title: 'The joy of the overture', globalMediaAggregate: 0 },
    ]);
    expect(episodes.map((ep) => ep._id)).toEqual(['b', 'c']);
  });

  it('does not collapse untitled episodes', () => {
    const episodes = dedupeSeriesEpisodes([
      { _id: 'a', title: '   ' },
      { _id: 'b', title: '' },
    ]);
    expect(episodes.map((ep) => ep._id)).toEqual(['a', 'b']);
  });
});

describe('catalogue episode matching', () => {
  it('matches title, host, and HTML description from the show catalogue', () => {
    expect(catalogueEpisodeMatchesSearch({ title: 'Interview with Ada' }, 'ada')).toBe(true);
    expect(catalogueEpisodeMatchesSearch({
      title: 'Weekly roundup',
      host: [{ name: 'Ada Lovelace' }],
    }, 'Lovelace')).toBe(true);
    expect(catalogueEpisodeMatchesSearch({
      title: 'Ep 12',
      description: '<p>Guest: <strong>Ada Lovelace</strong></p>',
    }, 'ada lovelace')).toBe(true);
    expect(catalogueEpisodeMatchesSearch({ title: 'Unrelated' }, 'ada')).toBe(false);
    expect(catalogueEpisodeMatchesSearch({ title: 'Ada' }, 'x')).toBe(false);
  });

  it('ranks title matches ahead of description matches and caps results', () => {
    const selected = selectCatalogueSearchMatches([
      { title: 'News dump', description: 'Ada is mentioned here' },
      { title: 'Ada Lovelace interview' },
      { title: 'Mailbag', author: 'Ada' },
      { title: 'No match' },
    ], 'Ada', 2);
    expect(selected.map((ep) => ep.title)).toEqual([
      'Ada Lovelace interview',
      'Mailbag',
    ]);
  });
});
