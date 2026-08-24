const {
  normalizeChartSort,
  sortChartItems,
  mediaChartMongoSort,
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

  it('maps mongo sort for all-time charts', () => {
    expect(mediaChartMongoSort('newest')).toEqual({
      createdAt: -1,
      globalMediaAggregate: -1,
    });
    expect(mediaChartMongoSort('oldest')).toEqual({
      createdAt: 1,
      globalMediaAggregate: -1,
    });
  });
});
