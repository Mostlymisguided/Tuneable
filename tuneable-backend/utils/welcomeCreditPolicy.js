/**
 * Welcome-credit spend safeguards.
 *
 * Rules (promotional portion only unless noted):
 * - Wallet freeze / inactive accounts cannot spend
 * - Unused welcome credit expires 12 months after grant
 * - Welcome-funded tips capped at £1.11 per tip
 * - Max £3.33 welcome + max 3 distinct media per artist (owner or name key)
 * - Own / controlled media: welcome credit allowed, but max £1.11 per media (artist caps skipped)
 * - Refunds do not restore welcome credit (see welcomeCreditHelper)
 * - Welcome-funded artist share is provisional until a real top-up (90 days)
 */

const mongoose = require('mongoose');
const {
  WELCOME_CREDIT_PENCE,
  peekWelcomeCreditApplied,
  getWelcomeCreditRemaining,
  revokeUnspentWelcomeCredit,
} = require('./welcomeCreditHelper');

const MAX_WELCOME_PER_TIP_PENCE = 111; // £1.11
const MAX_WELCOME_SELF_PER_MEDIA_PENCE = MAX_WELCOME_PER_TIP_PENCE; // £1.11 total welcome per owned media
const MAX_WELCOME_PER_ARTIST_PENCE = 333; // £3.33
const MAX_WELCOME_MEDIA_PER_ARTIST = 3;
const WELCOME_CREDIT_EXPIRY_MONTHS = 12;

/** Payout risk: hold when welcome-funded tips toward artist exceed both thresholds */
const PAYOUT_WELCOME_RISK_MIN_PENCE = 500; // £5.00
const PAYOUT_WELCOME_RISK_SHARE = 0.5; // 50% of tip volume

const CODES = {
  ACCOUNT_INACTIVE: 'WELCOME_ACCOUNT_INACTIVE',
  WALLET_FROZEN: 'WELCOME_WALLET_FROZEN',
  TIP_TOO_LARGE: 'WELCOME_TIP_TOO_LARGE',
  SELF_DEAL: 'WELCOME_SELF_DEAL',
  SELF_MEDIA_CAP: 'WELCOME_SELF_MEDIA_CAP',
  ARTIST_CAP_AMOUNT: 'WELCOME_ARTIST_CAP_AMOUNT',
  ARTIST_CAP_MEDIA: 'WELCOME_ARTIST_CAP_MEDIA',
  PAYOUT_HELD: 'PAYOUT_HELD',
  PAYOUT_WELCOME_RISK: 'PAYOUT_WELCOME_RISK',
};

function policyError(code, message, status = 400, details = {}) {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  err.details = details;
  return err;
}

function idStr(value) {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (value._id) return String(value._id);
  return String(value);
}

function normalizeArtistName(name) {
  if (!name || typeof name !== 'string') return null;
  const normalized = name.trim().toLowerCase().replace(/\s+/g, ' ');
  return normalized || null;
}

/**
 * UserIds that control / earn from this media (owners + linked artist profiles).
 */
function getMediaControllerUserIds(media) {
  const ids = new Set();
  if (!media) return ids;

  for (const owner of media.mediaOwners || []) {
    const id = idStr(owner.userId);
    if (id && mongoose.Types.ObjectId.isValid(id)) ids.add(id);
  }

  for (const artist of media.artist || []) {
    const id = idStr(artist.userId);
    if (id && mongoose.Types.ObjectId.isValid(id)) ids.add(id);
  }

  for (const host of media.host || []) {
    const id = idStr(host.userId);
    if (id && mongoose.Types.ObjectId.isValid(id)) ids.add(id);
  }

  return ids;
}

/**
 * True when the tipper owns or is linked as artist/host on this media.
 */
function userControlsMedia(user, media) {
  const tipperId = idStr(user?._id);
  if (!tipperId) return false;
  return getMediaControllerUserIds(media).has(tipperId);
}

/** @deprecated Use userControlsMedia — own-media welcome tips are capped, not blocked. */
function isWelcomeSelfDeal(user, media) {
  return userControlsMedia(user, media);
}

function remainingSelfMediaWelcomePence(usedPence) {
  return Math.max(0, MAX_WELCOME_SELF_PER_MEDIA_PENCE - Math.max(0, Math.round(Number(usedPence) || 0)));
}

/**
 * Cap keys for per-artist welcome limits.
 * Prefer owner user keys (with ownership weight); fall back to primary artist/host name.
 * @returns {{ key: string, label: string, weight: number }[]}
 */
function getArtistCapTargets(media) {
  const targets = [];
  const owners = (media?.mediaOwners || []).filter((o) => o?.userId && o.percentage > 0);

  if (owners.length > 0) {
    const totalPct = owners.reduce((sum, o) => sum + (Number(o.percentage) || 0), 0) || 100;
    for (const owner of owners) {
      const id = idStr(owner.userId);
      if (!id) continue;
      targets.push({
        key: `user:${id}`,
        label: `artist account`,
        weight: (Number(owner.percentage) || 0) / totalPct,
      });
    }
    return targets;
  }

  const primaryName =
    normalizeArtistName(media?.artist?.[0]?.name) ||
    normalizeArtistName(media?.host?.[0]?.name);

  if (primaryName) {
    targets.push({
      key: `name:${primaryName}`,
      label: media?.artist?.[0]?.name || media?.host?.[0]?.name || primaryName,
      weight: 1,
    });
  }

  return targets;
}

function computeWelcomeExpiryDate(fromDate = new Date()) {
  const expires = new Date(fromDate);
  expires.setMonth(expires.getMonth() + WELCOME_CREDIT_EXPIRY_MONTHS);
  return expires;
}

/**
 * Stamp grant + expiry when welcome credit is first given (or topped up as promo).
 * Mutates user in memory; caller saves.
 */
function stampWelcomeCreditGrant(user, { grantedAt = new Date() } = {}) {
  user.welcomeCreditGrantedAt = grantedAt;
  user.welcomeCreditExpiresAt = computeWelcomeExpiryDate(grantedAt);
}

/**
 * Auto-revoke expired unused welcome credit. Mutates + may save user.
 * Backfills expiry for legacy grants (12 months from grant/signup).
 */
async function expireWelcomeCreditIfNeeded(user) {
  const remaining = getWelcomeCreditRemaining(user);
  if (remaining <= 0) return { expired: false };

  if (!user.welcomeCreditExpiresAt) {
    const grantedAt = user.welcomeCreditGrantedAt || user.createdAt || new Date();
    if (!user.welcomeCreditGrantedAt) {
      user.welcomeCreditGrantedAt = grantedAt;
    }
    user.welcomeCreditExpiresAt = computeWelcomeExpiryDate(new Date(grantedAt));
    try {
      await user.save();
    } catch (saveErr) {
      console.error('Failed to backfill welcome credit expiry:', saveErr);
    }
  }

  if (new Date(user.welcomeCreditExpiresAt) > new Date()) return { expired: false };

  const result = await revokeUnspentWelcomeCredit(user, {
    reason: `Unused welcome credit expired after ${WELCOME_CREDIT_EXPIRY_MONTHS} months`,
  });
  return { expired: true, ...result };
}

async function assertAccountCanSpend(user) {
  if (user.isActive === false) {
    throw policyError(
      CODES.ACCOUNT_INACTIVE,
      'Your account is inactive. Contact support if you believe this is an error.',
      403
    );
  }

  if (user.walletFrozenAt) {
    throw policyError(
      CODES.WALLET_FROZEN,
      user.walletFrozenReason
        ? `Your wallet is frozen: ${user.walletFrozenReason}`
        : 'Your wallet is frozen pending review. Contact support for help.',
      403,
      { walletFrozenAt: user.walletFrozenAt }
    );
  }

  await expireWelcomeCreditIfNeeded(user);
}

/**
 * Resolve media IDs that count toward an artist cap key for this tipper's history.
 */
async function findMediaIdsForArtistKey(artistKey) {
  const Media = require('../models/Media');

  if (artistKey.startsWith('user:')) {
    const userId = artistKey.slice(5);
    if (!mongoose.Types.ObjectId.isValid(userId)) return [];
    return Media.find({
      $or: [
        { 'mediaOwners.userId': userId },
        { 'artist.userId': userId },
        { 'host.userId': userId },
      ],
    }).distinct('_id');
  }

  if (artistKey.startsWith('name:')) {
    const name = artistKey.slice(5);
    // Case-insensitive match on primary artist/host name; unowned or named catalogue.
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const nameRegex = new RegExp(`^${escaped}$`, 'i');
    return Media.find({
      $or: [{ 'artist.0.name': nameRegex }, { 'host.0.name': nameRegex }],
    }).distinct('_id');
  }

  return [];
}

/**
 * Historical welcome spend by this tipper toward an artist key.
 * Counts all bids that applied welcome credit (refunds no longer restore promo).
 */
async function getWelcomeUsageTowardArtist(tipperUserId, artistKey) {
  const Bid = require('../models/Bid');
  const mediaIds = await findMediaIdsForArtistKey(artistKey);
  if (!mediaIds.length) {
    return { pence: 0, mediaIds: new Set() };
  }

  const bids = await Bid.find({
    userId: tipperUserId,
    mediaId: { $in: mediaIds },
    welcomeCreditAppliedPence: { $gt: 0 },
  })
    .select('mediaId welcomeCreditAppliedPence')
    .lean();

  let pence = 0;
  const tippedMediaIds = new Set();
  for (const bid of bids) {
    pence += bid.welcomeCreditAppliedPence || 0;
    if (bid.mediaId) tippedMediaIds.add(String(bid.mediaId));
  }

  return { pence, mediaIds: tippedMediaIds };
}

/**
 * Historical welcome spend by this tipper on a single media item.
 */
async function getWelcomeUsageOnMedia(tipperUserId, mediaId) {
  const Bid = require('../models/Bid');
  const mediaIdStr = idStr(mediaId);
  if (!tipperUserId || !mediaIdStr || !mongoose.Types.ObjectId.isValid(mediaIdStr)) {
    return 0;
  }

  const bids = await Bid.find({
    userId: tipperUserId,
    mediaId: mediaIdStr,
    welcomeCreditAppliedPence: { $gt: 0 },
  })
    .select('welcomeCreditAppliedPence')
    .lean();

  return bids.reduce((sum, b) => sum + (b.welcomeCreditAppliedPence || 0), 0);
}

/**
 * In-memory welcome usage for a batch of tips.
 * DB history is loaded once per key; planned tips in the same batch are added on top
 * so later items see earlier welcome spend before those bids exist.
 */
function createWelcomeUsageLedger(userId) {
  const selfDb = new Map();
  const selfExtra = new Map();
  const artistDb = new Map();
  const artistExtra = new Map();

  return {
    async selfUsed(mediaId) {
      const key = String(mediaId);
      if (!selfDb.has(key)) {
        selfDb.set(key, await getWelcomeUsageOnMedia(userId, key));
      }
      return selfDb.get(key) + (selfExtra.get(key) || 0);
    },
    async artistUsage(artistKey) {
      if (!artistDb.has(artistKey)) {
        artistDb.set(artistKey, await getWelcomeUsageTowardArtist(userId, artistKey));
      }
      const base = artistDb.get(artistKey);
      const extra = artistExtra.get(artistKey) || { pence: 0, mediaIds: new Set() };
      return {
        pence: base.pence + extra.pence,
        mediaIds: new Set([...base.mediaIds, ...extra.mediaIds]),
      };
    },
    note({ mediaId, welcomeAppliedPence, controlsMedia, targets }) {
      const applied = Math.max(0, Math.round(Number(welcomeAppliedPence) || 0));
      if (applied <= 0) return;
      const id = String(mediaId);
      if (controlsMedia) {
        selfExtra.set(id, (selfExtra.get(id) || 0) + applied);
        return;
      }
      for (const target of targets || []) {
        const extra = artistExtra.get(target.key) || { pence: 0, mediaIds: new Set() };
        extra.pence += Math.round(applied * (target.weight || 1));
        extra.mediaIds.add(id);
        artistExtra.set(target.key, extra);
      }
    },
  };
}

/**
 * Welcome-credit decision for one media tip.
 * Returns a result instead of throwing so a batch can skip one tune and continue.
 * @returns {Promise<{ ok: true, welcomeAppliedPence: number } | { ok: false, code: string, message: string, status: number, details: object }>}
 */
async function assessWelcomeMediaSpend({ user, amountPence, media, ledger, skipBalanceCheck = false }) {
  const amount = Math.max(0, Math.round(Number(amountPence)) || 0);
  if (!skipBalanceCheck && (user.balance || 0) < amount) {
    return {
      ok: false,
      code: 'WELCOME_INSUFFICIENT_BALANCE',
      message: 'Insufficient balance',
      status: 400,
      details: {
        required: amount / 100,
        available: (user.balance || 0) / 100,
      },
    };
  }

  const welcomeAppliedPence = peekWelcomeCreditApplied(user, amount);
  if (welcomeAppliedPence <= 0) {
    return { ok: true, welcomeAppliedPence: 0 };
  }

  if (amount > MAX_WELCOME_PER_TIP_PENCE) {
    return {
      ok: false,
      code: CODES.TIP_TOO_LARGE,
      message: `Tips funded by welcome credit are limited to £${(MAX_WELCOME_PER_TIP_PENCE / 100).toFixed(2)} each.`,
      status: 400,
      details: {
        maxWelcomeTipPence: MAX_WELCOME_PER_TIP_PENCE,
        maxWelcomeTipPounds: MAX_WELCOME_PER_TIP_PENCE / 100,
        amountPence: amount,
      },
    };
  }

  if (userControlsMedia(user, media)) {
    const usedPence = ledger
      ? await ledger.selfUsed(media?._id)
      : await getWelcomeUsageOnMedia(user._id, media?._id);
    const remaining = remainingSelfMediaWelcomePence(usedPence);
    if (welcomeAppliedPence > remaining) {
      const maxLabel = `£${(MAX_WELCOME_SELF_PER_MEDIA_PENCE / 100).toFixed(2)}`;
      return {
        ok: false,
        code: CODES.SELF_MEDIA_CAP,
        message: remaining <= 0
          ? `Welcome credit on your own media is limited to ${maxLabel} per track.`
          : `Welcome credit on your own media is limited to ${maxLabel} per track. You have £${(remaining / 100).toFixed(2)} remaining on this track.`,
        status: 400,
        details: {
          maxSelfMediaPence: MAX_WELCOME_SELF_PER_MEDIA_PENCE,
          usedPence,
          remainingPence: remaining,
        },
      };
    }
    return { ok: true, welcomeAppliedPence };
  }

  const targets = getArtistCapTargets(media);
  const mediaIdStr = idStr(media?._id);

  for (const target of targets) {
    const usage = ledger
      ? await ledger.artistUsage(target.key)
      : await getWelcomeUsageTowardArtist(user._id, target.key);
    const attributed = Math.round(welcomeAppliedPence * (target.weight || 1));
    const nextPence = usage.pence + attributed;

    if (nextPence > MAX_WELCOME_PER_ARTIST_PENCE) {
      const remaining = Math.max(0, MAX_WELCOME_PER_ARTIST_PENCE - usage.pence);
      return {
        ok: false,
        code: CODES.ARTIST_CAP_AMOUNT,
        message: `Welcome credit toward this artist is capped at £${(MAX_WELCOME_PER_ARTIST_PENCE / 100).toFixed(2)}. ` +
          `You have £${(remaining / 100).toFixed(2)} remaining for this artist.`,
        status: 400,
        details: {
          artistKey: target.key,
          artistLabel: target.label,
          maxPence: MAX_WELCOME_PER_ARTIST_PENCE,
          usedPence: usage.pence,
          remainingPence: remaining,
        },
      };
    }

    const alreadyTippedThisMedia = mediaIdStr && usage.mediaIds.has(mediaIdStr);
    if (!alreadyTippedThisMedia && usage.mediaIds.size >= MAX_WELCOME_MEDIA_PER_ARTIST) {
      return {
        ok: false,
        code: CODES.ARTIST_CAP_MEDIA,
        message: `Welcome credit can be used on at most ${MAX_WELCOME_MEDIA_PER_ARTIST} songs per artist.`,
        status: 400,
        details: {
          artistKey: target.key,
          artistLabel: target.label,
          maxMedia: MAX_WELCOME_MEDIA_PER_ARTIST,
          tippedMediaCount: usage.mediaIds.size,
        },
      };
    }
  }

  return { ok: true, welcomeAppliedPence };
}

/**
 * Enforce welcome-credit rules for a media tip (party / global / podcast).
 * Call after media is resolved and before creating the Bid.
 * @returns {{ welcomeAppliedPence: number }}
 */
async function assertWelcomeMediaSpend({ user, amountPence, media }) {
  await assertAccountCanSpend(user);
  const result = await assessWelcomeMediaSpend({ user, amountPence, media });
  if (!result.ok) {
    throw policyError(result.code, result.message, result.status || 400, result.details || {});
  }
  return { welcomeAppliedPence: result.welcomeAppliedPence };
}

/**
 * Enforce freeze / expiry / per-spend welcome max for non-media spends (e.g. pledges).
 */
async function assertWelcomeGenericSpend({ user, amountPence }) {
  await assertAccountCanSpend(user);

  const amount = Math.max(0, Math.round(Number(amountPence)) || 0);
  if ((user.balance || 0) < amount) {
    throw policyError(
      'WELCOME_INSUFFICIENT_BALANCE',
      'Insufficient wallet balance',
      400,
      {
        required: amount / 100,
        available: (user.balance || 0) / 100,
      }
    );
  }

  const welcomeAppliedPence = peekWelcomeCreditApplied(user, amount);

  if (welcomeAppliedPence > 0 && amount > MAX_WELCOME_PER_TIP_PENCE) {
    throw policyError(
      CODES.TIP_TOO_LARGE,
      `Spends funded by welcome credit are limited to £${(MAX_WELCOME_PER_TIP_PENCE / 100).toFixed(2)} each.`,
      400,
      {
        maxWelcomeTipPence: MAX_WELCOME_PER_TIP_PENCE,
        amountPence: amount,
      }
    );
  }

  return { welcomeAppliedPence };
}

/**
 * Welcome-origin tip volume toward an artist's owned media (for payout risk).
 */
async function getArtistWelcomeOriginStats(artistUserId) {
  const Media = require('../models/Media');
  const Bid = require('../models/Bid');

  const mediaIds = await Media.find({
    $or: [
      { 'mediaOwners.userId': artistUserId },
      { 'artist.userId': artistUserId },
      { 'host.userId': artistUserId },
    ],
  }).distinct('_id');

  if (!mediaIds.length) {
    return {
      totalTipPence: 0,
      welcomeTipPence: 0,
      welcomeShare: 0,
      mediaCount: 0,
    };
  }

  const bids = await Bid.find({
    mediaId: { $in: mediaIds },
    status: { $ne: 'refunded' },
  })
    .select('amount welcomeCreditAppliedPence')
    .lean();

  let totalTipPence = 0;
  let welcomeTipPence = 0;
  for (const bid of bids) {
    totalTipPence += bid.amount || 0;
    welcomeTipPence += bid.welcomeCreditAppliedPence || 0;
  }

  return {
    totalTipPence,
    welcomeTipPence,
    welcomeShare: totalTipPence > 0 ? welcomeTipPence / totalTipPence : 0,
    mediaCount: mediaIds.length,
  };
}

/**
 * Gate artist payout requests for manual holds and welcome-origin risk.
 */
async function assertPayoutAllowed(user) {
  const { expireDuePromoEscrowForArtist } = require('../services/welcomePromoEscrowService');
  await expireDuePromoEscrowForArtist(user._id);

  if (user.payoutHeldAt) {
    throw policyError(
      CODES.PAYOUT_HELD,
      user.payoutHeldReason
        ? `Payouts are on hold: ${user.payoutHeldReason}`
        : 'Payouts for this account are on hold pending review. Contact support.',
      403,
      { payoutHeldAt: user.payoutHeldAt }
    );
  }

  if (user.walletFrozenAt) {
    throw policyError(
      CODES.WALLET_FROZEN,
      'Your wallet is frozen pending review. Payouts cannot be requested until the hold is lifted.',
      403
    );
  }

  const stats = await getArtistWelcomeOriginStats(user._id);
  const risky =
    stats.welcomeTipPence >= PAYOUT_WELCOME_RISK_MIN_PENCE &&
    stats.welcomeShare >= PAYOUT_WELCOME_RISK_SHARE;

  if (risky) {
    throw policyError(
      CODES.PAYOUT_WELCOME_RISK,
      'This payout needs a manual review because a high share of tips used promotional welcome credit. We\'ll be in touch — or email support to speed this up.',
      403,
      {
        welcomeTipPence: stats.welcomeTipPence,
        welcomeTipPounds: stats.welcomeTipPence / 100,
        totalTipPence: stats.totalTipPence,
        welcomeShare: Math.round(stats.welcomeShare * 1000) / 1000,
      }
    );
  }

  return { welcomeOrigin: stats, riskFlagged: false };
}

/**
 * Express helper: send policy error JSON if applicable.
 * @returns {boolean} true if response was sent
 */
function sendPolicyError(res, err) {
  if (!err?.code || !String(err.code).match(/^(WELCOME_|PAYOUT_)/)) return false;
  res.status(err.status || 400).json({
    error: err.message,
    code: err.code,
    ...(err.details || {}),
  });
  return true;
}

module.exports = {
  CODES,
  MAX_WELCOME_PER_TIP_PENCE,
  MAX_WELCOME_SELF_PER_MEDIA_PENCE,
  MAX_WELCOME_PER_ARTIST_PENCE,
  MAX_WELCOME_MEDIA_PER_ARTIST,
  WELCOME_CREDIT_EXPIRY_MONTHS,
  WELCOME_CREDIT_PENCE,
  PAYOUT_WELCOME_RISK_MIN_PENCE,
  PAYOUT_WELCOME_RISK_SHARE,
  policyError,
  getMediaControllerUserIds,
  userControlsMedia,
  isWelcomeSelfDeal,
  remainingSelfMediaWelcomePence,
  getArtistCapTargets,
  computeWelcomeExpiryDate,
  stampWelcomeCreditGrant,
  expireWelcomeCreditIfNeeded,
  assertAccountCanSpend,
  createWelcomeUsageLedger,
  assessWelcomeMediaSpend,
  assertWelcomeMediaSpend,
  assertWelcomeGenericSpend,
  getWelcomeUsageTowardArtist,
  getWelcomeUsageOnMedia,
  getArtistWelcomeOriginStats,
  assertPayoutAllowed,
  sendPolicyError,
};
