const fs = require('fs');
const path = require('path');
const xml2js = require('xml2js');

function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function decodeXmlEntities(str) {
  if (!str) return '';
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Decode Rekordbox Location URI to local filesystem path.
 */
function decodeRekordboxLocation(location) {
  if (!location || typeof location !== 'string') return null;
  let decoded = decodeURIComponent(location.trim());
  decoded = decoded.replace(/^file:\/\/localhost/i, '');
  if (/^\/[A-Za-z]:/.test(decoded)) {
    decoded = decoded.slice(1);
  }
  return path.normalize(decoded);
}

function decodeItunesLocation(location) {
  if (!location || typeof location !== 'string') return null;
  let decoded = decodeURIComponent(location.trim());
  decoded = decoded.replace(/^file:\/\//i, '');
  if (/^localhost\//i.test(decoded)) {
    decoded = decoded.replace(/^localhost\//i, '/');
  }
  if (/^\/[A-Za-z]:/.test(decoded)) {
    decoded = decoded.slice(1);
  }
  return path.normalize(decoded);
}

function basenameKey(filePath) {
  if (!filePath) return null;
  return path.basename(filePath).toLowerCase();
}

function normalizeText(str) {
  return (str || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Parse Rekordbox DJ_PLAYLISTS XML into a normalized track list.
 */
async function parseRekordboxXmlContent(xmlContent) {
  const parser = new xml2js.Parser({ explicitArray: false, mergeAttrs: true });
  const doc = await parser.parseStringPromise(xmlContent);
  const root = doc.DJ_PLAYLISTS;
  if (!root) {
    throw new Error('Not a Rekordbox DJ_PLAYLISTS XML file');
  }

  return asArray(root.COLLECTION?.TRACK).map((track) => {
    const filePath = decodeRekordboxLocation(track.Location);
    return {
      source: 'rekordbox',
      trackId: String(track.TrackID || ''),
      name: track.Name || '',
      title: track.Name || '',
      artist: track.Artist || '',
      album: track.Album || '',
      genre: track.Genre || '',
      bpm: track.AverageBpm ? parseFloat(track.AverageBpm) : null,
      key: track.Tonality || track.Key || null,
      rating: track.Rating ? parseInt(track.Rating, 10) : 0,
      playCount: track.PlayCount ? parseInt(track.PlayCount, 10) : 0,
      comments: track.Comments || '',
      label: track.Label || '',
      mix: track.Mix || '',
      duration: track.TotalTime ? parseInt(track.TotalTime, 10) : null,
      totalTime: track.TotalTime ? parseInt(track.TotalTime, 10) : null,
      year: track.Year ? parseInt(track.Year, 10) : null,
      bitrate: track.BitRate ? parseInt(track.BitRate, 10) : null,
      sampleRate: track.SampleRate ? parseInt(track.SampleRate, 10) : null,
      dateAdded: track.DateAdded || null,
      filePath,
      basename: basenameKey(filePath),
      fileExists: filePath ? fs.existsSync(filePath) : false,
    };
  });
}

function extractPlistString(dictXml, keyName) {
  const re = new RegExp(
    `<key>${escapeRegex(keyName)}</key>\\s*<string>([\\s\\S]*?)</string>`,
    'i'
  );
  const match = dictXml.match(re);
  return match ? decodeXmlEntities(match[1]) : null;
}

function extractPlistNumber(dictXml, keyName) {
  const re = new RegExp(
    `<key>${escapeRegex(keyName)}</key>\\s*<(integer|real)>([\\s\\S]*?)</(integer|real)>`,
    'i'
  );
  const match = dictXml.match(re);
  if (!match) return null;
  const num = parseFloat(match[2]);
  return Number.isFinite(num) ? num : null;
}

/**
 * Parse iTunes Library.xml (plist) Tracks section.
 * iTunes has BPM but no musical key field.
 */
function parseItunesLibraryXmlContent(xmlContent) {
  if (!xmlContent.includes('<key>Tracks</key>')) {
    throw new Error('Not an iTunes Library.xml file (missing Tracks section)');
  }

  const tracks = [];
  const trackDictRegex = /<key>\d+<\/key>\s*<dict>([\s\S]*?)<\/dict>/g;
  let match;

  while ((match = trackDictRegex.exec(xmlContent)) !== null) {
    const block = match[1];
    const trackType = extractPlistString(block, 'Track Type');
    if (trackType && trackType !== 'File') continue;

    const kind = extractPlistString(block, 'Kind') || '';
    if (kind && !/audio|mpeg|mp3|aac|wav|aiff|m4a/i.test(kind)) continue;

    const title = extractPlistString(block, 'Name');
    const artist = extractPlistString(block, 'Artist');
    const album = extractPlistString(block, 'Album');
    const location = extractPlistString(block, 'Location');
    const filePath = decodeItunesLocation(location);
    const totalTimeMs = extractPlistNumber(block, 'Total Time');
    const bpm = extractPlistNumber(block, 'BPM');
    const genre = extractPlistString(block, 'Genre');
    const year = extractPlistNumber(block, 'Year');

    if (!title && !filePath) continue;

    tracks.push({
      source: 'itunes',
      trackId: String(extractPlistNumber(block, 'Track ID') || ''),
      title: title || '',
      artist: artist || '',
      album: album || '',
      genre: genre || '',
      bpm: bpm || null,
      key: null,
      duration: totalTimeMs ? Math.round(totalTimeMs / 1000) : null,
      year: year ? Math.round(year) : null,
      bitrate: null,
      filePath,
      basename: basenameKey(filePath),
    });
  }

  return tracks;
}

/**
 * Detect and parse Rekordbox or iTunes library XML.
 */
async function parseLibraryXmlContent(xmlContent) {
  const trimmed = (xmlContent || '').trim();
  if (!trimmed) {
    throw new Error('Empty XML content');
  }

  if (trimmed.includes('<DJ_PLAYLISTS')) {
    const tracks = await parseRekordboxXmlContent(trimmed);
    return { source: 'rekordbox', trackCount: tracks.length, tracks };
  }

  if (trimmed.includes('<plist') && trimmed.includes('<key>Tracks</key>')) {
    const tracks = parseItunesLibraryXmlContent(trimmed);
    return { source: 'itunes', trackCount: tracks.length, tracks };
  }

  throw new Error('Unrecognized library XML format (expected Rekordbox or iTunes Library.xml)');
}

async function parseLibraryXmlFile(xmlPath) {
  const xmlContent = fs.readFileSync(xmlPath, 'utf8');
  return parseLibraryXmlContent(xmlContent);
}

function buildTrackIndexes(tracks) {
  const byBasename = new Map();
  const byTitleArtist = new Map();

  for (const track of tracks) {
    if (track.basename && !byBasename.has(track.basename)) {
      byBasename.set(track.basename, track);
    }
    const titleKey = normalizeText(track.title);
    const artistKey = normalizeText(track.artist);
    if (titleKey) {
      const key = `${titleKey}::${artistKey}`;
      if (!byTitleArtist.has(key)) byTitleArtist.set(key, track);
    }
  }

  return { byBasename, byTitleArtist };
}

/**
 * Look up BPM/key (and related fields) for an uploaded file.
 */
function lookupTrackInLibrary(tracks, { filename, title, artist, filePath } = {}) {
  if (!tracks?.length) return null;

  const indexes = buildTrackIndexes(tracks);
  const basename = basenameKey(filename || filePath);

  if (basename && indexes.byBasename.has(basename)) {
    return { ...indexes.byBasename.get(basename), matchType: 'basename' };
  }

  const titleKey = normalizeText(title);
  const artistKey = normalizeText(artist);
  if (titleKey) {
    const exact = indexes.byTitleArtist.get(`${titleKey}::${artistKey}`);
    if (exact) return { ...exact, matchType: 'title+artist' };

    const titleOnly = indexes.byTitleArtist.get(`${titleKey}::`);
    if (titleOnly) return { ...titleOnly, matchType: 'title-only' };
  }

  return null;
}

function pickLibraryMetadata(match) {
  if (!match) return null;
  return {
    source: match.source,
    bpm: match.bpm ?? null,
    key: match.key ?? null,
    title: match.title || null,
    artist: match.artist || null,
    album: match.album || null,
    genre: match.genre || null,
    duration: match.duration ?? null,
    matchType: match.matchType || null,
  };
}

function parseOptionalBpm(value) {
  if (value === undefined || value === null || value === '') return null;
  const num = parseFloat(String(value));
  return Number.isFinite(num) && num > 0 ? num : null;
}

function parseOptionalKey(value) {
  if (value === undefined || value === null) return null;
  const str = String(value).trim();
  return str || null;
}

/**
 * Resolve BPM/key with priority: explicit body > library XML match > ID3 extraction.
 */
function resolveBpmKey({ bodyBpm, bodyKey, libraryMatch, extracted } = {}) {
  const lib = pickLibraryMetadata(libraryMatch);
  const bpm = parseOptionalBpm(bodyBpm)
    ?? (lib?.bpm != null ? lib.bpm : null)
    ?? (extracted?.bpm != null ? extracted.bpm : null);
  const key = parseOptionalKey(bodyKey)
    || lib?.key
    || extracted?.key
    || null;
  return { bpm, key, libraryMeta: lib };
}

module.exports = {
  decodeRekordboxLocation,
  decodeItunesLocation,
  parseRekordboxXmlContent,
  parseItunesLibraryXmlContent,
  parseLibraryXmlContent,
  parseLibraryXmlFile,
  lookupTrackInLibrary,
  pickLibraryMetadata,
  resolveBpmKey,
  parseOptionalBpm,
  parseOptionalKey,
};
