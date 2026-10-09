type NotificationRef =
  | string
  | {
      _id?: string;
      slug?: string;
      uuid?: string;
    }
  | null
  | undefined;

export type NotificationLinkSource = {
  link?: string | null;
  linkText?: string | null;
  relatedMediaId?: NotificationRef;
  relatedPartyId?: NotificationRef;
  relatedLabelId?: NotificationRef;
  relatedCollectiveId?: NotificationRef;
  relatedConversationId?: NotificationRef;
};

function entityToken(value: NotificationRef, keys: Array<'slug' | 'uuid' | '_id'>): string | null {
  if (!value || typeof value !== 'object') return null;
  for (const key of keys) {
    const token = value[key];
    if (token) return String(token);
  }
  return null;
}

export function notificationDestination(notification: NotificationLinkSource): string | null {
  const explicit = notification.link?.trim();
  if (explicit) return explicit;

  const collective = entityToken(notification.relatedCollectiveId, ['slug', 'uuid']);
  if (collective) return `/collective/${encodeURIComponent(collective)}`;

  const label = entityToken(notification.relatedLabelId, ['slug', 'uuid']);
  if (label) return `/label/${encodeURIComponent(label)}`;

  const conversation = entityToken(notification.relatedConversationId, ['uuid', '_id']);
  if (conversation) return `/conversations/${encodeURIComponent(conversation)}`;

  const party = entityToken(notification.relatedPartyId, ['uuid', '_id']);
  if (party) return `/party/${encodeURIComponent(party)}`;

  const media = entityToken(notification.relatedMediaId, ['uuid', '_id']);
  if (media) return `/tune/${encodeURIComponent(media)}`;

  return null;
}

export function notificationLinkLabel(notification: NotificationLinkSource): string | null {
  const destination = notificationDestination(notification);
  if (!destination) return null;
  if (notification.linkText?.trim()) return notification.linkText.trim();
  if (destination.startsWith('/collective/')) return 'View Collective';
  if (destination.startsWith('/label/')) return 'View Label';
  if (destination.startsWith('/party')) return 'View Party';
  if (destination.startsWith('/conversations')) return 'View conversation';
  if (destination.startsWith('/tune/') || destination.startsWith('/podcast')) return 'View Media';
  if (destination.startsWith('/wallet')) return 'View Wallet';
  return 'Open';
}

export function isExternalNotificationLink(destination: string): boolean {
  return /^https?:\/\//i.test(destination);
}
