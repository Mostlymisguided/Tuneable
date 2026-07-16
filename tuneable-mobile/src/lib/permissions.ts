import type { User } from '@/src/types/user';

/** Matches backend canUploadMedia — creators and admins. */
export function canUploadMedia(user: User | null | undefined): boolean {
  const roles = user?.role ?? [];
  return roles.includes('creator') || roles.includes('admin');
}
