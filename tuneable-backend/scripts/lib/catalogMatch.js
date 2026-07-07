const { parseFile } = require('music-metadata');
const {
  normalize,
  primaryArtist,
  parseTitleArtistFromString,
  levenshtein,
  artistsCompatible,
  guessFromPath,
} = require('./matchUtils');

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

async function readId3(filePath) {
  try {
    const meta = await parseFile(filePath, { duration: true });
    return {
      artist: meta.common.artist || meta.common.artists?.[0] || '',
      title: meta.common.title || '',
      duration: Math.floor(meta.format.duration || 0),
      bpm: meta.common.bpm || null,
      key: meta.common.key || null,
      bitrate: meta.format.bitrate ? Math.round(meta.format.bitrate / 1000) : null,
    };
  } catch {
    return { artist: '', title: '', duration: 0, bpm: null, key: null, bitrate: null };
  }
}

function buildMediaIndexes(mediaList) {
  const byTitleArtist = new Map();
  const byTitle = new Map();
  const byCoreTitleArtist = new Map();
  const byCoreTitle = new Map();

  for (const media of mediaList) {
    const artistName = media.artist?.[0]?.name || '';
    const titleKey = normalize(media.title);
    const artistKey = normalize(primaryArtist(artistName));
    const core = coreTitle(media.title);
    const coreArtist = normalize(primaryArtist(artistName));

    const key = `${titleKey}::${artistKey}`;
    if (!byTitleArtist.has(key)) byTitleArtist.set(key, media);
    if (!byTitle.has(titleKey)) byTitle.set(titleKey, media);
    const coreKey = `${core}::${coreArtist}`;
    if (core && !byCoreTitleArtist.has(coreKey)) byCoreTitleArtist.set(coreKey, media);
    if (core && !byCoreTitle.has(core)) byCoreTitle.set(core, media);

    const parsed = parseTitleArtistFromString(media.title);
    if (parsed) {
      const pTitle = normalize(parsed.title);
      const pArtist = normalize(primaryArtist(parsed.artist));
      const pKey = `${pTitle}::${pArtist}`;
      if (!byTitleArtist.has(pKey)) byTitleArtist.set(pKey, media);
      if (!byTitle.has(pTitle)) byTitle.set(pTitle, media);
      const pCore = coreTitle(parsed.title);
      if (pCore) {
        if (!byCoreTitleArtist.has(`${pCore}::${pArtist}`)) {
          byCoreTitleArtist.set(`${pCore}::${pArtist}`, media);
        }
        if (!byCoreTitle.has(pCore)) byCoreTitle.set(pCore, media);
      }
    }
  }

  return { byTitleArtist, byTitle, byCoreTitleArtist, byCoreTitle, mediaList };
}

function findCatalogMatch(guess, indexes) {
  const titleKey = normalize(guess.title);
  const artistKey = normalize(primaryArtist(guess.artist));
  const core = coreTitle(guess.title);

  let media = indexes.byTitleArtist.get(`${titleKey}::${artistKey}`);
  if (media) return { media, matchType: 'title+artist' };

  media = indexes.byCoreTitleArtist.get(`${core}::${artistKey}`);
  if (media) return { media, matchType: 'core+artist' };

  media = indexes.byTitle.get(titleKey);
  if (media && artistsCompatible(media.artist?.[0]?.name, guess.artist)) {
    return { media, matchType: 'title-only' };
  }

  media = indexes.byCoreTitle.get(core);
  if (media && artistsCompatible(media.artist?.[0]?.name, guess.artist)) {
    return { media, matchType: 'core-title-only' };
  }

  return null;
}

function guessFromFile(filePath, musicRoot) {
  const pathGuess = guessFromPath(filePath, musicRoot);
  return pathGuess;
}

async function buildGuessFromFile(filePath, musicRoot, rekordboxMeta = null) {
  const id3 = await readId3(filePath);
  const pathGuess = guessFromPath(filePath, musicRoot);

  const rb = rekordboxMeta || {};
  const rbGuess = rb.name
    ? { artist: rb.artist || pathGuess.artist, title: rb.name, source: 'rekordbox' }
    : null;

  const candidates = [
    id3.title && id3.artist ? { artist: id3.artist, title: id3.title, source: 'id3' } : null,
    rbGuess,
    pathGuess,
  ].filter(Boolean);

  return { candidates, id3, pathGuess };
}

function findBestCatalogMatch(candidates, indexes) {
  for (const guess of candidates) {
    const result = findCatalogMatch(guess, indexes);
    if (result) return { ...result, guess };
  }
  return null;
}

module.exports = {
  coreTitle,
  readId3,
  buildMediaIndexes,
  findCatalogMatch,
  findBestCatalogMatch,
  buildGuessFromFile,
  guessFromFile,
};
