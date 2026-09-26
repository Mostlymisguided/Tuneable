const {
  COLLECTIVE_TYPES,
  normalizeCollectiveType,
  normalizeVenueKind,
  normalizeCollectiveLocation,
  venueLocationError,
  venuesAtPlaceQuery,
  serializeVenueForPlace,
  parentPlaceIdFromLocation,
  parseMaybeJson,
} = require('../utils/collectiveVenue');

describe('collectiveVenue', () => {
  it('includes venue in collective types', () => {
    expect(COLLECTIVE_TYPES).toContain('venue');
    expect(normalizeCollectiveType('Venue')).toBe('venue');
    expect(normalizeCollectiveType('nope')).toBe('collective');
  });

  it('normalizes venue kinds', () => {
    expect(normalizeVenueKind('Hostel')).toBe('hostel');
    expect(normalizeVenueKind('warehouse')).toBe(null);
  });

  it('parses JSON location strings', () => {
    expect(parseMaybeJson('{"placeId":"abc"}')).toEqual({ placeId: 'abc' });
    expect(parseMaybeJson('not-json')).toBe(null);
  });

  it('requires a Mapbox placeId for venues', () => {
    expect(venueLocationError('venue', { city: 'Goa' })).toBe('Venues must be bound to a Mapbox place');
    expect(venueLocationError('venue', { placeId: 'poi.1' })).toBe(null);
    expect(venueLocationError('band', {})).toBe(null);
  });

  it('keeps Mapbox fields when normalizing location', () => {
    const location = normalizeCollectiveLocation({
      placeId: 'dXJuOm1ieHBsYTpl',
      featureType: 'poi',
      city: 'Arambol',
      country: 'India',
      countryCode: 'IN',
      display: 'Curlies, Arambol, Goa, India',
      ancestorIds: ['dXJuOm1ieHBsYTpl', 'goa-id'],
    });
    expect(location.placeId).toBe('dXJuOm1ieHBsYTpl');
    expect(location.featureType).toBe('poi');
    expect(location.ancestorIds).toEqual(['dXJuOm1ieHBsYTpl', 'goa-id']);
  });

  it('finds venues whose location is the place or a descendant', () => {
    expect(venuesAtPlaceQuery('goa-id')).toEqual({
      isActive: true,
      type: 'venue',
      'location.ancestorIds': 'goa-id',
    });
  });

  it('serializes a venue for place profiles', () => {
    expect(serializeVenueForPlace({
      _id: { toString: () => 'abc' },
      name: 'Curlies',
      slug: 'curlies',
      profilePicture: null,
      type: 'venue',
      venueKind: 'bar',
      location: { display: 'Arambol, Goa' },
      verificationStatus: 'unverified',
    })).toEqual({
      _id: 'abc',
      name: 'Curlies',
      slug: 'curlies',
      profilePicture: null,
      type: 'venue',
      venueKind: 'bar',
      display: 'Arambol, Goa',
      verificationStatus: 'unverified',
    });
  });

  it('links POI venues to their parent city', () => {
    expect(parentPlaceIdFromLocation({
      placeId: 'poi.1',
      featureType: 'poi',
      ancestors: [
        { placeId: 'city.1', placetype: 'place' },
        { placeId: 'in.1', placetype: 'country' },
      ],
    })).toBe('city.1');
    expect(parentPlaceIdFromLocation({
      placeId: 'city.1',
      featureType: 'place',
    })).toBe('city.1');
  });
});
