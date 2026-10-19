import type { User } from '@/src/types/user';

/** Media shape used for edit checks. Profile payloads vary by kind. */
export type EditableMedia = {
  _id?: string;
  id?: string;
  mediaOwners?: Array<{
    userId?: string | { _id?: string; id?: string; uuid?: string } | null;
  }>;
  artists?: unknown;
  artist?: unknown;
  producer?: unknown;
  featuring?: unknown;
  songwriter?: unknown;
  composer?: unknown;
  host?: unknown;
  guest?: unknown;
  narrator?: unknown;
  author?: unknown;
  label?: unknown;
} | null | undefined;

function roleList(user: User | null | undefined): string[] {
  const role = user?.role as unknown;
  if (Array.isArray(role)) {
    return role.map((entry) => String(entry).toLowerCase());
  }
  if (typeof role === 'string') {
    return role.toLowerCase().split(/[\s,]+/).filter(Boolean);
  }
  return [];
}

export function isAdmin(user: User | null | undefined): boolean {
  return roleList(user).includes('admin');
}

/** Matches backend canUploadMedia — creators and admins. */
export function canUploadMedia(user: User | null | undefined): boolean {
  const roles = roleList(user);
  return roles.includes('creator') || roles.includes('admin');
}

function refId(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'object') {
    const record = value as { _id?: string; id?: string };
    if (record._id) return String(record._id);
    if (record.id) return String(record.id);
  }
  return null;
}

function userIds(user: User): Set<string> {
  return new Set(
    [user._id, user.id, user.uuid].filter((value): value is string => Boolean(value)).map(String)
  );
}

/** Owner of this media item (revenue / edit rights), not merely a credited name. */
export function isMediaOwner(
  user: User | null | undefined,
  media: EditableMedia
): boolean {
  if (!user || !media?.mediaOwners?.length) return false;
  const ids = userIds(user);
  return media.mediaOwners.some((owner) => {
    const ownerId = refId(owner?.userId);
    if (ownerId && ids.has(ownerId)) return true;
    const ownerUser = owner?.userId;
    if (ownerUser && typeof ownerUser === 'object' && ownerUser.uuid) {
      return ids.has(String(ownerUser.uuid));
    }
    return false;
  });
}

const VERIFIED_CREDIT_FIELDS = [
  'artists',
  'artist',
  'producer',
  'featuring',
  'songwriter',
  'composer',
  'host',
  'guest',
  'narrator',
  'author',
  'label',
] as const;

/** Verified credit on this media — same rule the website and API use. */
export function isVerifiedCreatorOnMedia(
  user: User | null | undefined,
  media: EditableMedia
): boolean {
  if (!user || !media) return false;
  const ids = userIds(user);
  return VERIFIED_CREDIT_FIELDS.some((field) => {
    const list = (media as Record<string, unknown>)[field];
    if (!Array.isArray(list)) return false;
    return list.some((entry) => {
      if (!entry || typeof entry !== 'object') return false;
      const credit = entry as {
        verified?: boolean;
        userId?: string | { _id?: string; id?: string; uuid?: string };
      };
      if (credit.verified !== true) return false;
      const id = refId(credit.userId);
      if (id && ids.has(id)) return true;
      if (credit.userId && typeof credit.userId === 'object' && credit.userId.uuid) {
        return ids.has(String(credit.userId.uuid));
      }
      return false;
    });
  });
}

/**
 * Who can edit a media item. Matches the website and PUT /media/:id:
 * platform admins, media owners, and verified creators on that item.
 */
export function canEditMedia(
  user: User | null | undefined,
  media: EditableMedia
): boolean {
  if (!user || !media) return false;
  if (isAdmin(user)) return true;
  if (isMediaOwner(user, media)) return true;
  return isVerifiedCreatorOnMedia(user, media);
}

/** Delete is limited to admins and media owners. */
export function canDeleteMedia(
  user: User | null | undefined,
  media: EditableMedia
): boolean {
  if (!user || !media) return false;
  if (isAdmin(user)) return true;
  return isMediaOwner(user, media);
}
