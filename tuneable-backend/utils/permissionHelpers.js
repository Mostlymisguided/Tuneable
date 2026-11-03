/**
 * Permission Helper Functions
 * 
 * Centralized permission checking functions for consistency across the codebase.
 * 
 * Platform Roles:
 * - 'admin': Platform administrator (full access)
 * - 'creator': Verified creator (can upload/manage media)
 * - 'user': Regular user (default)
 * - 'host', 'dj', 'partier': Party-specific roles
 * - 'moderator': Platform moderator
 * 
 * Note: Context-specific roles (labelAffiliations, mediaOwners, Label.admins) 
 * are checked separately and should not use these helpers.
 */

const CREDIT_FIELDS = [
  'artists',
  'artist',
  'producer',
  'featuring',
  'songwriter',
  'composer',
  'host',
  'guest',
  'narrator',
  'director',
  'cinematographer',
  'editor',
  'author',
  'label',
];

function roleList(user) {
  const role = user?.role;
  if (Array.isArray(role)) {
    return role.map((entry) => String(entry).toLowerCase());
  }
  if (typeof role === 'string') {
    return role.toLowerCase().split(/[\s,]+/).filter(Boolean);
  }
  return [];
}

/**
 * A real user id. Rejects missing values and plain objects, whose default
 * toString is "[object Object]" and would otherwise match every other object.
 */
function refId(value) {
  if (value == null) return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed || trimmed === '[object Object]') return null;
    return trimmed;
  }
  if (typeof value !== 'object') return null;

  if (value._id && value._id !== value) {
    const nested = refId(value._id);
    if (nested) return nested;
  }
  if (typeof value.toHexString === 'function') {
    const hex = value.toHexString();
    if (typeof hex === 'string' && /^[a-f0-9]{24}$/i.test(hex)) return hex;
  }
  if (typeof value.id === 'string') {
    const trimmed = value.id.trim();
    if (trimmed && trimmed !== '[object Object]') return trimmed;
  } else if (value.id && value.id !== value) {
    const nested = refId(value.id);
    if (nested) return nested;
  }
  if (typeof value.uuid === 'string' && value.uuid.trim()) return value.uuid.trim();
  if (typeof value.toString === 'function' && value.toString !== Object.prototype.toString) {
    const text = value.toString();
    if (typeof text === 'string' && text && text !== '[object Object]') return text;
  }
  return null;
}

function userIdSet(user) {
  const ids = new Set();
  if (!user) return ids;
  for (const value of [user._id, user.id, user.uuid]) {
    const id = refId(value);
    if (id) ids.add(id);
  }
  return ids;
}

function ownerIdSet(userId) {
  const ids = new Set();
  const id = refId(userId);
  if (id) ids.add(id);
  if (userId && typeof userId === 'object' && typeof userId.uuid === 'string' && userId.uuid.trim()) {
    ids.add(userId.uuid.trim());
  }
  return ids;
}

function idsOverlap(left, right) {
  for (const id of left) {
    if (right.has(id)) return true;
  }
  return false;
}

/**
 * A 0% mediaOwners row is a library-import curator placeholder, not a stake.
 */
function hasOwnershipStake(owner) {
  const percentage = Number(owner?.percentage ?? owner?.ownershipPercentage ?? 0);
  return Number.isFinite(percentage) && percentage > 0;
}

/**
 * Check if user is a platform administrator
 * @param {Object} user - User object
 * @returns {boolean}
 */
function isAdmin(user) {
  return roleList(user).includes('admin');
}

/**
 * Check if user is a verified creator
 * @param {Object} user - User object
 * @returns {boolean}
 */
function isCreator(user) {
  return roleList(user).includes('creator');
}

/**
 * Check if user is admin or creator
 * @param {Object} user - User object
 * @returns {boolean}
 */
function isAdminOrCreator(user) {
  return isAdmin(user) || isCreator(user);
}

/**
 * Check if user can upload media (admin or verified creator)
 * @param {Object} user - User object
 * @returns {boolean}
 */
function canUploadMedia(user) {
  return isAdminOrCreator(user);
}

/**
 * Check if user is a media owner
 * @param {Object} user - User object
 * @param {Object} media - Media object
 * @returns {boolean}
 */
function isMediaOwner(user, media) {
  if (!user || !media || !Array.isArray(media.mediaOwners)) return false;

  const ids = userIdSet(user);
  if (ids.size === 0) return false;

  return media.mediaOwners.some((owner) => {
    if (!owner || !hasOwnershipStake(owner)) return false;
    return idsOverlap(ids, ownerIdSet(owner.userId));
  });
}

/**
 * Check if user is a verified creator on a specific media item
 * @param {Object} user - User object
 * @param {Object} media - Media object (must have getVerifiedCreators method)
 * @returns {boolean}
 */
function creditMatchesUser(entry, ids) {
  if (!entry || typeof entry !== 'object' || entry.verified !== true) return false;
  return idsOverlap(ids, ownerIdSet(entry.userId));
}

function isVerifiedCreatorOnMedia(user, media) {
  if (!user || !media) return false;

  const ids = userIdSet(user);
  if (ids.size === 0) return false;

  if (typeof media.getVerifiedCreators === 'function') {
    const verifiedCreators = media.getVerifiedCreators() || [];
    const matched = verifiedCreators.some((creator) => idsOverlap(ids, ownerIdSet(creator?.userId)));
    if (matched) return true;
  }

  return CREDIT_FIELDS.some((field) => {
    const list = media[field];
    if (!Array.isArray(list)) return false;
    return list.some((entry) => creditMatchesUser(entry, ids));
  });
}

/**
 * Who can edit a media item, including its licence.
 * Platform admins, owners with a stake, and verified creators credited on
 * this item. A platform creator role, the uploader, and a 0% curator row
 * do not qualify.
 */
function canEditMedia(user, media) {
  if (!user || !media) return false;
  if (isAdmin(user)) return true;
  if (isMediaOwner(user, media)) return true;
  if (isVerifiedCreatorOnMedia(user, media)) return true;
  return false;
}

/**
 * Check if user can delete a media item (owners and admins only)
 * @param {Object} user - User object
 * @param {Object} media - Media object
 * @returns {boolean}
 */
function canDeleteMedia(user, media) {
  if (!user || !media) return false;
  if (isAdmin(user)) return true;
  return isMediaOwner(user, media);
}

module.exports = {
  isAdmin,
  isCreator,
  isAdminOrCreator,
  canUploadMedia,
  isMediaOwner,
  isVerifiedCreatorOnMedia,
  canEditMedia,
  canDeleteMedia
};

