/**
 * Escape hatch when Tuneable can't play a track yet:
 * prefer a known platform URL (YouTube), else Ecosia title+artist search.
 */

import {
  getPlayabilityBlockReason,
  isMediaPlayable,
  normalizeSources,
  type PlayabilityFields,
} from './mediaPlayability';
import { getCreatorDisplay } from './creatorDisplay';

export type ListenElsewhereKind = 'youtube' | 'search';

export type ListenElsewhereTarget = {
  url: string;
  kind: ListenElsewhereKind;
  label: string;
};

type MediaLike = PlayabilityFields & {
  title?: string | null;
  artist?: unknown;
  artists?: unknown;
  featuring?: unknown;
  creatorDisplay?: string | null;
  sources?: Parameters<typeof normalizeSources>[0];
  rightsStatus?: 'cleared' | 'pending' | 'disputed';
  rightsCleared?: boolean;
  contentForm?: string | string[];
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
  // Bare video id
  if (/^[\w-]{11}$/.test(value)) {
    return `https://www.youtube.com/watch?v=${value}`;
  }
  return null;
}

export function shouldOfferListenElsewhere(
  media: MediaLike | null | undefined
): boolean {
  if (!media?.title?.trim()) return false;
  if (isMediaPlayable(media)) return false;
  if (getPlayabilityBlockReason(media) === 'disputed') return false;
  return true;
}

export function getListenElsewhereTarget(
  media: MediaLike | null | undefined
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

  const artist = getCreatorDisplay(media);
  const artistForQuery =
    artist && artist !== 'Unknown Artist' ? artist : null;

  return {
    url: buildEcosiaListenUrl(media.title!.trim(), artistForQuery),
    kind: 'search',
    label: 'Find on the web',
  };
}

export function openListenElsewhere(media: MediaLike | null | undefined): boolean {
  const target = getListenElsewhereTarget(media);
  if (!target) return false;
  window.open(target.url, '_blank', 'noopener,noreferrer');
  return true;
}
