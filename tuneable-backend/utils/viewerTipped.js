const mongoose = require('mongoose');
const Bid = require('../models/Bid');

function toObjectId(value) {
  if (!value) return null;
  if (value instanceof mongoose.Types.ObjectId) return value;
  const raw = value._id || value.id || value;
  if (raw instanceof mongoose.Types.ObjectId) return raw;
  const str = String(raw);
  if (!mongoose.Types.ObjectId.isValid(str) || str.includes('-')) return null;
  return new mongoose.Types.ObjectId(str);
}

function mediaIdOf(item) {
  if (!item || typeof item !== 'object') return null;
  return item._id || item.id || item.mediaId || null;
}

/**
 * Mark chart rows the signed-in viewer has an active tip on.
 * Independent of the chart's time or place slice, so an older tip still shows.
 */
function markViewerTipped(items, tippedIds, getId = mediaIdOf) {
  const tipped = tippedIds instanceof Set
    ? tippedIds
    : new Set((tippedIds || []).map((id) => String(id)));
  if (!Array.isArray(items)) return items;
  return items.map((item) => {
    if (!item || typeof item !== 'object') return item;
    const id = getId(item);
    return {
      ...item,
      viewerTipped: Boolean(id && tipped.has(String(id))),
    };
  });
}

async function loadViewerTippedIdSet(mediaIds, userId) {
  const userObjectId = toObjectId(userId);
  const ids = (mediaIds || []).map(toObjectId).filter(Boolean);
  if (!userObjectId || !ids.length) return new Set();

  const tipped = await Bid.distinct('mediaId', {
    mediaId: { $in: ids },
    userId: userObjectId,
    status: 'active',
  });
  return new Set(tipped.map((id) => String(id)));
}

async function stampViewerTipped(items, userId, getId = mediaIdOf) {
  if (!Array.isArray(items) || !items.length) return items;
  const tipped = await loadViewerTippedIdSet(items.map(getId), userId);
  return markViewerTipped(items, tipped, getId);
}

module.exports = {
  mediaIdOf,
  markViewerTipped,
  loadViewerTippedIdSet,
  stampViewerTipped,
};
