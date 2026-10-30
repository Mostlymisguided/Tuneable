const mongoose = require('mongoose');
const TuneBytesTransaction = require('../models/TuneBytesTransaction');

function mediaIdKey(id) {
  if (id == null || id === '') return null;
  if (typeof id === 'object') {
    if (id._id) return mediaIdKey(id._id);
    if (typeof id.toString === 'function') {
      const key = id.toString();
      if (key && key !== '[object Object]') return key;
    }
    return null;
  }
  return String(id);
}

/**
 * Confirmed TuneBytes awarded on each media id.
 * This is the media total (every tipper), not one user's balance.
 */
async function sumConfirmedTuneBytesByMediaId(mediaIds) {
  const objectIds = [];
  const seen = new Set();
  for (const raw of mediaIds || []) {
    const key = mediaIdKey(raw);
    if (!key || seen.has(key) || !mongoose.Types.ObjectId.isValid(key)) continue;
    seen.add(key);
    objectIds.push(new mongoose.Types.ObjectId(key));
  }

  const totals = new Map();
  if (!objectIds.length) return totals;

  const rows = await TuneBytesTransaction.aggregate([
    { $match: { mediaId: { $in: objectIds }, status: 'confirmed' } },
    {
      $group: {
        _id: '$mediaId',
        totalTuneBytes: { $sum: '$tuneBytesEarned' },
      },
    },
  ]);

  for (const row of rows) {
    if (row._id) totals.set(row._id.toString(), row.totalTuneBytes || 0);
  }
  return totals;
}

function tuneBytesFor(totals, mediaId) {
  const key = mediaIdKey(mediaId);
  if (!key || !totals) return 0;
  return totals.get(key) || 0;
}

module.exports = {
  mediaIdKey,
  sumConfirmedTuneBytesByMediaId,
  tuneBytesFor,
};
