const {
  parseTitleArtistFromString,
} = require('./mediaMatchUtils');

const PLAYLIST_ID_RE = /^[A-Za-z0-9_-]{10,}$/;
const LIST_QUERY_RE = /[?&]list=([A-Za-z0-9_-]+)/;
const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;
const VIDEO_PATH_RE = /^\/(?:shorts|embed|live|v|e)\/([A-Za-z0-9_-]{11})(?:[/?#]|$)/;
const YOUTUBE_HOST_RE = /(?:^|\.)(?:youtube\.com|youtube-nocookie\.com|youtu\.be)$/i;
// Auto-generated mixes (RD…) and account-private lists (LL liked, WL watch later) can't be read publicly
const UNREADABLE_LIST_RE = /^(?:RD|LL$|WL$|LM$)/;

const JUNK_CHANNEL_RE = /lyric\s*video|lyrics?(?:\s*video|\s*channel)?|nightcore|sped\s*up|slowed(?:\s*\+\s*reverb)?|8d\s*audio|karaoke|backing\s*track|piano\s*cover|guitar\s*cover|drum\s*cover|tutorial|reaction|no\s*copyright|ncs(?:\s*release|\s*audio)?|audio\s*library|tiktok(?:\s*version|\s*audio)?|just\s*dance|mashup\s*compilation|copyright\s*free/i;

const TITLE_DECORATION_RE = /\s*[\(\[\{]\s*(?:official\s*(?:music\s*)?video|official\s*audio|official|music\s*video|lyrics?(?:\s*video)?|visualizer|audio\s*only|audio|explicit|clean|hd|4k|hq|full\s*(?:hd|4k))\s*[\)\]\}]/gi;

function parseIso8601Duration(duration) {
  if (!duration || typeof duration !== 'string') return 0;
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  const hours = parseInt(match[1] || '0', 10);
  const minutes = parseInt(match[2] || '0', 10);
  const seconds = parseInt(match[3] || '0', 10);
  return hours * 3600 + minutes * 60 + seconds;
}

function parseYouTubePlaylistId(input) {
  const raw = String(input || '').trim();
  if (!raw) return null;
  if (PLAYLIST_ID_RE.test(raw) && !raw.includes('://') && !raw.includes('?')) {
    return raw;
  }

  try {
    const url = new URL(raw);
    const list = url.searchParams.get('list');
    if (list && PLAYLIST_ID_RE.test(list)) return list;
  } catch {
    // fall through to regex
  }

  const match = raw.match(LIST_QUERY_RE);
  return match && PLAYLIST_ID_RE.test(match[1]) ? match[1] : null;
}

function parseYouTubeUrl(raw) {
  try {
    const url = new URL(/^[a-z]+:\/\//i.test(raw) ? raw : `https://${raw}`);
    return YOUTUBE_HOST_RE.test(url.hostname) ? url : null;
  } catch {
    return null;
  }
}

function parseYouTubeVideoId(input) {
  const raw = String(input || '').trim();
  if (!raw) return null;
  if (VIDEO_ID_RE.test(raw)) return raw;

  const url = parseYouTubeUrl(raw);
  if (!url) return null;
  if (/youtu\.be$/i.test(url.hostname)) {
    const id = url.pathname.slice(1).split('/')[0];
    return VIDEO_ID_RE.test(id) ? id : null;
  }
  const v = url.searchParams.get('v');
  if (v && VIDEO_ID_RE.test(v)) return v;
  return url.pathname.match(VIDEO_PATH_RE)?.[1] || null;
}

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

/**
 * Decide whether a pasted YouTube link is a playlist or a single video.
 * A watch URL that also carries a readable `list=` is treated as the playlist.
 * @returns {{ kind: 'playlist'|'video', id: string }}
 */
function parseYouTubeImportTarget(input) {
  const raw = String(input || '').trim();
  if (!raw) throw badRequest('Paste a YouTube playlist or video URL.');

  const looksLikeUrl = raw.includes('/') || raw.includes('?') || raw.includes('.');
  if (looksLikeUrl && !parseYouTubeUrl(raw)) {
    throw badRequest('That is not a YouTube link. Paste a youtube.com or youtu.be URL.');
  }

  const videoId = parseYouTubeVideoId(raw);
  const playlistId = videoId === raw ? null : parseYouTubePlaylistId(raw);
  const listParam = parseYouTubeUrl(raw)?.searchParams.get('list') || '';

  if (playlistId && !UNREADABLE_LIST_RE.test(playlistId)) return { kind: 'playlist', id: playlistId };
  if (videoId) return { kind: 'video', id: videoId };
  if (playlistId || UNREADABLE_LIST_RE.test(listParam)) {
    throw badRequest('Mixes, Liked videos and Watch later are private to your account. Paste a public playlist or a video URL.');
  }
  throw badRequest('Could not find a playlist or video in that YouTube link.');
}

function stripVideoDecorations(title) {
  let out = String(title || '');
  out = out.replace(TITLE_DECORATION_RE, '');
  out = out.replace(/\s*\|\s*official.*$/i, '');
  out = out.replace(/\s{2,}/g, ' ').trim();
  return out;
}

function classifyYouTubeChannel(channelTitle) {
  const name = String(channelTitle || '').trim();
  if (!name) return { quality: 'unknown', artistHint: null };

  if (JUNK_CHANNEL_RE.test(name)) {
    return { quality: 'junk', artistHint: null };
  }
  if (/\s*-\s*topic$/i.test(name)) {
    return {
      quality: 'topic',
      artistHint: name.replace(/\s*-\s*topic$/i, '').trim() || null,
    };
  }
  if (/vevo$/i.test(name)) {
    return {
      quality: 'vevo',
      artistHint: name.replace(/vevo$/i, '').trim() || null,
    };
  }
  return { quality: 'unknown', artistHint: null };
}

/**
 * Turn a YouTube playlist item into a parsed identity, or a skip reason.
 */
function parseYouTubeTrackIdentity({ title, channelTitle } = {}) {
  const originalTitle = String(title || '').trim();
  const channel = classifyYouTubeChannel(channelTitle);

  if (channel.quality === 'junk') {
    return {
      status: 'junk',
      reason: 'junk_channel',
      originalTitle,
      channelTitle: String(channelTitle || '').trim(),
      channelQuality: channel.quality,
    };
  }

  const cleaned = stripVideoDecorations(originalTitle);
  if (!cleaned) {
    return {
      status: 'unparsed',
      reason: 'empty_title',
      originalTitle,
      channelTitle: String(channelTitle || '').trim(),
      channelQuality: channel.quality,
    };
  }

  const parsed = parseTitleArtistFromString(cleaned);
  let artist = channel.artistHint || null;
  let songTitle = cleaned;

  if (channel.quality === 'topic' && channel.artistHint) {
    artist = channel.artistHint;
    if (parsed) songTitle = parsed.title;
  } else if (parsed) {
    artist = parsed.artist;
    songTitle = parsed.title;
  } else if (channel.artistHint) {
    artist = channel.artistHint;
    songTitle = cleaned;
  }

  songTitle = stripVideoDecorations(songTitle);
  if (!songTitle || !artist) {
    return {
      status: 'unparsed',
      reason: artist ? 'empty_title' : 'no_artist',
      originalTitle,
      channelTitle: String(channelTitle || '').trim(),
      channelQuality: channel.quality,
    };
  }

  return {
    status: 'parsed',
    title: songTitle,
    artist,
    channelQuality: channel.quality,
    originalTitle,
    channelTitle: String(channelTitle || '').trim(),
  };
}

function youtubeWatchUrl(videoId) {
  return videoId ? `https://www.youtube.com/watch?v=${videoId}` : null;
}

/**
 * Promote an unparsed/skipped playlist row so an admin can type artist + title.
 */
function unparsedSkipToImportTrack(skip, {
  importSource = 'youtube_playlist',
  sourceLabel = 'YouTube Playlist',
} = {}) {
  const videoId = skip?.videoId || null;
  const originalTitle = String(skip?.title || '').trim();
  const channelTitle = String(skip?.channelTitle || '').trim();
  const cleaned = stripVideoDecorations(originalTitle) || originalTitle;
  return {
    id: videoId,
    title: cleaned,
    artist: '',
    coverArt: skip?.coverArt || null,
    duration: skip?.duration || 0,
    album: null,
    sourceLabel,
    category: 'Music',
    importSource,
    channelQuality: skip?.channelQuality || 'unknown',
    originalTitle,
    originalArtist: channelTitle,
    parseStatus: 'unparsed',
    needsIdentity: true,
    externalIds: videoId ? { youtube: videoId } : {},
    sources: videoId ? { youtube: youtubeWatchUrl(videoId) } : {},
    tags: [],
    genres: [],
  };
}

module.exports = {
  parseIso8601Duration,
  parseYouTubePlaylistId,
  parseYouTubeVideoId,
  parseYouTubeImportTarget,
  stripVideoDecorations,
  classifyYouTubeChannel,
  parseYouTubeTrackIdentity,
  youtubeWatchUrl,
  unparsedSkipToImportTrack,
};
