import type { ChartMediaItem, MediaSources } from '@/src/types/media';

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
  const sources = normalizeSources(media.sources);
  const url = sources.upload || sources.audio_direct || sources.audio || null;
  return url || null;
}

export function isUploadPlayable(media: ChartMediaItem | null | undefined): boolean {
  if (!media) return false;
  if (typeof media.isPlayable === 'boolean') {
    return media.isPlayable && Boolean(getUploadUrl(media));
  }
  if (media.rightsStatus === 'disputed') return false;
  return Boolean(getUploadUrl(media));
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
