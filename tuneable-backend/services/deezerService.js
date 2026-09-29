/**
 * Deezer public-API library import (no OAuth — Deezer closed new app registration).
 * Reads public playlists and public profile favourites from api.deezer.com.
 */

const axios = require('axios');
const { normalizeIsrc } = require('../utils/mediaMatchUtils');

const DEEZER_API = 'https://api.deezer.com';
const PAGE_SIZE = 100;
const MAX_ITEMS = 200;
// Deezer quota is ~50 requests / 5s per IP
const REQUEST_GAP_MS = 110;
const QUOTA_RETRY_MS = 5500;
const SHORT_LINK_HOSTS = new Set(['link.deezer.com', 'deezer.page.link', 'dzr.page.link']);

let lastRequestAt = 0;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function throttle() {
  const wait = Math.max(0, REQUEST_GAP_MS - (Date.now() - lastRequestAt));
  if (wait > 0) await sleep(wait);
  lastRequestAt = Date.now();
}

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

/**
 * Parse a Deezer playlist / profile URL (or bare playlist id).
 * @returns {{ kind: 'playlist'|'user', id: string } | null}
 */
function parseDeezerUrl(input) {
  const raw = String(input || '').trim();
  if (!raw) return null;
  if (/^\d+$/.test(raw)) return { kind: 'playlist', id: raw };

  const m = raw.match(/deezer\.com\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?(playlist|profile|user)\/(\d+)/i);
  if (!m) return null;
  return { kind: m[1].toLowerCase() === 'playlist' ? 'playlist' : 'user', id: m[2] };
}

function isShortLink(input) {
  try {
    return SHORT_LINK_HOSTS.has(new URL(String(input).trim()).hostname.toLowerCase());
  } catch {
    return false;
  }
}

async function resolveShortLink(url) {
  const response = await axios.get(String(url).trim(), {
    maxRedirects: 5,
    timeout: 10000,
    responseType: 'text',
    validateStatus: () => true,
    beforeRedirect: (options) => {
      const host = String(options.hostname || '').toLowerCase();
      if (!host.endsWith('deezer.com') && !SHORT_LINK_HOSTS.has(host)) {
        throw new Error('Deezer short link redirected off Deezer');
      }
    },
  });
  const finalUrl = response.request?.res?.responseUrl || '';
  const fromUrl = parseDeezerUrl(finalUrl);
  if (fromUrl) return fromUrl;
  const body = typeof response.data === 'string' ? response.data : '';
  const inBody = body.match(/deezer\.com\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?(?:playlist|profile|user)\/\d+/i);
  return inBody ? parseDeezerUrl(inBody[0]) : null;
}

async function resolveDeezerTarget(input) {
  const direct = parseDeezerUrl(input);
  if (direct) return direct;
  if (isShortLink(input)) {
    const resolved = await resolveShortLink(input).catch(() => null);
    if (resolved) return resolved;
    throw badRequest('That Deezer share link did not lead to a playlist or profile.');
  }
  throw badRequest('Paste a Deezer playlist or profile URL (e.g. https://www.deezer.com/playlist/123).');
}

async function deezerGet(path, params = {}, { retried = false } = {}) {
  await throttle();
  const response = await axios.get(`${DEEZER_API}${path}`, { params, timeout: 15000 });
  const error = response.data?.error;
  if (!error) return response.data;

  if (error.code === 4 && !retried) {
    await sleep(QUOTA_RETRY_MS);
    return deezerGet(path, params, { retried: true });
  }
  const err = new Error(error.message || 'Deezer API error');
  err.status = error.code === 800 ? 404 : 502;
  err.deezerCode = error.code;
  throw err;
}

async function fetchPaged(path, cap, report, label) {
  const rows = [];
  let index = 0;
  while (rows.length < cap) {
    const page = await deezerGet(path, { index, limit: Math.min(PAGE_SIZE, cap - rows.length) });
    const data = Array.isArray(page?.data) ? page.data : [];
    rows.push(...data);
    index += data.length;
    report({
      stage: 'fetching',
      message: `Fetched ${Math.min(rows.length, cap)} ${label}…`,
      current: Math.min(rows.length, cap),
      total: cap,
    });
    if (!page?.next || data.length === 0) break;
  }
  return rows.slice(0, cap);
}

function releaseFields(releaseDate) {
  const m = String(releaseDate || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m || m[1] === '0000') return {};
  return {
    releaseDate: `${m[1]}-${m[2]}-${m[3]}`,
    releaseYear: Number(m[1]),
    releaseDatePrecision: 'day',
  };
}

function convertDeezerTrack(row, { importSource, sourceLabel }) {
  const id = String(row.id);
  const isrc = normalizeIsrc(row.isrc);
  const externalIds = { deezer: id };
  if (isrc) externalIds.isrc = isrc;
  return {
    id,
    title: row.title,
    artist: row.artist?.name || '',
    coverArt: row.album?.cover_xl || row.album?.cover_big || row.album?.cover_medium || null,
    duration: Number(row.duration) || 0,
    album: row.album?.title || null,
    ...releaseFields(row.release_date),
    bpm: Number(row.bpm) > 0 ? Number(row.bpm) : null,
    sourceLabel,
    category: 'Music',
    importSource,
    externalIds,
    sources: { deezer: row.link || `https://www.deezer.com/track/${id}` },
    tags: [],
    genres: [],
  };
}

/** Profile favourites omit ISRC; fill it (plus release date / BPM) from /track/{id}. */
async function hydrateMissingIsrc(rows, report) {
  const missing = rows.filter((r) => !r.isrc);
  let done = 0;
  for (const row of missing) {
    try {
      const full = await deezerGet(`/track/${row.id}`);
      row.isrc = full.isrc || null;
      row.release_date = full.release_date || row.release_date;
      row.bpm = full.bpm || row.bpm;
    } catch (err) {
      console.warn(`Deezer track ${row.id} hydrate failed:`, err.message);
    }
    done += 1;
    if (done === missing.length || done % 10 === 0) {
      report({
        stage: 'fetching',
        message: `Looking up ISRCs (${done}/${missing.length})…`,
        current: done,
        total: missing.length,
      });
    }
  }
}

/**
 * Fetch a public Deezer playlist or profile favourites as Tuneable import tracks.
 */
async function fetchPublicTracks(urlOrId, { limit = 50, onProgress } = {}) {
  const report = typeof onProgress === 'function' ? onProgress : () => {};
  const cap = Math.min(Math.max(parseInt(limit, 10) || 50, 1), MAX_ITEMS);
  const target = await resolveDeezerTarget(urlOrId);
  const isPlaylist = target.kind === 'playlist';
  const importSource = isPlaylist ? 'deezer_playlist' : 'deezer_likes';
  const sourceLabel = isPlaylist ? 'Deezer Playlist' : 'Deezer Favourites';

  report({
    stage: 'fetching',
    message: isPlaylist ? 'Fetching Deezer playlist…' : 'Fetching Deezer favourites…',
    current: 0,
    total: cap,
  });

  let title = null;
  let rows;
  try {
    if (isPlaylist) {
      const playlist = await deezerGet(`/playlist/${target.id}`);
      title = playlist.title || null;
      rows = await fetchPaged(`/playlist/${target.id}/tracks`, cap, report, 'tracks');
    } else {
      const profile = await deezerGet(`/user/${target.id}`);
      title = profile.name ? `${profile.name}'s favourites` : null;
      rows = await fetchPaged(`/user/${target.id}/tracks`, cap, report, 'favourites');
    }
  } catch (error) {
    if (error.status === 404) {
      throw badRequest(isPlaylist
        ? 'Deezer playlist is private, deleted, or not found. Make it public and try again.'
        : 'Deezer profile not found, or its favourites are private.');
    }
    throw error;
  }

  const trackRows = rows.filter((r) => r && r.id && r.title && r.artist?.name && (!r.type || r.type === 'track'));
  if (trackRows.length === 0) {
    throw badRequest(isPlaylist
      ? 'No tracks found in that Deezer playlist.'
      : 'No public favourites found. In Deezer, make your profile and favourite tracks public, then try again.');
  }

  await hydrateMissingIsrc(trackRows, report);
  const tracks = trackRows.map((row) => convertDeezerTrack(row, { importSource, sourceLabel }));

  report({
    stage: 'fetching',
    message: `Fetched ${tracks.length} Deezer track${tracks.length === 1 ? '' : 's'}`,
    current: tracks.length,
    total: tracks.length,
  });

  return {
    kind: target.kind,
    deezerId: target.id,
    title,
    importSource,
    scanned: rows.length,
    tracks,
  };
}

module.exports = {
  fetchPublicTracks,
  parseDeezerUrl,
  resolveDeezerTarget,
  convertDeezerTrack,
  MAX_ITEMS,
};
