const axios = require('axios');

const MAPBOX_FORWARD_URL = 'https://api.mapbox.com/search/geocode/v6/forward';
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
  const parts = [];
  const name = props.name || props.name_preferred;
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

  const city =
    context.locality?.name ||
    context.place?.name ||
    context.neighborhood?.name ||
    props.name ||
    null;
  const region = context.region?.name || context.district?.name || null;
  const country = context.country?.name || null;
  const countryCode = context.country?.country_code
    ? String(context.country.country_code).toUpperCase()
    : null;

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
    featureType: props.feature_type || null,
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

module.exports = {
  suggest,
  resolveByMapboxId,
  parseFeatureToLocation,
  featureToSuggestion,
};
