/**
 * Rights / playability policy for hosted music.
 *
 * Playback requires a hosted file plus a playable rights status:
 *   cleared   — rights holder is on Tuneable (self-upload or approved claim)
 *   permitted — admin attested off-platform permission; artist not onboarded yet
 *   pending   — no permission (library import); not playable
 *   disputed  — ownership contested; not playable
 *
 * Operator library imports stay pending. Playability lives in mediaPlayability.js.
 */

const RIGHTS_STATUSES = ['cleared', 'pending', 'permitted', 'disputed'];
const PLAYABLE_RIGHTS_STATUSES = ['cleared', 'permitted'];
const BLOCKED_RIGHTS_STATUSES = ['pending', 'disputed'];
const ESCROW_UNTIL_CLAIM_STATUSES = ['pending', 'permitted'];

const { isPodcastLike, isWrittenMedia, normalizeSources } = require('./mediaPlayability');

const LIBRARY_IMPORT_SOURCES = [
  'library_import',
  'library_import_curator',
  'bulk_library_import',
  'rekordbox',
  'itunes_library',
  'itunes',
  'operator_attach',
];

const LIBRARY_VERIFICATION_METHODS = [
  'library_import_curator',
  'bulk_library_import',
  'third_party_claim',
];

const ORIGINAL_UPLOAD_METHODS = ['Self-upload'];
const ORIGINAL_UPLOAD_SOURCES = ['upload'];
const CLAIM_VERIFICATION_METHODS = ['Claim approval', 'claim_approval'];

function hasHostedUpload(media) {
  const sources = normalizeSources(media?.sources);
  return !!sources.upload;
}

function isLibraryImportSource(value) {
  return LIBRARY_IMPORT_SOURCES.includes(value);
}

function isOriginalUploadOwner(owner) {
  if (!isVerifiedPercentageOwner(owner)) return false;
  const method = owner.verificationMethod;
  const source = owner.verificationSource;
  if (LIBRARY_VERIFICATION_METHODS.includes(method)) return false;
  if (isLibraryImportSource(source)) return false;
  return ORIGINAL_UPLOAD_METHODS.includes(method) || ORIGINAL_UPLOAD_SOURCES.includes(source);
}

function isClaimApprovedOwner(owner) {
  if (!isVerifiedPercentageOwner(owner)) return false;
  return CLAIM_VERIFICATION_METHODS.includes(owner.verificationMethod);
}

function isVerifiedPercentageOwner(owner) {
  if (!owner || owner.verified !== true) return false;
  return (owner.percentage || 0) > 0;
}

/**
 * Artist attested this file as their own. Used for invite-affiliate.
 */
function isVerifiedOriginalUpload(media) {
  if (!media || !hasHostedUpload(media)) return false;
  if (isPodcastLike(media) || isWrittenMedia(media)) return false;
  if (isLibraryImportSource(media.importSource)) return false;
  return (media.mediaOwners || []).some(isOriginalUploadOwner);
}

/**
 * A rights holder has been verified (self-upload or approved claim). Do not gate playback.
 */
function hasVerifiedRightsHolder(media) {
  if (!media || !hasHostedUpload(media)) return false;
  if (isPodcastLike(media) || isWrittenMedia(media)) return false;
  return (media.mediaOwners || []).some((owner) => (
    isOriginalUploadOwner(owner) || isClaimApprovedOwner(owner)
  ));
}

/**
 * Operator/admin attaching a file should not make it playable.
 * Artists attaching to their own listing, or a non-admin owner attach, should.
 */
function shouldClearRightsOnAttach({
  uploaderRole = 'owner',
  isAdminUser = false,
  existingOwner = null,
} = {}) {
  if (uploaderRole === 'third_party') return false;
  if (isOriginalUploadOwner(existingOwner) || isClaimApprovedOwner(existingOwner)) {
    return true;
  }
  if (!isAdminUser && uploaderRole === 'owner') return true;
  return false;
}

function pendingRightsFields(userId, importSource = null) {
  const fields = {
    rightsCleared: false,
    rightsStatus: 'pending',
  };
  if (userId) {
    fields.rightsConfirmedBy = userId;
    fields.rightsConfirmedAt = new Date();
  }
  if (importSource) fields.importSource = importSource;
  return fields;
}

function clearedRightsFields(userId) {
  return {
    rightsCleared: true,
    rightsStatus: 'cleared',
    rightsConfirmedBy: userId || undefined,
    rightsConfirmedAt: new Date(),
  };
}

function permittedRightsFields(userId) {
  return {
    rightsCleared: false,
    rightsStatus: 'permitted',
    rightsConfirmedBy: userId || undefined,
    rightsConfirmedAt: new Date(),
  };
}

function disputedRightsFields(userId) {
  return {
    rightsCleared: false,
    rightsStatus: 'disputed',
    rightsConfirmedBy: userId || undefined,
    rightsConfirmedAt: new Date(),
  };
}

function isValidRightsStatus(status) {
  return RIGHTS_STATUSES.includes(status);
}

function isBlockedRightsStatus(status) {
  return BLOCKED_RIGHTS_STATUSES.includes(status);
}

function isPlayableRightsStatus(status) {
  return PLAYABLE_RIGHTS_STATUSES.includes(status);
}

function isEscrowUntilClaim(media) {
  if (!media) return false;
  return ESCROW_UNTIL_CLAIM_STATUSES.includes(media.rightsStatus) && media.rightsCleared !== true;
}

function rightsFieldsForStatus(status, userId, importSource = null) {
  if (status === 'cleared') return clearedRightsFields(userId);
  if (status === 'permitted') return permittedRightsFields(userId);
  if (status === 'disputed') return disputedRightsFields(userId);
  return pendingRightsFields(userId, importSource);
}

function applyRightsStatus(media, status, userId, importSource = null) {
  if (!isValidRightsStatus(status)) {
    return { error: `Invalid rights status: ${status}` };
  }
  const fields = rightsFieldsForStatus(status, userId, importSource);
  const unchanged =
    media.rightsStatus === fields.rightsStatus &&
    media.rightsCleared === fields.rightsCleared;
  if (unchanged) return { changed: false, fields };
  Object.assign(media, fields);
  if (status === 'permitted') {
    demoteUnclaimedOwners(media);
  }
  return { changed: true, fields };
}

/**
 * Permitted means the rights holder is not on Tuneable yet, so nobody should
 * currently receive payouts. Zero out non-claim owners so a later claim can
 * take 100% without exceeding the ownership cap.
 */
function demoteUnclaimedOwners(media) {
  for (const owner of media.mediaOwners || []) {
    if (isClaimApprovedOwner(owner)) continue;
    owner.percentage = 0;
    if (owner.role === 'creator' || owner.role === 'primary') owner.role = 'aux';
    owner.verified = false;
  }
}

/**
 * Hosted non-podcast music that is currently streamable (or marked cleared)
 * without a verified original-upload owner.
 * Do not gate permitted tracks — admin attested off-platform permission.
 */
function shouldGateHostedMusic(media) {
  if (!media || !hasHostedUpload(media)) return false;
  if (isPodcastLike(media) || isWrittenMedia(media)) return false;
  if (hasVerifiedRightsHolder(media)) return false;
  if (media.rightsStatus === 'pending' && media.rightsCleared !== true) return false;
  if (media.rightsStatus === 'permitted') return false;
  if (media.rightsStatus === 'disputed') return false;
  return true;
}

function applyPendingGate(doc, { importSource } = {}) {
  Object.assign(doc, pendingRightsFields(null, importSource || doc.importSource || undefined));
  return doc;
}

module.exports = {
  RIGHTS_STATUSES,
  PLAYABLE_RIGHTS_STATUSES,
  BLOCKED_RIGHTS_STATUSES,
  ESCROW_UNTIL_CLAIM_STATUSES,
  LIBRARY_IMPORT_SOURCES,
  LIBRARY_VERIFICATION_METHODS,
  hasHostedUpload,
  isLibraryImportSource,
  isOriginalUploadOwner,
  isClaimApprovedOwner,
  isVerifiedOriginalUpload,
  hasVerifiedRightsHolder,
  shouldClearRightsOnAttach,
  shouldGateHostedMusic,
  pendingRightsFields,
  clearedRightsFields,
  permittedRightsFields,
  disputedRightsFields,
  isValidRightsStatus,
  isBlockedRightsStatus,
  isPlayableRightsStatus,
  isEscrowUntilClaim,
  rightsFieldsForStatus,
  applyRightsStatus,
  applyPendingGate,
  demoteUnclaimedOwners,
};
