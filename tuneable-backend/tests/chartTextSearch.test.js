const { chartTextSearchClause } = require('../utils/globalPartyChart');

describe('chartTextSearchClause', () => {
  it('ignores blank and single-character queries', () => {
    expect(chartTextSearchClause('')).toBeNull();
    expect(chartTextSearchClause('  ')).toBeNull();
    expect(chartTextSearchClause('k')).toBeNull();
  });

  it('matches title, creators, tags, and category without treating input as a regex', () => {
    const clause = chartTextSearchClause('serge bowl');
    expect(clause.$or).toEqual(expect.arrayContaining([
      { title: expect.any(RegExp) },
      { 'artist.name': expect.any(RegExp) },
      { creatorDisplay: expect.any(RegExp) },
      { tags: expect.any(RegExp) },
    ]));
    expect(clause.$or[0].title.source).toBe('serge bowl');
    expect(chartTextSearchClause('kahlushh+').$or[0].title.source).toBe('kahlushh\\+');
  });
});
