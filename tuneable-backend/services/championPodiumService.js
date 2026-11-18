const mongoose = require('mongoose');
const Bid = require('../models/Bid');
const MediaPodiumSnapshot = require('../models/MediaPodiumSnapshot');
const ChampionPodiumEvent = require('../models/ChampionPodiumEvent');
const {
  topPodium,
  shiftTotals,
  diffPodium,
  regainPence,
} = require('../utils/championPodium');

const chains = new Map();

function enqueue(mediaId, task) {
  const key = String(mediaId);
  const previous = chains.get(key) || Promise.resolve();
  const run = previous.catch(() => {}).then(task);
  chains.set(key, run);
  run.finally(() => {
    if (chains.get(key) === run) chains.delete(key);
  });
  return run;
}

function asObjectId(id) {
  if (!id) return null;
  if (id instanceof mongoose.Types.ObjectId) return id;
  const value = String(id);
  if (!mongoose.Types.ObjectId.isValid(value)) return null;
  return new mongoose.Types.ObjectId(value);
}

async function loadTotals(mediaId) {
  const objectId = asObjectId(mediaId);
  if (!objectId) return [];
  const rows = await Bid.aggregate([
    { $match: { mediaId: objectId, status: 'active' } },
    {
      $group: {
        _id: '$userId',
        totalAmount: { $sum: '$amount' },
        bidCount: { $sum: 1 },
      },
    },
  ]);
  return rows.map((row) => ({
    userId: row._id,
    totalAmount: row.totalAmount || 0,
    bidCount: row.bidCount || 0,
  }));
}

function serializeRanks(rows) {
  return rows.map((row) => ({
    userId: row.userId,
    totalAmount: row.totalAmount,
    bidCount: row.bidCount,
    rank: row.rank,
  }));
}

async function syncNow(mediaId, delta) {
  const objectId = asObjectId(mediaId);
  if (!objectId) return;

  const currentRows = await loadTotals(objectId);
  const nextTop = topPodium(currentRows);
  const snapshot = await MediaPodiumSnapshot.findOne({ mediaId: objectId }).lean();

  let previousTop = null;
  if (snapshot) {
    previousTop = snapshot.ranks || [];
  } else if (delta && (Number(delta.deltaPence) !== 0 || Number(delta.deltaBids) !== 0)) {
    previousTop = topPodium(shiftTotals(
      currentRows,
      delta.userId,
      -Number(delta.deltaPence || 0),
      -Number(delta.deltaBids || 0)
    ));
  }

  if (!previousTop) {
    await MediaPodiumSnapshot.findOneAndUpdate(
      { mediaId: objectId },
      { $set: { ranks: serializeRanks(nextTop) } },
      { upsert: true }
    );
    return;
  }

  const events = diffPodium(previousTop, nextTop);
  if (events.length > 0) {
    const occurredAt = new Date();
    await ChampionPodiumEvent.insertMany(events.map((event) => ({
      userId: event.userId,
      mediaId: objectId,
      kind: event.kind,
      rank: event.rank,
      previousRank: event.previousRank,
      nextRank: event.nextRank,
      occurredAt,
    })));
  }

  await MediaPodiumSnapshot.findOneAndUpdate(
    { mediaId: objectId },
    { $set: { ranks: serializeRanks(nextTop) } },
    { upsert: true }
  );
}

/**
 * Record earned/lost top-3 titles after a bid write.
 * `delta` is the change in that tipper's active pence and bid count.
 * The first change for a tune uses `delta` to rebuild the previous podium.
 * Later changes compare against the stored snapshot.
 */
function syncMediaPodium(mediaId, delta) {
  if (!mediaId) return Promise.resolve();
  return enqueue(mediaId, () => syncNow(mediaId, delta));
}

async function loadTotalsForMedia(mediaIds) {
  const objectIds = mediaIds.map(asObjectId).filter(Boolean);
  if (objectIds.length === 0) return new Map();
  const rows = await Bid.aggregate([
    { $match: { mediaId: { $in: objectIds }, status: 'active' } },
    {
      $group: {
        _id: { mediaId: '$mediaId', userId: '$userId' },
        totalAmount: { $sum: '$amount' },
        bidCount: { $sum: 1 },
      },
    },
  ]);
  const byMedia = new Map();
  for (const row of rows) {
    const key = String(row._id.mediaId);
    const list = byMedia.get(key) || [];
    list.push({
      userId: row._id.userId,
      totalAmount: row.totalAmount || 0,
      bidCount: row.bidCount || 0,
    });
    byMedia.set(key, list);
  }
  return byMedia;
}

async function listForUser(userId, limit = 20) {
  const objectId = asObjectId(userId);
  if (!objectId) return [];
  const size = Math.min(50, Math.max(1, parseInt(limit, 10) || 20));
  const events = await ChampionPodiumEvent.find({ userId: objectId })
    .sort({ occurredAt: -1 })
    .limit(size)
    .populate('mediaId', 'title artist coverArt uuid contentForm')
    .lean();

  const lostMediaIds = events
    .filter((event) => event.kind === 'lost' && event.mediaId && typeof event.mediaId === 'object')
    .map((event) => event.mediaId._id);
  const standings = await loadTotalsForMedia(lostMediaIds);

  return events.map((event) => {
    const media = event.mediaId && typeof event.mediaId === 'object' ? event.mediaId : null;
    const mediaKey = media ? String(media._id) : null;
    const regain = event.kind === 'lost' && media
      ? regainPence(standings.get(mediaKey) || [], objectId, event.rank)
      : null;
    return {
      _id: event._id,
      kind: event.kind,
      rank: event.rank,
      previousRank: event.previousRank ?? null,
      nextRank: event.nextRank ?? null,
      occurredAt: event.occurredAt,
      regainPence: regain,
      media: media ? {
        _id: media._id,
        uuid: media.uuid || null,
        title: media.title,
        artist: media.artist,
        coverArt: media.coverArt || null,
        contentForm: media.contentForm || [],
      } : null,
    };
  });
}

module.exports = {
  syncMediaPodium,
  listForUser,
};
