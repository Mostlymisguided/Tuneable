/**
 * Keyless YouTube reads (no Data API quota). Scrapes the public playlist / watch pages
 * for their embedded JSON, pages playlists via the web client's continuation endpoint,
 * and falls back to oEmbed for single videos when the watch page is blocked.
 *
 * YouTube changes this markup without notice — parsers below accept both the current
 * lockupViewModel shape and the older playlistVideoRenderer shape.
 */

const axios = require('axios');
const he = require('he');

const YOUTUBE_ORIGIN = 'https://www.youtube.com';
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
// Skips the EU cookie-consent interstitial, which has no ytInitialData
const CONSENT_COOKIE = 'CONSENT=YES+cb; SOCS=CAI';
const REQUEST_GAP_MS = 250;
const REQUEST_TIMEOUT_MS = 15000;
const FALLBACK_CLIENT_VERSION = '2.20250101.00.00';
const UNAVAILABLE_TITLES = new Set(['[private video]', '[deleted video]', 'private video', 'deleted video']);

let lastRequestAt = 0;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function throttle() {
  const wait = Math.max(0, REQUEST_GAP_MS - (Date.now() - lastRequestAt));
  if (wait > 0) await sleep(wait);
  lastRequestAt = Date.now();
}

function httpError(message, status) {
  const err = new Error(message);
  err.status = status;
  return err;
}

const pageHeaders = {
  'User-Agent': USER_AGENT,
  'Accept-Language': 'en-US,en;q=0.9',
  Cookie: CONSENT_COOKIE,
};

async function getPage(path, params) {
  await throttle();
  const response = await axios.get(`${YOUTUBE_ORIGIN}${path}`, {
    params: { ...params, hl: 'en', gl: 'US' },
    headers: pageHeaders,
    timeout: REQUEST_TIMEOUT_MS,
    responseType: 'text',
    validateStatus: () => true,
  });
  if (response.status === 429) throw httpError('YouTube is rate-limiting requests. Try again in a minute.', 503);
  if (response.status >= 500) throw httpError('YouTube is unavailable right now. Try again shortly.', 502);
  return typeof response.data === 'string' ? response.data : '';
}

/**
 * Read the JSON object literal that follows `marker` (e.g. `var ytInitialData`).
 * Brace-matched rather than regex'd because the payload contains `};` inside strings.
 */
function extractJsonObject(html, marker) {
  const at = html.indexOf(marker);
  if (at < 0) return null;
  const start = html.indexOf('{', at);
  if (start < 0) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < html.length; i += 1) {
    const c = html[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === '{') depth += 1;
    else if (c === '}') {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(html.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function blockedError() {
  return httpError('YouTube blocked the request (consent or bot check). Try again later.', 502);
}

function textOf(node) {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (typeof node.content === 'string') return node.content;
  if (typeof node.simpleText === 'string') return node.simpleText;
  if (Array.isArray(node.runs)) return node.runs.map((r) => r.text || '').join('');
  return '';
}

function parseClockDuration(text) {
  const m = String(text || '').trim().match(/^(?:(\d+):)?(\d{1,2}):(\d{2})$/);
  if (!m) return 0;
  return (parseInt(m[1] || '0', 10) * 3600) + (parseInt(m[2], 10) * 60) + parseInt(m[3], 10);
}

function findDurationBadge(node) {
  if (!node || typeof node !== 'object') return 0;
  if (node.thumbnailBadgeViewModel) {
    const seconds = parseClockDuration(node.thumbnailBadgeViewModel.text);
    if (seconds) return seconds;
  }
  for (const value of Object.values(node)) {
    const seconds = findDurationBadge(value);
    if (seconds) return seconds;
  }
  return 0;
}

function thumbnailUrl(videoId) {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

function rowFromLockup(lockup) {
  if (lockup?.contentType !== 'LOCKUP_CONTENT_TYPE_VIDEO' || !lockup.contentId) return null;
  const meta = lockup.metadata?.lockupMetadataViewModel;
  const rows = meta?.metadata?.contentMetadataViewModel?.metadataRows || [];
  return {
    videoId: lockup.contentId,
    title: textOf(meta?.title),
    channelTitle: textOf(rows[0]?.metadataParts?.[0]?.text),
    duration: findDurationBadge(lockup.contentImage),
  };
}

function rowFromPlaylistVideoRenderer(renderer) {
  if (!renderer?.videoId) return null;
  return {
    videoId: renderer.videoId,
    title: textOf(renderer.title),
    channelTitle: textOf(renderer.shortBylineText),
    duration: parseInt(renderer.lengthSeconds, 10) || parseClockDuration(textOf(renderer.lengthText)),
    unplayable: renderer.isPlayable === false,
  };
}

// Recommendation shelves YouTube mixes into playlist pages; their videos are not playlist items
const SHELF_KEYS = new Set([
  'horizontalShelfViewModel',
  'shelfRenderer',
  'richShelfRenderer',
  'reelShelfRenderer',
  'horizontalCardListRenderer',
]);

function continuationToken(node) {
  const cont = node?.continuationItemViewModel?.continuationCommand?.innertubeCommand?.continuationCommand
    || node?.continuationItemRenderer?.continuationEndpoint?.continuationCommand;
  return cont?.token || null;
}

function rowFromItem(node) {
  if (node?.lockupViewModel) return rowFromLockup(node.lockupViewModel);
  if (node?.playlistVideoRenderer) return rowFromPlaylistVideoRenderer(node.playlistVideoRenderer);
  return null;
}

/**
 * Walk a playlist contents subtree, collecting video rows and the next continuation token.
 * Only a token that sits in the same list as the videos pages the playlist; others page
 * unrelated sections (e.g. recommendations).
 */
function collectPlaylistItems(root) {
  const rows = [];
  let continuation = null;

  (function walk(node) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      const listRows = node.map(rowFromItem).filter(Boolean);
      if (listRows.length > 0) {
        rows.push(...listRows);
        if (!continuation) continuation = node.map(continuationToken).find(Boolean) || null;
        return;
      }
      node.forEach(walk);
      return;
    }
    for (const [key, value] of Object.entries(node)) {
      if (!SHELF_KEYS.has(key)) walk(value);
    }
  })(root);

  return { rows, continuation };
}

function normalizeRow(row) {
  const title = he.decode(String(row.title || '')).trim();
  const unavailable = row.unplayable || !title || UNAVAILABLE_TITLES.has(title.toLowerCase());
  return {
    videoId: row.videoId,
    title,
    channelTitle: he.decode(String(row.channelTitle || '')).trim(),
    coverArt: thumbnailUrl(row.videoId),
    duration: row.duration || 0,
    available: !unavailable,
  };
}

function innertubeConfig(html) {
  return {
    apiKey: html.match(/"INNERTUBE_API_KEY":"([^"]+)"/)?.[1] || null,
    clientVersion: html.match(/"INNERTUBE_CLIENT_VERSION":"([^"]+)"/)?.[1] || FALLBACK_CLIENT_VERSION,
  };
}

async function fetchContinuation(token, { apiKey, clientVersion }) {
  await throttle();
  const response = await axios.post(
    `${YOUTUBE_ORIGIN}/youtubei/v1/browse`,
    {
      context: { client: { clientName: 'WEB', clientVersion, hl: 'en', gl: 'US' } },
      continuation: token,
    },
    {
      params: { prettyPrint: false, ...(apiKey ? { key: apiKey } : {}) },
      headers: { 'User-Agent': USER_AGENT, 'Content-Type': 'application/json', Cookie: CONSENT_COOKIE },
      timeout: REQUEST_TIMEOUT_MS,
    }
  );
  const actions = response.data?.onResponseReceivedActions || [];
  const items = actions.flatMap((a) => a.appendContinuationItemsAction?.continuationItems || []);
  return collectPlaylistItems(items);
}

/**
 * Fetch up to `limit` videos from a public / unlisted playlist.
 * @returns {Promise<{ playlistId: string, title: string|null, rows: object[] }>}
 */
async function fetchPlaylist(playlistId, { limit = 50, onPage } = {}) {
  const html = await getPage('/playlist', { list: playlistId });
  const data = extractJsonObject(html, 'var ytInitialData');
  if (!data) throw blockedError();

  if (!data.contents) {
    const alert = (data.alerts || []).map((a) => textOf(a.alertRenderer?.text)).find(Boolean);
    throw httpError(
      alert && !/does not exist/i.test(alert)
        ? `YouTube: ${alert}`
        : 'Playlist is private, deleted, or not found. Paste a public playlist URL.',
      400
    );
  }

  const title = data.metadata?.playlistMetadataRenderer?.title
    || data.microformat?.microformatDataRenderer?.title
    || null;
  const config = innertubeConfig(html);

  let { rows, continuation } = collectPlaylistItems(data.contents);
  if (typeof onPage === 'function') onPage(Math.min(rows.length, limit));

  while (continuation && rows.length < limit) {
    let page;
    try {
      page = await fetchContinuation(continuation, config);
    } catch (error) {
      // Keep what we have rather than failing the whole scan on a later page
      console.warn(`[youtubePublic] continuation failed for ${playlistId}:`, error.message);
      break;
    }
    if (page.rows.length === 0) break;
    rows = rows.concat(page.rows);
    continuation = page.continuation;
    if (typeof onPage === 'function') onPage(Math.min(rows.length, limit));
  }

  return {
    playlistId,
    title: title ? he.decode(title) : null,
    rows: rows.slice(0, limit).map(normalizeRow),
  };
}

async function fetchVideoViaOembed(videoId) {
  await throttle();
  const response = await axios.get(`${YOUTUBE_ORIGIN}/oembed`, {
    params: { format: 'json', url: `${YOUTUBE_ORIGIN}/watch?v=${videoId}` },
    timeout: REQUEST_TIMEOUT_MS,
    validateStatus: () => true,
  });
  if (response.status === 400 || response.status === 404 || response.status === 403) {
    throw httpError('That YouTube video is private, deleted, or not found.', 400);
  }
  if (response.status !== 200 || !response.data?.title) throw blockedError();
  return normalizeRow({
    videoId,
    title: response.data.title,
    channelTitle: response.data.author_name,
    duration: 0,
  });
}

/**
 * Fetch title / channel / duration for a single public video.
 */
async function fetchVideo(videoId) {
  const html = await getPage('/watch', { v: videoId });
  const player = extractJsonObject(html, 'var ytInitialPlayerResponse');
  const details = player?.videoDetails;

  if (!details) {
    if (player?.playabilityStatus?.status === 'ERROR') {
      throw httpError('That YouTube video is private, deleted, or not found.', 400);
    }
    return fetchVideoViaOembed(videoId);
  }
  if (details.isPrivate) {
    throw httpError('That YouTube video is private. Paste a public video URL.', 400);
  }

  return normalizeRow({
    videoId: details.videoId || videoId,
    title: details.title,
    channelTitle: details.author,
    duration: parseInt(details.lengthSeconds, 10) || 0,
  });
}

module.exports = {
  fetchPlaylist,
  fetchVideo,
  extractJsonObject,
  collectPlaylistItems,
  normalizeRow,
  parseClockDuration,
};
