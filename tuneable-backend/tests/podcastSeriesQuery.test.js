const {
  MIN_SERIES_EPISODE_SEARCH_LENGTH,
  escapeRegex,
  normalizeSeriesEpisodeSearch,
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
