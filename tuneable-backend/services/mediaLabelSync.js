const Bid = require('../models/Bid');
const TuneableLedger = require('../models/TuneableLedger');
const { primaryCreditName } = require('../utils/mediaDisplayLabel');

/**
 * Copy the current media title and primary artist onto tip and ledger rows.
 * Those rows keep a snapshot for search and for media that has been deleted.
 */
async function syncDenormalizedMediaLabels(media) {
  const mediaId = media?._id;
  const title = String(media?.title || '').trim();
  if (!mediaId || !title) return { bids: 0, ledger: 0 };

  const artist = primaryCreditName(media) || 'Unknown';

  const bidResult = await Bid.updateMany(
    {
      mediaId,
      $or: [
        { mediaTitle: { $ne: title } },
        { mediaArtist: { $ne: artist } },
      ],
    },
    { $set: { mediaTitle: title, mediaArtist: artist } }
  );

  const staleLedger = await TuneableLedger.find({
    mediaId,
    mediaTitle: { $ne: title },
  }).select('_id mediaTitle description');

  if (staleLedger.length > 0) {
    const ops = staleLedger.map((entry) => {
      const previous = String(entry.mediaTitle || '');
      const next = { mediaTitle: title };
      if (previous && entry.description && entry.description.includes(previous)) {
        next.description = entry.description.split(previous).join(title);
      }
      return {
        updateOne: {
          filter: { _id: entry._id },
          update: { $set: next },
        },
      };
    });
    await TuneableLedger.bulkWrite(ops);
  }

  return {
    bids: bidResult.modifiedCount || 0,
    ledger: staleLedger.length,
  };
}

module.exports = {
  syncDenormalizedMediaLabels,
};
