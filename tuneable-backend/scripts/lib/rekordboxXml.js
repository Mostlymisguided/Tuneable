const fs = require('fs');
const path = require('path');
const xml2js = require('xml2js');
const {
  decodeRekordboxLocation,
  parseRekordboxXmlContent,
} = require('../../utils/libraryXml');

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
  const collectionTracks = await parseRekordboxXmlContent(xml);

  const trackById = new Map();
  const trackByPath = new Map();
  for (const track of collectionTracks) {
    if (track.trackId) trackById.set(track.trackId, track);
    if (track.filePath) trackByPath.set(path.normalize(track.filePath), track);
  }

  const parser = new xml2js.Parser({ explicitArray: false, mergeAttrs: true });
  const doc = await parser.parseStringPromise(xml);
  const root = doc.DJ_PLAYLISTS;
  if (!root) {
    throw new Error('Not a Rekordbox DJ_PLAYLISTS XML file');
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
