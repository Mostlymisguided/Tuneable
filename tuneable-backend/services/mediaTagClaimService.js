const mongoose = require('mongoose');
const Media = require('../models/Media');
const Bid = require('../models/Bid');
const MediaTagClaim = require('../models/MediaTagClaim');
const {
  getCanonicalTag,
  normalizeTagForStorage,
  tagsMatch,
} = require('../utils/tagNormalizer');
const {
  classifyTipChips,
  applyTipChipsToMedia,
} = require('../utils/elementNormalizer');

const MAX_CLAIM_TAGS = 5;

/**
 * @param {string|import('mongoose').Types.ObjectId} userId
 * @param {string|import('mongoose').Types.ObjectId} mediaId
 * @returns {Promise<{ totalPence: number, bidIds: import('mongoose').Types.ObjectId[] }>}
 */
async function getUserActiveTipOnMedia(userId, mediaId) {
  const bids = await Bid.find({
    userId,
    mediaId,
    status: 'active',
  })
    .select('_id amount')
    .lean();

  const totalPence = bids.reduce((sum, bid) => sum + (bid.amount || 0), 0);
  return {
    totalPence,
    bidIds: bids.map((b) => b._id),
  };
}

/**
 * Normalize and cap claimable discovery tags (elements are excluded).
 * @param {string[]} chips
 * @returns {string[]}
 */
function normalizeClaimTags(chips) {
  const { tags } = classifyTipChips(Array.isArray(chips) ? chips : []);
  const out = [];
  for (const tag of tags) {
    const display = normalizeTagForStorage(tag);
    if (!display) continue;
    if (out.some((t) => tagsMatch(t, display))) continue;
    out.push(display);
    if (out.length >= MAX_CLAIM_TAGS) break;
  }
  return out;
}

/**
 * Upsert claims for tags, adding `amountPence` to each (tip path).
 * @param {object} params
 */
async function incrementClaimsForTags({
  userId,
  mediaId,
  tags,
  amountPence,
  bidId = null,
  source = 'tip',
}) {
  const claimTags = normalizeClaimTags(tags);
  if (!claimTags.length || !amountPence || amountPence <= 0) {
    return { tags: claimTags, claims: [] };
  }

  const claims = [];
  for (const display of claimTags) {
    const canonicalTag = getCanonicalTag(display);
    const claim = await MediaTagClaim.findOneAndUpdate(
      { mediaId, userId, canonicalTag },
      {
        $set: {
          tag: display,
          lastSource: source,
          ...(bidId ? { lastBidId: bidId } : {}),
        },
        $inc: { amountPence },
        $setOnInsert: {
          mediaId,
          userId,
          canonicalTag,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    claims.push(claim);
  }

  return { tags: claimTags, claims };
}

/**
 * Ensure claim amount is at least the user's total active tip on this media
 * (post-tip / agree path — stake speaks for asserted tags).
 */
async function syncClaimsToUserTipTotal({
  userId,
  mediaId,
  tags,
  source = 'post_tip',
  bidId = null,
}) {
  const claimTags = normalizeClaimTags(tags);
  if (!claimTags.length) {
    return { tags: [], claims: [], totalPence: 0 };
  }

  const { totalPence, bidIds } = await getUserActiveTipOnMedia(userId, mediaId);
  if (totalPence <= 0) {
    const err = new Error('You must tip this media before tagging it');
    err.status = 403;
    throw err;
  }

  const effectiveBidId = bidId || bidIds[bidIds.length - 1] || null;
  const claims = [];

  for (const display of claimTags) {
    const canonicalTag = getCanonicalTag(display);
    const existing = await MediaTagClaim.findOne({ mediaId, userId, canonicalTag });
    const nextAmount = Math.max(existing?.amountPence || 0, totalPence);

    const claim = await MediaTagClaim.findOneAndUpdate(
      { mediaId, userId, canonicalTag },
      {
        $set: {
          tag: display,
          amountPence: nextAmount,
          lastSource: source,
          ...(effectiveBidId ? { lastBidId: effectiveBidId } : {}),
        },
        $setOnInsert: {
          mediaId,
          userId,
          canonicalTag,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    claims.push(claim);
  }

  return { tags: claimTags, claims, totalPence };
}

/**
 * Apply tip chips to media arrays + record £ claims for discovery tags only.
 * Elements still merge onto media.elements without claims.
 *
 * @returns {{ media, tags: string[], elements: string[], claims, didAddTag: boolean, didAddElement: boolean }}
 */
async function applyChipsAndRecordClaims({
  media,
  userId,
  chips,
  amountPence,
  bidId = null,
  source = 'tip',
  saveMedia = true,
}) {
  const applied = applyTipChipsToMedia(media, Array.isArray(chips) ? chips : []);
  media.tags = applied.tags;
  media.elements = applied.elements;

  if (saveMedia && (applied.didAddTag || applied.didAddElement)) {
    await media.save();
  }

  let claims = [];
  const { tags: claimTags } = classifyTipChips(Array.isArray(chips) ? chips : []);

  if (claimTags.length && amountPence > 0) {
    if (source === 'tip') {
      const result = await incrementClaimsForTags({
        userId,
        mediaId: media._id,
        tags: claimTags,
        amountPence,
        bidId,
        source,
      });
      claims = result.claims;
    } else {
      const result = await syncClaimsToUserTipTotal({
        userId,
        mediaId: media._id,
        tags: claimTags,
        source,
        bidId,
      });
      claims = result.claims;
    }
  }

  return {
    media,
    tags: applied.tags,
    elements: applied.elements,
    claims,
    didAddTag: applied.didAddTag,
    didAddElement: applied.didAddElement,
  };
}

/**
 * Aggregate £-backed tags for a media item.
 * Unclaimed folksonomy tags still appear with aggregate 0 (hybrid display).
 *
 * @param {string|import('mongoose').Types.ObjectId} mediaId
 * @param {{ includeUnclaimed?: boolean, limit?: number }} [options]
 */
async function getRankedTagsForMedia(mediaId, options = {}) {
  const includeUnclaimed = options.includeUnclaimed !== false;
  const limit = Math.min(Math.max(options.limit || 50, 1), 100);

  const idStr = String(mediaId);
  if (!mongoose.Types.ObjectId.isValid(idStr)) {
    return [];
  }
  const objectId = new mongoose.Types.ObjectId(idStr);

  const claimAgg = await MediaTagClaim.aggregate([
    { $match: { mediaId: objectId } },
    {
      $group: {
        _id: '$canonicalTag',
        aggregate: { $sum: '$amountPence' },
        tipperCount: { $sum: 1 },
        tag: { $first: '$tag' },
      },
    },
    { $sort: { aggregate: -1, tipperCount: -1, tag: 1 } },
  ]);

  const ranked = claimAgg.map((row) => ({
    tag: row.tag || normalizeTagForStorage(row._id) || row._id,
    canonicalTag: row._id,
    aggregate: row.aggregate || 0,
    tipperCount: row.tipperCount || 0,
  }));

  if (includeUnclaimed) {
    const media = await Media.findById(objectId).select('tags').lean();
    const existing = media?.tags || [];
    for (const raw of existing) {
      const display = normalizeTagForStorage(raw);
      if (!display) continue;
      const canonical = getCanonicalTag(display);
      if (ranked.some((r) => r.canonicalTag === canonical || tagsMatch(r.tag, display))) {
        continue;
      }
      ranked.push({
        tag: display,
        canonicalTag: canonical,
        aggregate: 0,
        tipperCount: 0,
      });
    }
  }

  return ranked.slice(0, limit);
}

/**
 * Top tags by backed £ (fallback to unclaimed media.tags order).
 */
async function getTopTagsForAgree(mediaId, limit = 5) {
  const ranked = await getRankedTagsForMedia(mediaId, {
    includeUnclaimed: true,
    limit: Math.max(limit, 10),
  });
  return ranked.slice(0, Math.min(limit, MAX_CLAIM_TAGS)).map((r) => r.tag);
}

/**
 * Post-tip claim and/or agree-with-top-tags for a tipper.
 */
async function claimTagsForTipper({
  userId,
  mediaId,
  tags = [],
  agreeTop = false,
  agreeLimit = 5,
}) {
  const media = await Media.findById(mediaId);
  if (!media || media.status === 'deleted' || media.status === 'vetoed') {
    const err = new Error('Media not found');
    err.status = 404;
    throw err;
  }

  const { totalPence } = await getUserActiveTipOnMedia(userId, mediaId);
  if (totalPence <= 0) {
    const err = new Error('You must tip this media before tagging it');
    err.status = 403;
    throw err;
  }

  const requested = [];
  if (agreeTop) {
    const top = await getTopTagsForAgree(mediaId, agreeLimit || 5);
    requested.push(...top);
  }
  if (Array.isArray(tags) && tags.length) {
    requested.push(...tags);
  }

  const claimTags = normalizeClaimTags(requested);
  if (!claimTags.length) {
    const err = new Error('No tags to claim');
    err.status = 400;
    throw err;
  }

  const source = agreeTop && (!tags || tags.length === 0) ? 'agree' : 'post_tip';
  const applied = await applyChipsAndRecordClaims({
    media,
    userId,
    chips: claimTags,
    amountPence: totalPence,
    source,
    saveMedia: true,
  });

  const rankedTags = await getRankedTagsForMedia(media._id);

  return {
    media,
    claimedTags: claimTags,
    rankedTags,
    tags: applied.tags,
    elements: applied.elements,
    userTipPence: totalPence,
  };
}

/**
 * User tag rankings from explicit claims (hybrid).
 * Falls back to empty when user has no claims yet.
 */
async function getUserTagAggregatesFromClaims(userId) {
  const rows = await MediaTagClaim.aggregate([
    { $match: { userId: new mongoose.Types.ObjectId(String(userId)) } },
    {
      $group: {
        _id: '$canonicalTag',
        aggregate: { $sum: '$amountPence' },
        tag: { $first: '$tag' },
      },
    },
  ]);

  const map = {};
  for (const row of rows) {
    const key = row.tag || row._id;
    map[key] = (map[key] || 0) + (row.aggregate || 0);
  }
  return map;
}

module.exports = {
  MAX_CLAIM_TAGS,
  getUserActiveTipOnMedia,
  normalizeClaimTags,
  incrementClaimsForTags,
  syncClaimsToUserTipTotal,
  applyChipsAndRecordClaims,
  getRankedTagsForMedia,
  getTopTagsForAgree,
  claimTagsForTipper,
  getUserTagAggregatesFromClaims,
};
