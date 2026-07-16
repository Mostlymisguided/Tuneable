/**
 * Champions — social status rankings by tip aggregate,
 * scoped to media, tag, or artist; optionally filtered by Mapbox place.
 */

const mongoose = require('mongoose');
const Bid = require('../models/Bid');
const Media = require('../models/Media');
const { isValidObjectId } = require('../utils/validators');
const { resolveTagFromSlug, collectTagVariants } = require('./tagProfileService');
const { tagsMatch } = require('../utils/tagNormalizer');

/** Minimum distinct tippers in-scope before crowning Champions. */
const MIN_TIPPERS_FOR_CHAMPION = 1;

/** Top N tippers are titled Champions (#1 / #2 / #3). */
const CHAMPION_PODIUM_SIZE = 3;

const PODCAST_FORMS = ['podcast', 'podcastseries', 'episode', 'podcastepisode'];

/**
 * Resolve media UUID or ObjectId to a Media document _id.
 * @param {string} mediaId
 * @returns {Promise<mongoose.Types.ObjectId|null>}
 */
async function resolveMediaObjectId(mediaId) {
  if (!mediaId || typeof mediaId !== 'string') return null;

  if (isValidObjectId(mediaId)) {
    const exists = await Media.exists({ _id: mediaId });
    return exists ? new mongoose.Types.ObjectId(mediaId) : null;
  }

  const media = await Media.findOne({ uuid: mediaId }).select('_id').lean();
  return media?._id || null;
}

/**
 * Resolve user UUID or ObjectId.
 * @param {string} userId
 * @returns {Promise<mongoose.Types.ObjectId|null>}
 */
async function resolveUserObjectId(userId) {
  if (!userId || typeof userId !== 'string') return null;

  if (isValidObjectId(userId)) {
    return new mongoose.Types.ObjectId(userId);
  }

  const User = require('../models/User');
  const user = await User.findOne({ uuid: userId }).select('_id').lean();
  return user?._id || null;
}

/**
 * Shared bid aggregation + podium formatting.
 * @param {object} match - Bid $match filter
 * @param {object} options
 * @param {string} [options.locationPlaceId]
 * @param {number} [options.limit]
 * @param {object} [options.meta] - Extra fields merged into response (entityType, tag, artist, etc.)
 */
async function aggregateChampionsForMatch(match, options = {}) {
  const limit = Math.min(Math.max(parseInt(options.limit, 10) || 10, 1), 50);
  const locationPlaceId =
    typeof options.locationPlaceId === 'string' && options.locationPlaceId.trim()
      ? options.locationPlaceId.trim()
      : null;

  const bidMatch = {
    ...match,
    status: 'active',
  };

  if (locationPlaceId) {
    bidMatch.bidderLocationAncestorIds = locationPlaceId;
  }

  const rankings = await Bid.aggregate([
    { $match: bidMatch },
    {
      $group: {
        _id: '$userId',
        totalAmount: { $sum: '$amount' },
        bidCount: { $sum: 1 },
        locationDisplay: { $first: '$bidderLocationDisplay' },
      },
    },
    { $sort: { totalAmount: -1, bidCount: -1 } },
    { $limit: limit },
    {
      $lookup: {
        from: 'users',
        localField: '_id',
        foreignField: '_id',
        as: 'user',
      },
    },
    { $unwind: { path: '$user', preserveNullAndEmptyArrays: false } },
    {
      $project: {
        _id: 0,
        userId: '$_id',
        totalAmount: 1,
        bidCount: 1,
        locationDisplay: 1,
        user: {
          _id: '$user._id',
          uuid: '$user.uuid',
          username: '$user.username',
          profilePic: '$user.profilePic',
        },
      },
    },
  ]);

  const scopeStats = await Bid.aggregate([
    { $match: bidMatch },
    {
      $group: {
        _id: null,
        totalAmount: { $sum: '$amount' },
        bidCount: { $sum: 1 },
        tipperIds: { $addToSet: '$userId' },
      },
    },
    {
      $project: {
        _id: 0,
        totalAmount: 1,
        bidCount: 1,
        tipperCount: { $size: '$tipperIds' },
      },
    },
  ]);

  const stats = scopeStats[0] || { totalAmount: 0, bidCount: 0, tipperCount: 0 };
  const tipperCount = stats.tipperCount || 0;
  const hasChampions = tipperCount >= MIN_TIPPERS_FOR_CHAMPION && rankings.length > 0;

  const ranked = rankings.map((row, index) => {
    const rank = index + 1;
    return {
      rank,
      totalAmount: row.totalAmount,
      bidCount: row.bidCount,
      locationDisplay: row.locationDisplay || null,
      user: {
        _id: row.user._id,
        uuid: row.user.uuid,
        username: row.user.username,
        profilePic: row.user.profilePic || null,
      },
      isChampion: hasChampions && rank <= CHAMPION_PODIUM_SIZE,
      medal: hasChampions && rank <= CHAMPION_PODIUM_SIZE
        ? (['gold', 'silver', 'bronze'][index] || null)
        : null,
    };
  });

  const champions = hasChampions ? ranked.slice(0, CHAMPION_PODIUM_SIZE) : [];

  return {
    entityType: options.meta?.entityType || 'media',
    ...options.meta,
    scope: locationPlaceId ? 'place' : 'global',
    locationPlaceId,
    tipperCount,
    totalAmount: stats.totalAmount || 0,
    bidCount: stats.bidCount || 0,
    hasChampions,
    /** @deprecated Prefer `hasChampions` / `champions` */
    hasChampion: hasChampions,
    champions,
    champion: champions[0] || null,
    rankings: ranked,
    podiumSize: CHAMPION_PODIUM_SIZE,
    minTippersForChampion: MIN_TIPPERS_FOR_CHAMPION,
  };
}

/**
 * Media IDs for all active music tagged with this slug (canonical matching).
 */
async function resolveTagMediaIds(rawSlug) {
  const resolved = await resolveTagFromSlug(rawSlug);
  if (!resolved) return null;

  const { displayName, canonicalTag, slug } = resolved;
  const variants = collectTagVariants(displayName, canonicalTag);

  const baseQuery = {
    status: 'active',
    contentType: 'music',
    contentForm: { $nin: PODCAST_FORMS },
    tags: { $exists: true, $ne: [] },
  };

  const candidates = await Media.find({
    ...baseQuery,
    tags: { $in: variants },
  })
    .select('_id tags')
    .lean();

  let pool = candidates;
  if (pool.length === 0) {
    pool = await Media.find(baseQuery)
      .sort({ globalMediaAggregate: -1 })
      .limit(500)
      .select('_id tags')
      .lean();
  }

  const mediaIds = pool
    .filter((item) => {
      if (!item.tags || !Array.isArray(item.tags)) return false;
      return item.tags.some((t) => typeof t === 'string' && tagsMatch(t, displayName));
    })
    .map((m) => m._id);

  return {
    tag: { name: displayName, slug, canonicalTag },
    mediaIds,
  };
}

/**
 * Aggregate tip champions for a media item.
 */
async function getMediaChampions(mediaId, options = {}) {
  const mediaObjectId = await resolveMediaObjectId(mediaId);
  if (!mediaObjectId) return null;

  return aggregateChampionsForMatch(
    { mediaId: mediaObjectId },
    { ...options, meta: { entityType: 'media', mediaId } }
  );
}

/**
 * Aggregate tip champions across all media with a tag.
 */
async function getTagChampions(tagSlug, options = {}) {
  const resolved = await resolveTagMediaIds(tagSlug);
  if (!resolved) return null;

  if (resolved.mediaIds.length === 0) {
    return {
      entityType: 'tag',
      tag: resolved.tag,
      scope: options.locationPlaceId ? 'place' : 'global',
      locationPlaceId: options.locationPlaceId || null,
      tipperCount: 0,
      totalAmount: 0,
      bidCount: 0,
      hasChampions: false,
      hasChampion: false,
      champions: [],
      champion: null,
      rankings: [],
      podiumSize: CHAMPION_PODIUM_SIZE,
      minTippersForChampion: MIN_TIPPERS_FOR_CHAMPION,
    };
  }

  return aggregateChampionsForMatch(
    { mediaId: { $in: resolved.mediaIds } },
    { ...options, meta: { entityType: 'tag', tag: resolved.tag } }
  );
}

/**
 * Aggregate tip champions across an artist's catalog.
 * Prefer verified userId; fall back to case-insensitive artist.name match.
 */
async function getArtistChampions({ userId, name } = {}, options = {}) {
  let mediaQuery = {
    status: 'active',
    contentType: 'music',
    contentForm: { $nin: PODCAST_FORMS },
  };

  let artistLabel = typeof name === 'string' ? name.trim() : null;
  let artistUserId = null;

  if (userId) {
    artistUserId = await resolveUserObjectId(userId);
    if (!artistUserId) return null;
    mediaQuery['artist.userId'] = artistUserId;

    if (!artistLabel) {
      const User = require('../models/User');
      const user = await User.findById(artistUserId)
        .select('username creatorProfile.artistName')
        .lean();
      artistLabel = user?.creatorProfile?.artistName || user?.username || 'Artist';
    }
  } else if (artistLabel) {
    const escaped = artistLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    mediaQuery['artist.name'] = new RegExp(`^${escaped}$`, 'i');
  } else {
    return null;
  }

  const mediaIds = await Media.find(mediaQuery).distinct('_id');
  if (!mediaIds.length) {
    return {
      entityType: 'artist',
      artist: { userId: artistUserId, name: artistLabel },
      scope: options.locationPlaceId ? 'place' : 'global',
      locationPlaceId: options.locationPlaceId || null,
      tipperCount: 0,
      totalAmount: 0,
      bidCount: 0,
      hasChampions: false,
      hasChampion: false,
      champions: [],
      champion: null,
      rankings: [],
      podiumSize: CHAMPION_PODIUM_SIZE,
      minTippersForChampion: MIN_TIPPERS_FOR_CHAMPION,
    };
  }

  return aggregateChampionsForMatch(
    { mediaId: { $in: mediaIds } },
    {
      ...options,
      meta: {
        entityType: 'artist',
        artist: { userId: artistUserId, name: artistLabel },
      },
    }
  );
}

module.exports = {
  getMediaChampions,
  getTagChampions,
  getArtistChampions,
  resolveMediaObjectId,
  resolveTagMediaIds,
  aggregateChampionsForMatch,
  MIN_TIPPERS_FOR_CHAMPION,
  CHAMPION_PODIUM_SIZE,
};
