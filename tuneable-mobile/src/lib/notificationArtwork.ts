const SPARKLE_TYPES = new Set([
  'admin_announcement',
  'bid_received',
  'tune_bytes_earned',
  'creator_approved',
  'claim_approved',
  'party_invite',
  'label_invite',
  'collective_invite',
  'conversation_invite',
  'conversation_pledge',
  'conversation_funded',
  'conversation_accepted',
  'conversation_scheduled',
  'conversation_completed',
  'escrow_allocated',
  'escrow_matched',
  'payout_processed',
  'ambassador_assigned',
  'ambassador_beat_assigned',
  'party_media_played',
  'media_claimed',
  'media_linked',
  'media_unvetoed',
]);

export type NotificationVisualSource = {
  type?: string | null;
  relatedMediaId?: unknown;
  relatedUserId?: unknown;
  relatedLabelId?: unknown;
  relatedCollectiveId?: unknown;
};

export type NotificationArtworkSource =
  | { kind: 'cover'; src: string; label: string }
  | { kind: 'profile'; src: string | null; label: string };

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null;
  return value as Record<string, unknown>;
}

function pictureUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('/')) {
    return trimmed;
  }
  return null;
}

function namedProfile(
  value: unknown,
  pictureKey: 'profilePic' | 'profilePicture',
  nameKey: 'username' | 'name',
): NotificationArtworkSource | null {
  const record = asRecord(value);
  if (!record) return null;
  const label = typeof record[nameKey] === 'string' ? record[nameKey].trim() : '';
  const src = pictureUrl(record[pictureKey]);
  if (!src && !label) return null;
  return { kind: 'profile', src, label: label || 'Profile' };
}

export function notificationSparkles(type?: string | null): boolean {
  return !!type && SPARKLE_TYPES.has(type);
}

/** Cover art first, then the label, collective, or person the notice is about. */
export function notificationArtwork(
  notification: NotificationVisualSource,
): NotificationArtworkSource | null {
  const media = asRecord(notification.relatedMediaId);
  const cover = pictureUrl(media?.coverArt);
  if (cover) {
    const title = typeof media?.title === 'string' ? media.title.trim() : '';
    return { kind: 'cover', src: cover, label: title || 'Tune artwork' };
  }

  return (
    namedProfile(notification.relatedLabelId, 'profilePicture', 'name') ||
    namedProfile(notification.relatedCollectiveId, 'profilePicture', 'name') ||
    namedProfile(notification.relatedUserId, 'profilePic', 'username')
  );
}
