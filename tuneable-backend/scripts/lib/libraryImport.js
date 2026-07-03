const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const mongoose = require('mongoose');

const MetadataExtractor = require('../../utils/metadataExtractor');
const { uploadToR2 } = require('./attachUpload');

const PENDING_RIGHTS_NOTES =
  'Library import — rights pending artist claim. Tips held in escrow until verified.';

function ensureSourcesMap(doc) {
  if (!doc.sources || typeof doc.sources.set !== 'function') {
    doc.sources = new Map(Object.entries(doc.sources || {}));
  }
}

function ensureCuratorContributor(doc, userId, source = 'library_import') {
  const hasCurator = doc.mediaOwners?.some((o) => o.userId?.toString() === userId.toString());
  if (!hasCurator) {
    doc.mediaOwners = doc.mediaOwners || [];
    doc.mediaOwners.push({
      userId,
      percentage: 0,
      role: 'aux',
      verified: false,
      verifiedAt: null,
      verifiedBy: null,
      verificationMethod: 'library_import_curator',
      verificationNotes: PENDING_RIGHTS_NOTES,
      verificationSource: source,
      addedBy: userId,
      addedAt: new Date(),
      lastUpdatedAt: new Date(),
      lastUpdatedBy: userId,
    });
  }
}

function applyPendingRights(doc, userId, importSource = 'library_import') {
  doc.rightsCleared = false;
  doc.rightsStatus = 'pending';
  doc.rightsConfirmedBy = userId;
  doc.rightsConfirmedAt = new Date();
  doc.importSource = importSource;
  doc.importedBy = userId;
  ensureCuratorContributor(doc, userId, importSource);
}

function mergeMetadata(doc, { id3, rekordbox, extracted }) {
  const ex = extracted || {};
  const rb = rekordbox || {};
  const tags = id3 || {};

  if (!doc.duration) {
    doc.duration = ex.duration || rb.totalTime || tags.duration || doc.duration;
  }
  if (!doc.bpm) {
    doc.bpm = rb.bpm || ex.bpm || tags.bpm || null;
  }
  if (!doc.key) {
    doc.key = rb.key || ex.key || tags.key || null;
  }
  if (!doc.album && (ex.album || rb.album)) {
    doc.album = ex.album || rb.album;
  }
  if (rb.genre && (!doc.genres || doc.genres.length === 0)) {
    doc.genres = [rb.genre];
  } else if (ex.genre && (!doc.genres || doc.genres.length === 0)) {
    doc.genres = Array.isArray(ex.genre) ? ex.genre : [ex.genre];
  }
  if (!doc.isrc && ex.isrc) doc.isrc = ex.isrc;
  if (!doc.bitrate && (ex.bitrate || rb.bitrate)) doc.bitrate = ex.bitrate || rb.bitrate;
  if (!doc.sampleRate && (ex.sampleRate || rb.sampleRate)) {
    doc.sampleRate = ex.sampleRate || rb.sampleRate;
  }
  if (rb.year && !doc.releaseDate) {
    doc.releaseDate = new Date(rb.year, 0, 1);
  } else if (ex.year && !doc.releaseDate) {
    doc.releaseDate = new Date(ex.year, 0, 1);
  }
  if (rb.comments && !doc.description) {
    doc.description = rb.comments;
  }
  if (rb.label && (!doc.label || doc.label.length === 0)) {
    doc.label = [{ name: rb.label, labelId: null, verified: false }];
  }
}

function parseArtistNames(artistStr) {
  if (!artistStr) return [{ name: 'Unknown Artist', userId: null, verified: false }];
  const parts = artistStr.split(/\s*(?:,|&| feat\.?| ft\.?| x | and | with )\s*/i).filter(Boolean);
  return parts.map((name, i) => ({
    name: name.trim(),
    userId: null,
    verified: false,
    relationToNext: i < parts.length - 1 ? ',' : null,
  }));
}

/**
 * Attach MP3 to existing catalog media with pending rights (playable, escrow tips).
 */
async function attachWithPendingRights(media, filePath, user, options = {}) {
  const Media = require('../../models/Media');
  const { rekordboxMeta = null, importSource = 'library_import' } = options;

  const fileUrl = await uploadToR2(filePath, media, user.username);
  const doc = await Media.findById(media._id);
  if (!doc) throw new Error('Media not found on save');

  if (doc.sources?.get?.('upload') || doc.sources?.upload) {
    return { skipped: true, reason: 'already has upload', mediaId: doc._id };
  }

  ensureSourcesMap(doc);
  doc.sources.set('upload', fileUrl);
  if (!doc.mediaType?.includes('mp3')) {
    doc.mediaType = [...(doc.mediaType || []), 'mp3'];
  }

  applyPendingRights(doc, user._id, importSource);

  try {
    const buffer = fs.readFileSync(filePath);
    const extracted = await MetadataExtractor.extractFromBuffer(buffer, path.basename(filePath));
    const id3 = await require('./catalogMatch').readId3(filePath);
    mergeMetadata(doc, { id3, rekordbox: rekordboxMeta, extracted });

    if (extracted?.artwork?.length && !doc.coverArt) {
      const coverUrl = await MetadataExtractor.processArtwork(extracted.artwork, doc._id.toString());
      if (coverUrl) doc.coverArt = coverUrl;
    }
  } catch {
    // optional metadata enrichment
  }

  if (rekordboxMeta?.trackId) {
    if (!doc.externalIds || typeof doc.externalIds.set !== 'function') {
      doc.externalIds = new Map(Object.entries(doc.externalIds || {}));
    }
    doc.externalIds.set('rekordbox', String(rekordboxMeta.trackId));
  }

  await doc.save();
  return { skipped: false, fileUrl, mediaId: doc._id, uuid: doc.uuid };
}

/**
 * Create a new Media record from a local MP3 with pending rights.
 */
async function createMediaWithPendingRights(filePath, user, options = {}) {
  const Media = require('../../models/Media');
  const { rekordboxMeta = null, importSource = 'library_import', guess = null } = options;

  const buffer = fs.readFileSync(filePath);
  const extracted = await MetadataExtractor.extractFromBuffer(buffer, path.basename(filePath));
  const id3 = await require('./catalogMatch').readId3(filePath);
  const rb = rekordboxMeta || {};

  const title = guess?.title || extracted.title || rb.name || path.basename(filePath, path.extname(filePath));
  const artistStr = guess?.artist || extracted.artist || rb.artist || 'Unknown Artist';

  const existing = await Media.findOne({
    title,
    'artist.name': parseArtistNames(artistStr)[0]?.name,
    'sources.upload': { $exists: true, $ne: null },
  });
  if (existing) {
    return { skipped: true, reason: 'duplicate title+artist with upload', mediaId: existing._id };
  }

  const media = new Media({
    title,
    artist: parseArtistNames(artistStr),
    album: extracted.album || rb.album || null,
    duration: extracted.duration || rb.totalTime || id3.duration || null,
    bpm: rb.bpm || extracted.bpm || id3.bpm || null,
    key: rb.key || extracted.key || id3.key || null,
    isrc: extracted.isrc || null,
    genres: rb.genre ? [rb.genre] : (extracted.genre ? (Array.isArray(extracted.genre) ? extracted.genre : [extracted.genre]) : []),
    explicit: extracted.explicit || false,
    bitrate: extracted.bitrate || rb.bitrate || null,
    sampleRate: extracted.sampleRate || rb.sampleRate || null,
    description: rb.comments || '',
    contentType: ['music'],
    contentForm: ['tune'],
    mediaType: ['mp3'],
    fileSize: buffer.length,
    category: 'music',
    addedBy: user._id,
    uploadedAt: new Date(),
    rightsCleared: false,
    rightsStatus: 'pending',
    rightsConfirmedBy: user._id,
    rightsConfirmedAt: new Date(),
    importSource,
    importedBy: user._id,
    mediaOwners: [{
      userId: user._id,
      percentage: 0,
      role: 'aux',
      verified: false,
      verificationMethod: 'library_import_curator',
      verificationNotes: PENDING_RIGHTS_NOTES,
      verificationSource: importSource,
      addedBy: user._id,
      addedAt: new Date(),
      lastUpdatedAt: new Date(),
      lastUpdatedBy: user._id,
    }],
    sources: {},
    externalIds: rb.trackId ? { rekordbox: String(rb.trackId) } : {},
  });

  if (rb.year) media.releaseDate = new Date(rb.year, 0, 1);
  if (rb.label) media.label = [{ name: rb.label, labelId: null, verified: false }];

  await media.save();

  const fileUrl = await uploadToR2(filePath, media, user.username);
  ensureSourcesMap(media);
  media.sources.set('upload', fileUrl);
  await media.save();

  if (extracted?.artwork?.length) {
    const coverUrl = await MetadataExtractor.processArtwork(extracted.artwork, media._id.toString());
    if (coverUrl) {
      media.coverArt = coverUrl;
      await media.save();
    }
  }

  return { skipped: false, created: true, fileUrl, mediaId: media._id, uuid: media.uuid };
}

function deriveCodeFromPartyId(objectId) {
  return crypto.createHash('sha256').update(objectId.toString()).digest('hex').slice(0, 8).toUpperCase();
}

/**
 * Find or create a private party for a Rekordbox playlist and add media (no bids).
 */
async function addMediaToPlaylistParty({ playlistName, mediaId, user, location = 'Library Import' }) {
  const Party = require('../../models/Party');
  const partyName = playlistName.length > 100 ? playlistName.slice(0, 97) + '...' : playlistName;

  let party = await Party.findOne({
    host: user._id,
    description: { $regex: `Rekordbox playlist: ${playlistName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}` },
  });

  if (!party) {
    party = await Party.findOne({ host: user._id, name: partyName });
  }

  if (!party) {
    const objectId = new mongoose.Types.ObjectId();
    party = new Party({
      _id: objectId,
      name: partyName,
      host: user._id,
      partyCode: deriveCodeFromPartyId(objectId),
      location,
      partiers: [user._id],
      mediaSource: 'mixed',
      privacy: 'private',
      type: 'remote',
      status: 'active',
      description: `Imported from Rekordbox playlist: ${playlistName}`,
      tags: ['rekordbox-import', 'library'],
      media: [],
    });
    await party.save();
  }

  const exists = party.media?.some((m) => m.mediaId?.toString() === mediaId.toString());
  if (exists) return { party, added: false };

  party.media.push({
    mediaId,
    addedBy: user._id,
    partyBids: [],
    status: 'active',
    queuedAt: new Date(),
  });
  await party.save();
  return { party, added: true };
}

module.exports = {
  applyPendingRights,
  attachWithPendingRights,
  createMediaWithPendingRights,
  addMediaToPlaylistParty,
  mergeMetadata,
  PENDING_RIGHTS_NOTES,
};
