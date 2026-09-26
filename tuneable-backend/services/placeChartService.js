/**
 * Ranked place directory: countries (or child places under a parent)
 * by financial support for originating media, or by tipper location.
 */

const Media = require('../models/Media');
const Bid = require('../models/Bid');
const { PODCAST_FORMS, WRITTEN_FORMS } = require('../utils/mediaKinds');
const { normalizeLocationScope } = require('../utils/locationScope');

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

function clampLimit(value) {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n)) return DEFAULT_LIMIT;
  return Math.min(Math.max(n, 1), MAX_LIMIT);
}

function countryPlaceFromLocation(loc) {
  if (!loc || typeof loc !== 'object') return null;

  if (loc.featureType === 'country' && loc.placeId) {
    const name = loc.country || loc.label || loc.display;
    if (!name) return null;
    return {
      placeId: loc.placeId,
      name,
      featureType: 'country',
      country: loc.country || name,
      countryCode: loc.countryCode || null,
    };
  }

  const ancestor = Array.isArray(loc.ancestors)
    ? loc.ancestors.find((a) => a && a.placetype === 'country' && a.placeId)
    : null;
  if (ancestor?.placeId) {
    const name = ancestor.label || loc.country;
    if (!name) return null;
    return {
      placeId: ancestor.placeId,
      name,
      featureType: 'country',
      country: loc.country || name,
      countryCode: ancestor.countryCode || loc.countryCode || null,
    };
  }

  return null;
}

/**
 * Key a media origin location into a chart row.
 * No parent → country. Parent → descendant place (not the parent itself).
 */
function placeKeyForChart(loc, parentPlaceId = null) {
  if (!loc || typeof loc !== 'object') return null;

  if (!parentPlaceId) {
    return countryPlaceFromLocation(loc);
  }

  const underParent =
    loc.placeId === parentPlaceId ||
    (Array.isArray(loc.ancestorIds) && loc.ancestorIds.includes(parentPlaceId));
  if (!underParent) return null;

  if (!loc.placeId || loc.placeId === parentPlaceId) return null;

  const name = loc.label || loc.city || loc.display;
  if (!name) return null;

  return {
    placeId: loc.placeId,
    name,
    featureType: loc.featureType || null,
    country: loc.country || null,
    countryCode: loc.countryCode || null,
  };
}

function rankPlacesFromMedia(media, { parentPlaceId = null, limit = DEFAULT_LIMIT } = {}) {
  const grouped = new Map();

  for (const item of media || []) {
    const key = placeKeyForChart(item.primaryLocation, parentPlaceId);
    if (!key) continue;
    const support = typeof item.globalMediaAggregate === 'number' ? item.globalMediaAggregate : 0;
    const existing = grouped.get(key.placeId);
    if (existing) {
      existing.supportPence += support;
      existing.mediaCount += 1;
      if (key.name.length > existing.name.length) existing.name = key.name;
    } else {
      grouped.set(key.placeId, {
        ...key,
        supportPence: support,
        mediaCount: 1,
      });
    }
  }

  return [...grouped.values()]
    .sort(
      (a, b) =>
        b.supportPence - a.supportPence ||
        b.mediaCount - a.mediaCount ||
        a.name.localeCompare(b.name)
    )
    .slice(0, clampLimit(limit));
}

function originMediaQuery(parentPlaceId) {
  const query = {
    status: 'active',
    contentType: 'music',
    contentForm: { $nin: [...PODCAST_FORMS, ...WRITTEN_FORMS] },
    'primaryLocation.placeId': { $exists: true, $nin: [null, ''] },
  };
  if (parentPlaceId) {
    query.$or = [
      { 'primaryLocation.placeId': parentPlaceId },
      { 'primaryLocation.ancestorIds': parentPlaceId },
    ];
  }
  return query;
}

async function rankPlacesByOrigin({ parentPlaceId = null, limit = DEFAULT_LIMIT } = {}) {
  const media = await Media.find(originMediaQuery(parentPlaceId))
    .select('primaryLocation globalMediaAggregate')
    .lean();
  return rankPlacesFromMedia(media, { parentPlaceId, limit });
}

function serializeTipperRow(row) {
  return {
    placeId: row._id,
    name: row.name || row._id,
    featureType: row.featureType || (row.countryCode ? 'country' : null),
    country: row.country || null,
    countryCode: row.countryCode || null,
    supportPence: row.supportPence || 0,
    mediaCount: 0,
    bidCount: row.bidCount || 0,
  };
}

async function rankPlacesByTippers({ parentPlaceId = null, limit = DEFAULT_LIMIT } = {}) {
  const capped = clampLimit(limit);

  if (!parentPlaceId) {
    const rows = await Bid.aggregate([
      {
        $match: {
          status: 'active',
          bidderCountryPlaceId: { $nin: [null, ''] },
        },
      },
      {
        $group: {
          _id: '$bidderCountryPlaceId',
          supportPence: { $sum: '$amount' },
          bidCount: { $sum: 1 },
          name: { $first: '$bidderCountry' },
          country: { $first: '$bidderCountry' },
          countryCode: { $first: '$bidderCountryCode' },
          featureType: { $first: { $literal: 'country' } },
        },
      },
      { $sort: { supportPence: -1, bidCount: -1 } },
      { $limit: capped },
    ]);
    return rows.map(serializeTipperRow);
  }

  const rows = await Bid.aggregate([
    {
      $match: {
        status: 'active',
        bidderLocationAncestorIds: parentPlaceId,
        bidderHomePlaceId: { $nin: [null, '', parentPlaceId] },
      },
    },
    {
      $group: {
        _id: '$bidderHomePlaceId',
        supportPence: { $sum: '$amount' },
        bidCount: { $sum: 1 },
        name: { $first: '$bidderPlaceLabel' },
        country: { $first: '$bidderCountry' },
        countryCode: { $first: '$bidderCountryCode' },
        featureType: { $first: '$bidderFeatureType' },
      },
    },
    { $sort: { supportPence: -1, bidCount: -1 } },
    { $limit: capped },
  ]);
  return rows.map(serializeTipperRow);
}

async function getPlaceChart({
  parentPlaceId = null,
  scope = 'from',
  limit = DEFAULT_LIMIT,
} = {}) {
  const parent = typeof parentPlaceId === 'string' && parentPlaceId.trim()
    ? parentPlaceId.trim()
    : null;
  const normalizedScope = normalizeLocationScope(scope);

  const places =
    normalizedScope === 'supported-by'
      ? await rankPlacesByTippers({ parentPlaceId: parent, limit })
      : await rankPlacesByOrigin({ parentPlaceId: parent, limit });

  return {
    places,
    count: places.length,
    parentPlaceId: parent,
    scope: normalizedScope === 'supported-by' ? 'supported-by' : 'from',
  };
}

module.exports = {
  clampLimit,
  countryPlaceFromLocation,
  placeKeyForChart,
  rankPlacesFromMedia,
  originMediaQuery,
  getPlaceChart,
};
