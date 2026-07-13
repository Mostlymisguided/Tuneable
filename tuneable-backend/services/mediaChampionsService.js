/**
 * Media Champions — social status rankings by tip aggregate,
 * optionally scoped to a Mapbox place via bid location snapshots.
 */

const mongoose = require('mongoose');
const Bid = require('../models/Bid');
const Media = require('../models/Media');
const { isValidObjectId } = require('../utils/validators');

/** Minimum distinct tippers in-scope before crowning a Champion. */
const MIN_TIPPERS_FOR_CHAMPION = 1;

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
 * Aggregate tip champions for a media item, optionally filtered by location place id.
 *
 * @param {string} mediaId - Media UUID or ObjectId
 * @param {object} options
 * @param {string} [options.locationPlaceId] - Mapbox place id (bids whose ancestor chain includes this)
 * @param {number} [options.limit=10]
 * @returns {Promise<object>}
 */
async function getMediaChampions(mediaId, options = {}) {
  const limit = Math.min(Math.max(parseInt(options.limit, 10) || 10, 1), 50);
  const locationPlaceId =
    typeof options.locationPlaceId === 'string' && options.locationPlaceId.trim()
      ? options.locationPlaceId.trim()
      : null;

  const mediaObjectId = await resolveMediaObjectId(mediaId);
  if (!mediaObjectId) {
    return null;
  }

  const match = {
    mediaId: mediaObjectId,
    status: 'active',
  };

  if (locationPlaceId) {
    match.bidderLocationAncestorIds = locationPlaceId;
  }

  const rankings = await Bid.aggregate([
    { $match: match },
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
    { $match: match },
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
  const hasChampion = tipperCount >= MIN_TIPPERS_FOR_CHAMPION && rankings.length > 0;

  const ranked = rankings.map((row, index) => ({
    rank: index + 1,
    totalAmount: row.totalAmount,
    bidCount: row.bidCount,
    locationDisplay: row.locationDisplay || null,
    user: {
      _id: row.user._id,
      uuid: row.user.uuid,
      username: row.user.username,
      profilePic: row.user.profilePic || null,
    },
    isChampion: hasChampion && index === 0,
  }));

  return {
    scope: locationPlaceId ? 'place' : 'global',
    locationPlaceId,
    tipperCount,
    totalAmount: stats.totalAmount || 0,
    bidCount: stats.bidCount || 0,
    hasChampion,
    champion: hasChampion ? ranked[0] : null,
    rankings: ranked,
    minTippersForChampion: MIN_TIPPERS_FOR_CHAMPION,
  };
}

module.exports = {
  getMediaChampions,
  resolveMediaObjectId,
  MIN_TIPPERS_FOR_CHAMPION,
};
