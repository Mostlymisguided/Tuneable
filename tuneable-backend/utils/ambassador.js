/**
 * Ambassador program membership.
 * Status lives beside User.role. Invite attribution stays on invitedByUserId.
 * invitedByAmbassador is stamped only while the inviter is active, and is not rewritten later.
 * The 3% tip share is unchanged: founding creators only, from Tuneable's share.
 */

const {
  isCreatorProfileComplete,
  isCreatorVerified,
  isWithinAffiliateWindow,
  attachAffiliateInviteStats,
} = require('./artistInviteAffiliate');

const AMBASSADOR_STATUSES = ['none', 'active', 'paused', 'revoked'];
const ASSIGNABLE_STATUSES = ['active', 'paused', 'revoked'];

function ambassadorStatus(user) {
  const status = user?.ambassador?.status;
  return AMBASSADOR_STATUSES.includes(status) ? status : 'none';
}

function isActiveAmbassador(user) {
  return ambassadorStatus(user) === 'active';
}

function isAmbassadorProgramMember(user) {
  const status = ambassadorStatus(user);
  return status === 'active' || status === 'paused' || status === 'revoked';
}

function hasUnlimitedInvites(user) {
  if (!user) return false;
  if (Array.isArray(user.role) && user.role.includes('admin')) return true;
  return isActiveAmbassador(user);
}

function userHasInviteCode(user) {
  if (!user) return false;
  if (typeof user.getActiveInviteCodes === 'function') {
    return user.getActiveInviteCodes().length > 0;
  }
  if (Array.isArray(user.personalInviteCodes)) {
    return user.personalInviteCodes.some((code) => code && code.isActive !== false && code.code);
  }
  return Boolean(user.personalInviteCode);
}

function countsAsVerifiedCreator(user) {
  const uploads = Number(user?.originalUploadCount) || 0;
  const hasUpload = uploads > 0 || Boolean(user?.hasOriginalUpload);
  return isCreatorVerified(user) && isCreatorProfileComplete(user) && hasUpload;
}

function inviteeInRewardWindow(user) {
  if (typeof user?.affiliateWindowActive === 'boolean') return user.affiliateWindowActive;
  return isWithinAffiliateWindow(user);
}

/**
 * Count signups that were stamped while the inviter was an active ambassador.
 * Invitees without invitedByAmbassador are ignored, including people invited earlier.
 */
function summarizeAmbassadorInvitees(invitees = []) {
  let signupCount = 0;
  let verifiedCreatorCount = 0;
  let activeWindowCount = 0;
  let commissionPence = 0;

  for (const user of invitees) {
    if (!user?.invitedByAmbassador) continue;
    signupCount += 1;
    if (countsAsVerifiedCreator(user)) {
      verifiedCreatorCount += 1;
      if (inviteeInRewardWindow(user)) activeWindowCount += 1;
    }
    commissionPence += Math.max(0, Math.round(Number(user.commissionPence) || 0));
  }

  return { signupCount, verifiedCreatorCount, activeWindowCount, commissionPence };
}

function ambassadorClientFields(user, summary = null) {
  if (!isAmbassadorProgramMember(user)) return null;
  return {
    status: ambassadorStatus(user),
    note: user.ambassador?.note || null,
    assignedAt: user.ambassador?.assignedAt || null,
    pausedAt: user.ambassador?.pausedAt || null,
    revokedAt: user.ambassador?.revokedAt || null,
    ...(summary || {}),
  };
}

/**
 * Set program status. Does not create invite codes and does not touch past attribution.
 * Re-activating keeps the original assignedAt.
 */
function applyAmbassadorStatus(user, { status, note, adminId, now = new Date() } = {}) {
  if (!ASSIGNABLE_STATUSES.includes(status)) {
    return { ok: false, error: 'Status must be active, paused, or revoked' };
  }
  if (!user) return { ok: false, error: 'User not found' };

  if (note !== undefined && note !== null) {
    const trimmed = String(note).trim();
    if (trimmed.length > 500) {
      return { ok: false, error: 'Note must be 500 characters or fewer' };
    }
  }

  const previousStatus = ambassadorStatus(user);
  if (!user.ambassador) user.ambassador = {};
  user.ambassador.status = status;

  if (note !== undefined) {
    const trimmed = note == null ? '' : String(note).trim();
    user.ambassador.note = trimmed || null;
  }

  if (!user.ambassador.assignedAt) user.ambassador.assignedAt = now;
  if (!user.ambassador.assignedBy && adminId) user.ambassador.assignedBy = adminId;

  if (status === 'active') {
    user.ambassador.assignedBy = adminId || user.ambassador.assignedBy || null;
    user.ambassador.pausedAt = null;
    user.ambassador.revokedAt = null;
  } else if (status === 'paused') {
    user.ambassador.pausedAt = now;
    user.ambassador.revokedAt = null;
  } else if (status === 'revoked') {
    user.ambassador.revokedAt = now;
    user.ambassador.pausedAt = null;
  }

  if (typeof user.markModified === 'function') user.markModified('ambassador');
  return { ok: true, previousStatus };
}

function publicInvitee(user) {
  return {
    username: user.username,
    uuid: user.uuid,
    profilePic: user.profilePic || null,
    joinedAt: user.createdAt || user.joinedAt || null,
    creatorVerificationStatus: user.creatorVerificationStatus || user.creatorProfile?.verificationStatus || 'unverified',
    hasOriginalUpload: Boolean(user.hasOriginalUpload),
    originalUploadCount: user.originalUploadCount || 0,
    countsAsVerifiedCreator: countsAsVerifiedCreator(user),
    affiliateWindowActive: Boolean(inviteeInRewardWindow(user) && countsAsVerifiedCreator(user)),
    affiliateDaysRemaining: user.affiliateDaysRemaining || 0,
    commissionPence: user.commissionPence || 0,
  };
}

async function loadFlaggedInvitees(inviter) {
  const User = require('../models/User');
  return User.find({
    invitedByUserId: inviter._id,
    invitedByAmbassador: true,
  })
    .select('username uuid profilePic createdAt creatorProfile invitedByAmbassador')
    .sort({ createdAt: -1 })
    .lean();
}

async function summarizeForInviter(inviter, preloadedInvitees) {
  const source = Array.isArray(preloadedInvitees)
    ? preloadedInvitees.filter((user) => user?.invitedByAmbassador)
    : await loadFlaggedInvitees(inviter);

  const alreadyEnriched = source.length > 0 && Object.prototype.hasOwnProperty.call(source[0], 'commissionPence');
  const enriched = alreadyEnriched
    ? source
    : await attachAffiliateInviteStats(inviter, source);

  return {
    summary: summarizeAmbassadorInvitees(enriched),
    invitees: enriched.map(publicInvitee),
  };
}

function ambassadorRow(user, summary) {
  return {
    userId: String(user._id),
    username: user.username,
    email: user.email || null,
    artistName: user.creatorProfile?.artistName || null,
    isFoundingCreator: Boolean(user.isFoundingCreator),
    hasInviteCode: userHasInviteCode(user),
    status: ambassadorStatus(user),
    note: user.ambassador?.note || null,
    assignedAt: user.ambassador?.assignedAt || null,
    pausedAt: user.ambassador?.pausedAt || null,
    revokedAt: user.ambassador?.revokedAt || null,
    ...summary,
  };
}

async function listAmbassadorRows() {
  const User = require('../models/User');
  const ambassadors = await User.find({
    'ambassador.status': { $in: ['active', 'paused', 'revoked'] },
  })
    .select('username email creatorProfile.artistName creatorProfile.verificationStatus creatorProfile.verifiedAt creatorProfile.roles creatorProfile.genres isFoundingCreator ambassador personalInviteCode personalInviteCodes artistEscrowHistory referralCommissionEarned')
    .sort({ 'ambassador.assignedAt': -1 })
    .lean();

  const rows = await Promise.all(ambassadors.map(async (user) => {
    const { summary } = await summarizeForInviter(user);
    return ambassadorRow(user, summary);
  }));
  return rows;
}

async function findAmbassadorTarget({ userId, identifier }) {
  const mongoose = require('mongoose');
  const User = require('../models/User');
  if (userId) {
    if (!mongoose.Types.ObjectId.isValid(userId)) return null;
    return User.findById(userId);
  }
  const raw = typeof identifier === 'string' ? identifier.trim() : '';
  if (!raw) return null;
  const escaped = raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return User.findOne({
    $or: [
      { username: new RegExp(`^${escaped}$`, 'i') },
      { email: raw.toLowerCase() },
    ],
  });
}

async function setAmbassadorStatus({ userId, identifier, status, note, adminId }) {
  const user = await findAmbassadorTarget({ userId, identifier });
  if (!user) return { ok: false, statusCode: 404, error: 'User not found' };

  const applied = applyAmbassadorStatus(user, { status, note, adminId });
  if (!applied.ok) return { ok: false, statusCode: 400, error: applied.error };

  await user.save();
  const { summary } = await summarizeForInviter(user);
  return {
    ok: true,
    ambassador: ambassadorRow(user, summary),
    previousStatus: applied.previousStatus,
  };
}

module.exports = {
  AMBASSADOR_STATUSES,
  ASSIGNABLE_STATUSES,
  ambassadorStatus,
  isActiveAmbassador,
  isAmbassadorProgramMember,
  hasUnlimitedInvites,
  userHasInviteCode,
  countsAsVerifiedCreator,
  summarizeAmbassadorInvitees,
  ambassadorClientFields,
  applyAmbassadorStatus,
  summarizeForInviter,
  listAmbassadorRows,
  setAmbassadorStatus,
};
