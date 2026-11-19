/**
 * Personal home queue: New, Heard, and Tipped.
 *
 * New is the playback queue in add order, limited to tunes that have neither
 * an active tip nor a qualified play. Heard is a qualified play (30s or half
 * the tune). Tipped is an active tip. Podcasts and books stay out of this list.
 */

const mongoose = require('mongoose');
const User = require('../models/User');
const Media = require('../models/Media');
const Bid = require('../models/Bid');
const ListeningHistory = require('../models/ListeningHistory');
const { formatMediaArtist } = require('./listeningHistoryService');
const { enrichMediaWithPlayability } = require('../utils/mediaPlayability');
const { isMusicMedia, isWrittenMedia } = require('../utils/mediaKinds');

const BID_SCAN = 400;
const HEARD_SCAN = 200;
const UNHEARD_LIMIT = 100;
const HEARD_LIMIT = 50;

function isListenQueueMusic(media) {
  if (!media || isWrittenMedia(media)) return false;
  return isMusicMedia(media);
}

function timeValue(value) {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

function classifyHomeListenQueue({
  queueEntries = [],
  bids = [],
  heard = [],
  mediaById = {},
  unheardLimit = UNHEARD_LIMIT,
  heardLimit = HEARD_LIMIT,
} = {}) {
  const heardById = new Map();
  heard.forEach((row) => {
    const id = String(row.mediaId || '');
    if (!id) return;
    const previous = heardById.get(id);
    if (!previous || timeValue(row.qualifiedAt) > timeValue(previous.qualifiedAt)) {
      heardById.set(id, row);
    }
  });

  const bidById = new Map();
  bids.forEach((row) => {
    const id = String(row.mediaId || '');
    if (!id) return;
    bidById.set(id, row);
  });

  const queuedAt = new Map();
  const queuedIds = [];
  queueEntries.forEach((entry) => {
    const id = String(entry.mediaId || '');
    if (!id || queuedAt.has(id)) return;
    queuedAt.set(id, entry.addedAt || null);
    queuedIds.push(id);
  });

  const usable = (id) => isListenQueueMusic(mediaById[id]);

  const meta = (id) => {
    const bid = bidById.get(id);
    const heardRow = heardById.get(id);
    return {
      mediaId: id,
      queued: queuedAt.has(id),
      addedAt: queuedAt.get(id) || null,
      heard: Boolean(heardRow),
      qualifiedAt: heardRow ? heardRow.qualifiedAt || null : null,
      tipped: Boolean(bid),
      userBidTotal: bid ? bid.userBidTotal || 0 : 0,
      lastBidAt: bid ? bid.lastBidAt || null : null,
    };
  };

  const unheard = [];
  const seenUnheard = new Set();
  queuedIds.forEach((id) => {
    if (!usable(id) || heardById.has(id) || bidById.has(id) || seenUnheard.has(id)) return;
    seenUnheard.add(id);
    unheard.push(meta(id));
  });

  const heardItems = [...heardById.keys()]
    .filter(usable)
    .sort((a, b) => timeValue(heardById.get(b)?.qualifiedAt) - timeValue(heardById.get(a)?.qualifiedAt))
    .map(meta);

  const tippedCount = [...bidById.keys()].filter(usable).length;

  return {
    unheard: unheard.slice(0, unheardLimit),
    heard: heardItems.slice(0, heardLimit),
    counts: {
      unheard: unheard.length,
      heard: heardItems.length,
      tipped: tippedCount,
    },
  };
}

function decorateQueueItem(item, media) {
  const playability = enrichMediaWithPlayability(media, { authenticated: true });
  return {
    ...item,
    mediaUuid: media.uuid || item.mediaId,
    slug: media.slug || null,
    title: media.title || 'Unknown Title',
    artist: formatMediaArtist(media),
    coverArt: media.coverArt || null,
    duration: media.duration || null,
    contentForm: media.contentForm || [],
    tags: media.tags || [],
    rightsStatus: media.rightsStatus,
    rightsCleared: media.rightsCleared,
    ...playability,
  };
}

async function getHomeListenQueue(userId) {
  const userObjectId = mongoose.Types.ObjectId.isValid(userId)
    ? new mongoose.Types.ObjectId(userId)
    : userId;

  const user = await User.findById(userObjectId).select('playbackQueue').lean();
  const queueEntries = (Array.isArray(user?.playbackQueue) ? user.playbackQueue : []).map((entry) => ({
    mediaId: entry.mediaId,
    addedAt: entry.addedAt,
  }));

  const [bidRows, heardRows] = await Promise.all([
    Bid.aggregate([
      { $match: { userId: userObjectId, status: 'active' } },
      {
        $group: {
          _id: '$mediaId',
          userBidTotal: { $sum: '$amount' },
          lastBidAt: { $max: '$createdAt' },
        },
      },
      { $sort: { lastBidAt: -1 } },
      { $limit: BID_SCAN },
    ]),
    ListeningHistory.aggregate([
      { $match: { userId: userObjectId, countedAsPlay: true } },
      {
        $group: {
          _id: '$mediaId',
          qualifiedAt: { $max: '$qualifiedAt' },
        },
      },
      { $sort: { qualifiedAt: -1 } },
      { $limit: HEARD_SCAN },
    ]),
  ]);

  const bids = bidRows
    .filter((row) => row && row._id)
    .map((row) => ({
      mediaId: row._id,
      userBidTotal: row.userBidTotal || 0,
      lastBidAt: row.lastBidAt || null,
    }));
  const heard = heardRows
    .filter((row) => row && row._id)
    .map((row) => ({
      mediaId: row._id,
      qualifiedAt: row.qualifiedAt || null,
    }));

  const idSet = new Set();
  queueEntries.forEach((entry) => {
    if (entry.mediaId) idSet.add(String(entry.mediaId));
  });
  bids.forEach((row) => idSet.add(String(row.mediaId)));
  heard.forEach((row) => idSet.add(String(row.mediaId)));

  const objectIds = [...idSet]
    .filter((id) => mongoose.Types.ObjectId.isValid(id))
    .map((id) => new mongoose.Types.ObjectId(id));

  const mediaDocs = objectIds.length
    ? await Media.find({ _id: { $in: objectIds } })
      .select('title artist creatorDisplay featuring host author coverArt duration uuid slug tags contentForm contentType sources rightsStatus rightsCleared')
      .lean()
    : [];

  const mediaById = {};
  mediaDocs.forEach((media) => {
    mediaById[media._id.toString()] = media;
  });

  const classified = classifyHomeListenQueue({
    queueEntries,
    bids,
    heard,
    mediaById,
  });

  return {
    unheard: classified.unheard.map((item) => decorateQueueItem(item, mediaById[item.mediaId])),
    heard: classified.heard.map((item) => decorateQueueItem(item, mediaById[item.mediaId])),
    counts: classified.counts,
  };
}

module.exports = {
  BID_SCAN,
  HEARD_SCAN,
  UNHEARD_LIMIT,
  HEARD_LIMIT,
  isListenQueueMusic,
  classifyHomeListenQueue,
  getHomeListenQueue,
};
