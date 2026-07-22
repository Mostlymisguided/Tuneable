/**
 * Slim Global Party chart helpers.
 * Avoids loading every active bid + full Global Party embedded media[] on read paths.
 */
const mongoose = require('mongoose');
const Media = require('../models/Media');
const Bid = require('../models/Bid');
const User = require('../models/User');
const { DEFAULT_COVER_ART } = require('./coverArtUtils');

const GLOBAL_PARTY_TUNES_FILTER = {
  contentType: { $in: ['music'] },
  contentForm: { $in: ['tune'] },
};

const MEDIA_CHART_SELECT = [
  'title',
  'artist',
  'featuring',
  'coverArt',
  'sources',
  'duration',
  'tags',
  'category',
  'bpm',
  'releaseDate',
  'releaseYear',
  'uuid',
  'globalMediaAggregate',
  'globalMediaBidTop',
  'globalMediaBidTopUser',
  'globalMediaAggregateTop',
  'globalMediaAggregateTopUser',
  'addedBy',
  'status',
  'createdAt',
  'creatorDisplay',
  'contentType',
  'contentForm',
].join(' ');

const USER_PUBLIC_SELECT = 'username profilePic uuid homeLocation secondaryLocation';
const DEFAULT_SUPPORTERS_LIMIT = 5;

function sourcesToObject(sources) {
  const sourcesObj = {};
  if (!sources) return sourcesObj;
  if (sources instanceof Map) {
    sources.forEach((value, key) => {
      if (value) sourcesObj[key] = value;
    });
  } else if (typeof sources === 'object') {
    Object.entries(sources).forEach(([key, value]) => {
      if (value) sourcesObj[key] = value;
    });
  }
  return sourcesObj;
}

function artistNameFromMedia(media) {
  if (Array.isArray(media.artist) && media.artist.length > 0) {
    return media.artist[0].name;
  }
  return media.artist || 'Unknown Artist';
}

/**
 * Period start for chart filters (matches partyRoutes sorted endpoint rolling windows).
 */
function getPeriodStartDate(timePeriod) {
  const now = new Date();
  switch (timePeriod) {
    case 'today':
      return new Date(now.getTime() - (24 * 60 * 60 * 1000));
    case 'this-week':
      return new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));
    case 'this-month':
      return new Date(now.getTime() - (28 * 24 * 60 * 60 * 1000));
    case 'this-year':
      return new Date(now.getTime() - (365 * 24 * 60 * 60 * 1000));
    case 'all-time':
    default:
      return null;
  }
}

/**
 * Load top N active bids per media (by amount), optionally merging the viewer's own bids.
 */
async function loadTopSupportersByMedia(mediaIds, {
  supportersLimit = DEFAULT_SUPPORTERS_LIMIT,
  userId = null,
  locationPlaceId = null,
  startDate = null,
} = {}) {
  if (!mediaIds.length) {
    return new Map();
  }

  const match = {
    mediaId: { $in: mediaIds },
    status: 'active',
  };
  if (startDate) {
    match.createdAt = { $gte: startDate };
  }
  if (locationPlaceId) {
    match.bidderLocationAncestorIds = locationPlaceId;
  }

  // Rank within each media so we never materialize full bid arrays in memory
  const pipeline = [
    { $match: match },
    {
      $setWindowFields: {
        partitionBy: '$mediaId',
        sortBy: { amount: -1 },
        output: { rank: { $documentNumber: {} } },
      },
    },
    { $match: { rank: { $lte: supportersLimit } } },
    {
      $project: {
        mediaId: 1,
        userId: 1,
        amount: 1,
        status: 1,
        createdAt: 1,
        bidderLocationDisplay: 1,
        bidderLocationAncestorIds: 1,
        bidderHomePlaceId: 1,
      },
    },
  ];

  const topRows = await Bid.aggregate(pipeline);
  const byMedia = new Map();
  for (const bid of topRows) {
    const key = bid.mediaId.toString();
    if (!byMedia.has(key)) byMedia.set(key, []);
    byMedia.get(key).push({
      _id: bid._id,
      userId: bid.userId,
      amount: bid.amount,
      status: bid.status,
      createdAt: bid.createdAt,
      bidderLocationDisplay: bid.bidderLocationDisplay,
      bidderLocationAncestorIds: bid.bidderLocationAncestorIds,
      bidderHomePlaceId: bid.bidderHomePlaceId,
    });
  }

  if (userId) {
    const viewerMatch = {
      mediaId: { $in: mediaIds },
      userId: new mongoose.Types.ObjectId(userId),
      status: 'active',
    };
    if (startDate) {
      viewerMatch.createdAt = { $gte: startDate };
    }
    if (locationPlaceId) {
      viewerMatch.bidderLocationAncestorIds = locationPlaceId;
    }

    const viewerBids = await Bid.find(viewerMatch)
      .select('_id userId amount status createdAt bidderLocationDisplay bidderLocationAncestorIds bidderHomePlaceId mediaId')
      .lean();

    for (const bid of viewerBids) {
      const key = bid.mediaId.toString();
      const existing = byMedia.get(key) || [];
      if (!existing.some((b) => b._id.toString() === bid._id.toString())) {
        existing.push({
          _id: bid._id,
          userId: bid.userId,
          amount: bid.amount,
          status: bid.status,
          createdAt: bid.createdAt,
          bidderLocationDisplay: bid.bidderLocationDisplay,
          bidderLocationAncestorIds: bid.bidderLocationAncestorIds,
          bidderHomePlaceId: bid.bidderHomePlaceId,
        });
        byMedia.set(key, existing);
      }
    }
  }

  // Populate user stubs for all bid userIds in one query
  const userIds = new Set();
  for (const bids of byMedia.values()) {
    for (const bid of bids) {
      if (bid.userId) userIds.add(bid.userId.toString());
    }
  }

  const users = userIds.size
    ? await User.find({ _id: { $in: [...userIds] } }).select(USER_PUBLIC_SELECT).lean()
    : [];
  const usersById = new Map(users.map((u) => [u._id.toString(), u]));

  for (const [mediaKey, bids] of byMedia.entries()) {
    byMedia.set(
      mediaKey,
      bids.map((bid) => ({
        ...bid,
        userId: usersById.get(bid.userId?.toString()) || bid.userId,
      }))
    );
  }

  return byMedia;
}

/**
 * Country tip volume from Bid location snapshots (no full bid populate).
 */
async function computeTopLocations({ startDate = null, limit = 30 } = {}) {
  const match = { status: 'active', bidderHomePlaceId: { $exists: true, $ne: null } };
  if (startDate) {
    match.createdAt = { $gte: startDate };
  }

  const rows = await Bid.aggregate([
    { $match: match },
    {
      $group: {
        _id: '$bidderHomePlaceId',
        total: { $sum: '$amount' },
        count: { $sum: 1 },
        display: { $first: '$bidderLocationDisplay' },
      },
    },
    { $sort: { total: -1, count: -1 } },
    { $limit: limit },
  ]);

  return rows.map((row) => {
    const display = row.display || '';
    // Display is often "City, Country" — take last segment as country label
    const parts = display.split(',').map((p) => p.trim()).filter(Boolean);
    const country = parts.length ? parts[parts.length - 1] : 'Unknown';
    return {
      placeId: row._id,
      country,
      countryCode: '',
      display: country,
      total: row.total,
      count: row.count,
    };
  });
}

/**
 * All-time Global Party chart: tipped tunes sorted by stored aggregate, slim supporters.
 */
async function fetchAllTimeGlobalChart({
  userId = null,
  supportersLimit = DEFAULT_SUPPORTERS_LIMIT,
  limit = null,
  offset = 0,
} = {}) {
  const startTime = Date.now();

  const query = Media.find({
    ...GLOBAL_PARTY_TUNES_FILTER,
    bids: { $exists: true, $ne: [] },
    status: { $ne: 'vetoed' },
  })
    .select(MEDIA_CHART_SELECT)
    .sort({ globalMediaAggregate: -1 })
    .populate('globalMediaBidTopUser', USER_PUBLIC_SELECT)
    .populate('globalMediaAggregateTopUser', USER_PUBLIC_SELECT)
    .populate('addedBy', 'username profilePic uuid')
    .lean();

  if (typeof offset === 'number' && offset > 0) {
    query.skip(offset);
  }
  if (typeof limit === 'number' && limit > 0) {
    query.limit(limit);
  }

  const mediaList = await query;
  const mediaIds = mediaList.map((m) => m._id);
  const supportersByMedia = await loadTopSupportersByMedia(mediaIds, {
    supportersLimit,
    userId,
  });

  const chartMedia = mediaList.map((media) => {
    const activeBids = supportersByMedia.get(media._id.toString()) || [];
    const aggregate = media.globalMediaAggregate || 0;
    const sourcesObj = sourcesToObject(media.sources);

    return {
      _id: media._id,
      id: media._id || media.uuid,
      uuid: media._id || media.uuid,
      title: media.title,
      artist: artistNameFromMedia(media),
      artists: Array.isArray(media.artist) ? media.artist : [],
      featuring: media.featuring || [],
      creatorDisplay: media.creatorDisplay,
      duration: media.duration || '666',
      coverArt: media.coverArt || DEFAULT_COVER_ART,
      sources: sourcesObj,
      globalMediaAggregate: aggregate,
      partyMediaAggregate: aggregate,
      totalBidValue: aggregate,
      bids: activeBids,
      addedBy: media.addedBy,
      tags: media.tags || [],
      category: media.category || 'Unknown',
      bpm: media.bpm ?? null,
      releaseDate: media.releaseDate || null,
      releaseYear: media.releaseYear ?? null,
      partyMediaBidTop: media.globalMediaBidTop || 0,
      partyMediaBidTopUser: media.globalMediaBidTopUser,
      partyMediaAggregateTop: media.globalMediaAggregateTop || 0,
      partyMediaAggregateTopUser: media.globalMediaAggregateTopUser,
      globalMediaBidTop: media.globalMediaBidTop || 0,
      globalMediaBidTopUser: media.globalMediaBidTopUser,
      globalMediaAggregateTop: media.globalMediaAggregateTop || 0,
      globalMediaAggregateTopUser: media.globalMediaAggregateTopUser,
      status: 'active',
      queuedAt: media.createdAt || new Date(),
      playedAt: null,
      completedAt: null,
      vetoedAt: null,
      vetoedBy: null,
      vetoedBy_uuid: null,
      vetoedReason: null,
      contentType: media.contentType || 'music',
    };
  });

  const topLocations = await computeTopLocations({ startDate: null });

  return {
    media: chartMedia,
    topLocations,
    meta: {
      count: chartMedia.length,
      processingTimeMs: Date.now() - startTime,
      supportersLimit,
      limited: typeof limit === 'number' && limit > 0,
      offset: offset || 0,
    },
  };
}

/**
 * Period / location Global Party chart.
 */
async function fetchPeriodGlobalChart({
  timePeriod = 'today',
  locationPlaceId = null,
  userId = null,
  supportersLimit = DEFAULT_SUPPORTERS_LIMIT,
  limit = null,
  offset = 0,
} = {}) {
  const startTime = Date.now();
  const startDate = getPeriodStartDate(timePeriod);

  const bidQuery = { status: 'active' };
  if (startDate) {
    bidQuery.createdAt = { $gte: startDate };
  }
  if (locationPlaceId) {
    bidQuery.bidderLocationAncestorIds = locationPlaceId;
  }

  const periodBids = await Bid.find(bidQuery)
    .select('mediaId amount')
    .lean();

  const mediaBidValues = {};
  for (const bid of periodBids) {
    const mediaId = bid.mediaId?.toString();
    if (!mediaId) continue;
    mediaBidValues[mediaId] = (mediaBidValues[mediaId] || 0) + bid.amount;
  }

  const matchingMediaIds = Object.keys(mediaBidValues);
  if (matchingMediaIds.length === 0) {
    return {
      media: [],
      topLocations: await computeTopLocations({ startDate }),
      meta: {
        count: 0,
        processingTimeMs: Date.now() - startTime,
        supportersLimit,
        limited: typeof limit === 'number' && limit > 0,
        offset: offset || 0,
      },
    };
  }

  let mediaList = await Media.find({
    ...GLOBAL_PARTY_TUNES_FILTER,
    _id: { $in: matchingMediaIds },
    status: { $ne: 'vetoed' },
  })
    .select(MEDIA_CHART_SELECT)
    .populate('globalMediaBidTopUser', USER_PUBLIC_SELECT)
    .populate('globalMediaAggregateTopUser', USER_PUBLIC_SELECT)
    .populate('addedBy', 'username profilePic uuid')
    .populate({
      path: 'artist.userId',
      model: 'User',
      select: 'username profilePic uuid creatorProfile.artistName',
    })
    .populate({
      path: 'artist.collectiveId',
      model: 'Collective',
      select: 'name slug profilePicture verificationStatus',
    })
    .populate({
      path: 'featuring.userId',
      model: 'User',
      select: 'username profilePic uuid creatorProfile.artistName',
    })
    .lean();

  mediaList = mediaList
    .map((media) => ({
      media,
      timePeriodBidValue: mediaBidValues[media._id.toString()] || 0,
    }))
    .filter((row) => row.timePeriodBidValue > 0)
    .sort((a, b) => b.timePeriodBidValue - a.timePeriodBidValue);

  if (typeof offset === 'number' && offset > 0) {
    mediaList = mediaList.slice(offset);
  }
  if (typeof limit === 'number' && limit > 0) {
    mediaList = mediaList.slice(0, limit);
  }

  const pageMediaIds = mediaList.map((row) => row.media._id);
  const supportersByMedia = await loadTopSupportersByMedia(pageMediaIds, {
    supportersLimit,
    userId,
    locationPlaceId,
    startDate,
  });

  const chartMedia = mediaList.map(({ media, timePeriodBidValue }) => {
    const activeBids = supportersByMedia.get(media._id.toString()) || [];
    const sourcesObj = sourcesToObject(media.sources);
    const availablePlatforms = Object.entries(sourcesObj).map(([platform, url]) => ({
      platform,
      url,
    }));

    return {
      _id: media._id,
      id: media._id || media.uuid,
      uuid: media._id || media.uuid,
      title: media.title,
      artist: artistNameFromMedia(media),
      artists: Array.isArray(media.artist) ? media.artist : [],
      featuring: media.featuring || [],
      creatorDisplay: media.creatorDisplay,
      duration: media.duration,
      coverArt: media.coverArt || DEFAULT_COVER_ART,
      sources: sourcesObj,
      availablePlatforms,
      globalMediaAggregate: media.globalMediaAggregate || 0,
      partyMediaAggregate: timePeriodBidValue,
      timePeriodBidValue,
      totalBidValue: timePeriodBidValue,
      bids: activeBids,
      tags: media.tags || [],
      category: media.category || null,
      bpm: media.bpm ?? null,
      releaseDate: media.releaseDate || null,
      releaseYear: media.releaseYear ?? null,
      addedBy: media.addedBy,
      status: 'active',
      queuedAt: media.createdAt || new Date(),
      playedAt: null,
      completedAt: null,
      vetoedAt: null,
      vetoedBy: null,
      contentType: media.contentType || 'music',
    };
  });

  return {
    media: chartMedia,
    topLocations: await computeTopLocations({ startDate }),
    meta: {
      count: chartMedia.length,
      processingTimeMs: Date.now() - startTime,
      supportersLimit,
      limited: typeof limit === 'number' && limit > 0,
      offset: offset || 0,
    },
  };
}

module.exports = {
  GLOBAL_PARTY_TUNES_FILTER,
  DEFAULT_SUPPORTERS_LIMIT,
  getPeriodStartDate,
  fetchAllTimeGlobalChart,
  fetchPeriodGlobalChart,
  computeTopLocations,
  loadTopSupportersByMedia,
};
