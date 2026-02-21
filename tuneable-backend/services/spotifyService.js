/**
 * Spotify API Service
 * Fetches user's saved podcast shows and episode data for import
 */

const axios = require('axios');

const SPOTIFY_API = 'https://api.spotify.com/v1';

/**
 * Get all saved shows for a user (paginated)
 * @param {string} accessToken - User's Spotify OAuth token
 * @param {number} limit - Max shows per request (max 50)
 * @returns {Promise<Array>} Array of show objects
 */
async function getSavedShows(accessToken, limit = 50) {
  const shows = [];
  let url = `${SPOTIFY_API}/me/shows?limit=${Math.min(limit, 50)}`;

  while (url) {
    const res = await axios.get(url, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const items = res.data.items || [];
    shows.push(...items.map(i => i.show));
    url = res.data.next || null;
  }

  return shows;
}

/**
 * Get episodes for a show
 * @param {string} accessToken - User's Spotify OAuth token
 * @param {string} showId - Spotify show ID
 * @param {number} limit - Max episodes (max 50)
 * @returns {Promise<Object>} { episodes, show }
 */
async function getShowEpisodes(accessToken, showId, limit = 50) {
  const url = `${SPOTIFY_API}/shows/${showId}?market=US`;
  const showRes = await axios.get(url, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const show = showRes.data;

  const episodes = [];
  let episodesUrl = `${SPOTIFY_API}/shows/${showId}/episodes?limit=${Math.min(limit, 50)}&market=US`;

  while (episodesUrl) {
    const epRes = await axios.get(episodesUrl, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const items = epRes.data.items || [];
    episodes.push(...items);
    episodesUrl = epRes.data.next || null;
  }

  return { show, episodes };
}

/**
 * Convert Spotify show + episode to format for podcastAdapter
 */
function convertShowToSeriesFormat(show) {
  const categories = show.categories ? Object.values(show.categories).map(c => c) : [];
  return {
    title: show.name || 'Unknown Podcast',
    description: show.description || '',
    author: show.publisher || '',
    image: show.images?.[0]?.url || null,
    categories: Array.isArray(categories) ? categories : [categories],
    language: show.languages?.[0] || 'en',
    explicit: show.explicit || false,
    spotifyId: show.id,
    rssUrl: null,
    spotifyUrl: show.external_urls?.spotify || `https://open.spotify.com/show/${show.id}`
  };
}

/**
 * Convert Spotify episode to format for podcastAdapter
 */
function convertEpisodeToOurFormat(episode, show) {
  return {
    id: episode.id,
    name: episode.name || 'Untitled Episode',
    description: episode.description || '',
    duration: episode.duration_ms ? Math.floor(episode.duration_ms / 1000) : 0,
    explicit: episode.explicit || false,
    releaseDate: episode.release_date ? new Date(episode.release_date).toISOString() : null,
    audioPreviewUrl: episode.audio_preview_url || null,
    spotifyUrl: episode.external_urls?.spotify || `https://open.spotify.com/episode/${episode.id}`,
    show: show ? {
      id: show.id,
      name: show.name,
      images: show.images,
      publisher: show.publisher,
      external_urls: show.external_urls
    } : null
  };
}

module.exports = {
  getSavedShows,
  getShowEpisodes,
  convertShowToSeriesFormat,
  convertEpisodeToOurFormat
};
