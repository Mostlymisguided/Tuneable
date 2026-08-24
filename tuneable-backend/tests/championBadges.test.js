/**
 * Unit tests for champion badge fallback picker (no DB).
 * Run: npx jest tests/championBadges.test.js
 */

const {
  getChampionScopePicksFromLocation,
  selectFallbackScopes,
  locationFromPick,
  pickFallbackChampionBadges,
} = require('../utils/championBadges');

const londonHome = {
  placeId: 'london',
  label: 'London',
  city: 'London',
  featureType: 'place',
  ancestors: [
    { placeId: 'uk', label: 'United Kingdom', placetype: 'country' },
    { placeId: 'england', label: 'England', placetype: 'region' },
    { placeId: 'greater-london', label: 'Greater London', placetype: 'district' },
  ],
};

describe('getChampionScopePicksFromLocation', () => {
  it('builds coarse→fine scopes and skips postcodes', () => {
    const picks = getChampionScopePicksFromLocation({
      ...londonHome,
      ancestors: [
        ...londonHome.ancestors,
        { placeId: 'ec1', label: 'EC1A', placetype: 'postcode' },
      ],
    });
    expect(picks.map((p) => p.label)).toEqual([
      'United Kingdom',
      'England',
      'Greater London',
      'London',
    ]);
  });
});

describe('selectFallbackScopes', () => {
  it('keeps country, city, and finest when there are many levels', () => {
    const picks = getChampionScopePicksFromLocation({
      placeId: 'peckham',
      label: 'Peckham',
      featureType: 'neighborhood',
      ancestors: [
        { placeId: 'uk', label: 'United Kingdom', placetype: 'country' },
        { placeId: 'england', label: 'England', placetype: 'region' },
        { placeId: 'london', label: 'London', placetype: 'place' },
      ],
    });
    expect(selectFallbackScopes(picks).map((p) => p.label)).toEqual([
      'United Kingdom',
      'London',
      'Peckham',
    ]);
  });
});

describe('pickFallbackChampionBadges', () => {
  const uk = locationFromPick(
    { placeId: 'uk', label: 'United Kingdom', placetype: 'country' },
    [
      { placeId: 'uk', label: 'United Kingdom', placetype: 'country' },
      { placeId: 'london', label: 'London', placetype: 'place' },
    ]
  );
  const london = locationFromPick(
    { placeId: 'london', label: 'London', placetype: 'place' },
    [
      { placeId: 'uk', label: 'United Kingdom', placetype: 'country' },
      { placeId: 'london', label: 'London', placetype: 'place' },
    ]
  );

  it('uses global titles first and does not duplicate them locally', () => {
    const badges = pickFallbackChampionBadges({
      globalTags: [{ tag: 'House', rank: 1, totalAmount: 500 }],
      globalMedia: [{ mediaId: 'm1', title: 'Glue', rank: 2, totalAmount: 80 }],
      scopedPlaces: [
        {
          location: london,
          tags: [{ tag: 'House', rank: 1, totalAmount: 40 }],
          media: [{ mediaId: 'm1', title: 'Glue', rank: 1, totalAmount: 20 }],
          placeTitle: { rank: 1, totalAmount: 90 },
        },
      ],
      limit: 8,
    });
    expect(badges.map((b) => [b.entityType, b.tag || b.title, b.scope])).toEqual([
      ['tag', 'House', 'global'],
      ['media', 'Glue', 'global'],
      ['place', undefined, 'place'],
    ]);
    expect(badges[2].location.label).toBe('London');
  });

  it('fills with combined titles when there are no global podiums', () => {
    const badges = pickFallbackChampionBadges({
      globalTags: [],
      globalMedia: [],
      scopedPlaces: [
        {
          location: london,
          tags: [{ tag: 'House', rank: 1, totalAmount: 12, totalUsers: 1 }],
          media: [{ mediaId: 'm2', title: 'Glue', rank: 3, totalAmount: 4 }],
        },
      ],
      limit: 8,
    });
    expect(badges).toHaveLength(2);
    expect(badges[0]).toMatchObject({
      entityType: 'tag',
      tag: 'House',
      rank: 1,
      scope: 'place',
    });
    expect(badges[0].location.label).toBe('London');
    expect(badges[1].title).toBe('Glue');
  });

  it('keeps a solo #1 (one tipper in scope)', () => {
    const badges = pickFallbackChampionBadges({
      globalTags: [],
      scopedPlaces: [
        {
          location: london,
          tags: [{ tag: 'Jazz', rank: 1, totalAmount: 1, totalUsers: 1 }],
        },
      ],
    });
    expect(badges[0]).toMatchObject({ tag: 'Jazz', rank: 1, totalUsers: 1 });
  });

  it('prefers a better local rank over a wider weaker one', () => {
    const badges = pickFallbackChampionBadges({
      scopedPlaces: [
        {
          location: uk,
          tags: [{ tag: 'House', rank: 2, totalAmount: 40 }],
        },
        {
          location: london,
          tags: [{ tag: 'House', rank: 1, totalAmount: 20 }],
        },
      ],
    });
    expect(badges[0]).toMatchObject({ tag: 'House', rank: 1 });
    expect(badges[0].location.label).toBe('London');
  });

  it('prefers the wider place when rank is tied', () => {
    const badges = pickFallbackChampionBadges({
      scopedPlaces: [
        {
          location: uk,
          tags: [{ tag: 'House', rank: 2, totalAmount: 40 }],
        },
        {
          location: london,
          tags: [{ tag: 'House', rank: 2, totalAmount: 20 }],
        },
      ],
    });
    expect(badges[0].location.label).toBe('United Kingdom');
  });

  it('prefers city place-only titles over a related country title', () => {
    const badges = pickFallbackChampionBadges({
      scopedPlaces: [
        {
          location: uk,
          placeTitle: { rank: 1, totalAmount: 200 },
        },
        {
          location: london,
          placeTitle: { rank: 1, totalAmount: 90 },
        },
      ],
    });
    expect(badges).toHaveLength(1);
    expect(badges[0]).toMatchObject({ entityType: 'place', rank: 1 });
    expect(badges[0].location.label).toBe('London');
  });

  it('caps global tags so tune titles still make the row', () => {
    const badges = pickFallbackChampionBadges({
      globalTags: [
        { tag: 'A', rank: 1, totalAmount: 9 },
        { tag: 'B', rank: 1, totalAmount: 8 },
        { tag: 'C', rank: 1, totalAmount: 7 },
        { tag: 'D', rank: 1, totalAmount: 6 },
        { tag: 'E', rank: 1, totalAmount: 5 },
        { tag: 'F', rank: 1, totalAmount: 4 },
      ],
      globalMedia: [{ mediaId: 'm1', title: 'Glue', rank: 1, totalAmount: 50 }],
      limit: 8,
    });
    expect(badges.filter((b) => b.entityType === 'tag')).toHaveLength(5);
    expect(badges.some((b) => b.title === 'Glue')).toBe(true);
  });

  it('respects the badge limit after global titles', () => {
    const badges = pickFallbackChampionBadges({
      globalTags: [
        { tag: 'House', rank: 1, totalAmount: 9 },
        { tag: 'Techno', rank: 2, totalAmount: 8 },
      ],
      globalMedia: [{ mediaId: 'm1', title: 'Glue', rank: 1, totalAmount: 7 }],
      scopedPlaces: [
        {
          location: london,
          tags: [{ tag: 'Jazz', rank: 1, totalAmount: 3 }],
          placeTitle: { rank: 1, totalAmount: 5 },
        },
      ],
      limit: 3,
    });
    expect(badges).toHaveLength(3);
    expect(badges.every((b) => b.scope === 'global')).toBe(true);
  });
});
