/**
 * SoundCloud API Service
 * Fetches user's liked tracks for library import
 */

const axios = require('axios');
const User = require('../models/User');

const SOUNDCLOUD_API = 'https://api.soundcloud.com';
const SOUNDCLOUD_TOKEN_URL = 'https://secure.soundcloud.com/oauth/token';

/** Long-form sets/mixes — Tuneable import is for individual tunes only. */
const MIX_DURATION_SEC = 15 * 60;
const HARD_SET_DURATION_SEC = 20 * 60;
const MIX_TITLE_PATTERNS = [
  /\bdj\s*set\b/i,
  /\blive\s*set\b/i,
  /\bliveset\b/i,
  /\bmixtape\b/i,
  /\bcontinuous\s*mix\b/i,
  /\bradio\s*show\b/i,
  /\bpodcast\b/i,
  /\bwarm[\s-]*up\s*mix\b/i,
  /\bguest\s*mix\b/i,
  /\bpromo\s*mix\b/i,
  /\bboiler\s*room\b/i,
  /\bessential\s*mix\b/i,
  /\bb2b\b/i,
];

function authHeaders(accessToken) {
  return {
    Authorization: `OAuth ${accessToken}`,
    Accept: 'application/json; charset=utf-8',
  };
}

/**
 * True for DJ mixes / live sets / long-form shows — not individual tunes.
 * Remixes and short edits are kept.
 */
function isLikelyMixOrSet(track) {
  if (!track) return false;

  const durationSec = track.duration ? Number(track.duration) / 1000 : 0;
  const title = String(track.title || '');
  const genre = String(track.genre || '');
  const tags = String(track.tag_list || '');
  const haystack = `${title} ${genre} ${tags}`;

  const isRemixOrEdit = /\bremix\b|\bedit\b|\bbootleg\b|\bvip\b/i.test(title)
    && !MIX_TITLE_PATTERNS.some((p) => p.test(haystack));

  if (isRemixOrEdit && durationSec < HARD_SET_DURATION_SEC) {
    return false;
  }

  if (MIX_TITLE_PATTERNS.some((p) => p.test(haystack))) {
    return true;
  }

  // Genre often literally "DJ Mix" / "Mix"
  if (/\b(dj\s*)?mix(es|ing)?\b/i.test(genre) && !/\bremix\b/i.test(genre)) {
    return true;
  }

  // Standalone "mix" in title (not remix): "Friday Mix", "House Mix 012"
  if (/(^|[^a-z])mix([^a-z]|$)/i.test(title) && !/\bremix\b|\bedit\b/i.test(title)) {
    return true;
  }

  // Very long uploads are almost always sets
  if (durationSec >= HARD_SET_DURATION_SEC) {
    return true;
  }

  // Borderline length + mix-ish wording in tags/title
  if (
    durationSec >= MIX_DURATION_SEC
    && /\bmix\b|\bset\b|\bdj\b/i.test(haystack)
    && !/\bremix\b/i.test(title)
  ) {
    return true;
  }

  return false;
}

/**
 * Refresh an expired SoundCloud access token and persist on the user.
 * @param {import('mongoose').Document} user
 * @returns {Promise<string>} fresh access token
 */
async function refreshAccessToken(user) {
  if (!user?.soundcloudRefreshToken) {
    const err = new Error('SoundCloud token expired. Please reconnect SoundCloud.');
    err.status = 400;
    err.code = 'PROVIDER_REAUTH_REQUIRED';
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
      err.status = 400;
      err.code = 'PROVIDER_REAUTH_REQUIRED';
      throw err;
    }

    user.soundcloudAccessToken = accessToken;
    if (refreshToken) {
      user.soundcloudRefreshToken = refreshToken;
    }
    await user.save();
    return accessToken;
  } catch (error) {
    if (error.status === 400 || error.status === 500 || error.code === 'PROVIDER_REAUTH_REQUIRED') throw error;
    const err = new Error('SoundCloud token expired. Please reconnect SoundCloud.');
    err.status = 400;
    err.code = 'PROVIDER_REAUTH_REQUIRED';
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
 * Mixes / live sets are excluded by default so import stays tune-only.
 * @param {string|import('mongoose').Types.ObjectId} userId
 * @param {number} limit - Max tracks to return overall (after filtering)
 * @param {{ excludeMixes?: boolean }} [options]
 * @returns {Promise<{ tracks: Array, skippedMixes: number, scanned: number }>}
 */
async function getLikedTracks(userId, limit = 50, options = {}) {
  const excludeMixes = options.excludeMixes !== false;
  const user = await User.findById(userId).select(
    'soundcloudAccessToken soundcloudRefreshToken soundcloudId'
  );
  if (!user?.soundcloudAccessToken && !user?.soundcloudRefreshToken) {
    const err = new Error('SoundCloud not connected. Please connect your SoundCloud account first.');
    err.status = 400;
    throw err;
  }

  const tracks = [];
  let skippedMixes = 0;
  let scanned = 0;
  // Scan extra pages so filtering still fills `limit` with real tunes
  const maxScan = Math.min(Math.max(limit * 3, limit), 400);
  const pageSize = Math.min(50, Math.max(limit, 1));
  let url = `${SOUNDCLOUD_API}/me/likes/tracks?limit=${pageSize}&linked_partitioning=true`;

  while (url && tracks.length < limit && scanned < maxScan) {
    const res = await soundcloudGet(user, url);
    const data = res.data;
    const batch = Array.isArray(data)
      ? data
      : (Array.isArray(data?.collection) ? data.collection : []);

    for (const item of batch) {
      const track = item?.track && typeof item.track === 'object' ? item.track : item;
      if (!track?.id) continue;
      scanned += 1;

      if (excludeMixes && isLikelyMixOrSet(track)) {
        skippedMixes += 1;
        continue;
      }

      tracks.push(track);
      if (tracks.length >= limit || scanned >= maxScan) break;
    }

    url = (tracks.length < limit && scanned < maxScan) ? (data?.next_href || null) : null;
  }

  return {
    tracks: tracks.slice(0, limit),
    skippedMixes,
    scanned,
  };
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
  isLikelyMixOrSet,
  MIX_DURATION_SEC,
};
