const Media = require('../models/Media');
const Party = require('../models/Party');
const Bid = require('../models/Bid');
const {
  getCanonicalTag,
  normalizeTagForMatching,
  normalizeTagForStorage,
  tagsMatch,
  TAG_ALIASES,
} = require('../utils/tagNormalizer');
const { generateSlug, getExistingTagParty } = require('./tagPartyService');
const { loadBidsByMediaId } = require('./relatedMediaService');
const { getPeriodStartDate } = require('../utils/globalPartyChart');
const { enrichMediaWithPlayability } = require('../utils/mediaPlayability');

const PODCAST_FORMS = ['podcast', 'podcastseries', 'episode', 'podcastepisode'];
const ADDED_BY_FIELDS = 'username profilePic uuid';
const PODCAST_SERIES_FIELDS = 'title coverArt genres tags';
const SKIP_PLACE_FEATURE_TYPES = new Set(['continent', 'earth', 'world']);
const CITYISH_FEATURE_TYPES = new Set([
  'place',
  'locality',
  'district',
  'neighborhood',
  'postcode',
  'address',
]);
const VALID_TIME_PERIODS = new Set([
  'all-time',
  'today',
  'this-week',
  'this-month',
  'this-year',
]);

/**
 * Parse a 4-digit release-year slug (e.g. "2024") for year-based tag profiles.
 * @returns {number|null}
 */
function parseReleaseYearFromSlug(rawSlug) {
  if (!rawSlug || typeof rawSlug !== 'string') return null;
  const slug = decodeURIComponent(rawSlug).trim();
  if (!/^\d{4}$/.test(slug)) return null;
  const year = parseInt(slug, 10);
  if (!Number.isFinite(year) || year < 1900 || year > 2100) return null;
  return year;
}

/**
 * Parse a BPM slug (e.g. "128") for tempo-based tag profiles.
 * Excludes 4-digit years (handled by parseReleaseYearFromSlug).
 * @returns {number|null}
 */
function parseBpmFromSlug(rawSlug) {
  if (!rawSlug || typeof rawSlug !== 'string') return null;
  const slug = decodeURIComponent(rawSlug).trim().toLowerCase();
  // Allow "128", "128bpm", "128-bpm"
  const match = slug.match(/^(\d{2,3})(?:-?bpm)?$/);
  if (!match) return null;
  const bpm = parseInt(match[1], 10);
  if (!Number.isFinite(bpm) || bpm < 20 || bpm > 400) return null;
  // Prefer year profiles for 1900–2100 four-digit slugs
  if (/^\d{4}$/.test(slug)) return null;
  return bpm;
}

/**
 * Mongo filter matching media whose bpm rounds to the given integer.
 */
function mediaBpmQuery(bpm) {
  return {
    bpm: { $gte: bpm - 0.5, $lt: bpm + 0.5 },
  };
}

/**
 * Resolve a URL slug into display name + canonical matching key.
 * Prefers an existing tag party when present (stable name/slug).
 */
async function resolveTagFromSlug(rawSlug) {
  if (!rawSlug || typeof rawSlug !== 'string') return null;

  const slug = decodeURIComponent(rawSlug).trim().toLowerCase();
  if (!slug) return null;

  const releaseYear = parseReleaseYearFromSlug(slug);
  if (releaseYear != null) {
    const yearLabel = String(releaseYear);
    return {
      displayName: yearLabel,
      canonicalTag: yearLabel,
      slug: yearLabel,
      party: null,
      releaseYear,
      kind: 'year',
    };
  }

  const bpm = parseBpmFromSlug(slug);
  if (bpm != null) {
    const bpmLabel = String(bpm);
    return {
      displayName: bpmLabel,
      canonicalTag: bpmLabel,
      slug: bpmLabel,
      party: null,
      bpm,
      kind: 'bpm',
    };
  }

  const nameFromSlug = slug.replace(/-/g, ' ').trim();

  let party = await Party.findOne({ type: 'tag', slug }).lean();
  if (!party) {
    party = await getExistingTagParty(nameFromSlug);
    if (party && typeof party.toObject === 'function') {
      party = party.toObject();
    }
  }

  let displayName;
  if (party) {
    displayName = (party.tags && party.tags[0])
      || (party.name ? party.name.replace(/\s+Party$/i, '').trim() : null)
      || normalizeTagForStorage(nameFromSlug);
  } else {
    // Prefer alias display forms (e.g. "Hip Hop") when available
    const aliasForm = TAG_ALIASES[normalizeTagForMatching(nameFromSlug)];
    displayName = (aliasForm && /^[A-Z]/.test(aliasForm))
      ? aliasForm
      : normalizeTagForStorage(nameFromSlug);
  }

  const canonicalTag = party?.canonicalTag || getCanonicalTag(displayName);
  const resolvedSlug = party?.slug || generateSlug(displayName) || slug;

  return {
    displayName,
    canonicalTag,
    slug: resolvedSlug,
    party: party || null,
    kind: 'tag',
  };
}

/**
 * URL/API scope for tag profiles. Year/BPM virtual tags stay music-only.
 */
function parseContentScope(raw) {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const normalized = String(value || 'music').trim().toLowerCase();
  if (normalized === 'podcast' || normalized === 'spoken' || normalized === 'podcastepisode') {
    return 'podcast';
  }
  return 'music';
}

function addVariant(variants, value) {
  if (!value || typeof value !== 'string') return;
  const trimmed = value.trim();
  if (!trimmed) return;
  variants.add(trimmed);
  variants.add(trimmed.toLowerCase());
  variants.add(normalizeTagForStorage(trimmed));
}

/**
 * Build a set of plausible stored tag strings for Mongo $in lookups.
 */
function collectTagVariants(displayName, canonicalTag) {
  const variants = new Set();
  const seeds = [displayName, canonicalTag, displayName.replace(/\s+/g, '')];

  for (const seed of seeds) {
    if (!seed || typeof seed !== 'string') continue;
    addVariant(variants, seed);

    // Apple/iTunes categories often use "Society & Culture" while the slug is society-culture.
    if (seed.includes('&')) {
      addVariant(variants, seed.replace(/\s*&\s*/g, ' '));
    } else {
      const words = seed.trim().split(/\s+/).filter(Boolean);
      if (words.length === 2) {
        addVariant(variants, `${words[0]} & ${words[1]}`);
      }
    }
  }

  for (const [normKey, aliasValue] of Object.entries(TAG_ALIASES)) {
    if (tagsMatch(normKey, displayName) || tagsMatch(aliasValue, displayName)) {
      addVariant(variants, aliasValue);
      addVariant(variants, normKey);
    }
  }

  return [...variants].filter(Boolean);
}

/**
 * Labels that can identify a tag on an item: tip tags, plus catalog genre/category
 * (and series labels) when includeCatalogFields is set.
 */
function collectTagLabels(item, { includeCatalogFields = false } = {}) {
  const labels = [];
  const pushOne = (raw) => {
    if (typeof raw === 'string' && raw.trim()) {
      labels.push(raw);
      return;
    }
    if (raw && typeof raw === 'object') {
      const name = raw.name || raw.label || raw.title;
      if (typeof name === 'string' && name.trim()) labels.push(name);
    }
  };
  const pushAll = (arr) => {
    if (!Array.isArray(arr)) return;
    for (const raw of arr) pushOne(raw);
  };

  pushAll(item?.tags);
  if (!includeCatalogFields) return labels;

  pushAll(item?.genres);
  pushOne(item?.category);

  const series = item?.podcastSeries;
  if (series && typeof series === 'object') {
    pushAll(series.tags);
    pushAll(series.genres);
  }

  return labels;
}

function itemMatchesTag(item, displayName, options = {}) {
  return collectTagLabels(item, options).some(
    (label) => tagsMatch(label, displayName)
  );
}

/**
 * Co-occurring tags across matched media, ranked by shared tip weight then count.
 * Skips the current tag (and aliases). Returns top N with display name + slug.
 */
function computeRelatedTags(
  matchedMedia,
  currentDisplayName,
  { limit = 8, includeCatalogFields = false } = {}
) {
  const byCanonical = new Map();

  for (const item of matchedMedia) {
    const labels = collectTagLabels(item, { includeCatalogFields });
    if (labels.length === 0) continue;
    const tipWeight = typeof item.globalMediaAggregate === 'number' ? item.globalMediaAggregate : 0;
    const seenOnTrack = new Set();

    for (const raw of labels) {
      if (typeof raw !== 'string' || !raw.trim()) continue;
      if (tagsMatch(raw, currentDisplayName)) continue;

      const canonical = getCanonicalTag(raw) || normalizeTagForMatching(raw);
      if (!canonical || seenOnTrack.has(canonical)) continue;
      seenOnTrack.add(canonical);

      const displayName = normalizeTagForStorage(raw) || raw.trim();
      const existing = byCanonical.get(canonical);
      if (existing) {
        existing.tipWeight += tipWeight;
        existing.count += 1;
        // Prefer Title Case / storage form when we already have a nicer label
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
 * Bucket a media primaryLocation into a city-first place, else country.
 * Skips continent/world; skips region so lists stay city-or-country.
 */
function originBucketFromLocation(loc) {
  if (!loc || typeof loc !== 'object' || !loc.placeId) return null;

  const ft = loc.featureType || null;
  if (ft && SKIP_PLACE_FEATURE_TYPES.has(ft)) return null;

  const ancestors = Array.isArray(loc.ancestors) ? loc.ancestors.filter(Boolean) : [];
  const countryAncestor = ancestors.find((a) => a.placetype === 'country') || null;

  const isCityish =
    (ft && CITYISH_FEATURE_TYPES.has(ft)) ||
    (!ft && !!(loc.city || loc.label));

  // City / locality (or unlabeled fine place) — not country/region
  if (ft !== 'country' && ft !== 'region' && (isCityish || (ft && !SKIP_PLACE_FEATURE_TYPES.has(ft)))) {
    const name = (loc.city || loc.label || loc.display || '').trim();
    if (name) {
      return {
        placeId: loc.placeId,
        name: loc.city || loc.label || name,
        featureType: ft || 'place',
      };
    }
  }

  // Country fallback
  if (countryAncestor?.placeId) {
    const name = (countryAncestor.label || loc.country || '').trim();
    if (name) {
      return {
        placeId: countryAncestor.placeId,
        name,
        featureType: 'country',
      };
    }
  }

  if (ft === 'country') {
    const name = (loc.label || loc.country || loc.display || '').trim();
    if (name) {
      return {
        placeId: loc.placeId,
        name,
        featureType: 'country',
      };
    }
  }

  return null;
}

/**
 * Top origin places for tagged media — tip-weighted, city-first then country.
 */
function computeTopOriginPlaces(matchedMedia, { limit = 3 } = {}) {
  const byPlaceId = new Map();

  for (const item of matchedMedia) {
    const bucket = originBucketFromLocation(item.primaryLocation);
    if (!bucket) continue;
    const tipWeight = typeof item.globalMediaAggregate === 'number' ? item.globalMediaAggregate : 0;
    const existing = byPlaceId.get(bucket.placeId);
    if (existing) {
      existing.tipWeight += tipWeight;
      existing.count += 1;
      if (bucket.name.length > existing.name.length) existing.name = bucket.name;
    } else {
      byPlaceId.set(bucket.placeId, {
        placeId: bucket.placeId,
        name: bucket.name,
        featureType: bucket.featureType,
        tipWeight,
        count: 1,
      });
    }
  }

  const ranked = [...byPlaceId.values()].sort(
    (a, b) => b.tipWeight - a.tipWeight || b.count - a.count || a.name.localeCompare(b.name)
  );

  // Prefer a single granularity: cities when we have them, else countries
  const cities = ranked.filter((p) => p.featureType !== 'country');
  const chosen = (cities.length > 0 ? cities : ranked).slice(0, limit);

  return chosen.map(({ placeId, name, featureType }) => ({ placeId, name, featureType }));
}

/**
 * Top tipper-home places supporting this tag's media — tip-amount weighted.
 * City-first (bidderHomePlaceId) with country fallback when home is country-level.
 */
async function computeTopSupportPlaces(mediaIds, { limit = 3 } = {}) {
  if (!Array.isArray(mediaIds) || mediaIds.length === 0) return [];

  const rows = await Bid.aggregate([
    {
      $match: {
        status: 'active',
        mediaId: { $in: mediaIds },
        bidderHomePlaceId: { $exists: true, $ne: null },
      },
    },
    {
      $group: {
        _id: '$bidderHomePlaceId',
        tipWeight: { $sum: '$amount' },
        count: { $sum: 1 },
        placeLabel: { $first: '$bidderPlaceLabel' },
        display: { $first: '$bidderLocationDisplay' },
        featureType: { $first: '$bidderFeatureType' },
        country: { $first: '$bidderCountry' },
        countryPlaceId: { $first: '$bidderCountryPlaceId' },
      },
    },
    { $sort: { tipWeight: -1, count: -1 } },
  ]);

  const byPlaceId = new Map();

  const add = (placeId, name, featureType, tipWeight, count) => {
    if (!placeId || !name) return;
    if (featureType && SKIP_PLACE_FEATURE_TYPES.has(featureType)) return;
    const existing = byPlaceId.get(placeId);
    if (existing) {
      existing.tipWeight += tipWeight;
      existing.count += count;
      if (name.length > existing.name.length) existing.name = name;
    } else {
      byPlaceId.set(placeId, {
        placeId,
        name,
        featureType: featureType || null,
        tipWeight,
        count,
      });
    }
  };

  for (const row of rows) {
    const featureType = row.featureType || null;
    const isCountryHome =
      featureType === 'country' ||
      (!row.placeLabel && !!row.country);

    if (isCountryHome) {
      const placeId = row.countryPlaceId || row._id;
      const name = (row.country || row.placeLabel || row.display || '').trim();
      add(placeId, name, 'country', row.tipWeight, row.count);
      continue;
    }

    const name = (row.placeLabel || (row.display || '').split(',')[0] || '').trim();
    add(row._id, name, featureType || 'place', row.tipWeight, row.count);
  }

  const ranked = [...byPlaceId.values()].sort(
    (a, b) => b.tipWeight - a.tipWeight || b.count - a.count || a.name.localeCompare(b.name)
  );

  const cities = ranked.filter((p) => p.featureType !== 'country');
  const chosen = (cities.length > 0 ? cities : ranked).slice(0, limit);

  return chosen.map(({ placeId, name, featureType }) => ({ placeId, name, featureType }));
}

/**
 * Rank tagged media by tip aggregate within a rolling time window.
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
        // Queue cards read globalMediaAggregate for tip display
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

function catalogMatchOr(variants) {
  return [
    { tags: { $in: variants } },
    { genres: { $in: variants } },
    { category: { $in: variants } },
  ];
}

async function findMusicMediaForTag({
  releaseYear,
  bpm,
  displayName,
  canonicalTag,
  selectFields,
}) {
  if (typeof releaseYear === 'number') {
    return Media.find({
      status: 'active',
      contentType: 'music',
      contentForm: { $nin: PODCAST_FORMS },
      releaseYear,
    })
      .sort({ globalMediaAggregate: -1, createdAt: -1 })
      .select(selectFields)
      .populate('addedBy', ADDED_BY_FIELDS)
      .lean();
  }

  if (typeof bpm === 'number') {
    return Media.find({
      status: 'active',
      contentType: 'music',
      contentForm: { $nin: PODCAST_FORMS },
      ...mediaBpmQuery(bpm),
    })
      .sort({ globalMediaAggregate: -1, createdAt: -1 })
      .select(selectFields)
      .populate('addedBy', ADDED_BY_FIELDS)
      .lean();
  }

  const variants = collectTagVariants(displayName, canonicalTag);
  const baseQuery = {
    status: 'active',
    contentType: 'music',
    contentForm: { $nin: PODCAST_FORMS },
    tags: { $exists: true, $ne: [] },
  };

  let pool = await Media.find({
    ...baseQuery,
    tags: { $in: variants },
  })
    .sort({ globalMediaAggregate: -1, createdAt: -1 })
    .select(selectFields)
    .populate('addedBy', ADDED_BY_FIELDS)
    .lean();

  if (pool.length === 0) {
    pool = await Media.find(baseQuery)
      .sort({ globalMediaAggregate: -1, createdAt: -1 })
      .limit(500)
      .select(selectFields)
      .populate('addedBy', ADDED_BY_FIELDS)
      .lean();
  }

  return pool.filter((item) => itemMatchesTag(item, displayName));
}

async function findPodcastMediaForTag({ displayName, canonicalTag, selectFields }) {
  const variants = collectTagVariants(displayName, canonicalTag);
  const seriesBase = {
    contentType: { $in: ['spoken'] },
    contentForm: { $in: ['podcastseries'] },
    status: { $nin: ['vetoed', 'deleted'] },
  };
  const episodeBase = {
    contentType: { $in: ['spoken'] },
    contentForm: { $in: ['podcastepisode'] },
    status: { $nin: ['vetoed', 'deleted'] },
  };

  let seriesPool = await Media.find({
    ...seriesBase,
    $or: catalogMatchOr(variants),
  })
    .select('_id tags genres category')
    .lean();

  if (seriesPool.length === 0) {
    seriesPool = await Media.find(seriesBase)
      .sort({ globalMediaAggregate: -1, createdAt: -1 })
      .limit(400)
      .select('_id tags genres category')
      .lean();
  }

  const matchingSeriesIds = seriesPool
    .filter((item) => itemMatchesTag(item, displayName, { includeCatalogFields: true }))
    .map((item) => item._id);
  const matchingSeriesIdSet = new Set(matchingSeriesIds.map((id) => id.toString()));

  const episodeOr = catalogMatchOr(variants);
  if (matchingSeriesIds.length > 0) {
    episodeOr.push({ podcastSeries: { $in: matchingSeriesIds } });
  }

  let pool = await Media.find({ ...episodeBase, $or: episodeOr })
    .sort({ globalMediaAggregate: -1, createdAt: -1 })
    .select(selectFields)
    .populate('addedBy', ADDED_BY_FIELDS)
    .populate('podcastSeries', PODCAST_SERIES_FIELDS)
    .lean();

  if (pool.length === 0) {
    pool = await Media.find(episodeBase)
      .sort({ globalMediaAggregate: -1, createdAt: -1 })
      .limit(500)
      .select(selectFields)
      .populate('addedBy', ADDED_BY_FIELDS)
      .populate('podcastSeries', PODCAST_SERIES_FIELDS)
      .lean();
  }

  return pool.filter((item) => {
    if (itemMatchesTag(item, displayName, { includeCatalogFields: true })) return true;
    const seriesRef = item.podcastSeries;
    const seriesId = seriesRef && (typeof seriesRef === 'object' ? seriesRef._id : seriesRef);
    return seriesId && matchingSeriesIdSet.has(seriesId.toString());
  });
}

/**
 * Fetch tag profile: media ranked by tip aggregate, stats, related party.
 */
async function getTagProfile(rawSlug, { page = 1, limit = 50, timePeriod = 'all-time', type } = {}) {
  const resolved = await resolveTagFromSlug(rawSlug);
  if (!resolved) {
    const err = new Error('Tag not found');
    err.status = 404;
    throw err;
  }

  const { displayName, canonicalTag, slug, party, releaseYear, bpm, kind } = resolved;
  const limitNum = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 100);
  const pageNum = Math.max(parseInt(page, 10) || 1, 1);
  const skip = (pageNum - 1) * limitNum;
  const period = VALID_TIME_PERIODS.has(timePeriod) ? timePeriod : 'all-time';
  const startDate = getPeriodStartDate(period);
  const isVirtualTag = typeof releaseYear === 'number' || typeof bpm === 'number';
  const contentScope = isVirtualTag ? 'music' : parseContentScope(type);

  const MEDIA_FIELDS = 'title artist featuring creatorNames coverArt sources globalMediaAggregate tags genres category uuid contentType contentForm duration bpm releaseDate releaseYear primaryLocation rightsStatus rightsCleared podcastTitle podcastSeries description';

  const matched = contentScope === 'podcast'
    ? await findPodcastMediaForTag({ displayName, canonicalTag, selectFields: MEDIA_FIELDS })
    : await findMusicMediaForTag({
        releaseYear,
        bpm,
        displayName,
        canonicalTag,
        selectFields: MEDIA_FIELDS,
      });

  // Related chips stay all-time (stable header); ranked list re-ranks by period
  const relatedTags = computeRelatedTags(matched, displayName, {
    limit: 8,
    includeCatalogFields: contentScope === 'podcast',
  });
  const topOriginPlaces = computeTopOriginPlaces(matched, { limit: 3 });
  const topSupportPlaces = await computeTopSupportPlaces(
    matched.map((m) => m._id),
    { limit: 3 }
  );

  const ranked = startDate
    ? await rankMatchedMediaByPeriod(matched, startDate)
    : matched;

  const total = ranked.length;
  const pageSlice = ranked.slice(skip, skip + limitNum);
  const tipTotal = ranked.reduce((sum, m) => sum + (m.globalMediaAggregate || 0), 0);

  // Attach active bids (with tipper user info) for supporters display on the page slice only
  const bidsByMediaId = await loadBidsByMediaId(pageSlice.map((m) => m._id));
  const media = pageSlice.map((m) => ({
    ...m,
    ...enrichMediaWithPlayability(m),
    bids: bidsByMediaId.get(m._id.toString()) || [],
  }));

  let relatedParty = null;
  if (party) {
    relatedParty = {
      _id: party._id,
      name: party.name,
      slug: party.slug,
      description: party.description,
      tags: party.tags,
    };
  }

  return {
    tag: {
      name: displayName,
      slug,
      canonicalTag,
      kind: kind || (releaseYear != null ? 'year' : bpm != null ? 'bpm' : 'tag'),
    },
    timePeriod: period,
    contentScope,
    stats: {
      mediaCount: total,
      globalTagAggregate: tipTotal,
    },
    relatedParty,
    relatedTags,
    topOriginPlaces,
    topSupportPlaces,
    media,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      pages: Math.ceil(total / limitNum) || 0,
    },
  };
}

module.exports = {
  resolveTagFromSlug,
  getTagProfile,
  generateSlug,
  collectTagVariants,
  collectTagLabels,
  catalogMatchOr,
  itemMatchesTag,
  parseContentScope,
  computeRelatedTags,
  computeTopOriginPlaces,
  computeTopSupportPlaces,
  parseReleaseYearFromSlug,
  parseBpmFromSlug,
  mediaBpmQuery,
  PODCAST_FORMS,
};
