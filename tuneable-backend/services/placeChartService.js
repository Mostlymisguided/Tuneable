/**
 * Ranked place directory: countries (or child places under a parent)
 * by financial support for originating media, or by tipper location.
 */

const Media = require('../models/Media');
const Bid = require('../models/Bid');
const TuneBytesTransaction = require('../models/TuneBytesTransaction');
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

/**
 * Aggregate tune bytes earned for media originating from places.
 * Returns a Map of placeId → total tune bytes.
 */
async function aggregateTuneBytesByOrigin(parentPlaceId = null) {
  const mediaQuery = originMediaQuery(parentPlaceId);
  const mediaIds = await Media.find(mediaQuery).distinct('_id');

  if (mediaIds.length === 0) return new Map();

  const tuneBytesByMedia = await TuneBytesTransaction.aggregate([
    { $match: { mediaId: { $in: mediaIds }, status: 'confirmed' } },
    {
      $group: {
        _id: '$mediaId',
        totalTuneBytes: { $sum: '$tuneBytesEarned' },
      },
    },
  ]);

  const tbMap = new Map();
  for (const doc of tuneBytesByMedia) {
    if (doc._id) tbMap.set(doc._id.toString(), doc.totalTuneBytes || 0);
  }

  const media = await Media.find(mediaQuery)
    .select('_id primaryLocation')
    .lean();

  const placeMap = new Map();
  for (const item of media) {
    const key = placeKeyForChart(item.primaryLocation, parentPlaceId);
    if (!key) continue;
    const tb = tbMap.get(item._id.toString()) || 0;
    placeMap.set(key.placeId, (placeMap.get(key.placeId) || 0) + tb);
  }

  return placeMap;
}

async function rankPlacesByOrigin({ parentPlaceId = null, limit = DEFAULT_LIMIT } = {}) {
  const media = await Media.find(originMediaQuery(parentPlaceId))
    .select('primaryLocation globalMediaAggregate')
    .lean();
  
  const tuneBytesMap = await aggregateTuneBytesByOrigin(parentPlaceId);
  const places = rankPlacesFromMedia(media, { parentPlaceId, limit });

  // Enrich with tune bytes
  for (const place of places) {
    place.tuneBytes = tuneBytesMap.get(place.placeId) || 0;
  }

  // Sort by tune bytes instead of supportPence
  places.sort(
    (a, b) =>
      b.tuneBytes - a.tuneBytes ||
      b.supportPence - a.supportPence ||
      b.mediaCount - a.mediaCount ||
      a.name.localeCompare(b.name)
  );

  return places.slice(0, clampLimit(limit));
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
    tuneBytes: row.tuneBytes || 0,
  };
}

/**
 * Aggregate tune bytes earned by users from a specific location.
 */
async function aggregateTuneBytesByTippers({ parentPlaceId = null } = {}) {
  const placeMap = new Map();

  // Get all bids from the location
  const matchCondition = parentPlaceId
    ? {
        status: 'active',
        bidderLocationAncestorIds: parentPlaceId,
        bidderHomePlaceId: { $nin: [null, ''] },
      }
    : {
        status: 'active',
        bidderCountryPlaceId: { $nin: [null, ''] },
      };

  const bids = await Bid.find(matchCondition)
    .select('_id userId bidderHomePlaceId bidderCountryPlaceId')
    .lean();

  if (bids.length === 0) return placeMap;

  const bidIds = bids.map((b) => b._id);
  const tuneBytesByBid = await TuneBytesTransaction.aggregate([
    { $match: { bidId: { $in: bidIds }, status: 'confirmed' } },
    {
      $group: {
        _id: '$bidId',
        totalTuneBytes: { $sum: '$tuneBytesEarned' },
      },
    },
  ]);

  const tbMap = new Map();
  for (const doc of tuneBytesByBid) {
    if (doc._id) tbMap.set(doc._id.toString(), doc.totalTuneBytes || 0);
  }

  for (const bid of bids) {
    const placeId = parentPlaceId ? bid.bidderHomePlaceId : bid.bidderCountryPlaceId;
    if (!placeId) continue;
    const tb = tbMap.get(bid._id.toString()) || 0;
    placeMap.set(placeId, (placeMap.get(placeId) || 0) + tb);
  }

  return placeMap;
}

async function rankPlacesByTippers({ parentPlaceId = null, limit = DEFAULT_LIMIT } = {}) {
  const capped = clampLimit(limit);
  const tuneBytesMap = await aggregateTuneBytesByTippers({ parentPlaceId });

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
      { $limit: capped * 3 }, // Get more to ensure we have enough after tune bytes sort
    ]);
    
    const places = rows.map(serializeTipperRow);
    for (const place of places) {
      place.tuneBytes = tuneBytesMap.get(place.placeId) || 0;
    }

    // Sort by tune bytes
    places.sort(
      (a, b) =>
        b.tuneBytes - a.tuneBytes ||
        b.supportPence - a.supportPence ||
        b.bidCount - a.bidCount ||
        a.name.localeCompare(b.name)
    );

    return places.slice(0, capped);
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
    { $limit: capped * 3 }, // Get more to ensure we have enough after tune bytes sort
  ]);
  
  const places = rows.map(serializeTipperRow);
  for (const place of places) {
    place.tuneBytes = tuneBytesMap.get(place.placeId) || 0;
  }

  // Sort by tune bytes
  places.sort(
    (a, b) =>
      b.tuneBytes - a.tuneBytes ||
      b.supportPence - a.supportPence ||
      b.bidCount - a.bidCount ||
      a.name.localeCompare(b.name)
  );

  return places.slice(0, capped);
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
