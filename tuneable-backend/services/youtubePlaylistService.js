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

function youtubeWatchUrl(videoId) {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

function thumbnailFromSnippet(snippet, videoId) {
  const thumbs = snippet?.thumbnails || {};
  const url = thumbs.high?.url || thumbs.medium?.url || thumbs.default?.url;
  if (url) return url;
  return videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : null;
}

async function fetchPlaylistPage({ playlistId, pageToken, apiKey }) {
  const response = await axios.get(`${YOUTUBE_API}/playlistItems`, {
    params: {
      part: 'snippet,contentDetails,status',
      playlistId,
      maxResults: PAGE_SIZE,
      pageToken: pageToken || undefined,
      key: apiKey,
    },
    timeout: 20000,
  });
  await recordQuotaUsage(QUOTA_COSTS.PLAYLIST_ITEMS, 'youtubePlaylistItems', {
    playlistId,
    count: response.data.items?.length || 0,
  });
  return response.data;
}

async function fetchVideoDurations(videoIds, apiKey) {
  const durations = {};
  if (!videoIds.length) return durations;

  for (let i = 0; i < videoIds.length; i += PAGE_SIZE) {
    const batch = videoIds.slice(i, i + PAGE_SIZE);
    const response = await axios.get(`${YOUTUBE_API}/videos`, {
      params: {
        part: 'contentDetails,status',
        id: batch.join(','),
        key: apiKey,
      },
      timeout: 20000,
    });
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

  const capped = Math.min(Math.max(parseInt(limit, 10) || 50, 1), MAX_PLAYLIST_ITEMS);
  const report = typeof onProgress === 'function' ? onProgress : () => {};
  report({
    stage: 'fetching',
    message: 'Fetching YouTube playlist…',
    current: 0,
    total: capped,
  });

  const rawItems = [];
  let pageToken = null;
  let playlistTitle = null;
  try {
    do {
      const page = await fetchPlaylistPage({ playlistId, pageToken, apiKey });
      if (!playlistTitle) {
        playlistTitle = page.items?.[0]?.snippet?.channelTitle || null;
      }
      rawItems.push(...(page.items || []));
      pageToken = page.nextPageToken || null;
      report({
        stage: 'fetching',
        message: `Fetched ${Math.min(rawItems.length, capped)} playlist item${rawItems.length === 1 ? '' : 's'}…`,
        current: Math.min(rawItems.length, capped),
        total: capped,
      });
    } while (pageToken && rawItems.length < capped);
  } catch (error) {
    const status = error.response?.status;
    if (status === 404 || status === 403) {
      const err = new Error('Playlist is private, deleted, or not found. Paste a public playlist URL.');
      err.status = 400;
      throw err;
    }
    throw error;
  }

  const sliced = rawItems.slice(0, capped);
  const videoIds = [];
  const parsedRows = [];

  for (const item of sliced) {
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
    videoIds.push(videoId);
  }

  const durationMap = await fetchVideoDurations(videoIds, apiKey);
  const tracks = [];
  const skipped = [];

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
      sourceLabel: 'YouTube Playlist',
      category: 'Music',
      importSource: 'youtube_playlist',
      channelQuality: row.identity.channelQuality,
      originalTitle: row.identity.originalTitle,
      originalArtist: row.channelTitle,
      externalIds: { youtube: row.videoId },
      sources: { youtube: youtubeWatchUrl(row.videoId) },
      tags: [],
      genres: [],
    });
  }

  report({
    stage: 'fetching',
    message: `Parsed ${tracks.length} track${tracks.length === 1 ? '' : 's'} from playlist`,
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

module.exports = {
  fetchPublicPlaylist,
  parseYouTubePlaylistId,
  MAX_PLAYLIST_ITEMS,
};
