const {
  normalizeChartSort,
  sortChartItems,
  mediaChartMongoSort,
  chartReleaseDate,
} = require('../utils/chartSort');

describe('chartSort', () => {
  it('defaults unknown values to most-tipped', () => {
    expect(normalizeChartSort('nope')).toBe('most-tipped');
    expect(normalizeChartSort(undefined)).toBe('most-tipped');
  });

  it('sorts most-tipped by tip total, newest as tie-break', () => {
    const sorted = sortChartItems(
      [
        { title: 'A', timePeriodBidValue: 10, createdAt: '2024-01-01' },
        { title: 'B', timePeriodBidValue: 30, createdAt: '2023-01-01' },
        { title: 'C', timePeriodBidValue: 30, createdAt: '2025-01-01' },
      ],
      'most-tipped'
    );
    expect(sorted.map((item) => item.title)).toEqual(['C', 'B', 'A']);
  });

  it('sorts newest by added date and keeps missing dates last', () => {
    const sorted = sortChartItems(
      [
        { title: 'Old', timePeriodBidValue: 9, createdAt: '2020-01-01' },
        { title: 'New', timePeriodBidValue: 1, createdAt: '2026-01-01' },
        { title: 'None', timePeriodBidValue: 50 },
      ],
      'newest'
    );
    expect(sorted.map((item) => item.title)).toEqual(['New', 'Old', 'None']);
  });

  it('sorts oldest by added date', () => {
    const sorted = sortChartItems(
      [
        { title: 'New', createdAt: '2026-01-01' },
        { title: 'Old', createdAt: '2020-01-01' },
      ],
      'oldest'
    );
    expect(sorted.map((item) => item.title)).toEqual(['Old', 'New']);
  });

  it('sorts most-tunebytes by tuneBytesEarned, newest as tie-break', () => {
    const sorted = sortChartItems(
      [
        { title: 'A', tuneBytesEarned: 10, createdAt: '2024-01-01' },
        { title: 'B', tuneBytesEarned: 30, createdAt: '2023-01-01' },
        { title: 'C', tuneBytesEarned: 30, createdAt: '2025-01-01' },
      ],
      'most-tunebytes'
    );
    expect(sorted.map((item) => item.title)).toEqual(['C', 'B', 'A']);
  });

  it('sorts newest and oldest by release date when a release accessor is set', () => {
    const items = [
      { title: 'Added later', createdAt: '2026-06-01', releaseDate: '1999-01-01', timePeriodBidValue: 1 },
      { title: 'Year only', createdAt: '2020-01-01', releaseYear: 2024, timePeriodBidValue: 9 },
      { title: 'Released later', createdAt: '2010-01-01', releaseDate: '2021-05-01', timePeriodBidValue: 2 },
      { title: 'Undated', createdAt: '2025-01-01', timePeriodBidValue: 50 },
    ];
    expect(sortChartItems(items, 'newest', { getReleaseDate: chartReleaseDate }).map((item) => item.title))
      .toEqual(['Year only', 'Released later', 'Added later', 'Undated']);
    expect(sortChartItems(items, 'oldest', { getReleaseDate: chartReleaseDate }).map((item) => item.title))
      .toEqual(['Added later', 'Released later', 'Year only', 'Undated']);
  });

  it('keeps most-tipped ties on added date when release dates differ', () => {
    const sorted = sortChartItems(
      [
        { title: 'Older tip', timePeriodBidValue: 10, createdAt: '2020-01-01', releaseDate: '2024-01-01' },
        { title: 'Newer tip', timePeriodBidValue: 10, createdAt: '2026-01-01', releaseDate: '1990-01-01' },
      ],
      'most-tipped',
      { getReleaseDate: chartReleaseDate }
    );
    expect(sorted.map((item) => item.title)).toEqual(['Newer tip', 'Older tip']);
  });

  it('reads a nested release date', () => {
    expect(chartReleaseDate({ media: { releaseYear: 2018 } })).toEqual(new Date(Date.UTC(2018, 0, 1)));
  });

  it('maps mongo sort for all-time charts', () => {
    expect(mediaChartMongoSort('newest')).toEqual({
      releaseDate: -1,
      releaseYear: -1,
      globalMediaAggregate: -1,
    });
    expect(mediaChartMongoSort('oldest')).toEqual({
      releaseDate: 1,
      releaseYear: 1,
      globalMediaAggregate: -1,
    });
    expect(mediaChartMongoSort('most-tunebytes')).toEqual({
      tuneBytesEarned: -1,
      createdAt: -1,
      _id: 1,
    });
    expect(mediaChartMongoSort('most-tipped')).toEqual({
      globalMediaAggregate: -1,
      createdAt: -1,
      _id: 1,
    });
    expect(mediaChartMongoSort(undefined)).toEqual({
      globalMediaAggregate: -1,
      createdAt: -1,
      _id: 1,
    });
  });
});
