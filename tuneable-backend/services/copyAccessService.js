const mongoose = require('mongoose');
const Bid = require('../models/Bid');
const CopyUnlock = require('../models/CopyUnlock');
const Media = require('../models/Media');
const {
  generousShareThreshold,
  normalizeCopySharePercent,
  replayCopyUnlocks,
} = require('../utils/generousHalf');
const { downloadDecision, replayFixedFloor } = require('../utils/mediaLicence');

function toObjectId(id) {
  if (id instanceof mongoose.Types.ObjectId) return id;
  return new mongoose.Types.ObjectId(String(id));
}

async function sharePercentFor(mediaId) {
  const media = await Media.findById(mediaId).select('copySharePercent').lean();
  return normalizeCopySharePercent(media?.copySharePercent);
}

async function loadLicenceDoc(mediaId) {
  return Media.findById(mediaId).select('licence copySharePercent').lean();
}

async function loadUserTotals(mediaId) {
  const rows = await Bid.aggregate([
    { $match: { mediaId: toObjectId(mediaId), status: 'active' } },
    { $group: { _id: '$userId', total: { $sum: '$amount' } } },
  ]);
  return new Map(rows.map((row) => [String(row._id), row.total]));
}

function explicitDownload(media) {
  if (!media?.licence?.chosen) return null;
  return {
    personalDownload: media.licence.personalDownload === true,
    unlockPence: media.licence.personalDownloadUnlockPence || 1,
  };
}

async function loadActiveTotals(mediaId) {
  const rows = await Bid.aggregate([
    { $match: { mediaId: toObjectId(mediaId), status: 'active' } },
    { $group: { _id: '$userId', total: { $sum: '$amount' } } },
  ]);
  const byUser = new Map(rows.map((row) => [String(row._id), row.total]));
  const sharePercent = await sharePercentFor(mediaId);
  return {
    byUser,
    sharePercent,
    thresholdPence: generousShareThreshold([...byUser.values()], sharePercent),
    tipperCount: byUser.size,
  };
}

async function grantCurrentHalf(mediaId) {
  const explicit = explicitDownload(await loadLicenceDoc(mediaId));
  if (explicit && !explicit.personalDownload) {
    return { thresholdPence: null, tipperCount: 0, skipped: true };
  }
  if (explicit && explicit.personalDownload) {
    const byUser = await loadUserTotals(mediaId);
    const ops = [];
    for (const [userId, total] of byUser) {
      if (total < explicit.unlockPence) continue;
      ops.push({
        updateOne: {
          filter: { userId, mediaId: toObjectId(mediaId) },
          update: {
            $setOnInsert: {
              userId,
              mediaId: toObjectId(mediaId),
              thresholdAtGrant: explicit.unlockPence,
              totalAtGrant: total,
              unlockedAt: new Date(),
            },
          },
          upsert: true,
        },
      });
    }
    if (ops.length > 0) await CopyUnlock.bulkWrite(ops);
    return { thresholdPence: explicit.unlockPence, tipperCount: byUser.size };
  }

  const { byUser, thresholdPence } = await loadActiveTotals(mediaId);
  if (thresholdPence == null) return { thresholdPence: null, tipperCount: 0 };

  const ops = [];
  for (const [userId, total] of byUser) {
    if (total < thresholdPence) continue;
    ops.push({
      updateOne: {
        filter: { userId, mediaId: toObjectId(mediaId) },
        update: {
          $setOnInsert: {
            userId,
            mediaId: toObjectId(mediaId),
            thresholdAtGrant: thresholdPence,
            totalAtGrant: total,
            unlockedAt: new Date(),
          },
        },
        upsert: true,
      },
    });
  }
  if (ops.length > 0) {
    await CopyUnlock.bulkWrite(ops);
  }
  return { thresholdPence, tipperCount: byUser.size };
}

async function revokeIfLapsed(mediaId, userId) {
  const explicit = explicitDownload(await loadLicenceDoc(mediaId));
  if (explicit && !explicit.personalDownload) return;
  if (explicit && explicit.personalDownload) {
    const unlock = await CopyUnlock.findOne({ mediaId, userId });
    if (!unlock) return;
    const totals = await loadUserTotals(mediaId);
    const total = totals.get(String(userId)) || 0;
    if (total >= explicit.unlockPence || total >= unlock.thresholdAtGrant) return;
    await unlock.deleteOne();
    return;
  }

  const unlock = await CopyUnlock.findOne({ mediaId, userId });
  if (!unlock) return;
  const { byUser, thresholdPence } = await loadActiveTotals(mediaId);
  const total = byUser.get(String(userId)) || 0;
  const inHalf = thresholdPence != null && total >= thresholdPence;
  if (inHalf || total >= unlock.thresholdAtGrant) return;
  await unlock.deleteOne();
}

async function getStatus(mediaId, userId) {
  const explicit = explicitDownload(await loadLicenceDoc(mediaId));
  if (explicit) {
    const byUser = await loadUserTotals(mediaId);
    const userKey = userId ? String(userId) : null;
    const userTotalPence = userKey ? (byUser.get(userKey) || 0) : null;
    let unlock = userKey
      ? await CopyUnlock.findOne({ mediaId, userId: userKey }).lean()
      : null;
    const decision = downloadDecision({
      explicit: true,
      personalDownload: explicit.personalDownload,
      unlockPence: explicit.unlockPence,
      userTotalPence: userTotalPence || 0,
      existingUnlock: unlock,
    });

    if (userKey && decision.mode === 'pence' && decision.unlocked && !decision.grandfathered && !unlock) {
      await CopyUnlock.updateOne(
        { userId: userKey, mediaId },
        {
          $setOnInsert: {
            userId: userKey,
            mediaId,
            thresholdAtGrant: decision.thresholdPence,
            totalAtGrant: userTotalPence,
            unlockedAt: new Date(),
          },
        },
        { upsert: true }
      );
      unlock = await CopyUnlock.findOne({ mediaId, userId: userKey }).lean();
    }

    if (userKey && decision.mode === 'pence' && !decision.unlocked && unlock) {
      await CopyUnlock.deleteOne({ _id: unlock._id });
      unlock = null;
    }

    return {
      mode: decision.mode,
      downloadOffered: explicit.personalDownload,
      sharePercent: null,
      thresholdPence: decision.thresholdPence,
      tipperCount: byUser.size,
      userTotalPence,
      unlocked: Boolean(decision.unlocked),
      grandfathered: Boolean(decision.grandfathered),
    };
  }

  const half = await loadActiveTotals(mediaId);
  const userKey = userId ? String(userId) : null;
  const userTotalPence = userKey ? (half.byUser.get(userKey) || 0) : null;
  const inHalf = userKey != null
    && half.thresholdPence != null
    && userTotalPence >= half.thresholdPence;

  let unlock = userKey
    ? await CopyUnlock.findOne({ mediaId, userId: userKey }).lean()
    : null;

  if (userKey && inHalf && !unlock) {
    await CopyUnlock.updateOne(
      { userId: userKey, mediaId },
      {
        $setOnInsert: {
          userId: userKey,
          mediaId,
          thresholdAtGrant: half.thresholdPence,
          totalAtGrant: userTotalPence,
          unlockedAt: new Date(),
        },
      },
      { upsert: true }
    );
    unlock = await CopyUnlock.findOne({ mediaId, userId: userKey }).lean();
  }

  if (userKey && unlock && !inHalf && userTotalPence < unlock.thresholdAtGrant) {
    await CopyUnlock.deleteOne({ _id: unlock._id });
    unlock = null;
  }

  return {
    mode: 'share',
    downloadOffered: true,
    sharePercent: half.sharePercent,
    thresholdPence: half.thresholdPence,
    tipperCount: half.tipperCount,
    userTotalPence,
    unlocked: Boolean(unlock),
    grandfathered: Boolean(unlock) && !inHalf,
  };
}

async function replayMediaUnlocks(mediaId) {
  const explicit = explicitDownload(await loadLicenceDoc(mediaId));
  if (explicit && !explicit.personalDownload) return 0;

  const bids = await Bid.find({ mediaId })
    .select('userId amount status createdAt refundedAt vetoedAt')
    .lean();

  const events = [];
  for (const bid of bids) {
    const userId = String(bid.userId);
    events.push({
      at: new Date(bid.createdAt).getTime(),
      type: 'tip',
      userId,
      amount: bid.amount,
    });
    if (bid.status !== 'active') {
      events.push({
        at: new Date(bid.refundedAt || bid.vetoedAt || bid.createdAt).getTime(),
        type: 'reverse',
        userId,
        amount: bid.amount,
      });
    }
  }

  const unlocks = explicit
    ? replayFixedFloor(events, explicit.unlockPence)
    : replayCopyUnlocks(events, await sharePercentFor(mediaId));
  await CopyUnlock.deleteMany({ mediaId });
  if (unlocks.length > 0) {
    await CopyUnlock.insertMany(unlocks.map((unlock) => ({
      mediaId,
      userId: unlock.userId,
      thresholdAtGrant: unlock.thresholdAtGrant,
      totalAtGrant: unlock.totalAtGrant,
      unlockedAt: new Date(unlock.unlockedAt),
    })));
  }
  return unlocks.length;
}

module.exports = {
  loadActiveTotals,
  grantCurrentHalf,
  revokeIfLapsed,
  getStatus,
  replayMediaUnlocks,
};
