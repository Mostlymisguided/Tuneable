/**
 * Unit tests for creator best-location pills (no DB).
 * Run: npx jest tests/championPlaces.test.js
 */

const { mergeBestLocationPlaces } = require('../utils/championPlaces');

describe('mergeBestLocationPlaces', () => {
  it('keeps the best rank for each place and orders best first', () => {
    const places = mergeBestLocationPlaces([
      { placeId: 'london', name: 'London', rank: 4, aggregate: 100, featureType: 'place' },
      { placeId: 'bristol', name: 'Bristol', rank: 1, aggregate: 40, featureType: 'place' },
      { placeId: 'london', name: 'London', rank: 2, aggregate: 80, featureType: 'place' },
      { placeId: 'uk', name: 'United Kingdom', rank: 2, aggregate: 200, featureType: 'country' },
    ]);

    expect(places).toEqual([
      { placeId: 'bristol', label: 'Bristol', rank: 1, placetype: 'place' },
      { placeId: 'uk', label: 'United Kingdom', rank: 2, placetype: 'country' },
      { placeId: 'london', label: 'London', rank: 2, placetype: 'place' },
    ]);
  });

  it('drops places outside the podium when a top-three rank exists', () => {
    const places = mergeBestLocationPlaces([
      { placeId: 'hackney', name: 'Hackney', rank: 1, featureType: 'locality' },
      { placeId: 'uk', name: 'United Kingdom', rank: 1, featureType: 'country' },
      { placeId: 'london', name: 'London', rank: 5, featureType: 'place' },
    ]);

    expect(places.map((place) => place.label)).toEqual(['United Kingdom', 'Hackney']);
  });

  it('prefers the higher aggregate when ranks tie', () => {
    const places = mergeBestLocationPlaces([
      { placeId: 'london', name: 'London', rank: 1, aggregate: 10, featureType: 'place' },
      { placeId: 'london', name: 'London', rank: 1, aggregate: 50, featureType: 'place' },
    ]);

    expect(places).toHaveLength(1);
    expect(places[0].placeId).toBe('london');
  });

  it('drops incomplete rows and caps the list', () => {
    const rows = [
      { placeId: '', name: 'Nowhere', rank: 1 },
      { placeId: 'a', name: ' ', rank: 1 },
      { placeId: 'b', name: 'B', rank: 0 },
    ];
    for (let i = 0; i < 6; i += 1) {
      rows.push({ placeId: `p${i}`, name: `Place ${i}`, rank: i + 1, aggregate: i });
    }

    const places = mergeBestLocationPlaces(rows, 3);
    expect(places.map((place) => place.label)).toEqual(['Place 0', 'Place 1', 'Place 2']);
  });
});
