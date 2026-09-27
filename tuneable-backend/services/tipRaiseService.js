/**
 * Bring a user's existing tips up to a target amount.
 *
 * Each tune below the target gets one new global tip for the gap.
 * Preview writes nothing. Confirm charges the whole raisable set, or nothing
 * when the balance cannot cover it. Tunes that fail welcome-credit rules are
 * left out of the charge and reported as skipped.
 */

const mongoose = require('mongoose');
const Bid = require('../models/Bid');
const Media = require('../models/Media');
const User = require('../models/User');
const TipRaiseReceipt = require('../models/TipRaiseReceipt');
const { placeGlobalBid } = require('./globalBidService');
const { getWelcomeCreditRemaining } = require('../utils/welcomeCreditHelper');
const {
  assertAccountCanSpend,
  assessWelcomeMediaSpend,
  createWelcomeUsageLedger,
  getArtistCapTargets,
  userControlsMedia,
} = require('../utils/welcomeCreditPolicy');

const LIST_LIMIT = 25;
const MAX_MEDIA_IDS = 2000;
const MAX_TARGET_PENCE = 100000; // £1,000 per tune
const PROCESSING_LOCK_MS = 2 * 60 * 1000;

function httpError(message, status = 400) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function parseTargetPence(targetPounds) {
  const pounds = Number(targetPounds);
  if (!Number.isFinite(pounds)) {
    throw httpError('Enter a tip amount in pounds');
  }
  const pence = Math.round(pounds * 100);
  if (pence < 1) {
    throw httpError('Minimum amount is £0.01');
  }
  if (pence > MAX_TARGET_PENCE) {
    throw httpError('Maximum amount is £1000.00');
  }
  return pence;
}

function normalizeMediaIds(mediaIds) {
  if (mediaIds == null) return null;
  if (!Array.isArray(mediaIds)) {
    throw httpError('mediaIds must be an array');
  }
  if (mediaIds.length === 0) return null;
  if (mediaIds.length > MAX_MEDIA_IDS) {
    throw httpError(`Select at most ${MAX_MEDIA_IDS} tunes`);
  }
  return mediaIds.map((id) => {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw httpError('Invalid media id');
    }
    return new mongoose.Types.ObjectId(id);
  });
}

function creatorLabel(media) {
  return media?.artist?.[0]?.name
    || media?.author?.[0]?.name
    || media?.host?.[0]?.name
    || 'Unknown';
}

function minimumGapPence(media) {
  const pounds = media?.minimumBid;
  if (typeof pounds === 'number' && pounds > 0) {
    return Math.max(1, Math.round(pounds * 100));
  }
  return 1;
}

function summaryItem(media, extra) {
  return {
    mediaId: String(media._id),
    title: media.title || 'Unknown Title',
    artist: creatorLabel(media),
    coverArt: media.coverArt || null,
    ...extra,
  };
}

/**
 * Decide which tips rise, which are already at the target, and which welcome
 * rules skip. Does not write. `assess` is injectable for tests.
 */
async function buildTipRaisePlan({
  user,
  entries,
  targetPence,
  assess = assessWelcomeMediaSpend,
  ledger,
}) {
  const balancePence = Math.max(0, Math.round(user.balance || 0));
  const simulated = {
    _id: user._id,
    balance: balancePence,
    welcomeCreditRemainingPence: getWelcomeCreditRemaining(user),
    isActive: user.isActive,
    role: user.role,
  };

  const ordered = [...entries].sort((a, b) => {
    const gapA = Math.max(0, targetPence - (a.currentPence || 0));
    const gapB = Math.max(0, targetPence - (b.currentPence || 0));
    if (gapA !== gapB) return gapA - gapB;
    return String(a.media?._id || '').localeCompare(String(b.media?._id || ''));
  });

  const willRaise = [];
  const already = [];
  const skipped = [];

  for (const entry of ordered) {
    const media = entry.media;
    const currentPence = Math.max(0, Math.round(entry.currentPence || 0));

    if (!media || media.status === 'deleted' || media.status === 'vetoed') {
      skipped.push({
        mediaId: String(entry.mediaId || media?._id || ''),
        title: media?.title || entry.title || 'Unknown Title',
        artist: media ? creatorLabel(media) : (entry.artist || 'Unknown'),
        coverArt: media?.coverArt || null,
        currentPence,
        gapPence: Math.max(0, targetPence - currentPence),
        code: 'unavailable',
        message: 'This tune is no longer available.',
      });
      continue;
    }

    if (currentPence >= targetPence) {
      already.push(summaryItem(media, { currentPence }));
      continue;
    }

    const gapPence = targetPence - currentPence;
    const minimumPence = minimumGapPence(media);
    if (gapPence < minimumPence) {
      skipped.push({
        ...summaryItem(media, { currentPence, gapPence }),
        code: 'below_minimum',
        message: `The gap is £${(gapPence / 100).toFixed(2)}, below this tune's £${(minimumPence / 100).toFixed(2)} minimum tip.`,
      });
      continue;
    }

    const decision = await assess({
      user: simulated,
      amountPence: gapPence,
      media,
      ledger,
      skipBalanceCheck: true,
    });

    if (!decision.ok) {
      skipped.push({
        ...summaryItem(media, { currentPence, gapPence }),
        code: decision.code,
        message: decision.message,
      });
      continue;
    }

    willRaise.push(summaryItem(media, {
      currentPence,
      gapPence,
      nextPence: targetPence,
      welcomeAppliedPence: decision.welcomeAppliedPence || 0,
    }));

    const applied = decision.welcomeAppliedPence || 0;
    simulated.welcomeCreditRemainingPence = Math.max(
      0,
      (simulated.welcomeCreditRemainingPence || 0) - applied
    );
    if (ledger && applied > 0) {
      ledger.note({
        mediaId: media._id,
        welcomeAppliedPence: applied,
        controlsMedia: userControlsMedia(simulated, media),
        targets: getArtistCapTargets(media),
      });
    }
  }

  const chargePence = willRaise.reduce((sum, item) => sum + item.gapPence, 0);
  const shortfallPence = Math.max(0, chargePence - balancePence);

  return {
    targetPence,
    balancePence,
    chargePence,
    shortfallPence,
    canAfford: shortfallPence === 0,
    willRaise,
    already,
    skipped,
  };
}

function presentPlan(plan, {
  applied = false,
  partial = false,
  error = null,
  balanceAfterPence = null,
  raised = [],
} = {}) {
  return {
    applied,
    partial,
    error,
    targetPence: plan.targetPence,
    targetPounds: plan.targetPence / 100,
    balancePence: plan.balancePence,
    balanceAfterPence: balanceAfterPence == null ? plan.balancePence : balanceAfterPence,
    projectedBalancePence: Math.max(0, plan.balancePence - plan.chargePence),
    shortfallPence: plan.shortfallPence,
    canAfford: plan.canAfford,
    chargePence: plan.chargePence,
    chargePounds: plan.chargePence / 100,
    counts: {
      raise: plan.willRaise.length,
      already: plan.already.length,
      skipped: plan.skipped.length,
    },
    willRaise: plan.willRaise.slice(0, LIST_LIMIT),
    willRaiseHasMore: plan.willRaise.length > LIST_LIMIT,
    skipped: plan.skipped.slice(0, LIST_LIMIT),
    skippedHasMore: plan.skipped.length > LIST_LIMIT,
    raised,
  };
}

async function loadEntries(userId, mediaIds) {
  const match = {
    userId: new mongoose.Types.ObjectId(String(userId)),
    status: 'active',
  };
  if (mediaIds) {
    match.mediaId = { $in: mediaIds };
  }

  const aggregates = await Bid.aggregate([
    { $match: match },
    { $group: { _id: '$mediaId', currentPence: { $sum: '$amount' } } },
  ]);

  if (aggregates.length === 0) return [];

  const ids = aggregates.map((row) => row._id).filter(Boolean);
  const mediaDocs = await Media.find({ _id: { $in: ids } })
    .select('title artist host author mediaOwners coverArt status contentType contentForm minimumBid')
    .lean();
  const byId = new Map(mediaDocs.map((media) => [String(media._id), media]));

  return aggregates.map((row) => ({
    mediaId: row._id,
    currentPence: row.currentPence || 0,
    media: byId.get(String(row._id)) || null,
  }));
}

async function planForUser(user, { targetPounds, mediaIds }) {
  const targetPence = parseTargetPence(targetPounds);
  const ids = normalizeMediaIds(mediaIds);
  const entries = await loadEntries(user._id, ids);
  const ledger = createWelcomeUsageLedger(user._id);
  const plan = await buildTipRaisePlan({
    user,
    entries,
    targetPence,
    ledger,
  });
  return plan;
}

async function previewTipRaise(userId, body = {}) {
  const user = await User.findById(userId);
  if (!user) throw httpError('User not found', 404);
  await assertAccountCanSpend(user);
  const plan = await planForUser(user, body);
  return presentPlan(plan);
}

async function claimReceipt(userId, idempotencyKey) {
  if (typeof idempotencyKey !== 'string' || idempotencyKey.length < 8 || idempotencyKey.length > 80) {
    throw httpError('A valid idempotency key is required');
  }

  const existing = await TipRaiseReceipt.findOne({ userId, idempotencyKey });
  if (existing?.status === 'completed' && existing.result) {
    return { replay: existing.result };
  }
  if (existing?.status === 'processing') {
    const age = Date.now() - new Date(existing.updatedAt).getTime();
    if (age < PROCESSING_LOCK_MS) {
      throw httpError('A tip raise is already running. Wait a moment and try again.', 409);
    }
    existing.status = 'processing';
    existing.result = null;
    await existing.save();
    return { receipt: existing };
  }

  await TipRaiseReceipt.updateMany(
    {
      userId,
      status: 'processing',
      updatedAt: { $lt: new Date(Date.now() - PROCESSING_LOCK_MS) },
    },
    { $set: { status: 'aborted' } }
  );

  const busy = await TipRaiseReceipt.findOne({
    userId,
    status: 'processing',
    idempotencyKey: { $ne: idempotencyKey },
    updatedAt: { $gt: new Date(Date.now() - PROCESSING_LOCK_MS) },
  }).select('_id');
  if (busy) {
    throw httpError('A tip raise is already running. Wait a moment and try again.', 409);
  }

  if (existing) {
    existing.status = 'processing';
    existing.result = null;
    await existing.save();
    return { receipt: existing };
  }

  try {
    const receipt = await TipRaiseReceipt.create({
      userId,
      idempotencyKey,
      status: 'processing',
    });
    return { receipt };
  } catch (error) {
    if (error?.code === 11000) {
      const raced = await TipRaiseReceipt.findOne({ userId, idempotencyKey });
      if (raced?.status === 'completed' && raced.result) return { replay: raced.result };
      throw httpError('A tip raise is already running. Wait a moment and try again.', 409);
    }
    throw error;
  }
}

async function confirmTipRaise(userId, body = {}) {
  const user = await User.findById(userId);
  if (!user) throw httpError('User not found', 404);
  await assertAccountCanSpend(user);

  const claimed = await claimReceipt(user._id, body.idempotencyKey);
  if (claimed.replay) return claimed.replay;

  const receipt = claimed.receipt;
  try {
    const freshUser = await User.findById(userId);
    if (!freshUser) throw httpError('User not found', 404);
    const plan = await planForUser(freshUser, body);

    if (plan.willRaise.length === 0 || !plan.canAfford) {
      const bodyOut = presentPlan(plan, { applied: false });
      receipt.status = 'aborted';
      receipt.result = bodyOut;
      await receipt.save();
      return bodyOut;
    }

    const raised = [];
    let balanceAfterPence = freshUser.balance || 0;
    let failure = null;

    for (const item of plan.willRaise) {
      try {
        const placed = await placeGlobalBid(freshUser._id, {
          mediaId: item.mediaId,
          amount: item.gapPence / 100,
          allowWritten: true,
          skipTagRankings: true,
          platform: 'tip-raise',
          currentLocation: body.currentLocation,
        });
        balanceAfterPence = placed.updatedBalance;
        raised.push({
          mediaId: item.mediaId,
          bidId: placed.bid?._id ? String(placed.bid._id) : null,
          gapPence: item.gapPence,
        });
      } catch (error) {
        failure = error;
        break;
      }
    }

    if (raised.length > 0) {
      try {
        const tagRankingsService = require('./tagRankingsService');
        tagRankingsService.invalidateUserTagRankings(freshUser._id).catch(console.error);
        tagRankingsService.calculateAndUpdateUserTagRankings(freshUser._id, 10, true).catch(console.error);
      } catch (error) {
        console.error('Error refreshing tag rankings after tip raise:', error);
      }
    }

    const partial = Boolean(failure) && raised.length > 0 && raised.length < plan.willRaise.length;
    const applied = raised.length > 0 && !failure;
    const response = presentPlan(plan, {
      applied: applied || partial,
      partial,
      error: failure ? (failure.message || 'Failed to raise every tip') : null,
      balanceAfterPence: raised.length > 0 ? balanceAfterPence : plan.balancePence,
      raised,
    });

    if (raised.length === 0) {
      receipt.status = 'aborted';
    } else {
      receipt.status = 'completed';
    }
    receipt.result = response;
    await receipt.save();
    return response;
  } catch (error) {
    if (receipt.status === 'processing') {
      receipt.status = 'aborted';
      receipt.result = { error: error.message || 'Failed to raise tips' };
      await receipt.save().catch(() => {});
    }
    throw error;
  }
}

module.exports = {
  parseTargetPence,
  buildTipRaisePlan,
  presentPlan,
  previewTipRaise,
  confirmTipRaise,
};
