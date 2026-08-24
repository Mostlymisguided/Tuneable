const {
  MIN_SERIES_EPISODE_SEARCH_LENGTH,
  escapeRegex,
  normalizeSeriesEpisodeSearch,
  seriesEpisodeMatch,
  buildSeriesEpisodeMatch,
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
