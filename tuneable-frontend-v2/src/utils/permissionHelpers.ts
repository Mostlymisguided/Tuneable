/**
 * Permission Helper Functions (Frontend)
 * 
 * Centralized permission checking functions for consistency across the frontend.
 * 
 * Platform Roles:
 * - 'admin': Platform administrator (full access)
 * - 'creator': Verified creator (can upload/manage media)
 * - 'user': Regular user (default)
 * - 'host', 'dj', 'partier': Party-specific roles
 * - 'moderator': Platform moderator
 */

interface User {
  role?: string[];
  _id?: string;
  id?: string;
  uuid?: string;
}

// Media interface - flexible to accept any Media type
interface Media {
  _id?: string;
  id?: string;
  uuid?: string;
  mediaOwners?: Array<{
    userId?: string | { _id?: string; id?: string; toString(): string } | any;
  }>;
  verifiedCreators?: Array<string | { _id?: string; id?: string; toString(): string } | any>;
  getVerifiedCreators?: () => Array<{
    userId?: string | { _id?: string; id?: string; toString(): string } | any;
  }>;
  [key: string]: any; // Allow additional properties to match any Media type
}

/**
 * Check if user is a platform administrator
 */
export function isAdmin(user: User | null | undefined): boolean {
  return user?.role?.includes('admin') ?? false;
}

/**
 * Check if user is a verified creator
 */
export function isCreator(user: User | null | undefined): boolean {
  return user?.role?.includes('creator') ?? false;
}

/**
 * Check if user is admin or creator
 */
export function isAdminOrCreator(user: User | null | undefined): boolean {
  return isAdmin(user) || isCreator(user);
}

/**
 * Check if user should see creator dashboard
 */
export function showCreatorDashboard(user: User | null | undefined): boolean {
  return isAdminOrCreator(user);
}

/**
 * Check if user is a media owner
 */
export function isMediaOwner(user: User | null | undefined, media: Media | null | undefined): boolean {
  if (!user || !media || !media.mediaOwners) return false;
  
  const userId = user._id || user.id || user.uuid;
  if (!userId) return false;
  
  const userIdStr = userId.toString();
  
  return media.mediaOwners.some(owner => {
    const ownerId = owner.userId;
    if (!ownerId) return false;
    
    if (typeof ownerId === 'string') {
      return ownerId === userIdStr;
    }
    
    const ownerIdStr = ownerId._id?.toString() || ownerId.id?.toString() || ownerId.toString();
    return ownerIdStr === userIdStr;
  });
}

/**
 * Check if user is a verified creator on a specific media item
 */
export function isVerifiedCreatorOnMedia(user: User | null | undefined, media: Media | null | undefined): boolean {
  if (!user || !media) return false;
  
  const userId = user._id || user.id || user.uuid;
  if (!userId) return false;
  
  const userIdStr = userId.toString();
  
  // Try getVerifiedCreators method first
  if (typeof media.getVerifiedCreators === 'function') {
    const verifiedCreators = media.getVerifiedCreators();
    return verifiedCreators.some(creator => {
      const creatorId = creator.userId;
      if (!creatorId) return false;
      
      if (typeof creatorId === 'string') {
        return creatorId === userIdStr;
      }
      
      const creatorIdStr = creatorId._id?.toString() || creatorId.id?.toString() || creatorId.toString();
      return creatorIdStr === userIdStr;
    });
  }
  
  // Fallback to verifiedCreators array
  if (media.verifiedCreators) {
    return media.verifiedCreators.some(creatorId => {
      if (typeof creatorId === 'string') {
        return creatorId === userIdStr;
      }
      
      const creatorIdStr = creatorId._id?.toString() || creatorId.id?.toString() || creatorId.toString();
      return creatorIdStr === userIdStr;
    });
  }
  
  return false;
}

/**
 * Check if user can edit a media item
 */
export function canEditMedia(user: User | null | undefined, media: Media | null | undefined): boolean {
  if (!user || !media) return false;
  
  // Admin can always edit
  if (isAdmin(user)) return true;
  
  // Media owners can edit
  if (isMediaOwner(user, media)) return true;
  
  // Verified creators on the media can edit
  if (isVerifiedCreatorOnMedia(user, media)) return true;
  
  return false;
}

