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
  if (typeof type !== 'string') return 'collective';
  const normalized = type.trim().toLowerCase();
  return COLLECTIVE_TYPES.includes(normalized) ? normalized : 'collective';
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
  if (type !== 'venue') return null;
  if (!location?.placeId) {
    return 'Venues must be bound to a Mapbox place';
  }
  return null;
}

function venuesAtPlaceQuery(placeId) {
  return {
    isActive: true,
    type: 'venue',
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
  normalizeCollectiveLocation,
  venueLocationError,
  venuesAtPlaceQuery,
  serializeVenueForPlace,
  parentPlaceIdFromLocation,
};
