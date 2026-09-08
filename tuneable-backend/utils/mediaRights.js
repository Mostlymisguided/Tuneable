/**
 * Rights / playability policy for hosted music.
 *
 * Playback requires a verified original upload (artist self-upload or
 * rights-holder attach). Operator library imports stay pending.
 * Playability itself still lives on Media.rightsStatus in mediaPlayability.js.
 */

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

/**
 * Hosted non-podcast music that is currently streamable (or marked cleared)
 * without a verified original-upload owner.
 */
function shouldGateHostedMusic(media) {
  if (!media || !hasHostedUpload(media)) return false;
  if (isPodcastLike(media) || isWrittenMedia(media)) return false;
  if (hasVerifiedRightsHolder(media)) return false;
  if (media.rightsStatus === 'pending' && media.rightsCleared !== true) return false;
  if (media.rightsStatus === 'disputed') return false;
  return true;
}

function applyPendingGate(doc, { importSource } = {}) {
  Object.assign(doc, pendingRightsFields(null, importSource || doc.importSource || undefined));
  return doc;
}

module.exports = {
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
  applyPendingGate,
};
