const fs = require('fs');
const path = require('path');

function foldAccents(str) {
  return (str || '').normalize('NFD').replace(/\p{M}/gu, '');
}

function normalize(str) {
  return foldAccents(str)
    .toLowerCase()
    .replace(/\s*\(feat\.?[^)]*\)/gi, '')
    .replace(/\s*\(ft\.?[^)]*\)/gi, '')
    .replace(/\s*\(with[^)]*\)/gi, '')
    .replace(/\s*\[[^\]]*\]/g, '')
    .replace(/\s*\([^)]*\)/g, '')
    .replace(/^\d{1,3}[\s._-]+/, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function primaryArtist(artist) {
  if (!artist) return '';
  return artist
    .split(/\s*(?:,|&| feat\.?| ft\.?| x | X | and | with )\s*/i)[0]
    .trim();
}

function parseTitleArtistFromString(str) {
  if (!str || !str.includes(' - ')) return null;
  const idx = str.indexOf(' - ');
  return {
    artist: str.slice(0, idx).trim(),
    title: str.slice(idx + 3).replace(/\s*\[[^\]]*\]\s*/g, '').trim(),
  };
}

function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = i;
    for (let j = 1; j <= b.length; j++) {
      const val = a[i - 1] === b[j - 1]
        ? row[j - 1]
        : Math.min(row[j] + 1, prev + 1, row[j - 1] + 1);
      row[j - 1] = prev;
      prev = val;
    }
    row[b.length] = prev;
  }
  return row[b.length];
}

function artistsCompatible(mediaArtist, fileArtist) {
  const a = normalize(primaryArtist(mediaArtist));
  const b = normalize(primaryArtist(fileArtist));
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.includes(b) || b.includes(a)) return true;
  const aFirst = a.split(' ')[0];
  const bFirst = b.split(' ')[0];
  if (aFirst.length >= 4 && aFirst === bFirst) return true;
  return levenshtein(a, b) <= 2;
}

function stripTrackPrefix(filename) {
  const base = path.basename(filename, path.extname(filename));
  return base
    .replace(/^\d{1,3}[\s._-]+/, '')
    .replace(/^\d+\s*-\s*/, '')
    .trim();
}

function walkMp3Files(dir, results = []) {
  if (!fs.existsSync(dir)) return results;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkMp3Files(full, results);
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.mp3')) {
      results.push(full);
    }
  }
  return results;
}

function guessFromPath(filePath, musicRoot) {
  const rel = path.relative(musicRoot, filePath);
  const parts = rel.split(path.sep);
  const filename = stripTrackPrefix(filePath);

  if (parts.length >= 3) {
    return { artist: parts[0], title: filename, source: 'path' };
  }
  if (parts.length === 2) {
    const artist = parts[0];
    if (filename.includes(' - ')) {
      const bits = filename.split(' - ');
      return { artist: bits[0].trim(), title: bits.slice(1).join(' - ').trim(), source: 'filename' };
    }
    return { artist, title: filename, source: 'path' };
  }
  const base = stripTrackPrefix(filePath);
  if (base.includes(' - ')) {
    const bits = base.split(' - ');
    return { artist: bits[0].trim(), title: bits.slice(1).join(' - ').trim(), source: 'filename' };
  }
  return { artist: '', title: base, source: 'filename' };
}

/** Catalog artist candidates (DB field + artist embedded in title). */
function catalogArtistCandidates(media) {
  const names = new Set();
  const fromField = media.artist?.[0]?.name;
  if (fromField) names.add(fromField);
  const parsed = parseTitleArtistFromString(media.title);
  if (parsed?.artist) names.add(parsed.artist);
  return Array.from(names);
}

function durationWithinTolerance(catalogSec, fileSec, opts = {}) {
  const minCatalog = opts.minCatalogDuration ?? 30;
  const minDelta = opts.minDeltaSec ?? 8;
  const pct = opts.pct ?? 0.04;

  if (!catalogSec || !fileSec || catalogSec < minCatalog || fileSec < minCatalog) {
    return false;
  }
  const delta = Math.abs(catalogSec - fileSec);
  const allowed = Math.max(minDelta, catalogSec * pct);
  return delta <= allowed;
}

function formatDuration(sec) {
  if (!sec || !Number.isFinite(sec)) return '?';
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

module.exports = {
  normalize,
  primaryArtist,
  parseTitleArtistFromString,
  levenshtein,
  artistsCompatible,
  walkMp3Files,
  guessFromPath,
  catalogArtistCandidates,
  durationWithinTolerance,
  formatDuration,
};
