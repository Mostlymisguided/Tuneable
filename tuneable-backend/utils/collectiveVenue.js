const { applyResolvedLocation } = require('./locationUtils');

const COLLECTIVE_TYPES = ['band', 'collective', 'production_company', 'venue', 'other'];
const VENUE_KINDS = ['bar', 'club', 'hostel', 'cafe', 'restaurant', 'festival', 'other'];
const CITY_LIKE_PLACETYPES = new Set(['place', 'locality', 'neighborhood', 'district']);

function parseMaybeJson(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (typeof value === 'object') return value;
  return null;
}

function normalizeCollectiveType(type) {
  // Handle array of types
  if (Array.isArray(type)) {
    const normalized = type
      .filter(t => typeof t === 'string')
      .map(t => t.trim().toLowerCase())
      .filter(t => COLLECTIVE_TYPES.includes(t));
    return normalized.length > 0 ? normalized : ['collective'];
  }
  
  // Handle single type
  if (typeof type !== 'string') return ['collective'];
  const normalized = type.trim().toLowerCase();
  return [COLLECTIVE_TYPES.includes(normalized) ? normalized : 'collective'];
}

function normalizeVenueKind(kind) {
  if (typeof kind !== 'string') return null;
  const normalized = kind.trim().toLowerCase();
  return VENUE_KINDS.includes(normalized) ? normalized : null;
}

function normalizeCollectiveLocation(raw) {
  return applyResolvedLocation(parseMaybeJson(raw));
}

function venueLocationError(type, location) {
  // Check if 'venue' is in the types array
  const isVenue = Array.isArray(type) 
    ? type.includes('venue') 
    : type === 'venue';
  
  if (!isVenue) return null;
  if (!location?.placeId) {
    return 'Venues must be bound to a Mapbox place';
  }
  return null;
}

function resolvedVenueKind(kind) {
  return normalizeVenueKind(kind) || 'other';
}

function collectiveSaveErrorResponse(error, action = 'create') {
  if (error && error.code === 11000) {
    const fields = Object.keys(error.keyPattern || error.keyValue || {});
    if (fields.includes('email')) {
      return {
        status: 409,
        body: { error: 'That email is already used by another collective. Use a different email.' },
      };
    }
    if (fields.includes('name') || fields.includes('slug')) {
      return {
        status: 409,
        body: { error: 'A collective with this name already exists' },
      };
    }
    return {
      status: 409,
      body: { error: 'A collective with these details already exists' },
    };
  }

  if (error && error.name === 'ValidationError') {
    const messages = Object.values(error.errors || {})
      .map((entry) => entry && entry.message)
      .filter(Boolean);
    return {
      status: 400,
      body: { error: messages.join(' ') || 'Invalid collective details' },
    };
  }

  return {
    status: 500,
    body: {
      error: `Failed to ${action} collective`,
      details: error && error.message ? error.message : undefined,
    },
  };
}

function venuesAtPlaceQuery(placeId) {
  return {
    isActive: true,
    type: 'venue', // MongoDB will match if array contains 'venue'
    'location.ancestorIds': placeId,
  };
}

function serializeVenueForPlace(doc) {
  if (!doc) return null;
  return {
    _id: doc._id?.toString?.() || doc._id,
    name: doc.name,
    slug: doc.slug,
    profilePicture: doc.profilePicture || null,
    type: doc.type,
    venueKind: doc.venueKind || null,
    display: doc.location?.display || doc.location?.label || doc.name,
    verificationStatus: doc.verificationStatus || 'unverified',
  };
}

function parentPlaceIdFromLocation(location) {
  if (!location) return null;
  const featureType = location.featureType || null;
  if (featureType === 'country' || featureType === 'region' || CITY_LIKE_PLACETYPES.has(featureType)) {
    return location.placeId || null;
  }
  const ancestors = Array.isArray(location.ancestors) ? location.ancestors : [];
  const parent =
    ancestors.find((a) => a && CITY_LIKE_PLACETYPES.has(a.placetype))
    || ancestors.find((a) => a?.placetype === 'region')
    || ancestors.find((a) => a?.placetype === 'country');
  return parent?.placeId || null;
}

module.exports = {
  COLLECTIVE_TYPES,
  VENUE_KINDS,
  parseMaybeJson,
  normalizeCollectiveType,
  normalizeVenueKind,
  resolvedVenueKind,
  normalizeCollectiveLocation,
  venueLocationError,
  collectiveSaveErrorResponse,
  venuesAtPlaceQuery,
  serializeVenueForPlace,
  parentPlaceIdFromLocation,
};
