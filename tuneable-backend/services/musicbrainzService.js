const axios = require('axios');
const { normalizeTagForStorage } = require('../utils/tagNormalizer');
const { parseReleaseDate } = require('../utils/releaseDateUtils');

const MUSICBRAINZ_API = 'https://musicbrainz.org/ws/2';
const USER_AGENT = 'TuneableLocal/1.0 ( https://tuneable.stream )';

/** Folksonomy tags to ignore (not useful as genres). */
const NOISE_TAGS = new Set([
  'seen live',
  'favorite',
  'favourites',
  'favorites',
  'beautiful',
  'awesome',
  'love',
  'under 2000 listeners',
  'wish for cd',
]);

function normalizeDuration(ms) {
  if (!Number.isFinite(ms) || ms <= 0) {
    return 0;
  }
  return Math.round(ms / 1000);
}

function getArtistCredit(recording) {
  if (!Array.isArray(recording?.['artist-credit'])) {
    return 'Unknown Artist';
  }

  const parts = recording['artist-credit']
    .map((entry) => {
      if (typeof entry === 'string') return entry;
      return entry?.name || entry?.artist?.name || '';
    })
    .filter(Boolean);

  return parts.join('') || 'Unknown Artist';
}

function buildReleaseLabel(recording, release = null) {
  const picked = release || pickRelease(recording)?.release;
  if (!picked) return null;

  if (picked.title && picked.date) {
    return `${picked.title} (${picked.date.slice(0, 4)})`;
  }

  return picked.title || null;
}

/**
 * Prefer MusicBrainz first-release-date, else earliest dated release (not a random reissue).
 * @returns {{ release: object|null, dateRaw: string|null }}
 */
function pickRelease(recording) {
  const firstReleaseDate = recording?.['first-release-date'] || null;
  const releases = Array.isArray(recording?.releases) ? recording.releases : [];

  if (releases.length === 0) {
    return { release: null, dateRaw: firstReleaseDate || null };
  }

  const dated = releases
    .filter((r) => r?.date)
    .map((r) => ({
      release: r,
      parsed: parseReleaseDate(r.date),
      sortKey: String(r.date),
    }))
    .filter((entry) => entry.parsed.releaseYear)
    .sort((a, b) => a.sortKey.localeCompare(b.sortKey));

  const earliest = dated[0] || null;
  const release = earliest?.release || releases[0] || null;

  // Prefer official first-release-date when present; fall back to earliest release date
  const dateRaw = firstReleaseDate || earliest?.release?.date || release?.date || null;
  return { release, dateRaw };
}

/**
 * Map MB folksonomy tags → normalized Tuneable tag strings.
 * @param {Array<{name?: string, count?: number}>} mbTags
 * @param {{ minCount?: number, limit?: number }} opts
 */
function mapMusicBrainzTags(mbTags, { minCount = 1, limit = 8 } = {}) {
  if (!Array.isArray(mbTags)) return [];

  const ranked = mbTags
    .filter((t) => t && typeof t.name === 'string' && t.name.trim())
    .map((t) => ({
      name: t.name.trim(),
      count: Number(t.count) || 0,
    }))
    .filter((t) => t.count >= minCount)
    .filter((t) => !NOISE_TAGS.has(t.name.toLowerCase()))
    .filter((t) => !/^\d{4}$/.test(t.name)) // bare years
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  const seen = new Set();
  const out = [];
  for (const tag of ranked) {
    const normalized = normalizeTagForStorage(tag.name);
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(normalized);
    if (out.length >= limit) break;
  }
  return out;
}

function mapRecordingToTrack(recording) {
  const { release, dateRaw } = pickRelease(recording);
  const parsed = parseReleaseDate(dateRaw);
  const isrcs = Array.isArray(recording.isrcs)
    ? recording.isrcs.filter((c) => typeof c === 'string' && c.trim())
    : [];
  const tags = mapMusicBrainzTags(recording.tags);

  return {
    id: recording.id,
    title: recording.title || 'Unknown Title',
    artist: getArtistCredit(recording),
    duration: normalizeDuration(recording.length),
    coverArt: null,
    category: 'Music',
    album: release?.title || buildReleaseLabel(recording, release),
    releaseDate: parsed.releaseDate
      ? parsed.releaseDate.toISOString().slice(0, 10)
      : (parsed.precision === 'year' && parsed.releaseYear ? String(parsed.releaseYear) : dateRaw),
    releaseYear: parsed.releaseYear,
    releaseDatePrecision: parsed.precision,
    isrc: isrcs[0] || null,
    isrcs,
    tags,
    genres: tags.slice(0, 5),
    externalIds: {
      musicbrainz: recording.id,
      ...(release?.id ? { musicbrainzRelease: release.id } : {}),
      ...(isrcs[0] ? { isrc: isrcs[0] } : {}),
    },
    sources: {},
    isLocal: false,
    isPlayable: false,
    supportMode: 'tip',
    awaitingUpload: true,
    sourceLabel: 'MusicBrainz',
  };
}

async function searchRecordings(query, offset = 0, limit = 20) {
  const trimmedQuery = String(query || '').trim();
  if (!trimmedQuery) {
    return { nextOffset: null, tracks: [] };
  }

  const cappedLimit = Math.max(1, Math.min(limit, 100));
  const response = await axios.get(`${MUSICBRAINZ_API}/recording`, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'application/json',
    },
    params: {
      query: trimmedQuery,
      dismax: true,
      fmt: 'json',
      limit: cappedLimit,
      offset: Math.max(0, Number(offset) || 0),
    },
    timeout: 15000,
  });

  const recordings = Array.isArray(response.data?.recordings)
    ? response.data.recordings
    : [];

  const tracks = recordings.map((recording) => {
    const { release, dateRaw } = pickRelease(recording);
    const parsed = parseReleaseDate(dateRaw);

    return {
      id: recording.id,
      title: recording.title || 'Unknown Title',
      artist: getArtistCredit(recording),
      duration: normalizeDuration(recording.length),
      coverArt: null,
      category: 'Music',
      album: buildReleaseLabel(recording, release),
      releaseDate: parsed.releaseDate
        ? parsed.releaseDate.toISOString().slice(0, 10)
        : (parsed.precision === 'year' && parsed.releaseYear ? String(parsed.releaseYear) : dateRaw),
      releaseYear: parsed.releaseYear,
      releaseDatePrecision: parsed.precision,
      isrc: null,
      isrcs: [],
      tags: [],
      genres: [],
      externalIds: {
        musicbrainz: recording.id,
        ...(release?.id ? { musicbrainzRelease: release.id } : {}),
      },
      sources: {},
      isLocal: false,
      isPlayable: false,
      supportMode: 'tip',
      awaitingUpload: true,
      sourceLabel: 'MusicBrainz',
    };
  });

  const count = Number(response.data?.count) || 0;
  const nextOffset = offset + tracks.length < count ? offset + tracks.length : null;

  return {
    nextOffset,
    tracks,
  };
}

/**
 * Lookup a recording by MBID with tags, ISRCs, and release data.
 */
async function getRecording(mbid) {
  const id = String(mbid || '').trim();
  if (!id) return null;

  const response = await axios.get(`${MUSICBRAINZ_API}/recording/${encodeURIComponent(id)}`, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'application/json',
    },
    params: {
      fmt: 'json',
      inc: 'tags+isrcs+releases+artist-credits',
    },
    timeout: 15000,
  });

  if (!response.data?.id) return null;
  return mapRecordingToTrack(response.data);
}

/**
 * Lookup recordings by ISRC.
 */
async function searchByIsrc(isrc, limit = 5) {
  const code = String(isrc || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  if (code.length < 12) return [];

  const response = await axios.get(`${MUSICBRAINZ_API}/recording`, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'application/json',
    },
    params: {
      query: `isrc:${code}`,
      fmt: 'json',
      limit: Math.max(1, Math.min(limit, 25)),
    },
    timeout: 15000,
  });

  const recordings = Array.isArray(response.data?.recordings)
    ? response.data.recordings
    : [];

  return recordings.map(mapRecordingToTrack);
}

module.exports = {
  searchRecordings,
  getRecording,
  searchByIsrc,
  mapMusicBrainzTags,
};
