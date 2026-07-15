const Media = require('../models/Media');
const Party = require('../models/Party');
const {
  getCanonicalTag,
  normalizeTagForMatching,
  tagsMatch,
  TAG_ALIASES,
} = require('../utils/tagNormalizer');
const { generateSlug, capitalizeTag, getExistingTagParty } = require('./tagPartyService');

const PODCAST_FORMS = ['podcast', 'podcastseries', 'episode', 'podcastepisode'];

/**
 * Resolve a URL slug into display name + canonical matching key.
 * Prefers an existing tag party when present (stable name/slug).
 */
async function resolveTagFromSlug(rawSlug) {
  if (!rawSlug || typeof rawSlug !== 'string') return null;

  const slug = decodeURIComponent(rawSlug).trim().toLowerCase();
  if (!slug) return null;

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
      || capitalizeTag(nameFromSlug);
  } else {
    // Prefer alias display forms (e.g. "Hip Hop") when available
    const aliasForm = TAG_ALIASES[normalizeTagForMatching(nameFromSlug)];
    displayName = (aliasForm && /^[A-Z]/.test(aliasForm))
      ? aliasForm
      : capitalizeTag(nameFromSlug);
  }

  const canonicalTag = party?.canonicalTag || getCanonicalTag(displayName);
  const resolvedSlug = party?.slug || generateSlug(displayName) || slug;

  return {
    displayName,
    canonicalTag,
    slug: resolvedSlug,
    party: party || null,
  };
}

/**
 * Build a set of plausible stored tag strings for Mongo $in lookups.
 */
function collectTagVariants(displayName, canonicalTag) {
  const variants = new Set();
  const seeds = [displayName, canonicalTag, displayName.replace(/\s+/g, '')];

  for (const seed of seeds) {
    if (!seed || typeof seed !== 'string') continue;
    variants.add(seed);
    variants.add(seed.toLowerCase());
    variants.add(capitalizeTag(seed));
  }

  for (const [normKey, aliasValue] of Object.entries(TAG_ALIASES)) {
    if (tagsMatch(normKey, displayName) || tagsMatch(aliasValue, displayName)) {
      variants.add(aliasValue);
      variants.add(normKey);
      variants.add(capitalizeTag(normKey));
      // Spaced guess from collapsed key (deephouse → deep house)
      if (!normKey.includes(' ') && normKey.length > 4) {
        // Skip inventing spaces; alias value already has correct form
      }
    }
  }

  return [...variants].filter(Boolean);
}

/**
 * Fetch tag profile: media ranked by tip aggregate, stats, related party.
 */
async function getTagProfile(rawSlug, { page = 1, limit = 50 } = {}) {
  const resolved = await resolveTagFromSlug(rawSlug);
  if (!resolved) {
    const err = new Error('Tag not found');
    err.status = 404;
    throw err;
  }

  const { displayName, canonicalTag, slug, party } = resolved;
  const limitNum = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 100);
  const pageNum = Math.max(parseInt(page, 10) || 1, 1);
  const skip = (pageNum - 1) * limitNum;

  const variants = collectTagVariants(displayName, canonicalTag);

  const baseQuery = {
    status: 'active',
    contentType: 'music',
    contentForm: { $nin: PODCAST_FORMS },
    tags: { $exists: true, $ne: [] },
  };

  // Broad candidate set via indexed tags field, then fuzzy-filter
  const candidates = await Media.find({
    ...baseQuery,
    tags: { $in: variants },
  })
    .sort({ globalMediaAggregate: -1, createdAt: -1 })
    .select('title artist featuring creatorNames coverArt sources globalMediaAggregate tags uuid contentType contentForm duration bids')
    .populate('addedBy', 'username profilePic uuid')
    .lean();

  // Fallback: if $in found nothing (casing / spelling drift), scan top tipped music
  let pool = candidates;
  if (pool.length === 0) {
    pool = await Media.find(baseQuery)
      .sort({ globalMediaAggregate: -1, createdAt: -1 })
      .limit(500)
      .select('title artist featuring creatorNames coverArt sources globalMediaAggregate tags uuid contentType contentForm duration bids')
      .populate('addedBy', 'username profilePic uuid')
      .lean();
  }

  const matched = pool.filter((item) => {
    if (!item.tags || !Array.isArray(item.tags)) return false;
    return item.tags.some((t) => typeof t === 'string' && tagsMatch(t, displayName));
  });

  const total = matched.length;
  const media = matched.slice(skip, skip + limitNum);
  const tipTotal = matched.reduce((sum, m) => sum + (m.globalMediaAggregate || 0), 0);

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
    },
    stats: {
      mediaCount: total,
      globalTagAggregate: tipTotal,
    },
    relatedParty,
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
};
