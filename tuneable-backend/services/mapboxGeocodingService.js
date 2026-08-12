const axios = require('axios');

const MAPBOX_FORWARD_URL = 'https://api.mapbox.com/search/geocode/v6/forward';
const MAPBOX_REVERSE_URL = 'https://api.mapbox.com/search/geocode/v6/reverse';
const PLACE_TYPES = 'country,region,district,place,locality,neighborhood';

function getAccessToken() {
  const token = process.env.MAPBOX_ACCESS_TOKEN;
  if (!token) {
    throw new Error('MAPBOX_ACCESS_TOKEN is not configured');
  }
  return token;
}

async function forwardGeocode(params) {
  const response = await axios.get(MAPBOX_FORWARD_URL, {
    params: {
      access_token: getAccessToken(),
      ...params,
    },
    timeout: 10000,
  });
  return response.data;
}

/**
 * Autocomplete suggestions (temporary geocoding — do not persist results).
 */
async function suggest(query, options = {}) {
  const trimmed = typeof query === 'string' ? query.trim() : '';
  if (!trimmed) {
    return [];
  }

  const params = {
    q: trimmed,
    autocomplete: true,
    permanent: false,
    types: PLACE_TYPES,
    limit: Math.min(Math.max(options.limit || 8, 1), 10),
    language: options.language || 'en',
  };

  if (options.country) {
    params.country = options.country;
  }
  if (options.worldview) {
    params.worldview = options.worldview;
  }
  if (options.proximity) {
    params.proximity = options.proximity;
  }

  const data = await forwardGeocode(params);
  return (data.features || []).map(featureToSuggestion);
}

/**
 * Resolve a place by mapbox_id for storage (permanent geocoding).
 */
async function resolveByMapboxId(mapboxId) {
  const id = typeof mapboxId === 'string' ? mapboxId.trim() : '';
  if (!id) {
    return null;
  }

  const data = await forwardGeocode({
    q: id,
    autocomplete: false,
    permanent: true,
    limit: 1,
  });

  const feature = data.features?.[0];
  if (!feature) {
    return null;
  }

  return parseFeatureToLocation(feature);
}

function featureToSuggestion(feature) {
  const props = feature.properties || {};
  return {
    mapboxId: props.mapbox_id,
    label: props.name || props.name_preferred,
    placeFormatted: props.place_formatted || props.full_address || null,
    featureType: props.feature_type || null,
  };
}

function formatLocationDisplay(props, context) {
  const featureType = props.feature_type || null;
  const name = props.name || props.name_preferred;

  // Country / region features: don't duplicate the place name as city + country
  if (featureType === 'country') {
    return name || props.place_formatted || props.full_address || '';
  }
  if (featureType === 'region') {
    const parts = [name];
    if (context.country?.name && context.country.name !== name) {
      parts.push(context.country.name);
    }
    return parts.filter(Boolean).join(', ') || props.place_formatted || '';
  }

  const parts = [];
  if (name) parts.push(name);
  if (context.region?.name && context.region.name !== name) {
    parts.push(context.region.name);
  }
  if (context.country?.name) {
    parts.push(context.country.name);
  }
  if (parts.length > 0) {
    return parts.join(', ');
  }
  return props.place_formatted || props.full_address || name || '';
}

/**
 * Parse a Mapbox geocoding feature into Tuneable's location shape.
 */
function parseFeatureToLocation(feature) {
  const props = feature.properties || {};
  const context = props.context || {};
  const placeId = props.mapbox_id || feature.id || null;
  const featureType = props.feature_type || null;

  const ancestorIdSet = new Set();
  if (placeId) ancestorIdSet.add(placeId);

  const ancestors = [];
  const contextOrder = ['country', 'region', 'district', 'place', 'locality', 'neighborhood'];
  for (const placetype of contextOrder) {
    const entry = context[placetype];
    if (!entry?.mapbox_id) continue;
    ancestorIdSet.add(entry.mapbox_id);
    ancestors.push({
      placeId: entry.mapbox_id,
      label: entry.name,
      placetype,
      regionCode: entry.region_code_full || entry.region_code || null,
      countryCode: entry.country_code || null,
    });
  }

  let city = null;
  let region = null;
  let country = context.country?.name || null;
  let countryCode = context.country?.country_code
    ? String(context.country.country_code).toUpperCase()
    : null;

  if (featureType === 'country') {
    city = null;
    region = null;
    country = props.name || props.name_preferred || country;
    // Mapbox v6 may put iso on props or context for country features
    countryCode = countryCode
      || (props.country_code ? String(props.country_code).toUpperCase() : null)
      || (context.country?.country_code ? String(context.country.country_code).toUpperCase() : null);
  } else if (featureType === 'region' || featureType === 'district') {
    city = null;
    region = props.name || props.name_preferred || context.region?.name || null;
  } else {
    city =
      context.locality?.name ||
      context.place?.name ||
      (featureType === 'place' || featureType === 'locality' || featureType === 'neighborhood'
        ? (props.name || props.name_preferred)
        : null) ||
      context.neighborhood?.name ||
      null;
    // Only fall back to props.name as city for place-like features
    if (!city && featureType !== 'country' && featureType !== 'region') {
      city = props.name || props.name_preferred || null;
    }
    region = context.region?.name || context.district?.name || null;
  }

  // Guard: never keep city === country (produces "Ireland, Ireland")
  if (city && country && city.toLowerCase() === country.toLowerCase()) {
    city = null;
  }

  const coords = props.coordinates || {};
  const lng = feature.geometry?.coordinates?.[0] ?? coords.longitude;
  const lat = feature.geometry?.coordinates?.[1] ?? coords.latitude;
  const coordinates =
    lat != null && lng != null && !Number.isNaN(lat) && !Number.isNaN(lng)
      ? { lat: Number(lat), lng: Number(lng) }
      : null;

  return {
    placeProvider: 'mapbox',
    placeId,
    featureType,
    ancestorIds: Array.from(ancestorIdSet),
    ancestors,
    label: props.name || props.name_preferred || null,
    display: formatLocationDisplay(props, context),
    city,
    region,
    country,
    countryCode,
    coordinates,
    resolvedAt: new Date(),
    detectedFromIP: false,
  };
}

/**
 * Reverse geocode lat/lng into Tuneable's location shape.
 * Defaults to permanent geocoding so results are safe to store on Bid snapshots.
 */
async function reverseGeocode(longitude, latitude, options = {}) {
  const lng = Number(longitude);
  const lat = Number(latitude);

  if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
    throw new Error('Valid longitude and latitude are required');
  }
  if (lng < -180 || lng > 180 || lat < -90 || lat > 90) {
    throw new Error('Coordinates out of range');
  }

  const response = await axios.get(MAPBOX_REVERSE_URL, {
    params: {
      access_token: getAccessToken(),
      longitude: lng,
      latitude: lat,
      types: options.types || PLACE_TYPES,
      limit: Math.min(Math.max(options.limit || 1, 1), 5),
      language: options.language || 'en',
      permanent: options.permanent !== false,
    },
    timeout: 10000,
  });

  const feature = response.data?.features?.[0];
  if (!feature) {
    return null;
  }

  return parseFeatureToLocation(feature);
}

/**
 * Permanent forward geocode for a free-text place query (batch migrations).
 */
async function geocodeQuery(query, options = {}) {
  const trimmed = typeof query === 'string' ? query.trim() : '';
  if (!trimmed) {
    return null;
  }

  const params = {
    q: trimmed,
    autocomplete: false,
    permanent: true,
    types: options.types || PLACE_TYPES,
    limit: 1,
    language: options.language || 'en',
  };

  if (options.country) {
    params.country = options.country;
  }
  if (options.worldview) {
    params.worldview = options.worldview;
  }
  if (options.proximity) {
    params.proximity = options.proximity;
  }

  const data = await forwardGeocode(params);
  const feature = data.features?.[0];
  if (!feature) {
    return null;
  }

  return parseFeatureToLocation(feature);
}

module.exports = {
  suggest,
  resolveByMapboxId,
  reverseGeocode,
  geocodeQuery,
  parseFeatureToLocation,
  featureToSuggestion,
};
