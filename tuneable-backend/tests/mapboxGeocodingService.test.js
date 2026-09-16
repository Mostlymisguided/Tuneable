const {
  parseFeatureToLocation,
  CONTEXT_TYPE_ORDER,
  SEARCH_PLACE_TYPES,
} = require('../services/mapboxGeocodingService');

function claptonFeature() {
  return {
    geometry: { coordinates: [-0.057, 51.561] },
    properties: {
      mapbox_id: 'clapton-id',
      feature_type: 'neighborhood',
      name: 'Clapton',
      name_preferred: 'Clapton',
      place_formatted: 'London, England, United Kingdom',
      full_address: 'Clapton, London, England, United Kingdom',
      coordinates: { longitude: -0.057, latitude: 51.561 },
      context: {
        locality: {
          mapbox_id: 'hackney-id',
          name: 'Hackney',
          wikidata_id: 'Q23306',
        },
        place: {
          mapbox_id: 'london-id',
          name: 'London',
          wikidata_id: 'Q84',
        },
        district: {
          mapbox_id: 'greater-london-id',
          name: 'Greater London',
        },
        region: {
          mapbox_id: 'england-id',
          name: 'England',
          region_code: 'ENG',
          region_code_full: 'GB-ENG',
        },
        country: {
          mapbox_id: 'uk-id',
          name: 'United Kingdom',
          country_code: 'gb',
        },
        postcode: {
          mapbox_id: 'e5-id',
          name: 'E5',
        },
        street: {
          mapbox_id: 'clapton-road-id',
          name: 'Clapton Road',
        },
      },
    },
  };
}

describe('Mapbox location hierarchy', () => {
  it('searches admin layers including postcode but not street/address', () => {
    expect(SEARCH_PLACE_TYPES).toBe(
      'country,region,postcode,district,place,locality,neighborhood'
    );
    expect(CONTEXT_TYPE_ORDER).toEqual([
      'country',
      'region',
      'postcode',
      'district',
      'place',
      'locality',
      'neighborhood',
      'street',
      'address',
    ]);
  });

  it('persists every Mapbox context layer for a neighborhood like Clapton', () => {
    const location = parseFeatureToLocation(claptonFeature());

    expect(location.placeId).toBe('clapton-id');
    expect(location.featureType).toBe('neighborhood');
    expect(location.label).toBe('Clapton');
    expect(location.postcode).toBe('E5');
    expect(location.placeFormatted).toBe('London, England, United Kingdom');
    expect(location.fullAddress).toBe('Clapton, London, England, United Kingdom');

    expect(location.ancestors.map((a) => a.placetype)).toEqual([
      'country',
      'region',
      'postcode',
      'district',
      'place',
      'locality',
      'street',
    ]);
    expect(location.ancestors.find((a) => a.placetype === 'place')).toMatchObject({
      placeId: 'london-id',
      label: 'London',
    });
    expect(location.ancestors.find((a) => a.placetype === 'postcode')).toMatchObject({
      placeId: 'e5-id',
      label: 'E5',
    });
    expect(location.ancestors.find((a) => a.placetype === 'street')).toMatchObject({
      placeId: 'clapton-road-id',
      label: 'Clapton Road',
    });
    expect(location.ancestorIds).toEqual([
      'clapton-id',
      'uk-id',
      'england-id',
      'e5-id',
      'greater-london-id',
      'london-id',
      'hackney-id',
      'clapton-road-id',
    ]);
  });

  it('keeps London in the public display without showing postcode or street', () => {
    const location = parseFeatureToLocation(claptonFeature());
    expect(location.display).toBe('Clapton, London, England, United Kingdom');
  });

  it('keeps unknown future context types instead of dropping them', () => {
    const location = parseFeatureToLocation({
      properties: {
        mapbox_id: 'x-id',
        feature_type: 'place',
        name: 'Goa',
        context: {
          country: { mapbox_id: 'in-id', name: 'India', country_code: 'in' },
          block: { mapbox_id: 'block-id', name: 'Ward 4' },
        },
      },
    });

    expect(location.ancestors.map((a) => a.placetype)).toEqual(['country', 'block']);
    expect(location.ancestorIds).toEqual(['x-id', 'in-id', 'block-id']);
  });
});
