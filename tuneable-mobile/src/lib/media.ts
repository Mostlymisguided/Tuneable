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

const PLACEHOLDER_CREATOR = /^unknown(\s+(artist|author|podcast))?$/i;

function isPlaceholderCreatorLabel(value?: string | null): boolean {
  if (!value) return true;
  return PLACEHOLDER_CREATOR.test(value.trim());
}

function namesFromCreators(creators: unknown): string[] {
  if (!creators) return [];
  if (typeof creators === 'string') {
    const name = creators.trim();
    return name && !isPlaceholderCreatorLabel(name) ? [name] : [];
  }
  if (!Array.isArray(creators)) return [];
  return creators
    .map((entry) => (typeof entry === 'string' ? entry : (entry as { name?: string })?.name))
    .map((name) => (typeof name === 'string' ? name.trim() : ''))
    .filter((name) => name && !isPlaceholderCreatorLabel(name));
}

export function formatArtist(
  artist: ChartMediaItem['artist'] | undefined
): string {
  if (!artist) return 'Unknown artist';
  if (typeof artist === 'string') {
    return isPlaceholderCreatorLabel(artist) ? 'Unknown artist' : artist;
  }
  if (Array.isArray(artist)) {
    const names = namesFromCreators(artist);
    return names.length ? names.join(', ') : 'Unknown artist';
  }
  return 'Unknown artist';
}

function seriesTitleFromMedia(media: ChartMediaItem): string {
  const series = media.podcastSeries;
  if (series && typeof series === 'object' && series.title?.trim()) {
    return series.title.trim();
  }
  if (media.podcastTitle?.trim()) return media.podcastTitle.trim();
  return '';
}

function isPodcastEpisode(media: ChartMediaItem): boolean {
  return (media.contentForm || []).some((form) =>
    ['podcastepisode', 'episode', 'podcast'].includes(form)
  );
}

/** Subtitle for mixed lists: artist, show title, or author. */
export function getCreatorDisplay(
  media: ChartMediaItem | null | undefined
): string {
  if (!media) return 'Unknown artist';
  if (!isPlaceholderCreatorLabel(media.creatorDisplay)) {
    return media.creatorDisplay!.trim();
  }

  const fromArtist = formatArtist(media.artist);
  if (!isPlaceholderCreatorLabel(fromArtist)) return fromArtist;

  if (isPodcastEpisode(media)) {
    const showTitle = seriesTitleFromMedia(media);
    if (showTitle) return showTitle;
  }

  const hosts = namesFromCreators(media.host);
  if (hosts.length) return hosts.join(', ');

  const authors = namesFromCreators(media.author);
  if (authors.length) return authors.join(', ');

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
