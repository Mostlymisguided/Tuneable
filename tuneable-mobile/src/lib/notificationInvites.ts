import type { AppNotification, NotificationRef } from '@/src/types/notification';

function refSlug(value: NotificationRef | undefined): string | null {
  if (!value || typeof value !== 'object') return null;
  const slug = value.slug?.trim();
  return slug || null;
}

function slugFromLink(link: string | undefined, kind: 'collective' | 'label'): string | null {
  if (!link) return null;
  const match = link.match(new RegExp(`/${kind}/([^/?#]+)`));
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

export function isCollectiveInvite(notification: AppNotification): boolean {
  return notification.type === 'collective_invite' && Boolean(notification.inviteType);
}

export function isLabelInvite(notification: AppNotification): boolean {
  return (
    notification.type === 'label_invite' &&
    (notification.inviteType === 'admin' || notification.inviteType === 'artist')
  );
}

export function collectiveInviteSlug(notification: AppNotification): string | null {
  if (!isCollectiveInvite(notification)) return null;
  return refSlug(notification.relatedCollectiveId) || slugFromLink(notification.link, 'collective');
}

export function labelInviteSlug(notification: AppNotification): string | null {
  if (!isLabelInvite(notification)) return null;
  return refSlug(notification.relatedLabelId) || slugFromLink(notification.link, 'label');
}
