/**
 * Escape hatch when Tuneable can't play a track yet:
 * prefer a known platform URL (YouTube), else Ecosia title+artist search.
 */

import {
  formatArtist,
  getPlayabilityBlockReason,
  isUploadPlayable,
  normalizeSources,
} from '@/src/lib/media';
import type { ChartMediaItem } from '@/src/types/media';

export type ListenElsewhereKind = 'youtube' | 'search';

export type ListenElsewhereTarget = {
  url: string;
  kind: ListenElsewhereKind;
  label: string;
};

const ECOSIA_SEARCH = 'https://www.ecosia.org/search';

export function buildEcosiaListenUrl(title: string, artist?: string | null): string {
  const parts = [title.trim(), (artist || '').trim()].filter(Boolean);
  const q = parts.map((p) => `"${p}"`).join(' ');
  const params = new URLSearchParams({ q: `${q} music`.trim() });
  return `${ECOSIA_SEARCH}?${params.toString()}`;
}

function youtubeWatchUrl(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  if (/^[\w-]{11}$/.test(value)) {
    return `https://www.youtube.com/watch?v=${value}`;
  }
  return null;
}

export function shouldOfferListenElsewhere(
  media: ChartMediaItem | null | undefined
): boolean {
  if (!media?.title?.trim()) return false;
  if (isUploadPlayable(media)) return false;
  if (getPlayabilityBlockReason(media) === 'disputed') return false;
  return true;
}

export function getListenElsewhereTarget(
  media: ChartMediaItem | null | undefined
): ListenElsewhereTarget | null {
  if (!shouldOfferListenElsewhere(media) || !media) return null;

  const sources = normalizeSources(media.sources);
  const yt = sources.youtube ? youtubeWatchUrl(sources.youtube) : null;
  if (yt) {
    return {
      url: yt,
      kind: 'youtube',
      label: 'Open on YouTube',
    };
  }

  const artist = media.creatorDisplay || formatArtist(media.artist);
  const artistForQuery =
    artist && artist !== 'Unknown artist' && artist !== 'Unknown Artist'
      ? artist
      : null;

  return {
    url: buildEcosiaListenUrl(media.title!.trim(), artistForQuery),
    kind: 'search',
    label: 'Find on the web',
  };
}
