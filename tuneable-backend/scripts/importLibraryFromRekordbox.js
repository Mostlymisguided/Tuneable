#!/usr/bin/env node
/**
 * Import MP3s from Rekordbox XML playlists into Tuneable.
 *
 * Shared implementation: services/rekordboxPlaylistIngestService.js
 * (same path the admin web UI uses).
 *
 * - Matches existing catalog entries and attaches MP3 (pending rights)
 * - Creates new Media records for unmatched tracks (--create-unmatched, default on)
 * - Optionally mirrors Rekordbox playlists as private Tuneable parties
 *
 * List playlists:
 *   node scripts/importLibraryFromRekordbox.js --xml /path/to/rekordbox.xml --list-playlists
 *
 * Dry run:
 *   node scripts/importLibraryFromRekordbox.js \
 *     --xml /path/to/rekordbox.xml \
 *     --playlists "House Favorites,Warm Up" \
 *     --dry-run
 *
 * Execute:
 *   node scripts/importLibraryFromRekordbox.js \
 *     --xml /path/to/rekordbox.xml \
 *     --playlists "House Favorites" \
 *     --execute \
 *     --user-id YOUR_OBJECT_ID \
 *     [--party-location "London, UK"] \
 *     [--limit 50] \
 *     [--no-create-parties]
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');

const { listPlaylistsFromContent } = require('./lib/rekordboxXml');
const { runPlaylistIngest } = require('../services/rekordboxPlaylistIngestService');

const args = process.argv.slice(2);

function argValue(flag) {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : null;
}

const xmlPath = argValue('--xml');
const playlistsArg = argValue('--playlists');
const dryRun = args.includes('--dry-run');
const execute = args.includes('--execute');
const listOnly = args.includes('--list-playlists');
const userIdArg = argValue('--user-id') || process.env.BULK_UPLOAD_USER_ID || null;
const limit = argValue('--limit') ? parseInt(argValue('--limit'), 10) : null;
const partyLocation = argValue('--party-location') || 'Library Import';
const createUnmatched = !args.includes('--no-create-unmatched');
const createParties = !args.includes('--no-create-parties');
const minBitrate = argValue('--min-bitrate') ? parseInt(argValue('--min-bitrate'), 10) : 0;
const musicRootArg = argValue('--music-root') || process.env.REKORDBOX_MUSIC_ROOT || null;

if (!xmlPath) {
  console.error(`Usage: node importLibraryFromRekordbox.js --xml /path/to/export.xml [options]

Options:
  --list-playlists              List playlist names and exit
  --playlists "A,B"             Comma-separated playlist names (match name or full path)
  --dry-run                     Preview without changes
  --execute                     Run import (requires --user-id)
  --user-id OBJECTID            Importing user
  --limit N                     Max tracks to process
  --party-location "City"       Location for created parties
  --min-bitrate N               Reject tracks below N kbps (e.g. 320)
  --music-root /path            If XML Location paths are missing, match MP3s by filename under this folder
  --no-create-unmatched         Skip creating new Media for unmatched files
  --no-create-parties           Skip creating Tuneable parties from playlists
`);
  process.exit(1);
}

if (!fs.existsSync(xmlPath)) {
  console.error('XML file not found:', xmlPath);
  process.exit(1);
}

if (!listOnly && !dryRun && !execute) {
  console.error('Specify --dry-run, --execute, or --list-playlists');
  process.exit(1);
}

if (execute && !userIdArg) {
  console.error('--execute requires --user-id (or BULK_UPLOAD_USER_ID env)');
  process.exit(1);
}

if (!listOnly && !playlistsArg) {
  console.error('--playlists is required (comma-separated names). Use --list-playlists to discover names.');
  process.exit(1);
}

function formatItem(item) {
  const fileLabel = item.filePath ? path.basename(item.filePath) : item.title;
  const label = `"${item.title || fileLabel}" by ${item.artist || '?'}`;
  if (item.action === 'attach') {
    return `  MATCH [${item.matchType}] ${fileLabel} → catalog ${label}`;
  }
  if (item.action === 'create') {
    return `  NEW  ${fileLabel} → ${label}`;
  }
  const reason = item.skipReason ? ` (${item.skipReason})` : '';
  return `  SKIP${reason} ${fileLabel} — ${label}`;
}

async function main() {
  const xmlContent = fs.readFileSync(xmlPath, 'utf8');

  if (listOnly) {
    const playlists = await listPlaylistsFromContent(xmlContent);
    console.log(`\nRekordbox playlists (${playlists.length}):\n`);
    for (const p of playlists) {
      const missing = p.missingFiles > 0 ? ` (${p.missingFiles} missing files)` : '';
      const local = p.localFiles > 0 ? `, ${p.localFiles} local` : '';
      console.log(`  ${p.fullPath} — ${p.trackCount} tracks${local}${missing}`);
    }
    return;
  }

  const playlistNames = playlistsArg.split(',').map((s) => s.trim()).filter(Boolean);

  const mongoURI = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/tuneable';
  await mongoose.connect(mongoURI);
  console.log('Connected to MongoDB\n');

  console.log(`XML: ${xmlPath}`);
  console.log(`Playlists: ${playlistNames.join(', ')}`);
  if (minBitrate > 0) {
    console.log(`Bitrate gate: rejecting tracks below ${minBitrate}kbps`);
  }
  console.log('');

  const result = await runPlaylistIngest(xmlContent, {
    playlists: playlistNames,
    userId: execute ? userIdArg : null,
    dryRun: !execute,
    limit,
    minBitrate,
    createUnmatched,
    createParties,
    partyLocation,
    musicRoot: musicRootArg,
    onItem: (item) => console.log(formatItem(item)),
  });

  console.log(`\nPlaylists matched: ${result.playlists.map((p) => p.fullPath).join(', ') || '(none)'}`);
  console.log('\n--- Summary ---');
  console.log(`Tracks in playlists: ${result.summary.total}`);
  console.log(`Attach to catalog:   ${result.summary.attach}`);
  console.log(`Create new media:    ${result.summary.create}`);
  console.log(`Skipped:             ${result.summary.skip}`);
  if (result.summary.lowBitrate > 0) {
    console.log(`Rejected < ${minBitrate}kbps:   ${result.summary.lowBitrate}`);
  }
  if (result.dryRun) {
    console.log('(dry run — no changes made)');
  }
  if (result.results) {
    console.log(`Attached to catalog: ${result.results.attached}`);
    console.log(`New media created:   ${result.results.created}`);
    console.log(`Skipped on execute:  ${result.results.skipped}`);
    console.log(`Party entries added: ${result.results.partyAdds}`);
    console.log(`Errors:              ${result.results.failed}`);
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
