#!/usr/bin/env node
/**
 * Import MP3s from Rekordbox XML playlists into Tuneable.
 *
 * - Matches existing YouTube catalog entries and attaches MP3 (pending rights)
 * - Creates new Media records for unmatched tracks (--create-unmatched, default on)
 * - Tips on pending-rights tracks go to artist escrow until claimed
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

const { listPlaylists, getTracksFromPlaylists } = require('./lib/rekordboxXml');
const { buildMediaIndexes, buildGuessFromFile, findBestCatalogMatch } = require('./lib/catalogMatch');
const {
  attachWithPendingRights,
  createMediaWithPendingRights,
  addMediaToPlaylistParty,
} = require('./lib/libraryImport');

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

async function main() {
  if (listOnly) {
    const playlists = await listPlaylists(xmlPath);
    console.log(`\nRekordbox playlists (${playlists.length}):\n`);
    for (const p of playlists) {
      const missing = p.missingFiles > 0 ? ` (${p.missingFiles} missing files)` : '';
      console.log(`  ${p.fullPath} — ${p.trackCount} tracks${missing}`);
    }
    return;
  }

  const playlistNames = playlistsArg.split(',').map((s) => s.trim()).filter(Boolean);
  const { playlists, tracks, unmatchedPlaylists } = await getTracksFromPlaylists(xmlPath, playlistNames);

  console.log(`XML: ${xmlPath}`);
  console.log(`Playlists matched: ${playlists.map((p) => p.fullPath).join(', ') || '(none)'}`);
  if (unmatchedPlaylists.length) {
    console.warn(`Playlists not found: ${unmatchedPlaylists.join(', ')}`);
  }
  console.log(`Tracks to process: ${tracks.length}`);

  const mp3Tracks = tracks.filter((t) => t.filePath?.toLowerCase().endsWith('.mp3'));
  const missing = tracks.filter((t) => !t.fileExists);
  if (missing.length) {
    console.warn(`${missing.length} track(s) reference missing files on disk`);
  }
  if (tracks.length - mp3Tracks.length > 0) {
    console.warn(`Skipping ${tracks.length - mp3Tracks.length} non-MP3 file(s)`);
  }

  const toProcess = limit ? mp3Tracks.slice(0, limit) : mp3Tracks;

  const mongoURI = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/tuneable';
  await mongoose.connect(mongoURI);
  console.log('Connected to MongoDB\n');

  const Media = require('../models/Media');

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
    console.log(`Executing as: ${user.username} (${user._id})\n`);
  }

  const catalogCandidates = await Media.find({
    contentForm: { $in: ['tune'] },
    $or: [
      { 'sources.youtube': { $exists: true, $ne: null } },
      { 'sources.upload': { $exists: false } },
      { 'sources.upload': null },
      { 'sources.upload': '' },
    ],
  }).select('title artist sources uuid _id rightsStatus');

  const youtubeOnly = catalogCandidates.filter((m) => {
    const upload = m.sources?.get?.('upload') ?? m.sources?.upload;
    return !upload;
  });

  const indexes = buildMediaIndexes(youtubeOnly);
  console.log(`YouTube-only catalog entries: ${youtubeOnly.length}\n`);

  const stats = {
    attached: 0,
    created: 0,
    skipped: 0,
    unmatched: 0,
    partyAdds: 0,
    errors: 0,
  };

  const musicRoot = path.dirname(toProcess[0]?.filePath || '/');

  for (const track of toProcess) {
    const filePath = track.filePath;
    const label = `"${track.name || path.basename(filePath)}" by ${track.artist || '?'}`;
    const { candidates } = await buildGuessFromFile(filePath, musicRoot, track);
    const match = findBestCatalogMatch(candidates, indexes);

    if (match) {
      console.log(`  MATCH [${match.matchType}] ${path.basename(filePath)} → catalog ${label}`);
      if (execute) {
        try {
          const out = await attachWithPendingRights(match.media, filePath, user, {
            rekordboxMeta: track,
            importSource: 'rekordbox',
          });
          if (out.skipped) {
            stats.skipped++;
            console.log(`    ↷ Skipped: ${out.reason}`);
          } else {
            stats.attached++;
            console.log(`    ↑ Attached (pending rights): ${out.uuid}`);
            if (createParties && track.playlistName) {
              const pr = await addMediaToPlaylistParty({
                playlistName: track.playlistName,
                mediaId: out.mediaId,
                user,
                location: partyLocation,
              });
              if (pr.added) stats.partyAdds++;
            }
          }
        } catch (err) {
          stats.errors++;
          console.error(`    ✗ Error: ${err.message}`);
        }
      }
    } else if (createUnmatched) {
      console.log(`  NEW  ${path.basename(filePath)} → ${label}`);
      if (execute) {
        try {
          const guess = candidates[0] || { title: track.name, artist: track.artist };
          const out = await createMediaWithPendingRights(filePath, user, {
            rekordboxMeta: track,
            importSource: 'rekordbox',
            guess,
          });
          if (out.skipped) {
            stats.skipped++;
            console.log(`    ↷ Skipped: ${out.reason}`);
          } else {
            stats.created++;
            console.log(`    + Created (pending rights): ${out.uuid}`);
            if (createParties && track.playlistName) {
              const pr = await addMediaToPlaylistParty({
                playlistName: track.playlistName,
                mediaId: out.mediaId,
                user,
                location: partyLocation,
              });
              if (pr.added) stats.partyAdds++;
            }
          }
        } catch (err) {
          stats.errors++;
          console.error(`    ✗ Error: ${err.message}`);
        }
      }
    } else {
      stats.unmatched++;
      console.log(`  ???  No catalog match: ${path.basename(filePath)} — ${label}`);
    }
  }

  console.log('\n--- Summary ---');
  console.log(`Tracks in playlists: ${tracks.length}`);
  console.log(`MP3 processed:       ${toProcess.length}`);
  if (dryRun) {
    console.log('(dry run — no changes made)');
  }
  if (execute) {
    console.log(`Attached to catalog: ${stats.attached}`);
    console.log(`New media created:   ${stats.created}`);
    console.log(`Skipped:             ${stats.skipped}`);
    console.log(`Unmatched (no create): ${stats.unmatched}`);
    console.log(`Party entries added: ${stats.partyAdds}`);
    console.log(`Errors:              ${stats.errors}`);
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
