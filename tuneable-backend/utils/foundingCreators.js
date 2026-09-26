/**
 * Founding Creators program:
 * - First N creators who upload verified original music claim a founding seat
 * - Perks: founding status/badge, upload allowance, exclusive artist-invite affiliate (3%)
 * - Not equity / ownership — status + platform benefits only
 *
 * Tunables via env (defaults in parentheses):
 *   FOUNDING_CREATOR_CAP (1111)
 *   FOUNDING_UPLOAD_QUOTA_MB (2048)
 */

const FOUNDING_CREATOR_CAP = Math.max(
  0,
  parseInt(process.env.FOUNDING_CREATOR_CAP || '1111', 10) || 1111
);

const FOUNDING_UPLOAD_QUOTA_MB = Math.max(
  1,
  parseInt(process.env.FOUNDING_UPLOAD_QUOTA_MB || '2048', 10) || 2048
);

const FOUNDING_UPLOAD_QUOTA_BYTES = FOUNDING_UPLOAD_QUOTA_MB * 1024 * 1024;
const MB = 1024 * 1024;

function bytesToMb(bytes) {
  return Math.round(((Number(bytes) || 0) / MB) * 10) / 10;
}

function mbToBytes(mb) {
  return Math.max(0, Math.round(Number(mb) || 0) * MB);
}

function isFoundingCreator(user) {
  return Boolean(user?.isFoundingCreator);
}

/**
 * Sum fileSize of verified original uploads owned by the user.
 */
function getFoundingProgram() {
  return require('../models/FoundingProgram');
}

async function getOriginalUploadBytesUsed(userId) {
  if (!userId) return 0;
  const mongoose = require('mongoose');
  const Media = require('../models/Media');
  const id = userId instanceof mongoose.Types.ObjectId
    ? userId
    : new mongoose.Types.ObjectId(userId);

  const rows = await Media.aggregate([
    { $unwind: '$mediaOwners' },
    {
      $match: {
        'mediaOwners.userId': id,
        $or: [
          { 'mediaOwners.verificationMethod': 'Self-upload' },
          { 'mediaOwners.verificationSource': 'upload' },
        ],
      },
    },
    {
      $group: {
        _id: null,
        total: { $sum: { $ifNull: ['$fileSize', 0] } },
      },
    },
  ]);
  return rows[0]?.total || 0;
}

/**
 * Effective upload quota in bytes for a user.
 * Founding creators get the founding allowance; others are unlimited (null) for now.
 */
function getUploadQuotaBytes(user) {
  if (!user) return null;
  if (user.isFoundingCreator) {
    const stored = Number(user.foundingUploadQuotaBytes);
    if (Number.isFinite(stored) && stored > 0) return stored;
    return FOUNDING_UPLOAD_QUOTA_BYTES;
  }
  return null;
}

/**
 * @returns {{ ok: true } | { ok: false, error: string, status: number, usedBytes: number, quotaBytes: number }}
 */
async function assertWithinUploadQuota(user, additionalBytes = 0) {
  const quotaBytes = getUploadQuotaBytes(user);
  if (quotaBytes == null) return { ok: true };

  const usedBytes = await getOriginalUploadBytesUsed(user._id);
  const nextUsed = usedBytes + Math.max(0, Number(additionalBytes) || 0);
  if (nextUsed <= quotaBytes) {
    return { ok: true, usedBytes, quotaBytes, nextUsed };
  }

  return {
    ok: false,
    status: 413,
    error: `Upload would exceed your founding creator allowance `
      + `(${bytesToMb(nextUsed)} MB of ${bytesToMb(quotaBytes)} MB). `
      + `Remove older uploads or contact support.`,
    usedBytes,
    quotaBytes,
    nextUsed,
  };
}

async function getProgramStatus() {
  const FoundingProgram = getFoundingProgram();
  const state = await FoundingProgram.getState();
  const claimed = Math.min(FOUNDING_CREATOR_CAP, Math.max(0, state.claimedSeats || 0));
  const remaining = Math.max(0, FOUNDING_CREATOR_CAP - claimed);
  return {
    cap: FOUNDING_CREATOR_CAP,
    claimed,
    remaining,
    open: remaining > 0,
    uploadQuotaMb: FOUNDING_UPLOAD_QUOTA_MB,
    uploadQuotaBytes: FOUNDING_UPLOAD_QUOTA_BYTES,
  };
}

/**
 * Claim a founding seat for a user after their first qualifying original upload.
 * Idempotent; race-safe via FoundingProgram counter.
 *
 * @returns {Promise<{ status: 'assigned'|'already'|'full'|'skipped', seatNumber?: number, user?: object }>}
 */
async function tryClaimFoundingSeat(userId, { reason = 'original_upload' } = {}) {
  const User = require('../models/User');
  const FoundingProgram = getFoundingProgram();
  if (!userId) return { status: 'skipped' };

  const existing = await User.findById(userId)
    .select('isFoundingCreator foundingSeatNumber foundingSeatAssignedAt foundingUploadQuotaBytes username');
  if (!existing) return { status: 'skipped' };
  if (existing.isFoundingCreator) {
    return { status: 'already', seatNumber: existing.foundingSeatNumber, user: existing };
  }

  const seatNumber = await FoundingProgram.claimSeat(FOUNDING_CREATOR_CAP);
  if (seatNumber == null) {
    return { status: 'full' };
  }

  const user = await User.findOneAndUpdate(
    { _id: userId, isFoundingCreator: { $ne: true } },
    {
      $set: {
        isFoundingCreator: true,
        foundingSeatNumber: seatNumber,
        foundingSeatAssignedAt: new Date(),
        foundingUploadQuotaBytes: FOUNDING_UPLOAD_QUOTA_BYTES,
        foundingSeatClaimReason: reason,
      },
    },
    { new: true }
  ).select(
    'isFoundingCreator foundingSeatNumber foundingSeatAssignedAt foundingUploadQuotaBytes username'
  );

  if (!user) {
    // Lost race — another request already founded this user; free the reserved seat.
    await FoundingProgram.releaseSeat();
    const again = await User.findById(userId)
      .select('isFoundingCreator foundingSeatNumber foundingSeatAssignedAt foundingUploadQuotaBytes username');
    return { status: 'already', seatNumber: again?.foundingSeatNumber, user: again };
  }

  console.log(
    `🏆 Founding creator seat #${seatNumber}/${FOUNDING_CREATOR_CAP} → ${user.username} (${userId})`
  );
  return { status: 'assigned', seatNumber, user };
}

/**
 * Build public/profile fields for a user (async for used bytes).
 */
async function attachFoundingProfileFields(user) {
  if (!user) return user;
  const obj = typeof user.toObject === 'function' ? user.toObject() : { ...user };
  const program = await getProgramStatus();
  const quotaBytes = getUploadQuotaBytes(obj);
  let usedBytes = 0;
  if (obj._id && (obj.isFoundingCreator || quotaBytes != null)) {
    usedBytes = await getOriginalUploadBytesUsed(obj._id);
  }

  return {
    ...obj,
    isFoundingCreator: Boolean(obj.isFoundingCreator),
    foundingSeatNumber: obj.foundingSeatNumber || null,
    foundingSeatAssignedAt: obj.foundingSeatAssignedAt || null,
    foundingUploadQuotaBytes: quotaBytes,
    foundingUploadUsedBytes: usedBytes,
    foundingUploadRemainingBytes: quotaBytes != null
      ? Math.max(0, quotaBytes - usedBytes)
      : null,
    foundingProgram: {
      cap: program.cap,
      claimed: program.claimed,
      remaining: program.remaining,
      open: program.open,
      uploadQuotaMb: program.uploadQuotaMb,
    },
  };
}

/**
 * Backfill seats for users who already have qualifying original uploads,
 * ordered by earliest upload time. Safe to re-run (skips existing founders).
 */
async function backfillFoundingSeats({ limit = FOUNDING_CREATOR_CAP } = {}) {
  const Media = require('../models/Media');
  const User = require('../models/User');

  const program = await getProgramStatus();
  if (!program.open) {
    return { assigned: 0, skipped: 0, full: true, claimed: program.claimed };
  }

  const take = Math.min(limit, program.remaining);
  const rows = await Media.aggregate([
    { $unwind: '$mediaOwners' },
    {
      $match: {
        'mediaOwners.userId': { $ne: null },
        $or: [
          { 'mediaOwners.verificationMethod': 'Self-upload' },
          { 'mediaOwners.verificationSource': 'upload' },
        ],
      },
    },
    {
      $group: {
        _id: '$mediaOwners.userId',
        firstUploadAt: {
          $min: { $ifNull: ['$uploadedAt', '$createdAt'] },
        },
      },
    },
    { $sort: { firstUploadAt: 1 } },
    { $limit: FOUNDING_CREATOR_CAP },
  ]);

  let assigned = 0;
  let skipped = 0;
  for (const row of rows) {
    if (assigned >= take) break;
    const already = await User.findById(row._id).select('isFoundingCreator');
    if (already?.isFoundingCreator) {
      skipped += 1;
      continue;
    }
    const result = await tryClaimFoundingSeat(row._id, { reason: 'backfill_original_upload' });
    if (result.status === 'assigned') assigned += 1;
    else if (result.status === 'full') break;
    else skipped += 1;
  }

  const after = await getProgramStatus();
  return { assigned, skipped, full: !after.open, claimed: after.claimed, cap: after.cap };
}

module.exports = {
  FOUNDING_CREATOR_CAP,
  FOUNDING_UPLOAD_QUOTA_MB,
  FOUNDING_UPLOAD_QUOTA_BYTES,
  bytesToMb,
  mbToBytes,
  isFoundingCreator,
  getOriginalUploadBytesUsed,
  getUploadQuotaBytes,
  assertWithinUploadQuota,
  getProgramStatus,
  tryClaimFoundingSeat,
  attachFoundingProfileFields,
  backfillFoundingSeats,
};
