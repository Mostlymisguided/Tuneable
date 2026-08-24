import type { Href } from 'expo-router';
import { getPlaceProfileHref } from '@/src/lib/location';
import { getTagProfileHref } from '@/src/lib/tagNormalizer';
import type { ChampionBadge } from '@/src/types/user';

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

export function championBadgeHref(badge: ChampionBadge): Href | null {
  if (badge.entityType === 'media') {
    const id = badge.uuid || badge.mediaId;
    return id ? (`/tune/${id}` as Href) : null;
  }
  if (badge.entityType === 'place') {
    return getPlaceProfileHref(badge.location?.placeId);
  }
  if (badge.tag) return getTagProfileHref(badge.tag);
  return null;
}

export function fallbackChampionBadges(
  tags: Array<{ tag: string; rank: number; totalAmount?: number }>,
  media: Array<{
    mediaId: string;
    uuid?: string;
    title: string;
    rank: number;
    totalAmount?: number;
  }>
): ChampionBadge[] {
  return [
    ...tags.map((tag) => ({
      entityType: 'tag' as const,
      tag: tag.tag,
      rank: tag.rank,
      totalAmount: tag.totalAmount,
      location: null,
      scope: 'global',
    })),
    ...media.map((item) => ({
      entityType: 'media' as const,
      mediaId: item.mediaId,
      uuid: item.uuid,
      title: item.title,
      rank: item.rank,
      totalAmount: item.totalAmount,
      location: null,
      scope: 'global',
    })),
  ];
}

export function championBadgesFromResponse(res: {
  badges?: ChampionBadge[] | null;
  tags?: Array<{ tag: string; rank: number; totalAmount?: number }> | null;
  media?: Array<{
    mediaId: string;
    uuid?: string;
    title: string;
    rank: number;
    totalAmount?: number;
  }> | null;
}): ChampionBadge[] {
  if (res.badges && res.badges.length > 0) return res.badges;
  return fallbackChampionBadges(res.tags || [], res.media || []);
}
