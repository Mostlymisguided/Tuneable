/**
 * Artist-invite affiliate: 3% of an invited artist's paid tip revenue
 * for 12 months, taken from Tuneable's platform share (artist still gets 70%).
 * Only original artist uploads qualify — not claimed library imports.
 */

const { isOriginalUploadOwner, isVerifiedOriginalUpload } = require('./mediaRights');

const AFFILIATE_SHARE_OF_ARTIST = 0.03;
const AFFILIATE_SHARE_PERCENT = Math.round(AFFILIATE_SHARE_OF_ARTIST * 100);
const AFFILIATE_WINDOW_MS = 365 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function computeAffiliateSharePence(paidArtistSharePence) {
  const paid = Math.max(0, Math.round(Number(paidArtistSharePence) || 0));
  if (paid <= 0) return 0;
  return Math.round(paid * AFFILIATE_SHARE_OF_ARTIST);
}

function originalUploaderOwner(media) {
  return (media?.mediaOwners || []).find((owner) => (
    isOriginalUploadOwner(owner) && owner.userId
  )) || null;
}

function isWithinAffiliateWindow(artistUser, now = new Date()) {
  return affiliateWindowInfo(artistUser?.createdAt, now).active;
}

function affiliateWindowInfo(createdAt, now = new Date()) {
  const start = createdAt ? new Date(createdAt) : null;
  if (!start || Number.isNaN(start.getTime())) {
    return { endsAt: null, active: false, daysRemaining: 0 };
  }
  const endsAt = new Date(start.getTime() + AFFILIATE_WINDOW_MS);
  const msLeft = endsAt.getTime() - now.getTime();
  return {
    endsAt,
    active: msLeft > 0,
    daysRemaining: Math.max(0, Math.ceil(msLeft / DAY_MS)),
  };
}

function isAffiliateEligible({
  media,
  artistUser,
  inviterUser,
  tipperUserId = null,
  now = new Date(),
} = {}) {
  if (!media || !artistUser || !inviterUser) return false;
  if (!isVerifiedOriginalUpload(media)) return false;
  if (String(artistUser._id) === String(inviterUser._id)) return false;
  if (tipperUserId && String(tipperUserId) === String(inviterUser._id)) return false;
  if (!isWithinAffiliateWindow(artistUser, now)) return false;
  return true;
}

function ownerPaidSharePence(paidArtistSharePence, percentage) {
  const pct = Number(percentage);
  if (!Number.isFinite(pct) || pct <= 0) return 0;
  return Math.round(Math.max(0, paidArtistSharePence) * (pct / 100));
}

function isInvitedCreator(user) {
  const status = user?.creatorProfile?.verificationStatus;
  return status === 'verified' || status === 'pending';
}

/** Sentence sent to the invited artist. The cut comes from Tuneable, not their 70%. */
function inviteeAffiliateDisclosure(inviterName) {
  const who = inviterName || 'Your inviter';
  return `If you upload your own music, ${who} earns ${AFFILIATE_SHARE_PERCENT}% of your paid tips for your first year — taken from Tuneable's share, not yours.`;
}

/**
 * Add creator/upload/window/commission fields for invitee lists.
 */
async function attachAffiliateInviteStats(inviter, invitedUsers = [], now = new Date()) {
  const mongoose = require('mongoose');
  const Media = require('../models/Media');
  const ids = invitedUsers
    .map((u) => u?._id)
    .filter(Boolean)
    .map((id) => (id instanceof mongoose.Types.ObjectId ? id : new mongoose.Types.ObjectId(id)));

  const countByOwner = new Map();
  if (ids.length) {
    const rows = await Media.aggregate([
      { $unwind: '$mediaOwners' },
      {
        $match: {
          'mediaOwners.userId': { $in: ids },
          $or: [
            { 'mediaOwners.verificationMethod': 'Self-upload' },
            { 'mediaOwners.verificationSource': 'upload' },
          ],
        },
      },
      { $group: { _id: '$mediaOwners.userId', count: { $sum: 1 } } },
    ]);
    for (const row of rows) {
      countByOwner.set(String(row._id), row.count);
    }
  }

  const commissionByArtist = new Map();
  const history = (inviter?.artistEscrowHistory || []).filter(
    (entry) => entry.source === 'affiliate' && entry.mediaId
  );
  const mediaIds = [...new Set(history.map((entry) => entry.mediaId))];
  if (mediaIds.length) {
    const mediaDocs = await Media.find({ _id: { $in: mediaIds } }).select('mediaOwners').lean();
    const mediaToArtist = new Map();
    for (const media of mediaDocs) {
      const owner = originalUploaderOwner(media);
      if (owner?.userId) mediaToArtist.set(String(media._id), String(owner.userId));
    }
    for (const entry of history) {
      const artistId = mediaToArtist.get(String(entry.mediaId));
      if (!artistId) continue;
      commissionByArtist.set(
        artistId,
        (commissionByArtist.get(artistId) || 0) + (entry.amount || 0)
      );
    }
  }

  return invitedUsers.map((user) => {
    const window = affiliateWindowInfo(user.createdAt, now);
    const originalUploadCount = countByOwner.get(String(user._id)) || 0;
    const verificationStatus = user.creatorProfile?.verificationStatus || 'unverified';
    return {
      ...user,
      isCreator: isInvitedCreator(user),
      creatorVerificationStatus: verificationStatus,
      hasOriginalUpload: originalUploadCount > 0,
      originalUploadCount,
      affiliateWindowEndsAt: window.endsAt,
      affiliateWindowActive: window.active,
      affiliateDaysRemaining: window.daysRemaining,
      commissionPence: commissionByArtist.get(String(user._id)) || 0,
    };
  });
}

module.exports = {
  AFFILIATE_SHARE_OF_ARTIST,
  AFFILIATE_SHARE_PERCENT,
  AFFILIATE_WINDOW_MS,
  computeAffiliateSharePence,
  originalUploaderOwner,
  isWithinAffiliateWindow,
  affiliateWindowInfo,
  isAffiliateEligible,
  ownerPaidSharePence,
  attachAffiliateInviteStats,
  inviteeAffiliateDisclosure,
};
