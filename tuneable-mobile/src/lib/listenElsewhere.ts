/**
 * Escape hatch when Tuneable can't play a track yet:
 * prefer a known platform URL (YouTube), else Google title+artist search.
 */

import {
  getCreatorDisplay,
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

const GOOGLE_SEARCH = 'https://www.google.com/search';
const LISTEN_ELSEWHERE_LABEL = 'Open externally';

export function buildGoogleListenUrl(title: string, artist?: string | null): string {
  const parts = [title.trim(), (artist || '').trim()].filter(Boolean);
  const q = parts.map((p) => `"${p}"`).join(' ');
  const params = new URLSearchParams({ q: `${q} music`.trim() });
  return `${GOOGLE_SEARCH}?${params.toString()}`;
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

function absoluteCatalogUrl(raw: string, origin: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith('/')) return `${origin}${value}`;
  return `${origin}/${value.replace(/^\//, '')}`;
}

/**
 * Books are read off-platform. Prefer a catalog page, then an ISBN lookup,
 * then a title+author search. The button label matches tune/podcast profiles.
 */
export function getReadElsewhereTarget(
  media: ChartMediaItem | null | undefined
): ListenElsewhereTarget | null {
  if (!media?.title?.trim()) return null;

  const sources = normalizeSources(media.sources);
  const externalIds = media.externalIds || {};

  const openLibrary = sources.openLibrary
    ? absoluteCatalogUrl(sources.openLibrary, 'https://openlibrary.org')
    : externalIds.openLibrary
      ? absoluteCatalogUrl(externalIds.openLibrary, 'https://openlibrary.org')
      : null;
  if (openLibrary) {
    return { url: openLibrary, kind: 'search', label: LISTEN_ELSEWHERE_LABEL };
  }

  const googleBooks = sources.googleBooks || sources.googleBooksPreview;
  if (googleBooks && /^https?:\/\//i.test(googleBooks)) {
    return { url: googleBooks, kind: 'search', label: LISTEN_ELSEWHERE_LABEL };
  }
  if (externalIds.googleBooks) {
    return {
      url: `https://books.google.com/books?id=${encodeURIComponent(externalIds.googleBooks)}`,
      kind: 'search',
      label: LISTEN_ELSEWHERE_LABEL,
    };
  }

  const isbn = (media.isbn || externalIds.isbn || '').trim();
  if (isbn) {
    return {
      url: `https://openlibrary.org/isbn/${encodeURIComponent(isbn)}`,
      kind: 'search',
      label: LISTEN_ELSEWHERE_LABEL,
    };
  }

  const author = getCreatorDisplay(media);
  const authorForQuery =
    author && !/^unknown(\s+author)?$/i.test(author) ? author : null;
  const q = [media.title.trim(), authorForQuery].filter(Boolean).join(' ');
  return {
    url: `${GOOGLE_SEARCH}?${new URLSearchParams({ q: `${q} book` }).toString()}`,
    kind: 'search',
    label: LISTEN_ELSEWHERE_LABEL,
  };
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
      label: LISTEN_ELSEWHERE_LABEL,
    };
  }

  const artist = getCreatorDisplay(media);
  const artistForQuery =
    artist && artist !== 'Unknown artist' && artist !== 'Unknown Artist'
      ? artist
      : null;

  return {
    url: buildGoogleListenUrl(media.title!.trim(), artistForQuery),
    kind: 'search',
    label: LISTEN_ELSEWHERE_LABEL,
  };
}
