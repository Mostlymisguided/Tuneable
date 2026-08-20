const axios = require('axios');
const he = require('he');
const { recordQuotaUsage, QUOTA_COSTS } = require('./quotaTracker');
const {
  parseYouTubePlaylistId,
  parseIso8601Duration,
  parseYouTubeTrackIdentity,
} = require('../utils/youtubePlaylistUtils');

const YOUTUBE_API = 'https://www.googleapis.com/youtube/v3';
const PAGE_SIZE = 50;
const MAX_PLAYLIST_ITEMS = 200;
const LIKED_PLAYLIST_ID = 'LL';

function youtubeWatchUrl(videoId) {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

function thumbnailFromSnippet(snippet, videoId) {
  const thumbs = snippet?.thumbnails || {};
  const url = thumbs.high?.url || thumbs.medium?.url || thumbs.default?.url;
  if (url) return url;
  return videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : null;
}

async function youtubeApiGet(path, params, { apiKey, user } = {}) {
  const url = `${YOUTUBE_API}/${path}`;
  if (user) {
    const googleTokenService = require('./googleTokenService');
    return googleTokenService.googleGet(user, url, { params, timeout: 20000 });
  }
  if (!apiKey) {
    const err = new Error('YouTube API is not configured');
    err.status = 503;
    throw err;
  }
  return axios.get(url, {
    params: { ...params, key: apiKey },
    timeout: 20000,
  });
}

async function fetchPlaylistPage({ playlistId, pageToken, apiKey, user }) {
  const response = await youtubeApiGet('playlistItems', {
    part: 'snippet,contentDetails,status',
    playlistId,
    maxResults: PAGE_SIZE,
    pageToken: pageToken || undefined,
  }, { apiKey, user });
  await recordQuotaUsage(QUOTA_COSTS.PLAYLIST_ITEMS, 'youtubePlaylistItems', {
    playlistId,
    count: response.data.items?.length || 0,
  });
  return response.data;
}

async function fetchVideoDurations(videoIds, { apiKey, user } = {}) {
  const durations = {};
  if (!videoIds.length) return durations;

  for (let i = 0; i < videoIds.length; i += PAGE_SIZE) {
    const batch = videoIds.slice(i, i + PAGE_SIZE);
    const response = await youtubeApiGet('videos', {
      part: 'contentDetails,status',
      id: batch.join(','),
    }, { apiKey, user });
    const quotaCost = Math.ceil(batch.length / PAGE_SIZE) * QUOTA_COSTS.VIDEOS_LIST_CONTENT_DETAILS;
    await recordQuotaUsage(quotaCost, 'youtubePlaylistVideoDetails', {
      videoCount: batch.length,
    });
    for (const item of response.data.items || []) {
      const privacy = item.status?.privacyStatus;
      const embeddable = item.status?.embeddable !== false;
      if (privacy && privacy !== 'public' && privacy !== 'unlisted') continue;
      durations[item.id] = {
        duration: parseIso8601Duration(item.contentDetails?.duration),
        embeddable,
      };
    }
  }
  return durations;
}

function convertPlaylistRows(rawItems, durationMap, { importSource, sourceLabel }) {
  const tracks = [];
  const skipped = [];
  const parsedRows = [];

  for (const item of rawItems) {
    const videoId = item.contentDetails?.videoId || item.snippet?.resourceId?.videoId;
    const privacy = item.status?.privacyStatus || item.snippet?.status?.privacyStatus;
    if (!videoId) continue;
    if (privacy && privacy !== 'public' && privacy !== 'unlisted') continue;
    const title = he.decode(item.snippet?.title || '');
    if (!title || title === 'Private video' || title === 'Deleted video') continue;
    const channelTitle = he.decode(item.snippet?.videoOwnerChannelTitle || item.snippet?.channelTitle || '');
    const identity = parseYouTubeTrackIdentity({ title, channelTitle });
    parsedRows.push({
      videoId,
      title,
      channelTitle,
      coverArt: thumbnailFromSnippet(item.snippet, videoId),
      identity,
    });
  }

  for (const row of parsedRows) {
    const details = durationMap[row.videoId];
    if (!details) {
      skipped.push({
        videoId: row.videoId,
        title: row.title,
        reason: 'unavailable',
      });
      continue;
    }
    if (row.identity.status === 'junk') {
      skipped.push({
        videoId: row.videoId,
        title: row.title,
        reason: row.identity.reason || 'junk_channel',
        channelTitle: row.channelTitle,
      });
      continue;
    }
    if (row.identity.status !== 'parsed') {
      skipped.push({
        videoId: row.videoId,
        title: row.title,
        reason: row.identity.reason || 'unparsed',
        channelTitle: row.channelTitle,
      });
      continue;
    }

    tracks.push({
      id: row.videoId,
      title: row.identity.title,
      artist: row.identity.artist,
      coverArt: row.coverArt,
      duration: details.duration || 0,
      album: null,
      sourceLabel,
      category: 'Music',
      importSource,
      channelQuality: row.identity.channelQuality,
      originalTitle: row.identity.originalTitle,
      originalArtist: row.channelTitle,
      externalIds: { youtube: row.videoId },
      sources: { youtube: youtubeWatchUrl(row.videoId) },
      tags: [],
      genres: [],
    });
  }

  return { tracks, skipped };
}

async function fetchPlaylistTracks(playlistId, {
  limit = 50,
  onProgress,
  apiKey,
  user,
  importSource,
  sourceLabel,
  fetchingMessage,
  emptyError,
} = {}) {
  const capped = Math.min(Math.max(parseInt(limit, 10) || 50, 1), MAX_PLAYLIST_ITEMS);
  const report = typeof onProgress === 'function' ? onProgress : () => {};
  report({
    stage: 'fetching',
    message: fetchingMessage || 'Fetching YouTube playlist…',
    current: 0,
    total: capped,
  });

  const rawItems = [];
  let pageToken = null;
  let playlistTitle = null;
  try {
    do {
      const page = await fetchPlaylistPage({ playlistId, pageToken, apiKey, user });
      if (!playlistTitle) {
        playlistTitle = page.items?.[0]?.snippet?.channelTitle || null;
      }
      rawItems.push(...(page.items || []));
      pageToken = page.nextPageToken || null;
      report({
        stage: 'fetching',
        message: `Fetched ${Math.min(rawItems.length, capped)} item${rawItems.length === 1 ? '' : 's'}…`,
        current: Math.min(rawItems.length, capped),
        total: capped,
      });
    } while (pageToken && rawItems.length < capped);
  } catch (error) {
    if (error.code === 'PROVIDER_REAUTH_REQUIRED' || error.status === 503) throw error;
    const status = error.response?.status;
    if (status === 404 || status === 403) {
      const err = new Error(emptyError || 'Playlist is private, deleted, or not found. Paste a public playlist URL.');
      err.status = 400;
      throw err;
    }
    throw error;
  }

  const sliced = rawItems.slice(0, capped);
  const videoIds = sliced
    .map((item) => item.contentDetails?.videoId || item.snippet?.resourceId?.videoId)
    .filter(Boolean);
  const durationMap = await fetchVideoDurations(videoIds, { apiKey, user });
  const { tracks, skipped } = convertPlaylistRows(sliced, durationMap, { importSource, sourceLabel });

  report({
    stage: 'fetching',
    message: `Parsed ${tracks.length} track${tracks.length === 1 ? '' : 's'}`,
    current: tracks.length,
    total: tracks.length,
  });

  return {
    playlistId,
    playlistTitle,
    scanned: sliced.length,
    tracks,
    skipped,
  };
}

/**
 * Fetch a public YouTube playlist and convert items to Tuneable import tracks.
 */
async function fetchPublicPlaylist(playlistUrlOrId, { limit = 50, onProgress } = {}) {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    const err = new Error('YouTube API is not configured');
    err.status = 503;
    throw err;
  }

  const playlistId = parseYouTubePlaylistId(playlistUrlOrId);
  if (!playlistId) {
    const err = new Error('Could not parse a YouTube playlist URL or ID');
    err.status = 400;
    throw err;
  }

  return fetchPlaylistTracks(playlistId, {
    limit,
    onProgress,
    apiKey,
    importSource: 'youtube_playlist',
    sourceLabel: 'YouTube Playlist',
    fetchingMessage: 'Fetching YouTube playlist…',
    emptyError: 'Playlist is private, deleted, or not found. Paste a public playlist URL.',
  });
}

/**
 * Fetch the authenticated user's liked videos (private LL playlist) via OAuth.
 */
async function fetchLikedVideos(user, { limit = 50, onProgress } = {}) {
  const googleTokenService = require('./googleTokenService');
  if (!googleTokenService.youtubeLikesConnected(user)) {
    const err = new Error('Connect YouTube to import liked videos.');
    err.status = 400;
    err.code = 'PROVIDER_REAUTH_REQUIRED';
    throw err;
  }

  const fetched = await fetchPlaylistTracks(LIKED_PLAYLIST_ID, {
    limit,
    onProgress,
    user,
    importSource: 'youtube_likes',
    sourceLabel: 'YouTube Likes',
    fetchingMessage: 'Fetching liked videos…',
    emptyError: 'Could not read liked videos. Reconnect YouTube with permission to read likes.',
  });

  return {
    ...fetched,
    playlistId: LIKED_PLAYLIST_ID,
    playlistTitle: fetched.playlistTitle || 'Liked videos',
  };
}

module.exports = {
  fetchPublicPlaylist,
  fetchLikedVideos,
  parseYouTubePlaylistId,
  MAX_PLAYLIST_ITEMS,
  LIKED_PLAYLIST_ID,
};
