/**
 * Podcast URL Parser
 * Parses podcast URLs from various platforms and extracts episode/series information
 */

/**
 * Parse a podcast URL and determine its type and extract IDs
 * @param {string} url - The podcast URL to parse
 * @returns {Object|null} - Parsed URL info or null if not a valid podcast URL
 * 
 * Returns:
 * {
 *   type: 'apple' | 'spotify' | 'rss' | 'generic',
 *   isEpisode: boolean,
 *   isSeries: boolean,
 *   episodeId: string | null,
 *   seriesId: string | null,
 *   originalUrl: string
 * }
 */
function parsePodcastUrl(url) {
  if (!url || typeof url !== 'string') {
    return null;
  }

  // Normalize URL
  const normalizedUrl = url.trim();
  
  // Apple Podcasts patterns
  const applePatterns = {
    // Episode: https://podcasts.apple.com/us/podcast/podcast-name/id123456789?i=1000123456789
    // Series: https://podcasts.apple.com/us/podcast/podcast-name/id123456789
    episode: /podcasts\.apple\.com\/[^\/]+\/podcast\/[^\/]+\/id(\d+).*[?&]i=(\d+)/i,
    series: /podcasts\.apple\.com\/[^\/]+\/podcast\/[^\/]+\/id(\d+)/i,
    // Short form: https://podcasts.apple.com/podcast/id123456789
    seriesShort: /podcasts\.apple\.com\/podcast\/id(\d+)/i
  };

  // Spotify patterns
  const spotifyPatterns = {
    // Episode: https://open.spotify.com/episode/4rOoJ6Egrf8K2IrywzwOMk
    // Series: https://open.spotify.com/show/4rOoJ6Egrf8K2IrywzwOMk
    episode: /open\.spotify\.com\/episode\/([a-zA-Z0-9]+)/i,
    series: /open\.spotify\.com\/show\/([a-zA-Z0-9]+)/i
  };

  // RSS feed pattern
  const rssPattern = /^https?:\/\/.+\/(feed|rss|rss\.xml|feed\.xml|\.rss|\.xml)(\?.*)?$/i;

  // Try Apple Podcasts
  const appleEpisodeMatch = normalizedUrl.match(applePatterns.episode);
  if (appleEpisodeMatch) {
    return {
      type: 'apple',
      isEpisode: true,
      isSeries: false,
      episodeId: appleEpisodeMatch[2], // The 'i' parameter
      seriesId: appleEpisodeMatch[1], // The 'id' parameter
      originalUrl: normalizedUrl
    };
  }

  const appleSeriesMatch = normalizedUrl.match(applePatterns.series) || normalizedUrl.match(applePatterns.seriesShort);
  if (appleSeriesMatch) {
    return {
      type: 'apple',
      isEpisode: false,
      isSeries: true,
      episodeId: null,
      seriesId: appleSeriesMatch[1],
      originalUrl: normalizedUrl
    };
  }

  // Try Spotify
  const spotifyEpisodeMatch = normalizedUrl.match(spotifyPatterns.episode);
  if (spotifyEpisodeMatch) {
    return {
      type: 'spotify',
      isEpisode: true,
      isSeries: false,
      episodeId: spotifyEpisodeMatch[1],
      seriesId: null, // Spotify doesn't provide series ID in episode URL
      originalUrl: normalizedUrl
    };
  }

  const spotifySeriesMatch = normalizedUrl.match(spotifyPatterns.series);
  if (spotifySeriesMatch) {
    return {
      type: 'spotify',
      isEpisode: false,
      isSeries: true,
      episodeId: null,
      seriesId: spotifySeriesMatch[1],
      originalUrl: normalizedUrl
    };
  }

  // Try RSS feed
  if (rssPattern.test(normalizedUrl)) {
    return {
      type: 'rss',
      isEpisode: false,
      isSeries: true, // RSS feeds are typically series-level
      episodeId: null,
      seriesId: null,
      originalUrl: normalizedUrl
    };
  }

  // Generic URL - could be a podcast platform we don't explicitly support
  // Check if it looks like a valid HTTP(S) URL
  try {
    const urlObj = new URL(normalizedUrl);
    if (urlObj.protocol === 'http:' || urlObj.protocol === 'https:') {
      return {
        type: 'generic',
        isEpisode: false,
        isSeries: false,
        episodeId: null,
        seriesId: null,
        originalUrl: normalizedUrl
      };
    }
  } catch (e) {
    // Not a valid URL
    return null;
  }

  return null;
}

/**
 * Validate if a URL is a valid podcast URL
 * @param {string} url - The URL to validate
 * @returns {boolean} - True if it's a valid podcast URL
 */
function isValidPodcastUrl(url) {
  const parsed = parsePodcastUrl(url);
  return parsed !== null;
}

module.exports = {
  parsePodcastUrl,
  isValidPodcastUrl
};

