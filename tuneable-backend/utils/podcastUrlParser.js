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

  const normalizedUrl = url.trim();

  const applePatterns = {
    episode: /podcasts\.apple\.com\/[^\/]+\/podcast\/[^\/]+\/id(\d+).*[?&]i=(\d+)/i,
    episodeShort: /podcasts\.apple\.com\/(?:[^\/]+\/)?podcast\/id(\d+).*[?&]i=(\d+)/i,
    series: /podcasts\.apple\.com\/[^\/]+\/podcast\/[^\/]+\/id(\d+)/i,
    seriesShort: /podcasts\.apple\.com\/(?:[^\/]+\/)?podcast\/id(\d+)/i,
  };

  const spotifyPatterns = {
    episode: /open\.spotify\.com\/episode\/([a-zA-Z0-9]+)/i,
    series: /open\.spotify\.com\/show\/([a-zA-Z0-9]+)/i,
    episodeUri: /^spotify:episode:([a-zA-Z0-9]+)/i,
    seriesUri: /^spotify:show:([a-zA-Z0-9]+)/i,
  };

  const rssPattern = /^https?:\/\/.+\.(rss|xml)(\?.*)?$/i;
  const rssPathPattern = /^https?:\/\/.+\/(feed|rss|podcast|atom)(\/|\.xml|\.rss)?(\?.*)?$/i;

  const appleEpisodeMatch =
    normalizedUrl.match(applePatterns.episode) ||
    normalizedUrl.match(applePatterns.episodeShort);
  if (appleEpisodeMatch) {
    return {
      type: 'apple',
      isEpisode: true,
      isSeries: false,
      episodeId: appleEpisodeMatch[2],
      seriesId: appleEpisodeMatch[1],
      originalUrl: normalizedUrl,
    };
  }

  const appleSeriesMatch =
    normalizedUrl.match(applePatterns.series) ||
    normalizedUrl.match(applePatterns.seriesShort);
  if (appleSeriesMatch) {
    return {
      type: 'apple',
      isEpisode: false,
      isSeries: true,
      episodeId: null,
      seriesId: appleSeriesMatch[1],
      originalUrl: normalizedUrl,
    };
  }

  const spotifyEpisodeMatch =
    normalizedUrl.match(spotifyPatterns.episode) ||
    normalizedUrl.match(spotifyPatterns.episodeUri);
  if (spotifyEpisodeMatch) {
    return {
      type: 'spotify',
      isEpisode: true,
      isSeries: false,
      episodeId: spotifyEpisodeMatch[1],
      seriesId: null,
      originalUrl: normalizedUrl,
    };
  }

  const spotifySeriesMatch =
    normalizedUrl.match(spotifyPatterns.series) ||
    normalizedUrl.match(spotifyPatterns.seriesUri);
  if (spotifySeriesMatch) {
    return {
      type: 'spotify',
      isEpisode: false,
      isSeries: true,
      episodeId: null,
      seriesId: spotifySeriesMatch[1],
      originalUrl: normalizedUrl,
    };
  }

  if (rssPattern.test(normalizedUrl) || rssPathPattern.test(normalizedUrl)) {
    return {
      type: 'rss',
      isEpisode: false,
      isSeries: true,
      episodeId: null,
      seriesId: null,
      originalUrl: normalizedUrl,
    };
  }

  try {
    const urlObj = new URL(normalizedUrl);
    if (urlObj.protocol === 'http:' || urlObj.protocol === 'https:') {
      return {
        type: 'generic',
        isEpisode: false,
        isSeries: false,
        episodeId: null,
        seriesId: null,
        originalUrl: normalizedUrl,
      };
    }
  } catch (e) {
    return null;
  }

  return null;
}

function isValidPodcastUrl(url) {
  const parsed = parsePodcastUrl(url);
  return parsed !== null;
}

module.exports = {
  parsePodcastUrl,
  isValidPodcastUrl,
};
