/**
 * Cover Art Utility Functions
 * 
 * Centralized functions for cover art URL resolution with fallback chain
 */

const DEFAULT_COVER_ART = 'https://uploads.tuneable.stream/cover-art/default-cover.png';
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

module.exports = {
  getCoverArtUrl,
  getMediaCoverArt,
  DEFAULT_COVER_ART
};

