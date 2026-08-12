const Media = require('../models/Media');
const Bid = require('../models/Bid');
const {
  getCanonicalTag,
  normalizeTagForMatching,
  normalizeTagForStorage,
} = require('../utils/tagNormalizer');
const { generateSlug } = require('./tagPartyService');
const { loadBidsByMediaId } = require('./relatedMediaService');
const mapboxGeocoding = require('./mapboxGeocodingService');
const { applyResolvedLocation } = require('../utils/locationUtils');
const { getPeriodStartDate } = require('../utils/globalPartyChart');

const PODCAST_FORMS = ['podcast', 'podcastseries', 'episode', 'podcastepisode'];
const VALID_TIME_PERIODS = new Set([
  'all-time',
  'today',
  'this-week',
  'this-month',
  'this-year',
]);

const MEDIA_FIELDS =
  'title artist featuring creatorNames coverArt sources globalMediaAggregate tags uuid contentType contentForm duration bpm releaseDate releaseYear primaryLocation';

/**
 * Normalize a Mapbox placeId from a URL/path segment.
 */
function normalizePlaceId(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const placeId = decodeURIComponent(raw).trim();
  return placeId || null;
}

/**
 * Build a place entity summary from stored media locations and/or Mapbox.
 */
function placeFromMediaLocations(matchedMedia, placeId) {
  for (const item of matchedMedia) {
    const loc = item.primaryLocation;
    if (!loc) continue;

    if (loc.placeId === placeId) {
      return {
        placeId,
        name: loc.label || loc.display || loc.city || loc.country || placeId,
        display: loc.display || loc.label || loc.city || loc.country || placeId,
        featureType: loc.featureType || null,
        country: loc.country || null,
        countryCode: loc.countryCode || null,
        city: loc.city || null,
        region: loc.region || null,
      };
    }

    const ancestor = Array.isArray(loc.ancestors)
      ? loc.ancestors.find((a) => a && a.placeId === placeId)
      : null;
    if (ancestor) {
      return {
        placeId,
        name: ancestor.label || loc.country || placeId,
        display: ancestor.label || loc.country || placeId,
        featureType: ancestor.placetype || null,
        country: ancestor.placetype === 'country'
          ? (ancestor.label || loc.country || null)
          : (loc.country || null),
        countryCode: ancestor.countryCode || loc.countryCode || null,
        city: ancestor.placetype === 'place' || ancestor.placetype === 'locality'
          ? ancestor.label
          : null,
        region: ancestor.placetype === 'region' ? ancestor.label : (loc.region || null),
      };
    }
  }
  return null;
}

async function resolvePlaceMeta(placeId, matchedMedia = []) {
  const fromMedia = placeFromMediaLocations(matchedMedia, placeId);
  if (fromMedia) return fromMedia;

  try {
    const resolved = await mapboxGeocoding.resolveByMapboxId(placeId);
    if (resolved) {
      const loc = applyResolvedLocation(resolved);
      return {
        placeId,
        name: loc.label || loc.display || loc.city || loc.country || placeId,
        display: loc.display || loc.label || loc.city || loc.country || placeId,
        featureType: loc.featureType || null,
        country: loc.country || null,
        countryCode: loc.countryCode || null,
        city: loc.city || null,
        region: loc.region || null,
      };
    }
  } catch (err) {
    console.warn('locationProfile: Mapbox resolve failed for', placeId, err.message);
  }

  return {
    placeId,
    name: placeId,
    display: placeId,
    featureType: null,
    country: null,
    countryCode: null,
    city: null,
    region: null,
  };
}

/**
 * Mongo query: media whose origin is this place or a descendant of it.
 */
function mediaOriginQuery(placeId) {
  return {
    status: 'active',
    contentType: 'music',
    contentForm: { $nin: PODCAST_FORMS },
    $or: [
      { 'primaryLocation.placeId': placeId },
      { 'primaryLocation.ancestorIds': placeId },
    ],
  };
}

/**
 * Related places from matched media (children when viewing a country,
 * siblings + parent country when viewing a finer place).
 */
function computeRelatedPlaces(matchedMedia, currentPlaceId, currentFeatureType, { limit = 8 } = {}) {
  const byPlaceId = new Map();
  const isCountry = currentFeatureType === 'country';

  const add = (placeId, name, featureType, tipWeight) => {
    if (!placeId || placeId === currentPlaceId || !name) return;
    const existing = byPlaceId.get(placeId);
    if (existing) {
      existing.tipWeight += tipWeight;
      existing.count += 1;
      if (name.length > existing.name.length) existing.name = name;
    } else {
      byPlaceId.set(placeId, {
        placeId,
        name,
        featureType: featureType || null,
        tipWeight,
        count: 1,
      });
    }
  };

  for (const item of matchedMedia) {
    const loc = item.primaryLocation;
    if (!loc) continue;
    const tipWeight = typeof item.globalMediaAggregate === 'number' ? item.globalMediaAggregate : 0;

    if (isCountry) {
      // Prefer cities / places that sit under this country
      if (
        loc.placeId &&
        loc.placeId !== currentPlaceId &&
        Array.isArray(loc.ancestorIds) &&
        loc.ancestorIds.includes(currentPlaceId)
      ) {
        const name = loc.label || loc.city || loc.display;
        if (name) add(loc.placeId, name, loc.featureType, tipWeight);
      }
    } else {
      // Parent country + other places sharing the same country ancestor
      const countryAncestor = Array.isArray(loc.ancestors)
        ? loc.ancestors.find((a) => a?.placetype === 'country')
        : null;
      if (countryAncestor?.placeId) {
        add(
          countryAncestor.placeId,
          countryAncestor.label || loc.country,
          'country',
          tipWeight
        );
      }

      if (
        loc.placeId &&
        loc.placeId !== currentPlaceId &&
        loc.featureType !== 'country'
      ) {
        const name = loc.label || loc.city || loc.display;
        if (name) add(loc.placeId, name, loc.featureType, tipWeight);
      }
    }
  }

  return [...byPlaceId.values()]
    .sort((a, b) => b.tipWeight - a.tipWeight || b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, limit)
    .map(({ placeId, name, featureType }) => ({ placeId, name, featureType }));
}

/**
 * Co-occurring tags across matched media.
 */
function computeRelatedTags(matchedMedia, { limit = 8 } = {}) {
  const byCanonical = new Map();

  for (const item of matchedMedia) {
    if (!item.tags || !Array.isArray(item.tags)) continue;
    const tipWeight = typeof item.globalMediaAggregate === 'number' ? item.globalMediaAggregate : 0;
    const seenOnTrack = new Set();

    for (const raw of item.tags) {
      if (typeof raw !== 'string' || !raw.trim()) continue;
      const canonical = getCanonicalTag(raw) || normalizeTagForMatching(raw);
      if (!canonical || seenOnTrack.has(canonical)) continue;
      seenOnTrack.add(canonical);

      const displayName = normalizeTagForStorage(raw) || raw.trim();
      const existing = byCanonical.get(canonical);
      if (existing) {
        existing.tipWeight += tipWeight;
        existing.count += 1;
        if (displayName.length > existing.name.length || /^[A-Z]/.test(displayName)) {
          existing.name = displayName;
        }
      } else {
        byCanonical.set(canonical, {
          name: displayName,
          tipWeight,
          count: 1,
        });
      }
    }
  }

  return [...byCanonical.values()]
    .sort((a, b) => b.tipWeight - a.tipWeight || b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, limit)
    .map(({ name }) => ({
      name,
      slug: generateSlug(name),
    }))
    .filter((t) => t.slug);
}

/**
 * Media IDs whose primaryLocation is this place or a descendant.
 */
async function resolveLocationMediaIds(rawPlaceId) {
  const placeId = normalizePlaceId(rawPlaceId);
  if (!placeId) return null;

  const media = await Media.find(mediaOriginQuery(placeId))
    .select('_id primaryLocation')
    .lean();

  return {
    placeId,
    mediaIds: media.map((m) => m._id),
    sampleLocations: media.map((m) => m.primaryLocation).filter(Boolean),
  };
}

/**
 * Rank place-origin media by tip aggregate within a rolling time window.
 * Returns only tracks with tips in-period; display aggregate is the period sum.
 */
async function rankMatchedMediaByPeriod(matchedMedia, startDate) {
  if (!startDate || !Array.isArray(matchedMedia) || matchedMedia.length === 0) {
    return matchedMedia;
  }

  const mediaIds = matchedMedia.map((m) => m._id);
  const periodRows = await Bid.aggregate([
    {
      $match: {
        status: 'active',
        mediaId: { $in: mediaIds },
        createdAt: { $gte: startDate },
      },
    },
    {
      $group: {
        _id: '$mediaId',
        tipWeight: { $sum: '$amount' },
      },
    },
  ]);

  const periodById = new Map(
    periodRows.map((row) => [row._id.toString(), row.tipWeight || 0])
  );

  return matchedMedia
    .map((item) => {
      const periodVal = periodById.get(item._id.toString()) || 0;
      return {
        ...item,
        timePeriodBidValue: periodVal,
        globalMediaAggregate: periodVal,
      };
    })
    .filter((item) => (item.timePeriodBidValue || 0) > 0)
    .sort(
      (a, b) =>
        (b.timePeriodBidValue || 0) - (a.timePeriodBidValue || 0) ||
        String(a.title || '').localeCompare(String(b.title || ''))
    );
}

/**
 * Place profile: origin-scoped media ranked by tip aggregate.
 */
async function getLocationProfile(rawPlaceId, { page = 1, limit = 50, timePeriod = 'all-time' } = {}) {
  const placeId = normalizePlaceId(rawPlaceId);
  if (!placeId) {
    const err = new Error('Place not found');
    err.status = 404;
    throw err;
  }

  const limitNum = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 100);
  const pageNum = Math.max(parseInt(page, 10) || 1, 1);
  const skip = (pageNum - 1) * limitNum;
  const period = VALID_TIME_PERIODS.has(timePeriod) ? timePeriod : 'all-time';
  const startDate = getPeriodStartDate(period);

  const matched = await Media.find(mediaOriginQuery(placeId))
    .sort({ globalMediaAggregate: -1, createdAt: -1 })
    .select(MEDIA_FIELDS)
    .populate('addedBy', 'username profilePic uuid')
    .lean();

  const place = await resolvePlaceMeta(placeId, matched);

  // Unknown placeId with no media and no Mapbox hit
  if (matched.length === 0 && place.name === placeId && !place.featureType && !place.country) {
    const err = new Error('Place not found');
    err.status = 404;
    throw err;
  }

  // Related chips stay all-time; Top Tunes re-rank by period
  const relatedPlaces = computeRelatedPlaces(matched, placeId, place.featureType, { limit: 8 });
  const relatedTags = computeRelatedTags(matched, { limit: 8 });

  const ranked = startDate
    ? await rankMatchedMediaByPeriod(matched, startDate)
    : matched;

  const total = ranked.length;
  const pageSlice = ranked.slice(skip, skip + limitNum);
  const tipTotal = ranked.reduce((sum, m) => sum + (m.globalMediaAggregate || 0), 0);

  const bidsByMediaId = await loadBidsByMediaId(pageSlice.map((m) => m._id));
  const media = pageSlice.map((m) => ({
    ...m,
    bids: bidsByMediaId.get(m._id.toString()) || [],
  }));

  return {
    place,
    timePeriod: period,
    stats: {
      mediaCount: total,
      globalPlaceAggregate: tipTotal,
    },
    relatedPlaces,
    relatedTags,
    media,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      pages: Math.ceil(total / limitNum) || 0,
    },
  };
}

const SKIP_RANKING_FEATURE_TYPES = new Set(['continent', 'world']);

/**
 * Pick place candidates for media profile location-rank chips:
 * most specific place + region (if distinct) + country. Skips Earth/continent.
 */
function pickLocationRankingCandidates(primaryLocation) {
  if (!primaryLocation?.placeId) return [];

  const out = [];
  const seen = new Set();

  const add = (placeId, name, featureType) => {
    if (!placeId || seen.has(placeId)) return;
    const label = typeof name === 'string' ? name.trim() : '';
    if (!label) return;
    if (featureType && SKIP_RANKING_FEATURE_TYPES.has(featureType)) return;
    seen.add(placeId);
    out.push({
      placeId,
      name: label,
      featureType: featureType || null,
    });
  };

  const ft = primaryLocation.featureType || null;
  const ancestors = Array.isArray(primaryLocation.ancestors)
    ? primaryLocation.ancestors.filter(Boolean)
    : [];

  // Most specific place (anything that isn't country / continent / world)
  if (ft !== 'country' && !SKIP_RANKING_FEATURE_TYPES.has(ft)) {
    add(
      primaryLocation.placeId,
      primaryLocation.label
        || primaryLocation.city
        || primaryLocation.display
        || primaryLocation.region,
      ft
    );
  }

  // Region ancestor when primary is finer than region
  if (ft !== 'region' && ft !== 'country') {
    const regionAncestor = ancestors.find((a) => a.placetype === 'region');
    if (regionAncestor?.placeId) {
      add(
        regionAncestor.placeId,
        regionAncestor.label || primaryLocation.region,
        'region'
      );
    }
  }

  // Country — self or ancestor
  if (ft === 'country') {
    add(
      primaryLocation.placeId,
      primaryLocation.country || primaryLocation.label || primaryLocation.display,
      'country'
    );
  } else {
    const countryAncestor = ancestors.find((a) => a.placetype === 'country');
    if (countryAncestor?.placeId) {
      add(
        countryAncestor.placeId,
        countryAncestor.label || primaryLocation.country,
        'country'
      );
    }
  }

  return out;
}

/**
 * Origin-scoped query matching the media's content family (music vs podcast).
 */
function originQueryForMedia(placeId, media) {
  const forms = Array.isArray(media.contentForm)
    ? media.contentForm
    : [media.contentForm].filter(Boolean);
  const isPodcast = forms.some((f) => PODCAST_FORMS.includes(f));

  if (isPodcast) {
    return {
      status: 'active',
      contentForm: { $in: PODCAST_FORMS },
      $or: [
        { 'primaryLocation.placeId': placeId },
        { 'primaryLocation.ancestorIds': placeId },
      ],
    };
  }

  return mediaOriginQuery(placeId);
}

/**
 * Rank a media item within its primaryLocation place(s) by globalMediaAggregate.
 * Returns best ranks first, capped for hero chips.
 *
 * @param {Object} media - Media document (needs _id, primaryLocation, globalMediaAggregate, contentForm)
 * @param {{ minTotal?: number, limit?: number }} opts
 */
async function getMediaLocationRankings(media, { minTotal = 2, limit = 3 } = {}) {
  if (!media) return [];

  const candidates = pickLocationRankingCandidates(media.primaryLocation);
  if (candidates.length === 0) return [];

  const aggregate = media.globalMediaAggregate || 0;
  const maxResults = Math.min(Math.max(parseInt(limit, 10) || 2, 1), 5);
  const minPool = Math.max(parseInt(minTotal, 10) || 2, 1);

  const rankings = [];

  for (const candidate of candidates) {
    const query = originQueryForMedia(candidate.placeId, media);
    const [higherCount, total] = await Promise.all([
      Media.countDocuments({ ...query, globalMediaAggregate: { $gt: aggregate } }),
      Media.countDocuments(query),
    ]);

    if (total < minPool) continue;

    const rank = higherCount + 1;
    const percentile = total > 0
      ? parseFloat((((total - rank) / total) * 100).toFixed(1))
      : 0;

    rankings.push({
      placeId: candidate.placeId,
      name: candidate.name,
      featureType: candidate.featureType,
      rank,
      total,
      percentile,
      aggregate,
    });
  }

  rankings.sort((a, b) => a.rank - b.rank || b.total - a.total);
  return rankings.slice(0, maxResults);
}

module.exports = {
  normalizePlaceId,
  mediaOriginQuery,
  resolveLocationMediaIds,
  getLocationProfile,
  computeRelatedPlaces,
  computeRelatedTags,
  pickLocationRankingCandidates,
  getMediaLocationRankings,
};
