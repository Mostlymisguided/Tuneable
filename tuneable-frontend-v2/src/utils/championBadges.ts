export type ChampionBadgeLocation = {
  placeId: string;
  label?: string | null;
  featureType?: string | null;
  ancestorIds?: string[];
};

export type ChampionBadge = {
  entityType: 'tag' | 'media' | 'place';
  rank: number;
  medal?: string | null;
  totalAmount?: number;
  totalUsers?: number;
  bidCount?: number;
  tag?: string;
  mediaId?: string;
  uuid?: string;
  title?: string;
  scope?: 'global' | 'place' | string;
  location?: ChampionBadgeLocation | null;
};

export function championBadgeKey(badge: ChampionBadge, index = 0): string {
  const loc = badge.location?.placeId || 'global';
  if (badge.entityType === 'media') {
    return `media-${badge.mediaId || badge.uuid || index}-${badge.rank}-${loc}`;
  }
  if (badge.entityType === 'place') {
    return `place-${badge.location?.placeId || index}-${badge.rank}`;
  }
  return `tag-${badge.tag || index}-${badge.rank}-${loc}`;
}

export function championBadgePrimaryLabel(badge: ChampionBadge): string {
  if (badge.entityType === 'place') {
    const name = badge.location?.label?.trim();
    return name ? `#${name}` : 'Place';
  }
  if (badge.entityType === 'media') {
    return badge.title || 'Untitled';
  }
  return badge.tag ? `#${badge.tag}` : 'Tag';
}

export function championBadgeLocationLabel(badge: ChampionBadge): string | null {
  if (badge.entityType === 'place') return null;
  const label = badge.location?.label?.trim();
  return label || null;
}

export function championBadgeTitle(badge: ChampionBadge): string {
  const rank = `#${badge.rank}`;
  const primary = championBadgePrimaryLabel(badge);
  const location = championBadgeLocationLabel(badge);
  if (location) return `${rank} ${primary} in ${location}`;
  return `${rank} ${primary}`;
}

export function championBadgePath(
  badge: ChampionBadge,
  getTagPath: (tag: string) => string,
  getPlacePath: (placeId: string | null | undefined) => string | null
): string | null {
  if (badge.entityType === 'media') {
    const id = badge.uuid || badge.mediaId;
    return id ? `/tune/${id}` : null;
  }
  if (badge.entityType === 'place') {
    return getPlacePath(badge.location?.placeId || null);
  }
  if (badge.tag) return getTagPath(badge.tag);
  return null;
}
