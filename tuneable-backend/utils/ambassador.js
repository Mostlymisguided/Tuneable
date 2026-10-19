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
const { normalizeTagForStorage, tagsMatch } = require('./tagNormalizer');

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

function canonicalAssignmentTag(tag) {
  if (tag == null) return null;
  const stored = normalizeTagForStorage(String(tag));
  return stored ? stored : null;
}

function assignmentLabel(assignment) {
  const parts = [];
  if (assignment?.tag) parts.push(assignment.tag);
  if (assignment?.placeLabel) parts.push(assignment.placeLabel);
  else if (assignment?.placeId) parts.push('Place');
  return parts.join(' · ');
}

/**
 * A tag-only beat matches that tag at any place.
 * A place-only beat matches that place or a descendant (context ancestorIds).
 * A paired beat matches both. An England beat matches a Manchester link; not the reverse.
 */
function assignmentMatchesContext(assignment, context) {
  const tag = assignment?.tag || null;
  const placeId = assignment?.placeId || null;
  if (!tag && !placeId) return false;
  if (tag) {
    if (!context?.tag || !tagsMatch(tag, context.tag)) return false;
  }
  if (placeId) {
    const ids = [context?.placeId, ...(context?.ancestorIds || [])].filter(Boolean);
    if (!ids.includes(placeId)) return false;
  }
  return true;
}

function activeAssignments(user) {
  return (user?.ambassador?.assignments || []).filter((assignment) => (
    (assignment?.status || 'active') === 'active'
  ));
}

function stampAssignmentIds(inviter, context) {
  if (!context) return null;
  const assignmentIds = isActiveAmbassador(inviter)
    ? activeAssignments(inviter)
      .filter((assignment) => assignmentMatchesContext(assignment, context))
      .map((assignment) => assignment._id)
      .filter(Boolean)
    : [];
  return {
    tag: context.tag || null,
    placeId: context.placeId || null,
    placeLabel: context.placeLabel || null,
    ancestorIds: Array.isArray(context.ancestorIds) ? context.ancestorIds.filter(Boolean) : [],
    assignmentIds,
  };
}

function assignmentIdentity(assignment) {
  return `${canonicalAssignmentTag(assignment?.tag) || ''}|${assignment?.placeId || ''}`;
}

function inviteeCountedOnAssignment(user, assignment) {
  if (!user?.invitedByAmbassador || !assignment?._id) return false;
  const ids = (user.inviteContext?.assignmentIds || []).map((id) => String(id));
  return ids.includes(String(assignment._id));
}

function inviteeInScene(user, assignment, tagsByUser) {
  if (!user?.invitedByAmbassador) return false;
  const tag = assignment?.tag || null;
  const placeId = assignment?.placeId || null;
  if (!tag && !placeId) return false;
  if (tag) {
    const tags = tagsByUser?.get(String(user._id)) || [];
    if (!tags.some((candidate) => tagsMatch(candidate, tag))) return false;
  }
  if (placeId) {
    const home = user.homeLocation || {};
    const ids = [home.placeId, ...(home.ancestorIds || [])].filter(Boolean);
    if (!ids.includes(placeId)) return false;
  }
  return true;
}

function summarizeAssignments(assignments, invitees, tagsByUser) {
  return (assignments || []).map((assignment) => {
    const counted = invitees.filter((user) => inviteeCountedOnAssignment(user, assignment));
    const stats = summarizeAmbassadorInvitees(counted.map((user) => ({ ...user, invitedByAmbassador: true })));
    const sceneCount = invitees.filter((user) => inviteeInScene(user, assignment, tagsByUser)).length;
    return {
      id: assignment._id ? String(assignment._id) : null,
      tag: assignment.tag || null,
      placeId: assignment.placeId || null,
      placeLabel: assignment.placeLabel || null,
      featureType: assignment.featureType || null,
      status: assignment.status || 'active',
      label: assignmentLabel(assignment),
      ...stats,
      sceneCount,
    };
  });
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
    .select('username uuid profilePic createdAt creatorProfile invitedByAmbassador inviteContext homeLocation')
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

  const summary = await buildAmbassadorSummary(inviter, enriched);
  return {
    summary,
    invitees: enriched.map(publicInvitee),
  };
}

async function originalTagsByUser(userIds) {
  if (!userIds.length) return new Map();
  const Media = require('../models/Media');
  const rows = await Media.aggregate([
    { $unwind: '$mediaOwners' },
    {
      $match: {
        'mediaOwners.userId': { $in: userIds },
        $or: [
          { 'mediaOwners.verificationMethod': 'Self-upload' },
          { 'mediaOwners.verificationSource': 'upload' },
        ],
      },
    },
    { $project: { userId: '$mediaOwners.userId', tags: { $ifNull: ['$tags', []] } } },
  ]);
  const map = new Map();
  for (const row of rows) {
    const id = String(row.userId);
    if (!map.has(id)) map.set(id, []);
    map.get(id).push(...(row.tags || []));
  }
  return map;
}

function addGenreTags(invitees, tagsByUser) {
  for (const user of invitees) {
    const genres = user?.creatorProfile?.genres;
    if (!Array.isArray(genres) || !genres.length) continue;
    const id = String(user._id);
    if (!tagsByUser.has(id)) tagsByUser.set(id, []);
    tagsByUser.get(id).push(...genres);
  }
  return tagsByUser;
}

async function buildAmbassadorSummary(inviter, invitees = []) {
  const flagged = invitees.filter((user) => user?.invitedByAmbassador);
  const assignments = inviter?.ambassador?.assignments || [];
  let tagsByUser = new Map();
  if (assignments.some((assignment) => assignment?.tag) && flagged.length) {
    const ids = flagged.map((user) => user._id).filter(Boolean);
    tagsByUser = await originalTagsByUser(ids);
    addGenreTags(flagged, tagsByUser);
  }
  return {
    ...summarizeAmbassadorInvitees(flagged),
    assignments: summarizeAssignments(assignments, flagged, tagsByUser),
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

function normalizeAssignmentInput({ tag, place } = {}) {
  const canonicalTag = canonicalAssignmentTag(tag);
  const placeId = place?.placeId ? String(place.placeId).trim() : null;
  if (!canonicalTag && !placeId) {
    return { ok: false, error: 'Choose a tag, a place, or both' };
  }
  return {
    ok: true,
    assignment: {
      tag: canonicalTag,
      placeId: placeId || null,
      placeLabel: place?.placeLabel ? String(place.placeLabel).trim() : null,
      featureType: place?.featureType || null,
      ancestorIds: Array.isArray(place?.ancestorIds) ? place.ancestorIds.filter(Boolean) : [],
    },
  };
}

function applyAssignmentStatus(assignment, status, now = new Date()) {
  if (!ASSIGNABLE_STATUSES.includes(status)) {
    return { ok: false, error: 'Status must be active, paused, or revoked' };
  }
  assignment.status = status;
  if (status === 'active') {
    assignment.pausedAt = null;
    assignment.revokedAt = null;
  } else if (status === 'paused') {
    assignment.pausedAt = now;
    assignment.revokedAt = null;
  } else {
    assignment.revokedAt = now;
    assignment.pausedAt = null;
  }
  return { ok: true };
}

async function addAmbassadorAssignment({ userId, tag, place, adminId }) {
  const user = await findAmbassadorTarget({ userId });
  if (!user) return { ok: false, statusCode: 404, error: 'User not found' };
  if (!isAmbassadorProgramMember(user)) {
    return { ok: false, statusCode: 400, error: 'Make this person an ambassador before assigning a beat' };
  }
  const normalized = normalizeAssignmentInput({ tag, place });
  if (!normalized.ok) return { ok: false, statusCode: 400, error: normalized.error };

  if (!Array.isArray(user.ambassador.assignments)) user.ambassador.assignments = [];
  const identity = assignmentIdentity(normalized.assignment);
  const existing = user.ambassador.assignments.find((assignment) => assignmentIdentity(assignment) === identity);
  if (existing && existing.status !== 'revoked') {
    return { ok: false, statusCode: 400, error: 'That beat is already assigned' };
  }
  if (existing && existing.status === 'revoked') {
    existing.tag = normalized.assignment.tag;
    existing.placeId = normalized.assignment.placeId;
    existing.placeLabel = normalized.assignment.placeLabel;
    existing.featureType = normalized.assignment.featureType;
    existing.ancestorIds = normalized.assignment.ancestorIds;
    applyAssignmentStatus(existing, 'active');
    existing.assignedBy = adminId || existing.assignedBy;
  } else {
    user.ambassador.assignments.push({
      ...normalized.assignment,
      status: 'active',
      assignedAt: new Date(),
      assignedBy: adminId || null,
    });
  }
  user.markModified('ambassador');
  await user.save();
  const { summary } = await summarizeForInviter(user);
  return { ok: true, ambassador: ambassadorRow(user, summary) };
}

async function setAssignmentStatus({ userId, assignmentId, status }) {
  const user = await findAmbassadorTarget({ userId });
  if (!user) return { ok: false, statusCode: 404, error: 'User not found' };
  const assignment = (user.ambassador?.assignments || []).find((entry) => String(entry._id) === String(assignmentId));
  if (!assignment) return { ok: false, statusCode: 404, error: 'Beat not found' };
  const applied = applyAssignmentStatus(assignment, status);
  if (!applied.ok) return { ok: false, statusCode: 400, error: applied.error };
  user.markModified('ambassador');
  await user.save();
  const { summary } = await summarizeForInviter(user);
  return { ok: true, ambassador: ambassadorRow(user, summary) };
}

function publicAmbassadorCard(user, assignment) {
  return {
    username: user.username,
    uuid: user.uuid,
    profilePic: user.profilePic || null,
    artistName: user.creatorProfile?.artistName || null,
    label: assignmentLabel(assignment),
    tag: assignment.tag || null,
    placeId: assignment.placeId || null,
    placeLabel: assignment.placeLabel || null,
  };
}

async function findActiveAmbassadorsForPlace(placeId) {
  const User = require('../models/User');
  const users = await User.find({
    'ambassador.status': 'active',
    'ambassador.assignments': {
      $elemMatch: { status: 'active', placeId },
    },
  }).select('username uuid profilePic creatorProfile.artistName ambassador.assignments').lean();
  return users.flatMap((user) => (
    (user.ambassador?.assignments || [])
      .filter((assignment) => (assignment.status || 'active') === 'active' && assignment.placeId === placeId)
      .map((assignment) => publicAmbassadorCard(user, assignment))
  ));
}

async function publicAmbassadorsForTag(tag) {
  const canonical = canonicalAssignmentTag(tag);
  if (!canonical || /^\d{2,4}$/.test(canonical)) return [];
  const User = require('../models/User');
  const users = await User.find({
    'ambassador.status': 'active',
    'ambassador.assignments': {
      $elemMatch: { status: 'active', tag: { $type: 'string', $ne: '' } },
    },
  }).select('username uuid profilePic creatorProfile.artistName ambassador.assignments').lean();
  return users.flatMap((user) => (
    (user.ambassador?.assignments || [])
      .filter((assignment) => (
        (assignment.status || 'active') === 'active'
        && assignment.tag
        && tagsMatch(assignment.tag, canonical)
      ))
      .map((assignment) => publicAmbassadorCard(user, assignment))
  ));
}

/**
 * Exact place first. If nobody is assigned there, the nearest ancestor that has ambassadors.
 * ancestorIds are stored coarse-to-fine after the place itself, so the nearest is last.
 */
async function publicAmbassadorsForPlace(placeId, ancestorIds = null) {
  const id = placeId ? String(placeId).trim() : '';
  if (!id) return { ambassadors: [], scope: null };

  const exact = await findActiveAmbassadorsForPlace(id);
  if (exact.length) {
    return { ambassadors: exact, scope: { placeId: id, viaAncestor: false, label: null } };
  }

  let chain = Array.isArray(ancestorIds) ? ancestorIds.filter(Boolean) : null;
  if (!chain) {
    try {
      const mapbox = require('../services/mapboxGeocodingService');
      const resolved = await mapbox.resolveByMapboxId(id);
      chain = resolved?.ancestorIds || [];
    } catch (error) {
      console.warn('Ambassador place lookup failed:', error.message);
      chain = [];
    }
  }
  const nearestFirst = chain.filter((ancestorId) => ancestorId && ancestorId !== id).slice().reverse();
  for (const ancestorId of nearestFirst) {
    const people = await findActiveAmbassadorsForPlace(ancestorId);
    if (!people.length) continue;
    const label = people.find((person) => person.placeId === ancestorId)?.placeLabel || null;
    return {
      ambassadors: people,
      scope: { placeId: ancestorId, viaAncestor: true, label },
    };
  }
  return { ambassadors: [], scope: null };
}

async function resolveInvitePlace(placeId) {
  const mapbox = require('../services/mapboxGeocodingService');
  const resolved = await mapbox.resolveByMapboxId(placeId);
  if (!resolved) return null;
  return {
    placeId: resolved.placeId || placeId,
    placeLabel: resolved.label || resolved.display || resolved.city || resolved.country || null,
    featureType: resolved.featureType || null,
    ancestorIds: Array.isArray(resolved.ancestorIds) ? resolved.ancestorIds : [placeId],
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
  assignmentMatchesContext,
  stampAssignmentIds,
  summarizeAssignments,
  canonicalAssignmentTag,
  assignmentLabel,
  ambassadorClientFields,
  applyAmbassadorStatus,
  buildAmbassadorSummary,
  summarizeForInviter,
  listAmbassadorRows,
  setAmbassadorStatus,
  addAmbassadorAssignment,
  setAssignmentStatus,
  publicAmbassadorsForTag,
  publicAmbassadorsForPlace,
  resolveInvitePlace,
};
