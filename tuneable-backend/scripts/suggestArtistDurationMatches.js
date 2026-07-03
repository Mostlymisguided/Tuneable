#!/usr/bin/env node
/**
 * Suggest MP3 ↔ catalog matches by artist + duration for manual approval.
 *
 * 1) Generate suggestions:
 *    node scripts/suggestArtistDurationMatches.js \
 *      --dir "/Users/admin/Music/iTunes/iTunes Media" \
 *      --out scripts/pending-approvals.csv
 *
 * 2) Open CSV, set approved=yes on rows you want (one per catalog track).
 *
 * 3) Upload approved rows:
 *    node scripts/suggestArtistDurationMatches.js \
 *      --execute-approved scripts/pending-approvals.csv \
 *      --user-id YOUR_USER_ID
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { parseFile } = require('music-metadata');
const {
  artistsCompatible,
  walkMp3Files,
  guessFromPath,
  catalogArtistCandidates,
  durationWithinTolerance,
  formatDuration,
  normalize,
  levenshtein,
} = require('./lib/matchUtils');
const { attachToMedia } = require('./lib/attachUpload');

const args = process.argv.slice(2);
const dirIndex = args.indexOf('--dir');
const outIndex = args.indexOf('--out');
const approvedIndex = args.indexOf('--execute-approved');
const userIdIndex = args.indexOf('--user-id');
const maxPerMediaIndex = args.indexOf('--max-per-media');
const userIdArg = userIdIndex >= 0 ? args[userIdIndex + 1] : process.env.BULK_UPLOAD_USER_ID || null;
const maxPerMedia = maxPerMediaIndex >= 0 ? parseInt(args[maxPerMediaIndex + 1], 10) : 5;

function csvEscape(val) {
  const s = String(val ?? '');
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function parseCsvLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

function readApprovedCsv(csvPath) {
  const text = fs.readFileSync(csvPath, 'utf8');
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const header = parseCsvLine(lines[0]);
  const idx = (name) => header.indexOf(name);

  const approved = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    const flag = (cols[idx('approved')] || '').trim().toLowerCase();
    if (!['yes', 'y', 'true', '1', 'approve', 'approved'].includes(flag)) continue;

    approved.push({
      matchId: cols[idx('matchId')],
      mediaUuid: cols[idx('mediaUuid')],
      filePath: cols[idx('filePath')],
    });
  }
  return approved;
}

async function readId3WithDuration(filePath) {
  try {
    const meta = await parseFile(filePath, { duration: true });
    const artist = meta.common.artist || meta.common.artists?.[0] || '';
    const title = meta.common.title || '';
    const duration = meta.format.duration ? Math.round(meta.format.duration) : 0;
    return { artist, title, duration, source: 'id3' };
  } catch {
    return { artist: '', title: '', duration: 0, source: 'id3' };
  }
}

async function buildLibraryWithDuration(files, musicRoot) {
  const entries = [];
  let processed = 0;
  for (const filePath of files) {
    processed++;
    if (processed % 500 === 0) {
      console.log(`  …indexed ${processed}/${files.length} files`);
    }

    const pathGuess = guessFromPath(filePath, musicRoot);
    const id3 = await readId3WithDuration(filePath);
    const artist = id3.artist || pathGuess.artist;
    const title = id3.title || pathGuess.title;
    const duration = id3.duration || 0;

    if (!duration) continue;

    entries.push({
      filePath,
      artist,
      title,
      duration,
      folderArtist: pathGuess.artist,
      basename: path.basename(filePath),
    });
  }
  return entries;
}

function titleSimilarity(catalogTitle, fileTitle) {
  const a = normalize(catalogTitle);
  const b = normalize(fileTitle);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.85;
  const maxLen = Math.max(a.length, b.length);
  if (!maxLen) return 0;
  return 1 - levenshtein(a, b) / maxLen;
}

async function generateSuggestions(rootDir, outPath) {
  const musicRoot = fs.existsSync(path.join(rootDir, 'Music'))
    ? path.join(rootDir, 'Music')
    : rootDir;

  const files = walkMp3Files(musicRoot);
  console.log(`Scanning ${files.length} MP3s under ${musicRoot}`);

  const mongoURI = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/tuneable';
  await mongoose.connect(mongoURI);

  const Media = require('../models/Media');
  const pending = await Media.find({
    'sources.youtube': { $exists: true, $ne: null },
    $or: [
      { 'sources.upload': { $exists: false } },
      { 'sources.upload': null },
      { 'sources.upload': '' },
    ],
    contentForm: { $in: ['tune'] },
    duration: { $gte: 30 },
  }).select('title artist sources uuid _id duration');

  console.log(`Catalog tracks needing upload (with duration): ${pending.length}`);
  console.log('Indexing library durations (ID3)…');
  const library = await buildLibraryWithDuration(files, musicRoot);
  console.log(`Library entries with duration: ${library.length}`);

  const suggestions = [];
  let matchId = 0;

  for (const media of pending) {
    const catalogDuration = Math.round(media.duration || 0);
    const artistNames = catalogArtistCandidates(media);
    const candidates = [];

    for (const entry of library) {
      const artistMatch = artistNames.some((name) => artistsCompatible(name, entry.artist))
        || artistsCompatible(artistNames[0], entry.folderArtist);

      if (!artistMatch) continue;
      if (!durationWithinTolerance(catalogDuration, entry.duration)) continue;

      const delta = Math.abs(catalogDuration - entry.duration);
      const titleScore = titleSimilarity(media.title, entry.title);
      candidates.push({
        ...entry,
        durationDeltaSec: delta,
        titleScore,
      });
    }

    candidates.sort((a, b) => {
      if (b.titleScore !== a.titleScore) return b.titleScore - a.titleScore;
      return a.durationDeltaSec - b.durationDeltaSec;
    });

    const top = candidates.slice(0, maxPerMedia);
    for (const c of top) {
      matchId++;
      suggestions.push({
        matchId: `m-${String(matchId).padStart(4, '0')}`,
        approved: 'no',
        mediaUuid: media.uuid,
        mediaId: media._id.toString(),
        catalogTitle: media.title,
        catalogArtist: media.artist?.[0]?.name || '',
        catalogDurationSec: catalogDuration,
        catalogDurationFmt: formatDuration(catalogDuration),
        fileTitle: c.title,
        fileArtist: c.artist,
        fileDurationSec: c.duration,
        fileDurationFmt: formatDuration(c.duration),
        durationDeltaSec: c.durationDeltaSec,
        titleScore: Math.round(c.titleScore * 100),
        filePath: c.filePath,
        fileName: c.basename,
      });
    }
  }

  const csvHeader = [
    'approved', 'matchId', 'mediaUuid', 'catalogTitle', 'catalogArtist',
    'catalogDurationFmt', 'catalogDurationSec', 'fileName', 'fileTitle', 'fileArtist',
    'fileDurationFmt', 'fileDurationSec', 'durationDeltaSec', 'titleScore', 'filePath',
  ].join(',');

  const csvRows = suggestions.map((s) => csvHeader.split(',').map((col) => {
    switch (col) {
      case 'approved': return csvEscape(s.approved);
      case 'matchId': return csvEscape(s.matchId);
      case 'mediaUuid': return csvEscape(s.mediaUuid);
      case 'catalogTitle': return csvEscape(s.catalogTitle);
      case 'catalogArtist': return csvEscape(s.catalogArtist);
      case 'catalogDurationFmt': return csvEscape(s.catalogDurationFmt);
      case 'catalogDurationSec': return csvEscape(s.catalogDurationSec);
      case 'fileName': return csvEscape(s.fileName);
      case 'fileTitle': return csvEscape(s.fileTitle);
      case 'fileArtist': return csvEscape(s.fileArtist);
      case 'fileDurationFmt': return csvEscape(s.fileDurationFmt);
      case 'fileDurationSec': return csvEscape(s.fileDurationSec);
      case 'durationDeltaSec': return csvEscape(s.durationDeltaSec);
      case 'titleScore': return csvEscape(s.titleScore);
      case 'filePath': return csvEscape(s.filePath);
      default: return '';
    }
  }).join(','));

  const jsonPath = outPath.replace(/\.csv$/i, '.json');
  fs.writeFileSync(outPath, [csvHeader, ...csvRows].join('\n') + '\n');
  fs.writeFileSync(jsonPath, JSON.stringify({
    generatedAt: new Date().toISOString(),
    tolerance: '±max(8s, 4% of catalog duration)',
    suggestionCount: suggestions.length,
    catalogTracksWithCandidates: new Set(suggestions.map((s) => s.mediaUuid)).size,
    suggestions,
  }, null, 2));

  const tracksWithCandidates = new Set(suggestions.map((s) => s.mediaUuid)).size;
  console.log(`\nWrote ${suggestions.length} suggestions for ${tracksWithCandidates} catalog tracks`);
  console.log(`CSV:  ${outPath}`);
  console.log(`JSON: ${jsonPath}`);
  console.log('\nNext: open the CSV, set approved=yes on rows you want, then run:');
  console.log(`  node scripts/suggestArtistDurationMatches.js --execute-approved ${outPath} --user-id YOUR_ID`);

  await mongoose.disconnect();
}

async function executeApproved(approvedPath) {
  if (!userIdArg) {
    console.error('--execute-approved requires --user-id (or BULK_UPLOAD_USER_ID)');
    process.exit(1);
  }
  if (!process.env.R2_ENDPOINT || !process.env.R2_BUCKET_NAME) {
    console.error('R2 env vars required');
    process.exit(1);
  }

  const rows = readApprovedCsv(approvedPath);
  if (!rows.length) {
    console.error('No approved rows found. Set approved=yes in the CSV first.');
    process.exit(1);
  }

  const byMedia = new Map();
  for (const row of rows) {
    if (byMedia.has(row.mediaUuid)) {
      console.error(`Duplicate approval for ${row.mediaUuid} — only approve one file per catalog track.`);
      process.exit(1);
    }
    byMedia.set(row.mediaUuid, row);
  }

  const mongoURI = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/tuneable';
  await mongoose.connect(mongoURI);

  const Media = require('../models/Media');
  const user = await mongoose.connection.collection('users').findOne({
    _id: new mongoose.Types.ObjectId(userIdArg),
  });
  if (!user) {
    console.error('User not found:', userIdArg);
    process.exit(1);
  }

  console.log(`Uploading ${rows.length} approved matches as ${user.username}`);

  let uploaded = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of rows) {
    if (!fs.existsSync(row.filePath)) {
      console.error(`✗ Missing file: ${row.filePath}`);
      failed++;
      continue;
    }

    const media = await Media.findOne({ uuid: row.mediaUuid });
    if (!media) {
      console.error(`✗ Media not found: ${row.mediaUuid}`);
      failed++;
      continue;
    }

    try {
      const out = await attachToMedia(media, row.filePath, user);
      if (out.skipped) {
        console.log(`↷ ${media.title} — ${out.reason}`);
        skipped++;
      } else {
        console.log(`↑ ${media.title} ← ${path.basename(row.filePath)}`);
        uploaded++;
      }
    } catch (err) {
      console.error(`✗ ${media.title}: ${err.message}`);
      failed++;
    }
  }

  console.log(`\nDone. Uploaded: ${uploaded}, skipped: ${skipped}, failed: ${failed}`);
  await mongoose.disconnect();
}

async function main() {
  if (approvedIndex >= 0) {
    const approvedPath = path.resolve(args[approvedIndex + 1]);
    if (!fs.existsSync(approvedPath)) {
      console.error('File not found:', approvedPath);
      process.exit(1);
    }
    await executeApproved(approvedPath);
    return;
  }

  if (dirIndex < 0 || outIndex < 0) {
    console.error(`Usage:
  node scripts/suggestArtistDurationMatches.js --dir "/path/to/iTunes Media" --out scripts/pending-approvals.csv
  node scripts/suggestArtistDurationMatches.js --execute-approved scripts/pending-approvals.csv --user-id ID`);
    process.exit(1);
  }

  const rootDir = path.resolve(args[dirIndex + 1]);
  const outPath = path.resolve(args[outIndex + 1]);
  await generateSuggestions(rootDir, outPath);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
