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
  const role = (user as { role?: unknown } | null | undefined)?.role;
  if (Array.isArray(role)) {
    return role.some((entry) => String(entry).toLowerCase() === 'admin');
  }
  if (typeof role === 'string') {
    return role.toLowerCase() === 'admin'
      || role.toLowerCase().split(/[\s,]+/).includes('admin');
  }
  return false;
}

function roleList(user: User | null | undefined): string[] {
  const role = user?.role as unknown;
  if (Array.isArray(role)) return role.map((entry) => String(entry).toLowerCase());
  if (typeof role === 'string') return role.toLowerCase().split(/[\s,]+/).filter(Boolean);
  return [];
}

/**
 * Check if user is a verified creator on the platform.
 * This role can upload. It does not grant edits on someone else's media.
 */
export function isCreator(user: User | null | undefined): boolean {
  return roleList(user).includes('creator');
}

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
] as const;

function refId(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed || trimmed === '[object Object]') return null;
    return trimmed;
  }
  if (typeof value !== 'object') return null;
  const record = value as { _id?: unknown; id?: unknown; uuid?: unknown; toHexString?: () => string; toString?: () => string };
  if (record._id && record._id !== value) {
    const nested = refId(record._id);
    if (nested) return nested;
  }
  if (typeof record.toHexString === 'function') {
    const hex = record.toHexString();
    if (typeof hex === 'string' && /^[a-f0-9]{24}$/i.test(hex)) return hex;
  }
  if (typeof record.id === 'string') {
    const trimmed = record.id.trim();
    if (trimmed && trimmed !== '[object Object]') return trimmed;
  } else if (record.id && record.id !== value) {
    const nested = refId(record.id);
    if (nested) return nested;
  }
  if (typeof record.uuid === 'string' && record.uuid.trim()) return record.uuid.trim();
  if (typeof record.toString === 'function' && record.toString !== Object.prototype.toString) {
    const text = record.toString();
    if (text && text !== '[object Object]') return text;
  }
  return null;
}

function userIdSet(user: User): Set<string> {
  return new Set(
    [user._id, user.id, user.uuid].map((value) => refId(value)).filter((value): value is string => Boolean(value))
  );
}

function subjectIdSet(value: unknown): Set<string> {
  const ids = new Set<string>();
  const id = refId(value);
  if (id) ids.add(id);
  if (value && typeof value === 'object' && typeof (value as { uuid?: unknown }).uuid === 'string') {
    const uuid = (value as { uuid: string }).uuid.trim();
    if (uuid) ids.add(uuid);
  }
  return ids;
}

function idsOverlap(left: Set<string>, right: Set<string>): boolean {
  for (const id of left) {
    if (right.has(id)) return true;
  }
  return false;
}

function hasOwnershipStake(owner: { percentage?: number; ownershipPercentage?: number } | null | undefined): boolean {
  const percentage = Number(owner?.percentage ?? owner?.ownershipPercentage ?? 0);
  return Number.isFinite(percentage) && percentage > 0;
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
  if (!user || !media || !Array.isArray(media.mediaOwners)) return false;

  const ids = userIdSet(user);
  if (ids.size === 0) return false;

  return media.mediaOwners.some((owner) => {
    if (!owner || !hasOwnershipStake(owner)) return false;
    return idsOverlap(ids, subjectIdSet(owner.userId));
  });
}

/**
 * Check if user is a verified creator on a specific media item
 */
export function isVerifiedCreatorOnMedia(user: User | null | undefined, media: Media | null | undefined): boolean {
  if (!user || !media) return false;

  const ids = userIdSet(user);
  if (ids.size === 0) return false;

  if (typeof media.getVerifiedCreators === 'function') {
    const verifiedCreators = media.getVerifiedCreators();
    const matched = verifiedCreators.some((creator) => idsOverlap(ids, subjectIdSet(creator?.userId)));
    if (matched) return true;
  }

  if (Array.isArray(media.verifiedCreators)) {
    const matched = media.verifiedCreators.some((creatorId) => idsOverlap(ids, subjectIdSet(creatorId)));
    if (matched) return true;
  }

  return CREDIT_FIELDS.some((field) => {
    const list = (media as Record<string, unknown>)[field];
    if (!Array.isArray(list)) return false;
    return list.some((entry) => {
      if (!entry || typeof entry !== 'object') return false;
      const credit = entry as { verified?: boolean; userId?: unknown };
      if (credit.verified !== true) return false;
      return idsOverlap(ids, subjectIdSet(credit.userId));
    });
  });
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

/**
 * Check if user can delete a media item (owners and admins only)
 */
export function canDeleteMedia(user: User | null | undefined, media: Media | null | undefined): boolean {
  if (!user || !media) return false;
  if (isAdmin(user)) return true;
  return isMediaOwner(user, media);
}

