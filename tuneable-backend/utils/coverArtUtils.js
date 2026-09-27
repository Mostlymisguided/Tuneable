/**
 * Cover Art Utility Functions
 * 
 * Centralized functions for cover art URL resolution with fallback chain
 */

const DEFAULT_COVER_ART = 'https://uploads.tuneable.stream/cover-art/default-cover.png';
/** Portrait stand-in served with the web app. Not stored on the book record. */
const DEFAULT_BOOK_COVER_ART = 'https://tuneable.stream/default-book-cover.png';
const { extractYouTubeVideoId, getYouTubeThumbnail } = require('./youtubeUtils');

/**
 * Get cover art URL with fallback chain
 * 
 * Fallback order:
 * 1. Use stored coverArt if exists and valid
 * 2. Try YouTube thumbnail if YouTube source exists
 * 3. Fall back to DEFAULT_COVER_ART
 * 
 * @param {Object} media - Media object with coverArt and sources
 * @param {Object|Map} sources - Optional sources object (if not in media)
 * @returns {string} - Cover art URL (never returns empty string)
 */
function getCoverArtUrl(media, sources = null) {
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
  
  // Handle both Map and plain object sources
  let youtubeSource = null;
  if (sourcesObj instanceof Map) {
    youtubeSource = sourcesObj.get('youtube');
  } else if (sourcesObj && typeof sourcesObj === 'object') {
    youtubeSource = sourcesObj.youtube;
  }
  
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
 * @param {Object} media - Media object
 * @returns {string} - Cover art URL
 */
function getMediaCoverArt(media) {
  return getCoverArtUrl(media);
}

function isUsableCoverArtUrl(value) {
  if (!value || typeof value !== 'string') return false;
  const coverArt = value.trim();
  if (!coverArt || coverArt === '[object Object]') return false;
  return coverArt.startsWith('http://') ||
    coverArt.startsWith('https://') ||
    coverArt.startsWith('/');
}

/**
 * Cover URL for a book response. Missing or unusable art becomes the book placeholder.
 * Callers should not persist this fallback onto the Media document.
 */
function resolveBookCoverArt(coverArt) {
  if (isUsableCoverArtUrl(coverArt)) return coverArt.trim();
  return DEFAULT_BOOK_COVER_ART;
}

module.exports = {
  getCoverArtUrl,
  getMediaCoverArt,
  isUsableCoverArtUrl,
  resolveBookCoverArt,
  DEFAULT_COVER_ART,
  DEFAULT_BOOK_COVER_ART
};

