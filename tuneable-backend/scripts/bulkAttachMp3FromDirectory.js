#!/usr/bin/env node
/**
 * Bulk attach local MP3 files to existing YouTube catalog Media records.
 *
 * Supports flat folders or iTunes layout: Music/Artist/Album/01 Track.mp3
 *
 * Usage:
 *   node scripts/bulkAttachMp3FromDirectory.js --dir "/path/to/iTunes Media" --dry-run
 *   node scripts/bulkAttachMp3FromDirectory.js --dir "/path/to/iTunes Media" --execute --user-id OBJECTID [--limit 50] [--create-unmatched]
 *
 * Default: pending rights (playable, tips in escrow). Use --clear-rights for legacy owner attach.
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { parseFile } = require('music-metadata');
const { attachToMedia, createMediaWithPendingRights } = require('./lib/attachUpload');

const args = process.argv.slice(2);
const dirIndex = args.indexOf('--dir');
const dryRun = args.includes('--dry-run');
const execute = args.includes('--execute');
const limitIndex = args.indexOf('--limit');
const userIdIndex = args.indexOf('--user-id');
const limit = limitIndex >= 0 ? parseInt(args[limitIndex + 1], 10) : null;
const userIdArg = userIdIndex >= 0 ? args[userIdIndex + 1] : process.env.BULK_UPLOAD_USER_ID || null;
const createUnmatched = args.includes('--create-unmatched');
const pendingRights = !args.includes('--clear-rights');

if (dirIndex < 0 || !args[dirIndex + 1]) {
  console.error(`Usage: node bulkAttachMp3FromDirectory.js --dir /path/to/mp3s [--dry-run | --execute] [--limit N] [--user-id ID] [--create-unmatched] [--clear-rights]`);
  process.exit(1);
}

if (!dryRun && !execute) {
  console.error('Specify --dry-run or --execute');
  process.exit(1);
}

if (execute && !userIdArg) {
  console.error('--execute requires --user-id (or BULK_UPLOAD_USER_ID env)');
  process.exit(1);
}

const rootDir = path.resolve(args[dirIndex + 1]);

function foldAccents(str) {
  return (str || '').normalize('NFD').replace(/\p{M}/gu, '');
}

/** Strip remix/edit/video suffixes for looser matching */
function coreTitle(str) {
  return normalize(str)
    .replace(/\b(original mix|extended mix|radio edit|official music video|official video|visualizer|lyric video|remix|edit|mix|live|dub|version|v\d+)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
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

function fuzzyTitleMatch(want, have, maxDist = 2) {
  if (!want || !have) return false;
  if (want === have) return true;
  if (Math.abs(want.length - have.length) > maxDist) return false;
  return levenshtein(want, have) <= maxDist;
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

  // iTunes: Artist/Album/track.mp3
  if (parts.length >= 3) {
    const artist = parts[0];
    const title = filename;
    return { artist, title, source: 'path' };
  }

  // Artist/track.mp3 or flat Artist - Title.mp3
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

async function readId3(filePath) {
  try {
    const meta = await parseFile(filePath, { duration: false });
    const artist = meta.common.artist || meta.common.artists?.[0] || '';
    const title = meta.common.title || '';
    return { artist, title };
  } catch {
    return { artist: '', title: '' };
  }
}

function buildMediaIndexes(youtubeOnly) {
  const byTitleArtist = new Map();
  const byTitle = new Map();
  const byCoreTitleArtist = new Map();
  const byCoreTitle = new Map();
  const mediaList = [];

  for (const media of youtubeOnly) {
    const artistName = media.artist?.[0]?.name || '';
    const titleKey = normalize(media.title);
    const artistKey = normalize(primaryArtist(artistName));
    const core = coreTitle(media.title);
    const coreArtist = normalize(primaryArtist(artistName));

    mediaList.push(media);
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

async function buildLibraryIndex(files, musicRoot) {
  const byTitleArtist = new Map();
  const byTitle = new Map();
  const byCoreTitleArtist = new Map();
  const byCoreTitle = new Map();
  const entries = [];

  for (const filePath of files) {
    const pathGuess = guessFromPath(filePath, musicRoot);
    const id3 = await readId3(filePath);

    const guesses = [
      id3.title && id3.artist ? { artist: id3.artist, title: id3.title, source: 'id3' } : null,
      pathGuess,
    ].filter(Boolean);

    for (const guess of guesses) {
      const artist = primaryArtist(guess.artist);
      const title = guess.title;
      const titleKey = normalize(title);
      const artistKey = normalize(artist);
      const core = coreTitle(title);

      const entry = { filePath, artist, title, titleKey, artistKey, core, source: guess.source };
      entries.push(entry);

      const add = (map, key, value) => {
        if (!key || map.has(key)) return;
        map.set(key, value);
      };

      add(byTitleArtist, `${titleKey}::${artistKey}`, entry);
      add(byTitle, titleKey, entry);
      if (core) {
        add(byCoreTitleArtist, `${core}::${artistKey}`, entry);
        add(byCoreTitle, core, entry);
      }

      const parsed = parseTitleArtistFromString(title);
      if (parsed) {
        const pArtist = normalize(primaryArtist(parsed.artist));
        const pTitle = normalize(parsed.title);
        const pCore = coreTitle(parsed.title);
        add(byTitleArtist, `${pTitle}::${pArtist}`, entry);
        add(byTitle, pTitle, entry);
        if (pCore) {
          add(byCoreTitleArtist, `${pCore}::${pArtist}`, entry);
          add(byCoreTitle, pCore, entry);
        }
      }
    }
  }

  return { byTitleArtist, byTitle, byCoreTitleArtist, byCoreTitle, entries };
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

function findMatch(guess, indexes) {
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

function findLibraryMatch(media, libraryIndex) {
  const artistName = media.artist?.[0]?.name || '';
  const searchKeys = [
    { artist: artistName, title: media.title },
    parseTitleArtistFromString(media.title),
  ].filter(Boolean);

  for (const guess of searchKeys) {
    const titleKey = normalize(guess.title);
    const artistKey = normalize(primaryArtist(guess.artist));
    const core = coreTitle(guess.title);

    let entry = libraryIndex.byTitleArtist.get(`${titleKey}::${artistKey}`);
    if (entry) return { entry, matchType: 'title+artist' };

    entry = libraryIndex.byCoreTitleArtist.get(`${core}::${artistKey}`);
    if (entry) return { entry, matchType: 'core+artist' };

    entry = libraryIndex.byTitle.get(titleKey);
    if (entry && artistsCompatible(artistName, entry.artist)) {
      return { entry, matchType: 'title-only' };
    }

    entry = libraryIndex.byCoreTitle.get(core);
    if (entry && artistsCompatible(artistName, entry.artist)) {
      return { entry, matchType: 'core-title-only' };
    }
  }

  // Fuzzy: same primary artist folder, close title
  const targetArtist = normalize(primaryArtist(artistName));
  const targetTitle = coreTitle(media.title) || normalize(media.title);
  if (!targetTitle) return null;

  let best = null;
  for (const entry of libraryIndex.entries) {
    if (entry.artistKey !== targetArtist && !entry.artistKey.startsWith(targetArtist.slice(0, 4))) {
      continue;
    }
    const candidate = entry.core || entry.titleKey;
    if (fuzzyTitleMatch(targetTitle, candidate, 2)) {
      const dist = levenshtein(targetTitle, candidate);
      if (!best || dist < best.dist) {
        best = { entry, matchType: 'fuzzy', dist };
      }
    }
  }
  if (best && best.dist <= 2) {
    return { entry: best.entry, matchType: `fuzzy(${best.dist})` };
  }

  return null;
}

// attachToMedia imported from ./lib/attachUpload.js

async function main() {
  const Media = require('../models/Media');
  const musicRoot = fs.existsSync(path.join(rootDir, 'Music'))
    ? path.join(rootDir, 'Music')
    : rootDir;

  const files = walkMp3Files(musicRoot);
  console.log(`Scanning: ${musicRoot}`);
  console.log(`Found ${files.length} MP3 files`);

  const mongoURI = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/tuneable';
  await mongoose.connect(mongoURI);
  console.log('Connected to MongoDB');

  let user = null;
  if (execute) {
    user = await mongoose.connection.collection('users').findOne({
      _id: new mongoose.Types.ObjectId(userIdArg),
    });
    if (!user) {
      console.error('User not found:', userIdArg);
      process.exit(1);
    }
    if (!process.env.R2_ENDPOINT || !process.env.R2_BUCKET_NAME) {
      console.error('R2 env vars required for --execute');
      process.exit(1);
    }
    console.log(`Executing uploads as: ${user.username} (${user._id})`);
  }

  const youtubeOnly = await Media.find({
    'sources.youtube': { $exists: true, $ne: null },
    $or: [
      { 'sources.upload': { $exists: false } },
      { 'sources.upload': null },
      { 'sources.upload': '' },
    ],
    contentForm: { $in: ['tune'] },
  }).select('title artist sources uuid _id');

  console.log(`YouTube-only tune records in DB: ${youtubeOnly.length}`);

  const indexes = buildMediaIndexes(youtubeOnly);

  console.log('Building library index (ID3 + paths)...');
  const libraryIndex = await buildLibraryIndex(files, musicRoot);
  console.log(`Library index: ${libraryIndex.entries.length} entries\n`);

  let matched = 0;
  let matchedPass2 = 0;
  let uploaded = 0;
  let created = 0;
  let skipped = 0;
  let unmatched = 0;
  const matchTypes = {};
  const unmatchedSamples = [];
  const matches = [];
  const matchedMediaIds = new Set();
  const matchedFilePaths = new Set();

  // Pass 1: file → catalog (exact / core)
  for (const filePath of files) {
    const pathGuess = guessFromPath(filePath, musicRoot);
    const id3 = await readId3(filePath);

    const candidates = [
      id3.title && id3.artist ? { artist: id3.artist, title: id3.title, source: 'id3' } : null,
      pathGuess,
    ].filter(Boolean);

    let result = null;
    let usedGuess = pathGuess;
    for (const guess of candidates) {
      result = findMatch(guess, indexes);
      if (result) {
        usedGuess = guess;
        break;
      }
    }

    if (!result) {
      unmatched++;
      if (unmatchedSamples.length < 15) {
        unmatchedSamples.push(path.basename(filePath));
      }
      continue;
    }

    matched++;
    matchTypes[result.matchType] = (matchTypes[result.matchType] || 0) + 1;
    matches.push({ filePath, result, guess: usedGuess, pass: 1 });
    matchedMediaIds.add(result.media._id.toString());
    matchedFilePaths.add(filePath);
  }

  console.log(`Pass 1: ${matched} file→catalog matches`);

  // Pass 2: remaining catalog → library (reverse search + fuzzy)
  for (const media of youtubeOnly) {
    if (matchedMediaIds.has(media._id.toString())) continue;

    const lib = findLibraryMatch(media, libraryIndex);
    if (!lib) continue;

    matchedPass2++;
    matchTypes[lib.matchType] = (matchTypes[lib.matchType] || 0) + 1;
    matches.push({
      filePath: lib.entry.filePath,
      result: { media, matchType: lib.matchType },
      pass: 2,
    });
    matchedMediaIds.add(media._id.toString());
    matchedFilePaths.add(lib.entry.filePath);
  }

  console.log(`Pass 2: ${matchedPass2} catalog→library matches`);
  console.log(`Total raw matches: ${matches.length}\n`);

  // One upload per media record — prefer title+artist matches
  const rank = (entry) => {
    const type = entry.result.matchType;
    if (type === 'title+artist') return 5;
    if (type === 'core+artist') return 4;
    if (type === 'title-only' || type === 'core-title-only') return 3;
    if (type.startsWith('fuzzy')) return 1;
    return 2;
  };

  const byMediaId = new Map();
  for (const entry of matches) {
    const id = entry.result.media._id.toString();
    const existing = byMediaId.get(id);
    if (!existing || rank(entry) > rank(existing)) {
      byMediaId.set(id, entry);
    }
  }
  const uniqueMatches = Array.from(byMediaId.values());
  if (uniqueMatches.length < matches.length) {
    console.log(`Deduped to ${uniqueMatches.length} unique media records (${matches.length - uniqueMatches.length} duplicate file matches dropped)\n`);
  }

  const toUpload = limit ? uniqueMatches.slice(0, limit) : uniqueMatches;

  for (const { filePath, result, pass } of toUpload) {
    const label = `"${result.media.title}" by ${result.media.artist?.[0]?.name || '?'}`;
    console.log(`  ✓ [p${pass || 1}:${result.matchType}] ${path.basename(filePath)} → ${label} (${result.media.uuid})`);

    if (execute) {
      try {
        const out = await attachToMedia(result.media, filePath, user, {
          pendingRights,
          importSource: 'itunes_library',
        });
        if (out.skipped) {
          skipped++;
          console.log(`    ↷ Skipped: ${out.reason}`);
        } else {
          uploaded++;
          console.log(`    ↑ Uploaded${pendingRights ? ' (pending rights)' : ''}: ${out.fileUrl || out.uuid}`);
          indexes.byTitleArtist.delete(`${normalize(result.media.title)}::${normalize(result.media.artist?.[0]?.name || '')}`);
          indexes.byTitle.delete(normalize(result.media.title));
        }
      } catch (err) {
        console.error(`    ✗ Upload failed: ${err.message}`);
      }
    }
  }

  if (createUnmatched) {
    const unmatchedFiles = files.filter((f) => !matchedFilePaths.has(f));
    const toCreate = limit ? unmatchedFiles.slice(0, Math.max(0, limit - toUpload.length)) : unmatchedFiles;
    if (toCreate.length) {
      console.log(`\n--- Create unmatched (${toCreate.length}) ---`);
    }
    for (const filePath of toCreate) {
      const pathGuess = guessFromPath(filePath, musicRoot);
      const id3 = await readId3(filePath);
      const title = id3.title || pathGuess.title || path.basename(filePath, '.mp3');
      const artist = id3.artist || pathGuess.artist || 'Unknown Artist';
      console.log(`  + NEW ${path.basename(filePath)} → "${title}" by ${artist}`);
      if (execute) {
        try {
          const out = await createMediaWithPendingRights(filePath, user, {
            importSource: 'itunes_library',
            guess: { title, artist },
          });
          if (out.skipped) {
            skipped++;
            console.log(`    ↷ Skipped: ${out.reason}`);
          } else {
            created++;
            console.log(`    + Created: ${out.uuid}`);
          }
        } catch (err) {
          console.error(`    ✗ Create failed: ${err.message}`);
        }
      }
    }
  }

  console.log('\n--- Summary ---');
  console.log(`Files scanned:  ${files.length}`);
  console.log(`Pass 1 matched: ${matched}`);
  console.log(`Pass 2 matched: ${matchedPass2}`);
  console.log(`Unique uploads: ${uniqueMatches.length}`);
  console.log(`Match types:    ${JSON.stringify(matchTypes)}`);
  console.log(`Files unmatched:${unmatched}`);
  if (execute) {
    console.log(`Upload batch:   ${toUpload.length} unique media`);
    console.log(`Uploaded:       ${uploaded}`);
    if (createUnmatched) console.log(`Created new:    ${created}`);
    console.log(`Skipped:        ${skipped}`);
    console.log(`Rights mode:    ${pendingRights ? 'pending (escrow)' : 'cleared (owner)'}`);
  }
  if (dryRun) {
    console.log('(dry run — no changes made)');
  }
  if (unmatchedSamples.length) {
    console.log(`\nSample unmatched files (first ${unmatchedSamples.length}):`);
    unmatchedSamples.forEach((f) => console.log(`  - ${f}`));
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
