/**
 * Artist-invite affiliate: 10% of an invited artist's paid tip revenue
 * for 12 months, taken from Tuneable's platform share (artist still gets 70%).
 * Only original artist uploads qualify — not claimed library imports.
 */

const { isOriginalUploadOwner, isVerifiedOriginalUpload } = require('./mediaRights');

const AFFILIATE_SHARE_OF_ARTIST = 0.10;
const AFFILIATE_WINDOW_MS = 365 * 24 * 60 * 60 * 1000;

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
  const start = artistUser?.createdAt ? new Date(artistUser.createdAt) : null;
  if (!start || Number.isNaN(start.getTime())) return false;
  return (now.getTime() - start.getTime()) < AFFILIATE_WINDOW_MS;
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

module.exports = {
  AFFILIATE_SHARE_OF_ARTIST,
  AFFILIATE_WINDOW_MS,
  computeAffiliateSharePence,
  originalUploaderOwner,
  isWithinAffiliateWindow,
  isAffiliateEligible,
  ownerPaidSharePence,
};
