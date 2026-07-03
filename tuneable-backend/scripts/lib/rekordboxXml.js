const fs = require('fs');
const path = require('path');
const xml2js = require('xml2js');

/**
 * Decode Rekordbox Location URI to local filesystem path.
 * e.g. file://localhost/Users/me/track.mp3 → /Users/me/track.mp3
 */
function decodeRekordboxLocation(location) {
  if (!location || typeof location !== 'string') return null;
  let decoded = decodeURIComponent(location.trim());
  decoded = decoded.replace(/^file:\/\/localhost/i, '');
  // Windows paths sometimes appear as /C:/Users/...
  if (/^\/[A-Za-z]:/.test(decoded)) {
    decoded = decoded.slice(1);
  }
  return path.normalize(decoded);
}

function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function normalizePlaylistName(name) {
  return (name || '').trim().toLowerCase();
}

/**
 * Parse Rekordbox XML export into collection + playlist tree.
 */
async function parseRekordboxXml(xmlPath) {
  const xml = fs.readFileSync(xmlPath, 'utf8');
  const parser = new xml2js.Parser({ explicitArray: false, mergeAttrs: true });
  const doc = await parser.parseStringPromise(xml);
  const root = doc.DJ_PLAYLISTS;
  if (!root) {
    throw new Error('Not a Rekordbox DJ_PLAYLISTS XML file');
  }

  const collectionTracks = asArray(root.COLLECTION?.TRACK).map((track) => {
    const filePath = decodeRekordboxLocation(track.Location);
    return {
      trackId: String(track.TrackID || ''),
      name: track.Name || '',
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
      totalTime: track.TotalTime ? parseInt(track.TotalTime, 10) : null,
      year: track.Year ? parseInt(track.Year, 10) : null,
      bitrate: track.BitRate ? parseInt(track.BitRate, 10) : null,
      sampleRate: track.SampleRate ? parseInt(track.SampleRate, 10) : null,
      dateAdded: track.DateAdded || null,
      filePath,
      fileExists: filePath ? fs.existsSync(filePath) : false,
    };
  });

  const trackById = new Map();
  const trackByPath = new Map();
  for (const track of collectionTracks) {
    if (track.trackId) trackById.set(track.trackId, track);
    if (track.filePath) trackByPath.set(path.normalize(track.filePath), track);
  }

  const playlists = [];

  function walkNodes(node, parentPath = '') {
    if (!node) return;
    const nodes = asArray(node);
    for (const n of nodes) {
      const nodeName = n.Name || 'Unnamed';
      const fullPath = parentPath ? `${parentPath}/${nodeName}` : nodeName;
      const type = String(n.Type ?? '0');

      if (type === '1') {
        const keys = asArray(n.TRACK).map((t) => String(t.Key || t.key || ''));
        const tracks = keys
          .map((key) => trackById.get(key))
          .filter(Boolean);
        playlists.push({
          name: nodeName,
          fullPath,
          trackCount: tracks.length,
          tracks,
        });
      } else {
        walkNodes(n.NODE, fullPath);
      }
    }
  }

  walkNodes(root.PLAYLISTS?.NODE);

  return { collectionTracks, trackById, trackByPath, playlists };
}

/**
 * List all playlist names (leaf playlists only).
 */
async function listPlaylists(xmlPath) {
  const { playlists } = await parseRekordboxXml(xmlPath);
  return playlists.map((p) => ({
    name: p.name,
    fullPath: p.fullPath,
    trackCount: p.trackCount,
    missingFiles: p.tracks.filter((t) => !t.fileExists).length,
  }));
}

/**
 * Resolve tracks for named playlists (case-insensitive match on name or fullPath).
 * @param {string} xmlPath
 * @param {string[]} playlistNames - e.g. ["House", "Favourites/Warm Up"]
 */
async function getTracksFromPlaylists(xmlPath, playlistNames) {
  const { playlists } = await parseRekordboxXml(xmlPath);
  if (!playlistNames?.length) {
    return { playlists: [], tracks: [], unmatchedPlaylists: [] };
  }

  const wanted = new Set(playlistNames.map(normalizePlaylistName));
  const matchedPlaylists = playlists.filter(
    (p) => wanted.has(normalizePlaylistName(p.name)) || wanted.has(normalizePlaylistName(p.fullPath))
  );

  const unmatchedPlaylists = playlistNames.filter((name) => {
    const key = normalizePlaylistName(name);
    return !matchedPlaylists.some(
      (p) => normalizePlaylistName(p.name) === key || normalizePlaylistName(p.fullPath) === key
    );
  });

  const seen = new Set();
  const tracks = [];
  for (const pl of matchedPlaylists) {
    for (const track of pl.tracks) {
      const id = track.filePath || track.trackId;
      if (!id || seen.has(id)) continue;
      seen.add(id);
      tracks.push({ ...track, playlistName: pl.name, playlistPath: pl.fullPath });
    }
  }

  return { playlists: matchedPlaylists, tracks, unmatchedPlaylists };
}

module.exports = {
  decodeRekordboxLocation,
  parseRekordboxXml,
  listPlaylists,
  getTracksFromPlaylists,
};
