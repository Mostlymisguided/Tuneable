/**
 * SoundCloud API Service
 * Fetches user's liked tracks for library import
 */

const axios = require('axios');
const User = require('../models/User');

const SOUNDCLOUD_API = 'https://api.soundcloud.com';
const SOUNDCLOUD_TOKEN_URL = 'https://secure.soundcloud.com/oauth/token';

function authHeaders(accessToken) {
  return {
    Authorization: `OAuth ${accessToken}`,
    Accept: 'application/json; charset=utf-8',
  };
}

/**
 * Refresh an expired SoundCloud access token and persist on the user.
 * @param {import('mongoose').Document} user
 * @returns {Promise<string>} fresh access token
 */
async function refreshAccessToken(user) {
  if (!user?.soundcloudRefreshToken) {
    const err = new Error('SoundCloud token expired. Please reconnect SoundCloud.');
    err.status = 401;
    throw err;
  }
  if (!process.env.SOUNDCLOUD_CLIENT_ID || !process.env.SOUNDCLOUD_CLIENT_SECRET) {
    const err = new Error('SoundCloud OAuth is not configured on the server.');
    err.status = 500;
    throw err;
  }

  try {
    const res = await axios.post(
      SOUNDCLOUD_TOKEN_URL,
      new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: process.env.SOUNDCLOUD_CLIENT_ID,
        client_secret: process.env.SOUNDCLOUD_CLIENT_SECRET,
        refresh_token: user.soundcloudRefreshToken,
      }).toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    const { access_token: accessToken, refresh_token: refreshToken } = res.data || {};
    if (!accessToken) {
      const err = new Error('SoundCloud token refresh failed. Please reconnect SoundCloud.');
      err.status = 401;
      throw err;
    }

    user.soundcloudAccessToken = accessToken;
    if (refreshToken) {
      user.soundcloudRefreshToken = refreshToken;
    }
    await user.save();
    return accessToken;
  } catch (error) {
    if (error.status === 401 || error.status === 500) throw error;
    const err = new Error('SoundCloud token expired. Please reconnect SoundCloud.');
    err.status = 401;
    err.cause = error;
    throw err;
  }
}

/**
 * GET with OAuth header; on 401, refresh once and retry.
 * @param {import('mongoose').Document} user
 * @param {string} url
 * @param {object} [config]
 */
async function soundcloudGet(user, url, config = {}) {
  let accessToken = user.soundcloudAccessToken;
  if (!accessToken) {
    const err = new Error('SoundCloud not connected. Please connect your SoundCloud account first.');
    err.status = 400;
    throw err;
  }

  try {
    return await axios.get(url, {
      ...config,
      headers: { ...authHeaders(accessToken), ...(config.headers || {}) },
    });
  } catch (error) {
    if (error.response?.status !== 401) throw error;
    accessToken = await refreshAccessToken(user);
    return axios.get(url, {
      ...config,
      headers: { ...authHeaders(accessToken), ...(config.headers || {}) },
    });
  }
}

/**
 * Get liked tracks for the authenticated SoundCloud user (paginated).
 * @param {string|import('mongoose').Types.ObjectId} userId
 * @param {number} limit - Max tracks to return overall
 * @returns {Promise<Array>} Array of SoundCloud track objects
 */
async function getLikedTracks(userId, limit = 50) {
  const user = await User.findById(userId).select(
    'soundcloudAccessToken soundcloudRefreshToken soundcloudId'
  );
  if (!user?.soundcloudAccessToken && !user?.soundcloudRefreshToken) {
    const err = new Error('SoundCloud not connected. Please connect your SoundCloud account first.');
    err.status = 400;
    throw err;
  }

  const tracks = [];
  const pageSize = Math.min(Math.max(limit, 1), 200);
  let url = `${SOUNDCLOUD_API}/me/likes/tracks?limit=${Math.min(pageSize, 50)}&linked_partitioning=true`;

  while (url && tracks.length < limit) {
    const res = await soundcloudGet(user, url);
    const data = res.data;
    const batch = Array.isArray(data)
      ? data
      : (Array.isArray(data?.collection) ? data.collection : []);

    for (const item of batch) {
      // Some responses wrap the track; prefer the track object itself
      const track = item?.track && typeof item.track === 'object' ? item.track : item;
      if (track?.id) tracks.push(track);
      if (tracks.length >= limit) break;
    }

    url = tracks.length < limit ? (data?.next_href || null) : null;
  }

  return tracks.slice(0, limit);
}

function normalizeArtworkUrl(url) {
  if (!url || typeof url !== 'string') return null;
  // Prefer larger artwork when SoundCloud returns the -large variant
  return url.replace('-large.', '-t500x500.').replace('-small.', '-t500x500.');
}

/**
 * Convert a SoundCloud track into Tuneable import format
 */
function convertLikedTrackToTuneableFormat(track) {
  const id = track?.id != null ? String(track.id) : null;
  const user = track?.user || {};
  const artist = user.username || user.full_name || 'Unknown Artist';
  const permalink = track?.permalink_url || null;
  const releaseDate = track?.release_date || track?.created_at || null;
  const releaseYear = releaseDate
    ? Number.parseInt(String(releaseDate).slice(0, 4), 10)
    : null;

  const isrc = track?.isrc || track?.publisher_metadata?.isrc || null;

  return {
    id,
    title: track?.title || 'Untitled Track',
    artist,
    artists: [artist].filter(Boolean),
    coverArt: normalizeArtworkUrl(track?.artwork_url)
      || normalizeArtworkUrl(user?.avatar_url)
      || null,
    duration: track?.duration ? Math.floor(Number(track.duration) / 1000) : 0,
    album: track?.album_title || null,
    releaseDate: releaseDate || null,
    releaseYear: Number.isFinite(releaseYear) ? releaseYear : null,
    category: 'Music',
    sources: permalink ? { soundcloud: permalink } : {},
    externalIds: {
      ...(id ? { soundcloud: id } : {}),
      ...(isrc ? { isrc } : {}),
    },
    isLocal: false,
    isPlayable: false,
    supportMode: 'tip',
    awaitingUpload: true,
    sourceLabel: 'SoundCloud Likes',
    genre: track?.genre || null,
    addedAt: track?.created_at || null,
  };
}

module.exports = {
  getLikedTracks,
  convertLikedTrackToTuneableFormat,
  refreshAccessToken,
};
