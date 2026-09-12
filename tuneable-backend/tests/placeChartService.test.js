const {
  countryPlaceFromLocation,
  placeKeyForChart,
  rankPlacesFromMedia,
} = require('../services/placeChartService');

const UK = {
  placeId: 'uk-1',
  featureType: 'country',
  country: 'United Kingdom',
  countryCode: 'GB',
  label: 'United Kingdom',
  ancestors: [],
  ancestorIds: [],
};

const GOA = {
  placeId: 'goa-1',
  featureType: 'place',
  city: 'Goa',
  country: 'India',
  countryCode: 'IN',
  label: 'Goa',
  display: 'Goa, India',
  ancestorIds: ['in-1'],
  ancestors: [{ placeId: 'in-1', label: 'India', placetype: 'country', countryCode: 'IN' }],
};

const ARAMBOL = {
  placeId: 'arambol-1',
  featureType: 'place',
  city: 'Arambol',
  country: 'India',
  countryCode: 'IN',
  label: 'Arambol',
  ancestorIds: ['goa-1', 'in-1'],
  ancestors: [
    { placeId: 'goa-1', label: 'Goa', placetype: 'place' },
    { placeId: 'in-1', label: 'India', placetype: 'country', countryCode: 'IN' },
  ],
};

describe('countryPlaceFromLocation', () => {
  it('uses the location itself when it is a country', () => {
    expect(countryPlaceFromLocation(UK)).toEqual({
      placeId: 'uk-1',
      name: 'United Kingdom',
      featureType: 'country',
      country: 'United Kingdom',
      countryCode: 'GB',
    });
  });

  it('walks ancestors for a city', () => {
    expect(countryPlaceFromLocation(GOA)).toMatchObject({
      placeId: 'in-1',
      name: 'India',
      featureType: 'country',
      countryCode: 'IN',
    });
  });

  it('returns null without a place', () => {
    expect(countryPlaceFromLocation(null)).toBeNull();
    expect(countryPlaceFromLocation({})).toBeNull();
  });
});

describe('placeKeyForChart', () => {
  it('keys Earth view as countries', () => {
    expect(placeKeyForChart(GOA, null).placeId).toBe('in-1');
    expect(placeKeyForChart(UK, null).placeId).toBe('uk-1');
  });

  it('keys a country view as descendant places', () => {
    expect(placeKeyForChart(GOA, 'in-1')).toMatchObject({
      placeId: 'goa-1',
      name: 'Goa',
    });
    expect(placeKeyForChart(UK, 'in-1')).toBeNull();
  });

  it('does not list the parent as a child', () => {
    expect(placeKeyForChart({ ...UK, ancestorIds: [] }, 'uk-1')).toBeNull();
  });
});

describe('rankPlacesFromMedia', () => {
  it('ranks countries by origin support', () => {
    const ranked = rankPlacesFromMedia([
      { primaryLocation: GOA, globalMediaAggregate: 500 },
      { primaryLocation: ARAMBOL, globalMediaAggregate: 200 },
      { primaryLocation: UK, globalMediaAggregate: 100 },
    ]);
    expect(ranked.map((p) => p.placeId)).toEqual(['in-1', 'uk-1']);
    expect(ranked[0].supportPence).toBe(700);
    expect(ranked[0].mediaCount).toBe(2);
  });

  it('ranks cities under a country', () => {
    const ranked = rankPlacesFromMedia(
      [
        { primaryLocation: GOA, globalMediaAggregate: 500 },
        { primaryLocation: ARAMBOL, globalMediaAggregate: 800 },
        { primaryLocation: UK, globalMediaAggregate: 999 },
      ],
      { parentPlaceId: 'in-1' }
    );
    expect(ranked.map((p) => p.placeId)).toEqual(['arambol-1', 'goa-1']);
    expect(ranked[0].supportPence).toBe(800);
  });
});
