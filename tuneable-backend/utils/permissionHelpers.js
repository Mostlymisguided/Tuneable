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

/**
 * Check if user is a platform administrator
 * @param {Object} user - User object
 * @returns {boolean}
 */
function isAdmin(user) {
  return user?.role?.includes('admin') || false;
}

/**
 * Check if user is a verified creator
 * @param {Object} user - User object
 * @returns {boolean}
 */
function isCreator(user) {
  return user?.role?.includes('creator') || false;
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
  if (!user || !media || !media.mediaOwners) return false;
  
  const userId = user._id?.toString() || user.id?.toString();
  if (!userId) return false;
  
  return media.mediaOwners.some(owner => {
    if (!owner.userId) return false;
    
    // Handle both ObjectId and populated User object cases
    const ownerUserId = owner.userId._id 
      ? owner.userId._id.toString() 
      : owner.userId.toString();
    
    return ownerUserId === userId;
  });
}

/**
 * Check if user is a verified creator on a specific media item
 * @param {Object} user - User object
 * @param {Object} media - Media object (must have getVerifiedCreators method)
 * @returns {boolean}
 */
function isVerifiedCreatorOnMedia(user, media) {
  if (!user || !media || typeof media.getVerifiedCreators !== 'function') return false;
  
  const userId = user._id?.toString() || user.id?.toString();
  if (!userId) return false;
  
  const verifiedCreators = media.getVerifiedCreators();
  return verifiedCreators.some(
    creator => creator.userId?.toString() === userId
  );
}

/**
 * Check if user can edit a media item
 * @param {Object} user - User object
 * @param {Object} media - Media object
 * @returns {boolean}
 */
function canEditMedia(user, media) {
  if (!user || !media) return false;
  
  // Admin can always edit
  if (isAdmin(user)) return true;
  
  // Media owners can edit
  if (isMediaOwner(user, media)) return true;
  
  // Verified creators on the media can edit
  if (isVerifiedCreatorOnMedia(user, media)) return true;
  
  return false;
}

module.exports = {
  isAdmin,
  isCreator,
  isAdminOrCreator,
  canUploadMedia,
  isMediaOwner,
  isVerifiedCreatorOnMedia,
  canEditMedia
};

