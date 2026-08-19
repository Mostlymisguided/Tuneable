const {
  parseTitleArtistFromString,
} = require('./mediaMatchUtils');

const PLAYLIST_ID_RE = /^[A-Za-z0-9_-]{10,}$/;
const LIST_QUERY_RE = /[?&]list=([A-Za-z0-9_-]+)/;

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

module.exports = {
  parseIso8601Duration,
  parseYouTubePlaylistId,
  stripVideoDecorations,
  classifyYouTubeChannel,
  parseYouTubeTrackIdentity,
};
