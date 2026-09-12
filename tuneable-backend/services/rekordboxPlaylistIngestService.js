/**
 * Rekordbox playlist MP3 ingest — shared by CLI and admin HTTP.
 *
 * Reads Location paths from a DJ_PLAYLISTS XML export on this machine,
 * matches against the catalog, attaches MP3s to existing tunes or creates
 * new pending-rights media, and optionally mirrors the playlist as a party.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const { getTracksFromPlaylistsFromContent } = require('../scripts/lib/rekordboxXml');

function emptyIndexes() {
  return {
    byTitleArtist: new Map(),
    byTitle: new Map(),
    byCoreTitleArtist: new Map(),
    byCoreTitle: new Map(),
    mediaList: [],
  };
}

function catalogMatch() {
  return require('../scripts/lib/catalogMatch');
}

function libraryImport() {
  return require('../scripts/lib/libraryImport');
}

function ingestError(message, status = 400) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function mediaHasUpload(media) {
  if (!media) return false;
  const sources = media.sources instanceof Map
    ? Object.fromEntries(media.sources)
    : (media.sources || {});
  return Boolean(sources.upload);
}

function artistLabel(media) {
  if (!media) return '';
  if (typeof media.artist === 'string') return media.artist;
  return media.artist?.[0]?.name || '';
}

function isMp3Path(filePath) {
  return Boolean(filePath && String(filePath).toLowerCase().endsWith('.mp3'));
}

function buildBasenameIndex(musicRoot) {
  if (!musicRoot || typeof musicRoot !== 'string') return null;
  const root = path.resolve(musicRoot.trim());
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) return null;
  const { walkMp3Files } = require('../scripts/lib/matchUtils');
  const index = new Map();
  for (const full of walkMp3Files(root)) {
    const key = path.basename(full).toLowerCase();
    if (!index.has(key)) index.set(key, full);
  }
  return index;
}

function remapTrackPath(track, basenameIndex) {
  if (!track?.filePath) return track;
  if (track.fileExists || fs.existsSync(track.filePath)) {
    return { ...track, fileExists: true };
  }
  if (!basenameIndex) return track;
  const hit = basenameIndex.get(path.basename(track.filePath).toLowerCase());
  if (!hit) return track;
  return { ...track, filePath: hit, fileExists: true, pathRemapped: true };
}

function isSafeLocalMp3Path(filePath) {
  if (!filePath || typeof filePath !== 'string') return false;
  if (filePath.includes('\0')) return false;
  const resolved = path.resolve(filePath);
  if (!resolved.toLowerCase().endsWith('.mp3')) return false;
  try {
    return fs.existsSync(resolved) && fs.statSync(resolved).isFile();
  } catch {
    return false;
  }
}

function trackKey(track, index = 0) {
  return String(track.trackId || track.filePath || `${track.title || track.name || 'track'}-${index}`);
}

function bitrateKbps(track, id3 = null) {
  if (Number.isFinite(Number(track?.bitrate)) && Number(track.bitrate) > 0) {
    return Number(track.bitrate);
  }
  if (Number.isFinite(Number(id3?.bitrate)) && Number(id3.bitrate) > 0) {
    return Number(id3.bitrate);
  }
  return null;
}

function classifyLocalFile(track, { minBitrate = 0 } = {}) {
  if (!track.filePath || !isMp3Path(track.filePath)) {
    if (track.filePath && !isMp3Path(track.filePath)) {
      return { action: 'skip', skipReason: 'not_mp3' };
    }
    return { action: 'skip', skipReason: 'missing_file' };
  }
  if (!track.fileExists && !fs.existsSync(track.filePath)) {
    return { action: 'skip', skipReason: 'missing_file' };
  }
  const kbps = bitrateKbps(track);
  if (minBitrate > 0 && kbps != null && kbps < minBitrate) {
    return { action: 'skip', skipReason: 'low_bitrate', bitrate: kbps };
  }
  return { action: 'pending', bitrate: kbps };
}

function serializeItem(base) {
  return {
    key: base.key,
    trackId: base.trackId || null,
    title: base.title || '',
    artist: base.artist || '',
    album: base.album || null,
    genre: base.genre || null,
    bpm: base.bpm || null,
    keySignature: base.keySignature || null,
    duration: base.duration || null,
    year: base.year || null,
    bitrate: base.bitrate || null,
    filePath: base.filePath || null,
    fileExists: Boolean(base.fileExists),
    needsUpload: Boolean(base.needsUpload),
    playlistName: base.playlistName || null,
    playlistPath: base.playlistPath || null,
    action: base.action,
    skipReason: base.skipReason || null,
    matchType: base.matchType || null,
    mediaId: base.mediaId ? String(base.mediaId) : null,
    mediaUuid: base.mediaUuid || null,
    catalogTitle: base.catalogTitle || null,
    catalogArtist: base.catalogArtist || null,
    selected: Boolean(base.selected),
  };
}

function itemFromTrack(track, index, extras = {}) {
  return serializeItem({
    key: trackKey(track, index),
    trackId: track.trackId ? String(track.trackId) : null,
    title: (track.title || track.name || '').trim(),
    artist: (track.artist || '').trim(),
    album: track.album || null,
    genre: track.genre || null,
    bpm: track.bpm || null,
    keySignature: track.key || null,
    duration: track.duration || track.totalTime || null,
    year: track.year || null,
    bitrate: extras.bitrate || bitrateKbps(track) || null,
    filePath: track.filePath || null,
    fileExists: Boolean(track.fileExists || (track.filePath && fs.existsSync(track.filePath))),
    playlistName: track.playlistName || null,
    playlistPath: track.playlistPath || null,
    ...extras,
  });
}

function rekordboxMetaFromItem(item) {
  return {
    trackId: item.trackId,
    name: item.title,
    title: item.title,
    artist: item.artist,
    album: item.album,
    genre: item.genre,
    bpm: item.bpm,
    key: item.keySignature || null,
    year: item.year,
    bitrate: item.bitrate,
    totalTime: item.duration,
    duration: item.duration,
    filePath: item.filePath,
    playlistName: item.playlistName,
  };
}

function itemFromCatalogMatch(track, index, match, {
  createUnmatched = true,
  bitrate = null,
  needsUpload = false,
} = {}) {
  if (match?.media) {
    if (mediaHasUpload(match.media)) {
      return itemFromTrack(track, index, {
        action: 'skip',
        skipReason: 'already_has_upload',
        matchType: match.matchType,
        mediaId: match.media._id,
        mediaUuid: match.media.uuid || null,
        catalogTitle: match.media.title,
        catalogArtist: artistLabel(match.media),
        bitrate,
        selected: false,
        needsUpload: false,
      });
    }
    return itemFromTrack(track, index, {
      action: 'attach',
      matchType: match.matchType,
      mediaId: match.media._id,
      mediaUuid: match.media.uuid || null,
      catalogTitle: match.media.title,
      catalogArtist: artistLabel(match.media),
      bitrate,
      selected: true,
      needsUpload,
    });
  }
  if (createUnmatched) {
    return itemFromTrack(track, index, {
      action: 'create',
      bitrate,
      selected: true,
      needsUpload,
    });
  }
  return itemFromTrack(track, index, {
    action: 'skip',
    skipReason: 'no_match',
    bitrate,
    selected: false,
    needsUpload: false,
  });
}

function matchFromRekordboxFields(track, catalogIndexes) {
  if (!catalogIndexes?.mediaList?.length) return null;
  const title = (track.title || track.name || '').trim();
  const artist = (track.artist || '').trim();
  if (!title || !artist) return null;
  return catalogMatch().findBestCatalogMatch(
    [{ artist, title, source: 'rekordbox' }],
    catalogIndexes,
  );
}

async function loadCatalogIndexes() {
  const Media = require('../models/Media');
  const mediaList = await Media.find({
    contentForm: { $in: ['tune'] },
    status: { $ne: 'deleted' },
    deletedAt: null,
  }).select('title artist sources uuid _id rightsStatus').lean();

  return {
    indexes: catalogMatch().buildMediaIndexes(mediaList),
    catalogSize: mediaList.length,
  };
}

/**
 * Classify playlist tracks against the catalog. Does not upload.
 */
async function buildIngestItems(tracks, {
  indexes,
  limit = null,
  minBitrate = 0,
  createUnmatched = true,
  musicRoot = null,
  onProgress,
} = {}) {
  const report = typeof onProgress === 'function' ? onProgress : () => {};
  const basenameIndex = buildBasenameIndex(musicRoot || process.env.REKORDBOX_MUSIC_ROOT);
  const remapped = (tracks || []).map((track) => remapTrackPath(track, basenameIndex));
  const capped = Number.isFinite(Number(limit)) && Number(limit) > 0
    ? remapped.slice(0, Number(limit))
    : remapped;
  const guessRoot = path.dirname(capped.find((t) => t.filePath)?.filePath || '/');
  const items = [];
  const catalogIndexes = indexes || emptyIndexes();

  for (let index = 0; index < capped.length; index += 1) {
    const track = capped[index];
    report({
      stage: 'matching',
      message: `Matching ${index + 1} of ${capped.length}…`,
      current: index + 1,
      total: capped.length,
    });

    const local = classifyLocalFile(track, { minBitrate });
    if (local.action === 'skip' && local.skipReason === 'not_mp3') {
      items.push(itemFromTrack(track, index, {
        action: 'skip',
        skipReason: 'not_mp3',
        bitrate: local.bitrate || bitrateKbps(track),
        selected: false,
      }));
      continue;
    }

    const fileMissing = local.action === 'skip' && local.skipReason === 'missing_file';
    if (fileMissing) {
      const match = matchFromRekordboxFields(track, catalogIndexes);
      items.push(itemFromCatalogMatch(track, index, match, {
        createUnmatched,
        bitrate: local.bitrate || bitrateKbps(track),
        needsUpload: true,
      }));
      continue;
    }

    if (local.action === 'skip') {
      items.push(itemFromTrack(track, index, {
        action: 'skip',
        skipReason: local.skipReason,
        bitrate: local.bitrate || bitrateKbps(track),
        selected: false,
      }));
      continue;
    }

    let id3 = null;
    let match = null;
    try {
      const guessed = await catalogMatch().buildGuessFromFile(track.filePath, guessRoot, track);
      id3 = guessed.id3;
      const kbps = bitrateKbps(track, id3);
      if (minBitrate > 0 && kbps != null && kbps < minBitrate) {
        items.push(itemFromTrack(track, index, {
          action: 'skip',
          skipReason: 'low_bitrate',
          bitrate: kbps,
          selected: false,
        }));
        continue;
      }
      match = catalogMatch().findBestCatalogMatch(guessed.candidates, catalogIndexes);
    } catch {
      match = matchFromRekordboxFields(track, catalogIndexes);
    }

    items.push(itemFromCatalogMatch(track, index, match, {
      createUnmatched,
      bitrate: bitrateKbps(track, id3),
      needsUpload: false,
    }));
  }

  return items;
}

function summarizeItems(items) {
  return {
    total: items.length,
    attach: items.filter((i) => i.action === 'attach').length,
    create: items.filter((i) => i.action === 'create').length,
    skip: items.filter((i) => i.action === 'skip').length,
    selected: items.filter((i) => i.selected).length,
    missingFiles: items.filter((i) => i.needsUpload || i.skipReason === 'missing_file').length,
    needsUpload: items.filter((i) => i.needsUpload).length,
    nonMp3: items.filter((i) => i.skipReason === 'not_mp3').length,
    lowBitrate: items.filter((i) => i.skipReason === 'low_bitrate').length,
    alreadyHasUpload: items.filter((i) => i.skipReason === 'already_has_upload').length,
  };
}

async function previewPlaylistIngest(xmlContent, {
  playlists = [],
  limit = null,
  minBitrate = 0,
  createUnmatched = true,
  musicRoot = null,
  onProgress,
} = {}) {
  const report = typeof onProgress === 'function' ? onProgress : () => {};
  if (!xmlContent) {
    throw ingestError('Rekordbox XML is required');
  }
  if (!Array.isArray(playlists) || playlists.length === 0) {
    throw ingestError('Select at least one Rekordbox playlist');
  }

  report({ stage: 'parsing', message: 'Parsing Rekordbox XML…', current: 0, total: 0 });
  const resolved = await getTracksFromPlaylistsFromContent(xmlContent, playlists);
  if (resolved.unmatchedPlaylists?.length) {
    throw ingestError(`Playlists not found: ${resolved.unmatchedPlaylists.join(', ')}`);
  }

  report({
    stage: 'catalog',
    message: 'Loading catalog for matching…',
    current: 0,
    total: resolved.tracks.length,
  });
  const { indexes, catalogSize } = await loadCatalogIndexes();

  const items = await buildIngestItems(resolved.tracks, {
    indexes,
    limit,
    minBitrate,
    createUnmatched,
    musicRoot,
    onProgress,
  });

  const summary = summarizeItems(items);
  const missingAll = summary.total > 0 && summary.missingFiles === summary.total;
  const message = missingAll
    ? `The XML listed ${summary.total} tracks but the audio is not on this API host (${os.hostname()}). Location in Rekordbox XML is a path, not the MP3. Choose the music folder on this computer (below) and we will upload matching files.`
    : summary.needsUpload
      ? `${summary.needsUpload} track(s) need MP3s from your computer. Choose the music folder below, then ingest.`
      : 'Local MP3s will be uploaded to the catalog with pending rights. Existing uploads are never overwritten.';

  return {
    source: 'rekordbox_ingest',
    playlists: resolved.playlists.map((p) => ({
      name: p.name,
      fullPath: p.fullPath,
      trackCount: p.trackCount || p.tracks?.length || 0,
    })),
    catalogSize,
    checkedOn: {
      hostname: os.hostname(),
      platform: process.platform,
    },
    musicRoot: musicRoot || process.env.REKORDBOX_MUSIC_ROOT || null,
    items,
    summary,
    message,
  };
}

async function executePlaylistIngest(userId, {
  items = [],
  createParties = true,
  partyLocation = 'Library Import',
  onProgress,
} = {}) {
  const report = typeof onProgress === 'function' ? onProgress : () => {};
  const User = require('../models/User');
  const user = await User.findById(userId);
  if (!user) {
    throw ingestError('User not found', 404);
  }
  if (!process.env.R2_ENDPOINT || !process.env.R2_BUCKET_NAME) {
    throw ingestError('R2 storage is not configured on this server', 500);
  }

  const selected = (items || []).filter((item) => (
    item.selected !== false
    && (item.action === 'attach' || item.action === 'create')
  ));
  if (!selected.length) {
    throw ingestError('No tracks selected to ingest');
  }

  const results = {
    attached: 0,
    created: 0,
    skipped: 0,
    failed: 0,
    partyAdds: 0,
    items: [],
  };

  const emit = (index, extra = {}) => {
    report({
      stage: 'uploading',
      message: extra.message || `Ingesting track ${index + 1} of ${selected.length}…`,
      current: index + 1,
      total: selected.length,
      partial: {
        attached: results.attached,
        created: results.created,
        skipped: results.skipped,
        failed: results.failed,
        partyAdds: results.partyAdds,
      },
    });
  };

  report({
    stage: 'uploading',
    message: `Ingesting track 0 of ${selected.length}…`,
    current: 0,
    total: selected.length,
    partial: {
      attached: 0,
      created: 0,
      skipped: 0,
      failed: 0,
      partyAdds: 0,
    },
  });

  for (let index = 0; index < selected.length; index += 1) {
    const item = selected[index];
    const label = `"${item.title || path.basename(item.filePath || '')}" by ${item.artist || '?'}`;

    try {
      if (!isSafeLocalMp3Path(item.filePath)) {
        results.skipped++;
        results.items.push({
          key: item.key,
          title: item.title,
          status: 'skipped',
          reason: 'missing_or_unsafe_file',
        });
        emit(index);
        continue;
      }

      const filePath = path.resolve(item.filePath);
      const meta = rekordboxMetaFromItem(item);
      let out;

      if (item.action === 'attach' && item.mediaId) {
        const Media = require('../models/Media');
        const media = await Media.findById(item.mediaId);
        if (!media) {
          results.failed++;
          results.items.push({
            key: item.key,
            title: item.title,
            status: 'failed',
            error: 'Catalog match no longer exists',
          });
          emit(index);
          continue;
        }
        out = await libraryImport().attachWithPendingRights(media, filePath, user, {
          rekordboxMeta: meta,
          importSource: 'rekordbox',
        });
      } else {
        out = await libraryImport().createMediaWithPendingRights(filePath, user, {
          rekordboxMeta: meta,
          importSource: 'rekordbox',
          guess: { title: item.title, artist: item.artist },
        });
      }

      if (out.skipped) {
        results.skipped++;
        results.items.push({
          key: item.key,
          title: item.title,
          status: 'skipped',
          reason: out.reason || 'skipped',
          mediaId: out.mediaId ? String(out.mediaId) : null,
        });
      } else {
        const created = Boolean(out.created) || item.action === 'create';
        if (created) results.created++;
        else results.attached++;

        if (createParties && item.playlistName && out.mediaId) {
          const pr = await libraryImport().addMediaToPlaylistParty({
            playlistName: item.playlistName,
            mediaId: out.mediaId,
            user,
            location: partyLocation || 'Library Import',
          });
          if (pr.added) results.partyAdds++;
        }

        results.items.push({
          key: item.key,
          title: item.title,
          status: created ? 'created' : 'attached',
          mediaId: out.mediaId ? String(out.mediaId) : null,
          uuid: out.uuid || null,
        });
      }
    } catch (err) {
      results.failed++;
      results.items.push({
        key: item.key,
        title: item.title,
        status: 'failed',
        error: err.message || 'Ingest failed',
      });
      console.error(`Rekordbox ingest failed for ${label}:`, err.message);
    }

    emit(index);
  }

  return results;
}

async function ingestUploadedAudio(userId, {
  item,
  buffer,
  originalname,
  createParties = true,
  partyLocation = 'Library Import',
} = {}) {
  if (!item || !item.action || (item.action !== 'attach' && item.action !== 'create')) {
    throw ingestError('Nothing to ingest for this track');
  }
  if (!buffer?.length) {
    throw ingestError('MP3 file is required');
  }
  const ext = path.extname(originalname || item.filePath || '.mp3').toLowerCase() || '.mp3';
  if (ext !== '.mp3') {
    throw ingestError('Only MP3 files are allowed');
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rb-ingest-'));
  const tmpFile = path.join(tmpDir, path.basename(originalname || 'track.mp3'));
  fs.writeFileSync(tmpFile, buffer);
  try {
    const results = await executePlaylistIngest(userId, {
      items: [{ ...item, selected: true, filePath: tmpFile, needsUpload: false }],
      createParties,
      partyLocation,
    });
    return results.items?.[0] || results;
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

async function runPlaylistIngest(xmlContent, {
  playlists,
  userId = null,
  dryRun = true,
  limit = null,
  minBitrate = 0,
  createUnmatched = true,
  createParties = true,
  partyLocation = 'Library Import',
  musicRoot = null,
  onProgress,
  onItem,
} = {}) {
  const preview = await previewPlaylistIngest(xmlContent, {
    playlists,
    limit,
    minBitrate,
    createUnmatched,
    musicRoot,
    onProgress,
  });

  if (typeof onItem === 'function') {
    preview.items.forEach((item) => onItem(item));
  }

  if (dryRun || !userId) {
    return { ...preview, dryRun: true };
  }

  const executed = await executePlaylistIngest(userId, {
    items: preview.items,
    createParties,
    partyLocation,
    onProgress,
  });

  return {
    ...preview,
    dryRun: false,
    results: executed,
  };
}

module.exports = {
  isSafeLocalMp3Path,
  classifyLocalFile,
  buildIngestItems,
  summarizeItems,
  previewPlaylistIngest,
  executePlaylistIngest,
  ingestUploadedAudio,
  runPlaylistIngest,
};
