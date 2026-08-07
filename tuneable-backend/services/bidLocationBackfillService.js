const Bid = require('../models/Bid');
const { getBidLocationSnapshot } = require('../utils/locationUtils');

/**
 * Active tips missing a home stamp (no ancestors and/or no home place id).
 * Tips that already have a home place id are left alone (historical stamps).
 */
function bidsNeedingHomeSnapshotQuery(userId) {
  return {
    userId,
    status: 'active',
    $or: [
      { bidderLocationAncestorIds: { $exists: false } },
      { bidderLocationAncestorIds: { $size: 0 } },
      { bidderHomePlaceId: { $exists: false } },
      { bidderHomePlaceId: null },
    ],
  };
}

/**
 * Stamp a user's active tips with their home location snapshot.
 * Preserves tip-time bidderCurrentPlaceId; unions home ancestors into any
 * existing current-location ancestors.
 *
 * @param {Object} user - User document with homeLocation set
 * @returns {Promise<{ matched: number, modified: number }>}
 */
async function backfillUserBidLocationSnapshots(user) {
  if (!user?._id) {
    return { matched: 0, modified: 0 };
  }

  const snapshot = getBidLocationSnapshot(user.homeLocation);
  if (!snapshot.bidderLocationAncestorIds?.length) {
    return { matched: 0, modified: 0 };
  }

  const result = await Bid.updateMany(bidsNeedingHomeSnapshotQuery(user._id), [
    {
      $set: {
        bidderHomePlaceId: snapshot.bidderHomePlaceId,
        bidderLocationAncestorIds: {
          $setUnion: [
            { $ifNull: ['$bidderLocationAncestorIds', []] },
            snapshot.bidderLocationAncestorIds,
          ],
        },
        // Home is the intended "where you're from" for charts
        bidderLocationDisplay: snapshot.bidderLocationDisplay,
        bidderCountryPlaceId: snapshot.bidderCountryPlaceId,
        bidderCountry: snapshot.bidderCountry,
        bidderCountryCode: snapshot.bidderCountryCode,
        bidderPlaceLabel: snapshot.bidderPlaceLabel,
        bidderFeatureType: snapshot.bidderFeatureType,
        // Intentionally omit bidderCurrentPlaceId so tip-time GPS is preserved
      },
    },
  ]);

  return {
    matched: result.matchedCount ?? result.n ?? 0,
    modified: result.modifiedCount ?? result.nModified ?? 0,
  };
}

module.exports = {
  backfillUserBidLocationSnapshots,
  bidsNeedingHomeSnapshotQuery,
};
