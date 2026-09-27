/**
 * Cover Art Utility Functions
 * 
 * Centralized functions for cover art URL resolution with fallback chain
 */

import {
  DEFAULT_BOOK_COVER_ART,
  DEFAULT_BOOK_COVER_ART_REMOTE,
  DEFAULT_COVER_ART,
} from '../constants';
import { extractYouTubeVideoId, getYouTubeThumbnail } from './youtubeUtils';

/**
 * Get cover art URL with fallback chain
 * 
 * Fallback order:
 * 1. Use stored coverArt if exists and valid
 * 2. Try YouTube thumbnail if YouTube source exists
 * 3. Fall back to DEFAULT_COVER_ART
 * 
 * @param media - Media object with coverArt and sources
 * @param sources - Optional sources object (if not in media)
 * @returns Cover art URL (never returns empty string)
 */
export function getCoverArtUrl(media: any, sources?: any): string {
  // 1. Use stored cover art if exists and valid
  if (media?.coverArt && typeof media.coverArt === 'string' && media.coverArt.trim() !== '') {
    const coverArt = media.coverArt.trim();
    
    // Validate URL format (http, https, or relative path starting with /)
    if (coverArt.startsWith('http://') || 
        coverArt.startsWith('https://') || 
        coverArt.startsWith('/')) {
      return coverArt;
    }
  }
  
  // 2. Try YouTube thumbnail if YouTube source exists
  const sourcesObj = sources || media?.sources || {};
  const youtubeSource = sourcesObj?.youtube || sourcesObj?.get?.('youtube');
  
  if (youtubeSource) {
    const videoId = extractYouTubeVideoId(youtubeSource);
    if (videoId) {
      const thumbnail = getYouTubeThumbnail(videoId);
      if (thumbnail) {
        return thumbnail;
      }
    }
  }
  
  // 3. Fall back to default (never return empty string)
  return DEFAULT_COVER_ART;
}

/**
 * Get cover art URL from media object (simplified version)
 * 
 * @param media - Media object
 * @returns Cover art URL
 */
export function getMediaCoverArt(media: any): string {
  return getCoverArtUrl(media);
}

function isBookPlaceholderUrl(value: string): boolean {
  return value === DEFAULT_BOOK_COVER_ART
    || value === DEFAULT_BOOK_COVER_ART_REMOTE
    || value.endsWith('/default-book-cover.png');
}

/**
 * Jacket URL for a book. Missing, unusable, or API placeholder values use the local asset.
 */
export function resolveBookCoverArt(coverArt?: string | null): string {
  if (!coverArt || typeof coverArt !== 'string') return DEFAULT_BOOK_COVER_ART;
  const trimmed = coverArt.trim();
  if (!trimmed || trimmed === '[object Object]' || isBookPlaceholderUrl(trimmed)) {
    return DEFAULT_BOOK_COVER_ART;
  }
  if (
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('/')
  ) {
    return trimmed;
  }
  return DEFAULT_BOOK_COVER_ART;
}

