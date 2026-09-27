import type { ImageSourcePropType } from 'react-native';

/** Bundled stand-in for books with no jacket. Matches the web `/default-book-cover.png`. */
export const DEFAULT_BOOK_COVER_ART: ImageSourcePropType = require('../../assets/images/default-book-cover.png');

export function isRemoteBookCover(coverArt?: string | null): boolean {
  if (!coverArt || typeof coverArt !== 'string') return false;
  const trimmed = coverArt.trim();
  if (!trimmed || trimmed === '[object Object]') return false;
  if (trimmed.endsWith('/default-book-cover.png')) return false;
  return /^https?:\/\//i.test(trimmed);
}

export function bookCoverSource(coverArt?: string | null): ImageSourcePropType {
  if (isRemoteBookCover(coverArt)) return { uri: coverArt!.trim() };
  return DEFAULT_BOOK_COVER_ART;
}

/** Open Library answers a missing jacket with a 1×1 GIF and HTTP 200. */
export function isBlankCoverSize(width?: number | null, height?: number | null): boolean {
  if (!width || !height) return false;
  return width < 20 || height < 20;
}
