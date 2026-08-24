import type { ChartMediaItem, MediaSources, TimePeriodKey } from '@/src/types/media';

export function normalizeSources(sources: MediaSources): Record<string, string> {
  if (!sources) return {};

  if (Array.isArray(sources)) {
    const obj: Record<string, string> = {};
    for (const source of sources) {
      if (source?.platform && source.url) {
        obj[source.platform] = source.url;
      }
    }
    return obj;
  }

  if (typeof sources === 'object') {
    const obj: Record<string, string> = {};
    for (const [key, value] of Object.entries(sources)) {
      if (typeof value === 'string' && value) obj[key] = value;
    }
    return obj;
  }

  return {};
}

/** Direct upload / MP3 URL only — YouTube is catalog-only in mobile P0. */
export function getUploadUrl(media: ChartMediaItem | null | undefined): string | null {
  if (!media) return null;
  if (media.rightsStatus === 'disputed' || media.rightsStatus === 'pending') return null;
  if (media.rightsCleared === false) return null;
  const sources = normalizeSources(media.sources);
  const url = sources.upload || sources.audio_direct || sources.audio || null;
  return url || null;
}

export function isWrittenMedia(
  media: { contentForm?: string[]; contentType?: string[] } | null | undefined
): boolean {
  if (!media) return false;
  if (media.contentType?.includes('written')) return true;
  return (media.contentForm || []).some((form) => form === 'book' || form === 'article');
}

export function isUploadPlayable(media: ChartMediaItem | null | undefined): boolean {
  if (!media) return false;
  if (isWrittenMedia(media)) return false;
  if (media.rightsStatus === 'disputed' || media.rightsStatus === 'pending') {
    return false;
  }
  if (media.isPlayable === false) return false;
  const url = getUploadUrl(media);
  if (!url) return false;
  if (media.isPlayable === true) return true;
  return media.rightsCleared === true;
}

export function isRightsPendingClaimable(
  media: ChartMediaItem | null | undefined
): boolean {
  if (!media) return false;
  return media.rightsStatus === 'pending' && !media.rightsCleared;
}

/** Why a track cannot play on mobile (null when playable). */
export function getPlayabilityBlockReason(
  media: ChartMediaItem | null | undefined
): 'rights' | 'audio' | 'disputed' | null {
  if (!media || isUploadPlayable(media)) return null;
  if (media.rightsStatus === 'disputed') return 'disputed';
  if (
    isRightsPendingClaimable(media) ||
    media.rightsStatus === 'pending'
  ) {
    return 'rights';
  }
  if (media.hasHostedAudio && media.rightsCleared === false) return 'rights';
  return 'audio';
}

export function mediaId(media: ChartMediaItem): string {
  return media.id || media._id || media.uuid || '';
}

export function formatArtist(
  artist: ChartMediaItem['artist'] | undefined
): string {
  if (!artist) return 'Unknown artist';
  if (typeof artist === 'string') return artist || 'Unknown artist';
  if (Array.isArray(artist)) {
    const names = artist
      .map((a) => (typeof a === 'string' ? a : a?.name))
      .filter(Boolean) as string[];
    return names.length ? names.join(', ') : 'Unknown artist';
  }
  return 'Unknown artist';
}

/** Tip value shown/sorted for chart rows — period tips when not all-time. */
export function getChartTipPence(
  item: ChartMediaItem,
  period: TimePeriodKey
): number {
  if (period !== 'all-time' && typeof item.timePeriodBidValue === 'number') {
    return item.timePeriodBidValue;
  }
  return item.partyMediaAggregate ?? 0;
}
