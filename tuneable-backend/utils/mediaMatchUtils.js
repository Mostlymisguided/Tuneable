/**
 * Shared title/artist normalization + fuzzy helpers for catalog matching.
 * Used by library import (assisted matches) and offline bulk scripts.
 */

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

/** Strip remix/edit/video suffixes for looser matching */
function coreTitle(str) {
  return normalize(str)
    .replace(/\b(original mix|extended mix|radio edit|official music video|official video|visualizer|lyric video|remix|edit|mix|live|dub|version|v\d+)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function fuzzyTitleMatch(want, have, maxDist = 2) {
  if (!want || !have) return false;
  if (want === have) return true;
  if (Math.abs(want.length - have.length) > maxDist) return false;
  return levenshtein(want, have) <= maxDist;
}

function durationWithinTolerance(catalogSec, fileSec, opts = {}) {
  const minCatalog = opts.minCatalogDuration ?? 30;
  const minDelta = opts.minDeltaSec ?? 8;
  const pct = opts.pct ?? 0.04;

  if (!catalogSec || !fileSec || catalogSec < minCatalog || fileSec < minCatalog) {
    return true; // don't reject when duration unknown/short
  }
  const delta = Math.abs(catalogSec - fileSec);
  const allowed = Math.max(minDelta, catalogSec * pct);
  return delta <= allowed;
}

function mediaPrimaryArtistName(media) {
  if (!media) return '';
  if (typeof media.artist === 'string') return media.artist;
  return media.artist?.[0]?.name || '';
}

/**
 * Build in-memory indexes for fuzzy catalog lookup.
 */
function buildMediaIndexes(mediaList) {
  const byTitleArtist = new Map();
  const byTitle = new Map();
  const byCoreTitleArtist = new Map();
  const byCoreTitle = new Map();

  for (const media of mediaList) {
    const artistName = mediaPrimaryArtistName(media);
    const titleKey = normalize(media.title);
    const artistKey = normalize(primaryArtist(artistName));
    const core = coreTitle(media.title);
    const coreArtist = normalize(primaryArtist(artistName));

    const key = `${titleKey}::${artistKey}`;
    if (!byTitleArtist.has(key)) byTitleArtist.set(key, media);
    if (!byTitle.has(titleKey)) byTitle.set(titleKey, []);
    byTitle.get(titleKey).push(media);

    const coreKey = `${core}::${coreArtist}`;
    if (core && !byCoreTitleArtist.has(coreKey)) byCoreTitleArtist.set(coreKey, media);
    if (core) {
      if (!byCoreTitle.has(core)) byCoreTitle.set(core, []);
      byCoreTitle.get(core).push(media);
    }

    const parsed = parseTitleArtistFromString(media.title);
    if (parsed) {
      const pTitle = normalize(parsed.title);
      const pArtist = normalize(primaryArtist(parsed.artist));
      const pKey = `${pTitle}::${pArtist}`;
      if (!byTitleArtist.has(pKey)) byTitleArtist.set(pKey, media);
      const pCore = coreTitle(parsed.title);
      if (pCore) {
        if (!byCoreTitleArtist.has(`${pCore}::${pArtist}`)) {
          byCoreTitleArtist.set(`${pCore}::${pArtist}`, media);
        }
        if (!byCoreTitle.has(pCore)) byCoreTitle.set(pCore, []);
        byCoreTitle.get(pCore).push(media);
      }
    }
  }

  return { byTitleArtist, byTitle, byCoreTitleArtist, byCoreTitle, mediaList };
}

/**
 * Find a medium-confidence catalog match for an import track.
 * Returns { media, matchType } or null. Never used for silent auto-merge.
 */
function findFuzzyCatalogMatch(track, indexes) {
  if (!track?.title || !indexes) return null;

  const titleKey = normalize(track.title);
  const artistKey = normalize(primaryArtist(track.artist));
  const core = coreTitle(track.title);
  const duration = track.duration || 0;

  const accept = (media, matchType) => {
    if (!media) return null;
    if (!durationWithinTolerance(media.duration || 0, duration)) return null;
    return { media, matchType };
  };

  let hit = indexes.byTitleArtist.get(`${titleKey}::${artistKey}`);
  if (hit) return accept(hit, 'normalized-title-artist');

  hit = indexes.byCoreTitleArtist.get(`${core}::${artistKey}`);
  if (hit) return accept(hit, 'core-title-artist');

  // Title-only with compatible artist (handles SoundCloud username vs legal name)
  const titleHits = indexes.byTitle.get(titleKey) || [];
  for (const media of titleHits) {
    if (artistsCompatible(mediaPrimaryArtistName(media), track.artist)) {
      const ok = accept(media, 'title-compatible-artist');
      if (ok) return ok;
    }
  }

  const coreHits = indexes.byCoreTitle.get(core) || [];
  for (const media of coreHits) {
    if (artistsCompatible(mediaPrimaryArtistName(media), track.artist)) {
      const ok = accept(media, 'core-title-compatible-artist');
      if (ok) return ok;
    }
  }

  // Fuzzy title (small edit distance) + compatible artist
  if (core && core.length >= 4) {
    for (const media of indexes.mediaList) {
      const mediaCore = coreTitle(media.title);
      if (!fuzzyTitleMatch(core, mediaCore, 2)) continue;
      if (!artistsCompatible(mediaPrimaryArtistName(media), track.artist)) continue;
      const ok = accept(media, 'fuzzy-title-compatible-artist');
      if (ok) return ok;
    }
  }

  // "Artist - Title" embedded in SoundCloud title vs catalog fields
  const parsed = parseTitleArtistFromString(track.title);
  if (parsed) {
    const pTitle = normalize(parsed.title);
    const pArtist = normalize(primaryArtist(parsed.artist));
    hit = indexes.byTitleArtist.get(`${pTitle}::${pArtist}`);
    if (hit) return accept(hit, 'parsed-title-artist');
    const pCore = coreTitle(parsed.title);
    hit = indexes.byCoreTitleArtist.get(`${pCore}::${pArtist}`);
    if (hit) return accept(hit, 'parsed-core-title-artist');
  }

  return null;
}

module.exports = {
  foldAccents,
  normalize,
  primaryArtist,
  parseTitleArtistFromString,
  levenshtein,
  artistsCompatible,
  coreTitle,
  fuzzyTitleMatch,
  durationWithinTolerance,
  mediaPrimaryArtistName,
  buildMediaIndexes,
  findFuzzyCatalogMatch,
};
