/**
 * YouTube Utility Functions
 * 
 * Centralized functions for YouTube video ID extraction and thumbnail generation
 */

/**
 * Extract YouTube video ID from various URL formats
 * 
 * Supports:
 * - https://www.youtube.com/watch?v=VIDEO_ID
 * - https://youtu.be/VIDEO_ID
 * - https://youtube.com/embed/VIDEO_ID
 * - https://www.youtube.com/watch?v=VIDEO_ID&list=...&index=...
 * 
 * @param {string} url - YouTube URL
 * @returns {string|null} - Video ID or null if not found
 */
function extractYouTubeVideoId(url) {
  if (!url || typeof url !== 'string') {
    return null;
  }
  
  try {
    // Handle youtu.be/VIDEO_ID format
    if (url.includes('youtu.be/')) {
      const match = url.match(/youtu\.be\/([^?&#]+)/);
      if (match && match[1]) {
        return match[1];
      }
    }
    
    // Handle youtube.com/watch?v=VIDEO_ID format
    if (url.includes('youtube.com/watch') || url.includes('youtube.com/v/')) {
      try {
        const urlObj = new URL(url);
        const videoId = urlObj.searchParams.get('v');
        if (videoId) {
          return videoId;
        }
      } catch (e) {
        // Fallback to regex if URL parsing fails
        const match = url.match(/[?&]v=([^&#]+)/);
        if (match && match[1]) {
          return match[1];
        }
      }
    }
    
    // Handle embed URLs: youtube.com/embed/VIDEO_ID
    if (url.includes('/embed/')) {
      const match = url.match(/\/embed\/([^?&#]+)/);
      if (match && match[1]) {
        return match[1];
      }
    }
    
    // Handle short URLs and other formats with regex fallback
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/)([^&\n?#]+)/,
      /youtube\.com\/watch\?.*v=([^&\n?#]+)/
    ];
    
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match && match[1]) {
        return match[1];
      }
    }
    
    return null;
  } catch (error) {
    console.error('Error extracting YouTube video ID:', error);
    return null;
  }
}

/**
 * Generate YouTube thumbnail URL from video ID
 * 
 * @param {string} videoId - YouTube video ID
 * @param {string} quality - Thumbnail quality: 'default', 'medium', 'high', 'hqdefault', 'maxresdefault'
 * @returns {string|null} - Thumbnail URL or null if videoId is invalid
 */
function getYouTubeThumbnail(videoId, quality = 'hqdefault') {
  if (!videoId || typeof videoId !== 'string') {
    return null;
  }
  
  const validQualities = ['default', 'medium', 'high', 'hqdefault', 'maxresdefault'];
  const thumbnailQuality = validQualities.includes(quality) ? quality : 'hqdefault';
  
  return `https://img.youtube.com/vi/${videoId}/${thumbnailQuality}.jpg`;
}

/**
 * Extract video ID and generate thumbnail URL in one call
 * 
 * @param {string} url - YouTube URL
 * @param {string} quality - Thumbnail quality
 * @returns {string|null} - Thumbnail URL or null
 */
function getYouTubeThumbnailFromUrl(url, quality = 'hqdefault') {
  const videoId = extractYouTubeVideoId(url);
  if (!videoId) {
    return null;
  }
  return getYouTubeThumbnail(videoId, quality);
}

module.exports = {
  extractYouTubeVideoId,
  getYouTubeThumbnail,
  getYouTubeThumbnailFromUrl
};

