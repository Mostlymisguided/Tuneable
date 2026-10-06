const youtubePublicService = require('./youtubePublicService');
const {
  parseYouTubePlaylistId,
  parseYouTubeImportTarget,
  parseYouTubeTrackIdentity,
  youtubeWatchUrl,
} = require('../utils/youtubePlaylistUtils');

const MAX_PLAYLIST_ITEMS = 200;
const LIKED_PLAYLIST_ID = 'LL';

/**
 * Turn normalized video rows ({ videoId, title, channelTitle, coverArt, duration, available })
 * into import tracks, or skip rows with a reason.
 */
function convertVideoRows(rows, { importSource, sourceLabel }) {
  const tracks = [];
  const skipped = [];

  for (const row of rows) {
    if (!row?.videoId || !row.title) continue;
    const base = {
      videoId: row.videoId,
      title: row.title,
      channelTitle: row.channelTitle,
      coverArt: row.coverArt,
    };
    if (row.available === false) {
      skipped.push({ ...base, reason: 'unavailable' });
      continue;
    }

    const identity = parseYouTubeTrackIdentity({ title: row.title, channelTitle: row.channelTitle });
    if (identity.status === 'junk') {
      skipped.push({ ...base, reason: identity.reason || 'junk_channel', duration: row.duration || 0 });
      continue;
    }
    if (identity.status !== 'parsed') {
      skipped.push({
        ...base,
        reason: identity.reason || 'unparsed',
        duration: row.duration || 0,
        channelQuality: identity.channelQuality,
      });
      continue;
    }

    tracks.push({
      id: row.videoId,
      title: identity.title,
      artist: identity.artist,
      coverArt: row.coverArt,
      duration: row.duration || 0,
      album: null,
      sourceLabel,
      category: 'Music',
      importSource,
      channelQuality: identity.channelQuality,
      originalTitle: identity.originalTitle,
      originalArtist: row.channelTitle,
      externalIds: { youtube: row.videoId },
      sources: { youtube: youtubeWatchUrl(row.videoId) },
      tags: [],
      genres: [],
    });
  }

  return { tracks, skipped };
}

async function fetchPlaylistTracks(playlistId, { limit, report }) {
  report({ stage: 'fetching', message: 'Fetching YouTube playlist…', current: 0, total: limit });

  const playlist = await youtubePublicService.fetchPlaylist(playlistId, {
    limit,
    onPage: (count) => report({
      stage: 'fetching',
      message: `Fetched ${count} item${count === 1 ? '' : 's'}…`,
      current: count,
      total: limit,
    }),
  });
  if (playlist.rows.length === 0) {
    const err = new Error('That YouTube playlist is empty.');
    err.status = 400;
    throw err;
  }

  const importSource = 'youtube_playlist';
  const sourceLabel = 'YouTube Playlist';
  const { tracks, skipped } = convertVideoRows(playlist.rows, { importSource, sourceLabel });
  return {
    kind: 'playlist',
    playlistId,
    videoId: null,
    playlistTitle: playlist.title,
    importSource,
    sourceLabel,
    scanned: playlist.rows.length,
    tracks,
    skipped,
  };
}

async function fetchVideoTrack(videoId, { report }) {
  report({ stage: 'fetching', message: 'Fetching YouTube video…', current: 0, total: 1 });
  const row = await youtubePublicService.fetchVideo(videoId);

  const importSource = 'youtube_video';
  const sourceLabel = 'YouTube';
  const { tracks, skipped } = convertVideoRows([row], { importSource, sourceLabel });
  return {
    kind: 'video',
    playlistId: null,
    videoId,
    playlistTitle: row.title,
    importSource,
    sourceLabel,
    scanned: 1,
    tracks,
    skipped,
  };
}

/**
 * Fetch a public YouTube playlist or single video (no Data API key) as import tracks.
 */
async function fetchPublicTracks(urlOrId, { limit = 50, onProgress } = {}) {
  const report = typeof onProgress === 'function' ? onProgress : () => {};
  const capped = Math.min(Math.max(parseInt(limit, 10) || 50, 1), MAX_PLAYLIST_ITEMS);
  const target = parseYouTubeImportTarget(urlOrId);

  const fetched = target.kind === 'video'
    ? await fetchVideoTrack(target.id, { report })
    : await fetchPlaylistTracks(target.id, { limit: capped, report });

  report({
    stage: 'fetching',
    message: `Parsed ${fetched.tracks.length} track${fetched.tracks.length === 1 ? '' : 's'}`,
    current: fetched.tracks.length,
    total: fetched.tracks.length,
  });
  return fetched;
}

const YOUTUBE_LIKES_IMPORT_DISABLED_MESSAGE =
  'YouTube liked-videos import is paused until Google verifies the Tuneable app. Paste a public playlist URL instead.';

function youtubeLikesImportDisabledError() {
  const err = new Error(YOUTUBE_LIKES_IMPORT_DISABLED_MESSAGE);
  err.status = 410;
  err.code = 'YOUTUBE_LIKES_IMPORT_DISABLED';
  return err;
}

/**
 * Fetch the authenticated user's liked videos (private LL playlist) via OAuth.
 * Paused: Google shows an unverified-app warning for youtube.readonly.
 */
async function fetchLikedVideos() {
  throw youtubeLikesImportDisabledError();
}

module.exports = {
  fetchPublicTracks,
  fetchLikedVideos,
  parseYouTubePlaylistId,
  convertVideoRows,
  MAX_PLAYLIST_ITEMS,
  LIKED_PLAYLIST_ID,
  YOUTUBE_LIKES_IMPORT_DISABLED_MESSAGE,
  youtubeLikesImportDisabledError,
};
