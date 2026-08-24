/**
 * Champion badge picker — global titles first, then location-combined
 * fallbacks, then place-only titles.
 *
 * Solo supporters still count: a single tipper can hold #1.
 */

const { getCanonicalTag } = require('./tagNormalizer');

const CHAMPION_SCOPE_PLACETYPES = new Set([
  'country',
  'region',
  'district',
  'place',
  'locality',
  'neighborhood',
]);

const CITY_FEATURE_TYPES = new Set([
  'place',
  'locality',
  'district',
  'neighborhood',
]);

const PLACE_WIDTH = {
  country: 0,
  region: 1,
  district: 2,
  place: 3,
  locality: 4,
  neighborhood: 5,
};

const DEFAULT_BADGE_LIMIT = 8;
const MAX_FALLBACK_SCOPES = 3;
const GLOBAL_TAG_BADGE_CAP = 5;

function medalForRank(rank) {
  return ['gold', 'silver', 'bronze'][rank - 1] || null;
}

function placeWidth(location) {
  const type = location?.featureType || location?.placetype || '';
  return Object.prototype.hasOwnProperty.call(PLACE_WIDTH, type) ? PLACE_WIDTH[type] : 6;
}

function isCityType(featureType) {
  return CITY_FEATURE_TYPES.has(String(featureType || '').toLowerCase());
}

/**
 * Build coarse→fine Champion scopes from a resolved home location.
 * Skips address/postcode levels.
 */
function getChampionScopePicksFromLocation(location) {
  if (!location) return [];

  const picks = [];
  const seen = new Set();

  const add = (placeId, label, placetype) => {
    if (!placeId || !label || seen.has(placeId)) return;
    if (placetype && !CHAMPION_SCOPE_PLACETYPES.has(placetype)) return;
    seen.add(placeId);
    picks.push({ placeId, label, placetype: placetype || undefined });
  };

  const ancestors = Array.isArray(location.ancestors) ? [...location.ancestors] : [];
  const order = ['country', 'region', 'district', 'place', 'locality', 'neighborhood'];
  ancestors.sort((a, b) => {
    const ai = order.indexOf(a.placetype || '');
    const bi = order.indexOf(b.placetype || '');
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  for (const ancestor of ancestors) {
    add(ancestor.placeId, ancestor.label, ancestor.placetype);
  }

  add(
    location.placeId,
    location.label || location.city || location.display || location.country,
    location.featureType
  );

  return picks;
}

/**
 * Cap fallback place lookups to country + city + finest (max 3).
 * Preserves coarse→fine order.
 */
function selectFallbackScopes(picks, max = MAX_FALLBACK_SCOPES) {
  if (!Array.isArray(picks) || picks.length === 0) return [];
  if (picks.length <= max) return picks;

  const country = picks.find((p) => p.placetype === 'country') || picks[0];
  const city = [...picks].reverse().find((p) => p.placetype === 'place' || p.placetype === 'locality');
  const finest = picks[picks.length - 1];

  const chosenIds = new Set();
  for (const pick of [country, city, finest]) {
    if (pick?.placeId) chosenIds.add(pick.placeId);
  }

  return picks.filter((p) => chosenIds.has(p.placeId)).slice(0, max);
}

function locationFromPick(pick, allPicks = []) {
  if (!pick?.placeId) return null;
  const idx = allPicks.findIndex((p) => p.placeId === pick.placeId);
  const ancestors = idx > 0 ? allPicks.slice(0, idx) : [];
  return {
    placeId: pick.placeId,
    label: pick.label,
    featureType: pick.placetype || null,
    ancestorIds: ancestors.map((a) => a.placeId),
  };
}

function entityKey(badge) {
  if (!badge) return '';
  if (badge.entityType === 'tag') {
    return `tag:${getCanonicalTag(badge.tag) || String(badge.tag || '').toLowerCase()}`;
  }
  if (badge.entityType === 'media') {
    return `media:${String(badge.mediaId || badge.uuid || '')}`;
  }
  if (badge.entityType === 'place') {
    return `place:${badge.location?.placeId || ''}`;
  }
  return '';
}

function placesRelated(a, b) {
  if (!a?.placeId || !b?.placeId) return false;
  if (a.placeId === b.placeId) return true;
  const aAnc = Array.isArray(a.ancestorIds) ? a.ancestorIds : [];
  const bAnc = Array.isArray(b.ancestorIds) ? b.ancestorIds : [];
  return aAnc.includes(b.placeId) || bAnc.includes(a.placeId);
}

function compareCombined(a, b) {
  if (a.rank !== b.rank) return a.rank - b.rank;
  const widthDelta = placeWidth(a.location) - placeWidth(b.location);
  if (widthDelta !== 0) return widthDelta;
  return (b.totalAmount || 0) - (a.totalAmount || 0);
}

function comparePlaceOnly(a, b) {
  const aCity = isCityType(a.location?.featureType) ? 0 : 1;
  const bCity = isCityType(b.location?.featureType) ? 0 : 1;
  if (aCity !== bCity) return aCity - bCity;
  if (a.rank !== b.rank) return a.rank - b.rank;
  return placeWidth(b.location) - placeWidth(a.location);
}

function entityTypeOrder(badge) {
  if (badge.entityType === 'tag') return 0;
  if (badge.entityType === 'media') return 1;
  return 2;
}

function withLocation(title, location, scope) {
  return {
    ...title,
    scope: scope || (location ? 'place' : 'global'),
    location: location || null,
  };
}

function normalizeBadge(badge) {
  const location = badge.location || null;
  return {
    entityType: badge.entityType,
    rank: badge.rank,
    medal: badge.medal || medalForRank(badge.rank),
    totalAmount: badge.totalAmount || 0,
    totalUsers: badge.totalUsers,
    bidCount: badge.bidCount,
    percentile: badge.percentile,
    tag: badge.tag,
    mediaId: badge.mediaId,
    uuid: badge.uuid,
    title: badge.title,
    scope: badge.scope || (location ? 'place' : 'global'),
    location,
  };
}

/**
 * Pick the profile/home badge row.
 *
 * 1. Global tag + media titles
 * 2. Best remaining combined (location × tag/media): better rank, then wider place
 * 3. Place-only titles, city preferred, one per related place cluster
 */
function pickFallbackChampionBadges({
  globalTags = [],
  globalMedia = [],
  scopedPlaces = [],
  limit = DEFAULT_BADGE_LIMIT,
} = {}) {
  const cap = Math.min(Math.max(parseInt(limit, 10) || DEFAULT_BADGE_LIMIT, 1), 20);
  const badges = [];
  const taken = new Set();

  const push = (badge) => {
    if (badges.length >= cap) return false;
    const key = entityKey(badge);
    if (!key || taken.has(key)) return false;
    taken.add(key);
    badges.push(normalizeBadge(badge));
    return true;
  };

  const globalCandidates = [
    ...globalTags.map((tag) => withLocation({ ...tag, entityType: 'tag' }, null, 'global')),
    ...globalMedia.map((media) => withLocation({ ...media, entityType: 'media' }, null, 'global')),
  ].sort(
    (a, b) =>
      a.rank - b.rank ||
      entityTypeOrder(a) - entityTypeOrder(b) ||
      (b.totalAmount || 0) - (a.totalAmount || 0)
  );

  let globalTagCount = 0;
  for (const badge of globalCandidates) {
    if (badge.entityType === 'tag' && globalTagCount >= GLOBAL_TAG_BADGE_CAP) continue;
    if (push(badge) && badge.entityType === 'tag') globalTagCount += 1;
  }
  if (badges.length >= cap) return badges;

  const bestCombined = new Map();
  for (const place of scopedPlaces) {
    const location = place.location || null;
    for (const tag of place.tags || []) {
      const badge = withLocation({ ...tag, entityType: 'tag' }, location, 'place');
      const key = entityKey(badge);
      if (!key || taken.has(key)) continue;
      const prev = bestCombined.get(key);
      if (!prev || compareCombined(badge, prev) < 0) bestCombined.set(key, badge);
    }
    for (const media of place.media || []) {
      const badge = withLocation({ ...media, entityType: 'media' }, location, 'place');
      const key = entityKey(badge);
      if (!key || taken.has(key)) continue;
      const prev = bestCombined.get(key);
      if (!prev || compareCombined(badge, prev) < 0) bestCombined.set(key, badge);
    }
  }

  const combined = [...bestCombined.values()].sort(
    (a, b) => compareCombined(a, b) || entityTypeOrder(a) - entityTypeOrder(b)
  );
  for (const badge of combined) {
    if (badges.length >= cap) break;
    push(badge);
  }
  if (badges.length >= cap) return badges;

  const placeTitles = [];
  for (const place of scopedPlaces) {
    if (!place.placeTitle) continue;
    placeTitles.push(
      withLocation(
        { ...place.placeTitle, entityType: 'place' },
        place.location || place.placeTitle.location,
        'place'
      )
    );
  }
  placeTitles.sort(comparePlaceOnly);

  for (const badge of placeTitles) {
    if (badges.length >= cap) break;
    const related = badges.some(
      (existing) =>
        existing.entityType === 'place' && placesRelated(existing.location, badge.location)
    );
    if (related) continue;
    push(badge);
  }

  return badges;
}

module.exports = {
  CHAMPION_SCOPE_PLACETYPES,
  CITY_FEATURE_TYPES,
  DEFAULT_BADGE_LIMIT,
  MAX_FALLBACK_SCOPES,
  GLOBAL_TAG_BADGE_CAP,
  medalForRank,
  placeWidth,
  isCityType,
  getChampionScopePicksFromLocation,
  selectFallbackScopes,
  locationFromPick,
  entityKey,
  placesRelated,
  withLocation,
  normalizeBadge,
  pickFallbackChampionBadges,
};
