/**
 * Admin media merge: fold source Media into keep Media, reassign refs, soft-delete source.
 */

const Media = require('../models/Media');
const Bid = require('../models/Bid');
const Party = require('../models/Party');
const User = require('../models/User');
const Comment = require('../models/Comment');
const Report = require('../models/Report');
const Claim = require('../models/Claim');
const ListeningHistory = require('../models/ListeningHistory');
const Notification = require('../models/Notification');
const TuneBytesTransaction = require('../models/TuneBytesTransaction');
const TuneableLedger = require('../models/TuneableLedger');
const ArtistEscrowAllocation = require('../models/ArtistEscrowAllocation');
const RefundRequest = require('../models/RefundRequest');
const Conversation = require('../models/Conversation');
const Label = require('../models/Label');
const Collective = require('../models/Collective');
const bidMetricsEngine = require('./bidMetricsEngine');
const { mediaPrimaryArtistName } = require('../utils/mediaMatchUtils');

async function resolveMediaByIdentifier(mediaId) {
  // Lazy-load so endpoints that only need duplicate clustering don't fail
  // when the lifecycle service isn't present in a given deployment build.
  const lifecycleService = require('./mediaLifecycleService');
  return lifecycleService.resolveMediaByIdentifier(mediaId);
}

function ensureMap(doc, field) {
  if (!(doc[field] instanceof Map)) {
    doc[field] = new Map(Object.entries(doc[field] || {}));
  }
}

function mapToObject(value) {
  if (!value) return {};
  if (value instanceof Map) return Object.fromEntries(value);
  return { ...value };
}

async function mergeMapFields(keep, source, field) {
  ensureMap(keep, field);
  const sourceMap = mapToObject(source[field]);
  let changed = false;
  for (const [key, value] of Object.entries(sourceMap)) {
    if (!value) continue;
    if (!keep[field].get(key)) {
      keep[field].set(key, value);
      changed = true;
    }
  }
  return changed;
}

function mergeMediaOwners(keep, source) {
  if (!Array.isArray(source.mediaOwners) || source.mediaOwners.length === 0) return false;
  if (!Array.isArray(keep.mediaOwners)) keep.mediaOwners = [];

  const existing = new Set(
    keep.mediaOwners
      .map((o) => (o.userId ? o.userId.toString() : null))
      .filter(Boolean)
  );

  let changed = false;
  for (const owner of source.mediaOwners) {
    const uid = owner.userId?.toString();
    if (!uid || existing.has(uid)) continue;
    keep.mediaOwners.push(owner);
    existing.add(uid);
    changed = true;
  }
  return changed;
}

function summarizeMedia(media) {
  if (!media) return null;
  return {
    _id: media._id.toString(),
    uuid: media.uuid,
    title: media.title,
    artist: mediaPrimaryArtistName(media),
    coverArt: media.coverArt || null,
    duration: media.duration || 0,
    isrc: media.isrc || null,
    status: media.status,
    deletedAt: media.deletedAt || null,
    globalMediaAggregate: media.globalMediaAggregate || 0,
    externalIds: mapToObject(media.externalIds),
    sources: mapToObject(media.sources),
  };
}

/**
 * Preview what a merge would do (no writes).
 */
async function previewMerge(sourceId, keepId) {
  const source = await resolveMediaByIdentifier(sourceId);
  const keep = await resolveMediaByIdentifier(keepId);

  if (!source) {
    const err = new Error('Source media not found');
    err.status = 404;
    throw err;
  }
  if (!keep) {
    const err = new Error('Keep (target) media not found');
    err.status = 404;
    throw err;
  }
  if (source._id.equals(keep._id)) {
    const err = new Error('Source and keep media must be different');
    err.status = 400;
    throw err;
  }
  if (keep.status === 'deleted' || keep.deletedAt) {
    const err = new Error('Keep media is deleted — restore it first or pick another target');
    err.status = 400;
    throw err;
  }

  const sourceOid = source._id;
  const [
    bidCount,
    commentCount,
    claimCount,
    partyCount,
    reportCount,
  ] = await Promise.all([
    Bid.countDocuments({ mediaId: sourceOid }),
    Comment.countDocuments({ mediaId: sourceOid }),
    Claim.countDocuments({ mediaId: sourceOid }),
    Party.countDocuments({ 'media.mediaId': sourceOid }),
    Report.countDocuments({ mediaId: sourceOid }),
  ]);

  return {
    source: summarizeMedia(source),
    keep: summarizeMedia(keep),
    willReassign: {
      bids: bidCount,
      comments: commentCount,
      claims: claimCount,
      parties: partyCount,
      reports: reportCount,
    },
    note: 'Bids and related records move to the keep media. Source is soft-deleted as merged.',
  };
}

async function reassignSimpleRefs(Model, sourceOid, keepOid, extra = {}) {
  return Model.updateMany(
    { mediaId: sourceOid },
    { $set: { mediaId: keepOid, ...extra } }
  );
}

async function mergePartyEntries(sourceOid, keepOid, keepUuid) {
  const parties = await Party.find({ 'media.mediaId': sourceOid });
  let updated = 0;

  for (const party of parties) {
    const sourceIdx = party.media.findIndex((m) => m.mediaId?.equals?.(sourceOid));
    if (sourceIdx < 0) continue;

    const keepIdx = party.media.findIndex((m) => m.mediaId?.equals?.(keepOid));
    const sourceEntry = party.media[sourceIdx];

    if (keepIdx >= 0) {
      const keepEntry = party.media[keepIdx];
      const sourceBids = sourceEntry.partyBids || [];
      const keepBids = keepEntry.partyBids || [];
      const bidSet = new Set(keepBids.map((id) => id.toString()));
      for (const bidId of sourceBids) {
        if (!bidSet.has(bidId.toString())) keepBids.push(bidId);
      }
      keepEntry.partyBids = keepBids;
      keepEntry.partyMediaAggregate = (keepEntry.partyMediaAggregate || 0)
        + (sourceEntry.partyMediaAggregate || 0);
      if ((sourceEntry.partyMediaBidTop || 0) > (keepEntry.partyMediaBidTop || 0)) {
        keepEntry.partyMediaBidTop = sourceEntry.partyMediaBidTop;
        keepEntry.partyMediaBidTopUser = sourceEntry.partyMediaBidTopUser;
      }
      if ((sourceEntry.partyMediaAggregateTop || 0) > (keepEntry.partyMediaAggregateTop || 0)) {
        keepEntry.partyMediaAggregateTop = sourceEntry.partyMediaAggregateTop;
        keepEntry.partyMediaAggregateTopUser = sourceEntry.partyMediaAggregateTopUser;
      }
      party.media.splice(sourceIdx, 1);
    } else {
      sourceEntry.mediaId = keepOid;
      sourceEntry.media_uuid = keepUuid;
    }

    await party.save();
    updated += 1;
  }

  return updated;
}

async function rewriteUserArrays(sourceOid, keepOid) {
  await User.updateMany(
    { 'playbackQueue.mediaId': sourceOid },
    { $set: { 'playbackQueue.$[elem].mediaId': keepOid } },
    { arrayFilters: [{ 'elem.mediaId': sourceOid }] }
  );

  await User.updateMany(
    { 'tuneBytesHistory.mediaId': sourceOid },
    { $set: { 'tuneBytesHistory.$[elem].mediaId': keepOid } },
    { arrayFilters: [{ 'elem.mediaId': sourceOid }] }
  );

  await User.updateMany(
    { 'artistEscrowHistory.mediaId': sourceOid },
    { $set: { 'artistEscrowHistory.$[elem].mediaId': keepOid } },
    { arrayFilters: [{ 'elem.mediaId': sourceOid }] }
  );

  // Drop duplicate queue entries pointing at keep after rewrite
  const usersWithDupQueue = await User.find({
    'playbackQueue.mediaId': keepOid,
  }).select('playbackQueue');

  for (const user of usersWithDupQueue) {
    const seen = new Set();
    const next = [];
    let changed = false;
    for (const entry of user.playbackQueue || []) {
      const id = entry.mediaId?.toString();
      if (id && seen.has(id)) {
        changed = true;
        continue;
      }
      if (id) seen.add(id);
      next.push(entry);
    }
    if (changed) {
      user.playbackQueue = next;
      await user.save();
    }
  }
}

async function rewriteTopPerformingMedia(Model, sourceOid, keepOid) {
  const docs = await Model.find({ 'bidMetrics.topPerformingMedia.mediaId': sourceOid });
  for (const doc of docs) {
    const list = doc.bidMetrics?.topPerformingMedia || [];
    let changed = false;
    const seen = new Set();
    const next = [];
    for (const item of list) {
      if (item.mediaId?.equals?.(sourceOid)) {
        item.mediaId = keepOid;
        changed = true;
      }
      const id = item.mediaId?.toString();
      if (id && seen.has(id)) {
        changed = true;
        continue;
      }
      if (id) seen.add(id);
      next.push(item);
    }
    if (changed) {
      doc.bidMetrics.topPerformingMedia = next;
      await doc.save();
    }
  }
}

/**
 * Execute merge: source → keep. Soft-deletes source without refunding (bids already moved).
 */
async function mergeMedia(sourceId, keepId, actorId, { dryRun = false } = {}) {
  const preview = await previewMerge(sourceId, keepId);
  if (dryRun) {
    return { dryRun: true, ...preview };
  }

  const source = await resolveMediaByIdentifier(sourceId);
  const keep = await resolveMediaByIdentifier(keepId);
  const sourceOid = source._id;
  const keepOid = keep._id;

  // 1) Merge metadata onto keep
  await mergeMapFields(keep, source, 'externalIds');
  await mergeMapFields(keep, source, 'sources');
  if (source.isrc && !keep.isrc) keep.isrc = source.isrc;
  if (!keep.coverArt && source.coverArt) keep.coverArt = source.coverArt;
  if ((!keep.duration || keep.duration === 0) && source.duration) keep.duration = source.duration;
  if (!keep.album && source.album) keep.album = source.album;
  mergeMediaOwners(keep, source);

  // Union tags
  if (Array.isArray(source.tags) && source.tags.length) {
    const tagSet = new Set([...(keep.tags || []), ...source.tags]);
    keep.tags = Array.from(tagSet);
  }

  // Self-refs on Media
  await Media.updateMany(
    { podcastSeries: sourceOid },
    { $set: { podcastSeries: keepOid } }
  );
  await Media.updateMany(
    { 'relationships.targetId': sourceOid },
    { $set: { 'relationships.$[rel].targetId': keepOid } },
    { arrayFilters: [{ 'rel.targetId': sourceOid }] }
  );

  await keep.save();

  // 2) Reassign foreign refs
  const bidResult = await reassignSimpleRefs(Bid, sourceOid, keepOid);
  await reassignSimpleRefs(Comment, sourceOid, keepOid);
  await reassignSimpleRefs(Claim, sourceOid, keepOid);
  await reassignSimpleRefs(ListeningHistory, sourceOid, keepOid);
  await Notification.updateMany(
    { relatedMediaId: sourceOid },
    { $set: { relatedMediaId: keepOid } }
  );
  await reassignSimpleRefs(TuneBytesTransaction, sourceOid, keepOid);
  await reassignSimpleRefs(TuneableLedger, sourceOid, keepOid);
  await reassignSimpleRefs(ArtistEscrowAllocation, sourceOid, keepOid);
  await reassignSimpleRefs(RefundRequest, sourceOid, keepOid);

  // Reports: also update mediaUuid; skip unique conflicts by deleting source report if keep already has same reporter+type
  const sourceReports = await Report.find({ mediaId: sourceOid });
  for (const report of sourceReports) {
    const clash = await Report.findOne({
      reportType: report.reportType,
      mediaId: keepOid,
      reportedBy: report.reportedBy,
    });
    if (clash) {
      await report.deleteOne();
    } else {
      report.mediaId = keepOid;
      report.mediaUuid = keep.uuid;
      await report.save();
    }
  }

  await Conversation.updateMany(
    { resultingMediaId: sourceOid },
    { $set: { resultingMediaId: keepOid } }
  );
  await Conversation.updateMany(
    { 'participants.mediaId': sourceOid },
    { $set: { 'participants.$[p].mediaId': keepOid } },
    { arrayFilters: [{ 'p.mediaId': sourceOid }] }
  );

  const partiesUpdated = await mergePartyEntries(sourceOid, keepOid, keep.uuid);
  await rewriteUserArrays(sourceOid, keepOid);
  await rewriteTopPerformingMedia(Label, sourceOid, keepOid);
  await rewriteTopPerformingMedia(Collective, sourceOid, keepOid);

  // 3) Soft-delete source (no tip refund — bids already on keep)
  source.status = 'deleted';
  source.deletedAt = new Date();
  source.deletedBy = actorId || null;
  source.deletedReason = `Merged into ${keep.uuid || keepOid.toString()}`;
  await source.save();

  // 4) Recompute metrics on keeper
  try {
    await bidMetricsEngine.recomputeMediaMetrics(keepOid);
  } catch (err) {
    console.error('mergeMedia: failed to recompute metrics', err);
  }

  return {
    success: true,
    source: summarizeMedia(source),
    keep: summarizeMedia(await Media.findById(keepOid)),
    reassigned: {
      bids: bidResult.modifiedCount || 0,
      parties: partiesUpdated,
    },
    message: `Merged "${preview.source.title}" into "${preview.keep.title}"`,
  };
}

/**
 * Find likely duplicate clusters for admin review (ISRC collisions + exact title+artist).
 */
async function findLikelyDuplicates({ limit = 50 } = {}) {
  const capped = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);

  const byIsrc = await Media.aggregate([
    {
      $match: {
        isrc: { $ne: null, $exists: true },
        status: { $ne: 'deleted' },
        deletedAt: null,
      },
    },
    {
      $group: {
        _id: '$isrc',
        count: { $sum: 1 },
        ids: { $push: { id: '$_id', uuid: '$uuid', title: '$title', artist: { $arrayElemAt: ['$artist.name', 0] }, aggregate: '$globalMediaAggregate' } },
      },
    },
    { $match: { count: { $gt: 1 } } },
    { $sort: { count: -1 } },
    { $limit: capped },
  ]);

  const byTitleArtist = await Media.aggregate([
    {
      $match: {
        status: { $ne: 'deleted' },
        deletedAt: null,
      },
    },
    {
      $project: {
        title: 1,
        uuid: 1,
        globalMediaAggregate: 1,
        artistName: { $arrayElemAt: ['$artist.name', 0] },
      },
    },
    {
      $group: {
        _id: { title: '$title', artist: '$artistName' },
        count: { $sum: 1 },
        ids: {
          $push: {
            id: '$_id',
            uuid: '$uuid',
            title: '$title',
            artist: '$artistName',
            aggregate: '$globalMediaAggregate',
          },
        },
      },
    },
    { $match: { count: { $gt: 1 } } },
    { $sort: { count: -1 } },
    { $limit: capped },
  ]);

  return {
    byIsrc: byIsrc.map((g) => ({
      key: g._id,
      reason: 'same-isrc',
      count: g.count,
      media: g.ids,
    })),
    byTitleArtist: byTitleArtist.map((g) => ({
      key: `${g._id.title} — ${g._id.artist}`,
      reason: 'exact-title-artist',
      count: g.count,
      media: g.ids,
    })),
  };
}

module.exports = {
  previewMerge,
  mergeMedia,
  findLikelyDuplicates,
  summarizeMedia,
  resolveMediaByIdentifier,
};
