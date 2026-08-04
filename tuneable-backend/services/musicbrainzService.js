const axios = require('axios');
const { normalizeTagForStorage } = require('../utils/tagNormalizer');
const { parseReleaseDate } = require('../utils/releaseDateUtils');

const MUSICBRAINZ_API = 'https://musicbrainz.org/ws/2';
const USER_AGENT = 'TuneableLocal/1.0 ( https://tuneable.stream )';

const MB_RETRYABLE = new Set([429, 500, 502, 503, 504]);
const MB_MAX_RETRIES = 4;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * MusicBrainz GET with backoff on 429/5xx (common under the 1 req/s soft limit).
 */
async function mbGet(url, params = {}) {
  let lastError = null;
  for (let attempt = 0; attempt <= MB_MAX_RETRIES; attempt += 1) {
    try {
      return await axios.get(url, {
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'application/json',
        },
        params,
        timeout: 20000,
      });
    } catch (err) {
      lastError = err;
      const status = err.response?.status;
      if (!MB_RETRYABLE.has(status) || attempt === MB_MAX_RETRIES) {
        throw err;
      }
      const backoff = 1000 * (attempt + 1) * (attempt + 1);
      await sleep(backoff);
    }
  }
  throw lastError;
}

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
  const response = await mbGet(`${MUSICBRAINZ_API}/recording`, {
      query: trimmedQuery,
      dismax: true,
      fmt: 'json',
      limit: cappedLimit,
      offset: Math.max(0, Number(offset) || 0),
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
  const raw = await getRecordingRaw(mbid);
  if (!raw) return null;
  return mapRecordingToTrack(raw);
}

/**
 * Raw recording lookup (keeps artist-credit MBIDs).
 */
async function getRecordingRaw(mbid) {
  const id = String(mbid || '').trim();
  if (!id) return null;

  const response = await mbGet(`${MUSICBRAINZ_API}/recording/${encodeURIComponent(id)}`, {
    fmt: 'json',
    inc: 'tags+isrcs+releases+artist-credits',
  });

  if (!response.data?.id) return null;
  return response.data;
}

/**
 * Primary artist MBIDs from a recording's artist-credit list (headline only).
 */
function extractPrimaryArtistMbids(recording) {
  const credits = Array.isArray(recording?.['artist-credit'])
    ? recording['artist-credit']
    : [];
  const ids = [];
  for (const entry of credits) {
    const id = entry?.artist?.id;
    if (id && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

/**
 * Lookup an artist by MBID (area / begin-area / country included by default).
 */
async function getArtist(mbid) {
  const id = String(mbid || '').trim();
  if (!id) return null;

  const response = await mbGet(`${MUSICBRAINZ_API}/artist/${encodeURIComponent(id)}`, {
    fmt: 'json',
  });

  if (!response.data?.id) return null;
  return response.data;
}

/**
 * Search artists by exact-ish name. Returns raw artist summaries (may include area/country).
 */
async function searchArtists(name, limit = 5) {
  const trimmed = String(name || '').trim();
  if (!trimmed) return [];

  const response = await mbGet(`${MUSICBRAINZ_API}/artist`, {
    query: `artist:"${trimmed.replace(/"/g, '')}"`,
    fmt: 'json',
    limit: Math.max(1, Math.min(limit, 25)),
  });

  return Array.isArray(response.data?.artists) ? response.data.artists : [];
}

/**
 * Pick the best origin area from a MusicBrainz artist.
 * Prefer begin-area (formation / birthplace), fall back to main area + country.
 *
 * @returns {{
 *   artistMbid: string,
 *   artistName: string,
 *   city: string|null,
 *   region: string|null,
 *   country: string|null,
 *   countryCode: string|null,
 *   areaName: string|null,
 *   beginAreaName: string|null,
 *   geocodeQuery: string|null,
 * }|null}
 */
function mapArtistOrigin(artist) {
  if (!artist?.id) return null;

  // Browse/lookup returns area objects; search often returns area as a string name.
  const beginArea = typeof artist['begin-area'] === 'object' && artist['begin-area']
    ? artist['begin-area']
    : (typeof artist.begin_area === 'object' && artist.begin_area ? artist.begin_area : null);
  const beginAreaName = beginArea?.name
    || (typeof artist['begin-area'] === 'string' ? artist['begin-area'] : null)
    || (typeof artist.begin_area === 'string' ? artist.begin_area : null);

  let area = null;
  let areaName = null;
  if (typeof artist.area === 'object' && artist.area) {
    area = artist.area;
    areaName = artist.area.name || null;
  } else if (typeof artist.area === 'string' && artist.area.trim()) {
    areaName = artist.area.trim();
  }

  const countryCode = (
    artist.country
    || area?.['iso-3166-1-codes']?.[0]
    || beginArea?.['iso-3166-1-codes']?.[0]
    || null
  );

  const beginType = (beginArea?.type || '').toLowerCase();
  const areaType = (area?.type || '').toLowerCase();

  const CITY_TYPES = new Set(['city', 'municipality', 'town', 'district', 'borough', 'neighborhood', 'locality']);
  const REGION_TYPES = new Set(['subdivision', 'county', 'state', 'province', 'region']);

  const areaLooksLikeCountry = areaType === 'country'
    || !!(area?.['iso-3166-1-codes']?.length);
  const beginLooksLikeCountry = beginType === 'country'
    || !!(beginArea?.['iso-3166-1-codes']?.length);

  let city = null;
  let region = null;
  let country = null;

  if (beginAreaName) {
    if (beginLooksLikeCountry) {
      country = beginAreaName;
    } else if (REGION_TYPES.has(beginType)) {
      region = beginAreaName;
    } else if (CITY_TYPES.has(beginType) || !beginType) {
      // type often null on MB areas — treat as place unless it matches country area
      if (areaLooksLikeCountry && areaName
        && beginAreaName.toLowerCase() === areaName.toLowerCase()) {
        country = beginAreaName;
      } else {
        city = beginAreaName;
      }
    } else {
      city = beginAreaName;
    }
  }

  if (areaName) {
    if (areaLooksLikeCountry) {
      country = country || areaName;
    } else if (REGION_TYPES.has(areaType)) {
      region = region || areaName;
    } else if (CITY_TYPES.has(areaType) && !city) {
      city = areaName;
    } else if (!areaType && !city && !region && !country) {
      // Search hit with string area — treat as place name for geocoding
      city = areaName;
    } else if (!country && !region && !city) {
      city = areaName;
    }
  }

  // Dedupe: begin-area country name mistakenly kept as city
  if (city && country && city.toLowerCase() === country.toLowerCase()) {
    city = null;
  }
  if (city && countryCode && city.toUpperCase() === String(countryCode).toUpperCase()) {
    city = null;
  }

  if (!city && !region && !country && !countryCode) {
    return null;
  }

  const geocodeParts = [
    city,
    region,
    country || (countryCode ? String(countryCode).toUpperCase() : null),
  ].filter(Boolean);

  return {
    artistMbid: artist.id,
    artistName: artist.name || null,
    city: city || null,
    region: region || null,
    country: country || null,
    countryCode: countryCode ? String(countryCode).toUpperCase() : null,
    areaName: areaName || null,
    beginAreaName: beginAreaName || null,
    geocodeQuery: geocodeParts.length > 0 ? geocodeParts.join(', ') : null,
  };
}

/**
 * Resolve origin for the first credited artist on a recording.
 */
async function getOriginFromRecordingMbid(recordingMbid) {
  const recording = await getRecordingRaw(recordingMbid);
  if (!recording) return null;

  const artistMbids = extractPrimaryArtistMbids(recording);
  for (const artistMbid of artistMbids) {
    const artist = await getArtist(artistMbid);
    const origin = mapArtistOrigin(artist);
    if (origin) {
      return {
        ...origin,
        recordingMbid: recording.id,
      };
    }
  }
  return null;
}

/**
 * Lookup recordings by ISRC.
 */
async function searchByIsrc(isrc, limit = 5) {
  const code = String(isrc || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  if (code.length < 12) return [];

  const response = await mbGet(`${MUSICBRAINZ_API}/recording`, {
    query: `isrc:${code}`,
    fmt: 'json',
    limit: Math.max(1, Math.min(limit, 25)),
  });

  const recordings = Array.isArray(response.data?.recordings)
    ? response.data.recordings
    : [];

  return recordings.map(mapRecordingToTrack);
}

/**
 * Raw ISRC search (keeps artist-credit MBIDs on recordings).
 */
async function searchByIsrcRaw(isrc, limit = 5) {
  const code = String(isrc || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  if (code.length < 12) return [];

  const response = await mbGet(`${MUSICBRAINZ_API}/recording`, {
    query: `isrc:${code}`,
    fmt: 'json',
    limit: Math.max(1, Math.min(limit, 25)),
  });

  return Array.isArray(response.data?.recordings) ? response.data.recordings : [];
}

module.exports = {
  searchRecordings,
  getRecording,
  getRecordingRaw,
  getArtist,
  searchArtists,
  searchByIsrc,
  searchByIsrcRaw,
  extractPrimaryArtistMbids,
  mapArtistOrigin,
  getOriginFromRecordingMbid,
  mapMusicBrainzTags,
};
