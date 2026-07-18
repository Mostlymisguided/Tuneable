const fs = require('fs');
const path = require('path');
const {
  attachWithPendingRights,
  createMediaWithPendingRights,
} = require('./libraryImport');
const { buildReadableAudioKey } = require('../../utils/readableUploadKey');

async function uploadToR2(filePath, media, username) {
  const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
  const { getPublicUrl } = require('../../utils/r2Upload');
  const buffer = fs.readFileSync(filePath);
  const audioKey = buildReadableAudioKey({
    title: media.title,
    artist: media.artist,
    ext: path.extname(filePath) || '.mp3',
    uuid: media.uuid,
    fallbackBasename: path.basename(filePath, path.extname(filePath)),
  });

  const s3Client = new S3Client({
    region: 'auto',
    endpoint: process.env.R2_ENDPOINT,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  });

  await s3Client.send(new PutObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME,
    Key: audioKey,
    Body: buffer,
    ContentType: 'audio/mpeg',
    ACL: 'public-read',
    CacheControl: 'public, max-age=31536000',
  }));

  return getPublicUrl(audioKey);
}

/**
 * Attach local MP3 to existing media.
 * Default: pending rights (playable, tips in escrow). Pass pendingRights: false for legacy cleared-rights attach.
 */
async function attachToMedia(media, filePath, user, options = {}) {
  const { pendingRights = true, rekordboxMeta = null, importSource = 'library_import' } = options;

  if (pendingRights) {
    return attachWithPendingRights(media, filePath, user, { rekordboxMeta, importSource });
  }

  const Media = require('../../models/Media');
  const MetadataExtractor = require('../../utils/metadataExtractor');
  const fileUrl = await uploadToR2(filePath, media, user.username);

  const doc = await Media.findById(media._id);
  if (!doc) throw new Error('Media not found on save');

  if (doc.sources?.get?.('upload') || doc.sources?.upload) {
    return { skipped: true, reason: 'already has upload' };
  }

  if (!doc.sources || typeof doc.sources.set !== 'function') {
    doc.sources = new Map(Object.entries(doc.sources || {}));
  }
  doc.sources.set('upload', fileUrl);
  doc.rightsCleared = true;
  doc.rightsStatus = 'cleared';
  doc.rightsConfirmedBy = user._id;
  doc.rightsConfirmedAt = new Date();
  if (!doc.mediaType?.includes('mp3')) {
    doc.mediaType = [...(doc.mediaType || []), 'mp3'];
  }

  const userId = user._id;
  const hasOwner = doc.mediaOwners?.some((o) => o.userId?.toString() === userId.toString());
  if (!hasOwner) {
    doc.mediaOwners = doc.mediaOwners || [];
    doc.mediaOwners.push({
      userId,
      percentage: 100,
      role: 'creator',
      verified: true,
      verifiedAt: new Date(),
      verifiedBy: userId,
      verificationMethod: 'bulk_library_import',
      verificationNotes: 'Attached from local library (manual approval)',
      verificationSource: 'manual_approval',
      addedBy: userId,
      addedAt: new Date(),
      lastUpdatedAt: new Date(),
      lastUpdatedBy: userId,
    });
  }

  try {
    const buffer = fs.readFileSync(filePath);
    const extracted = await MetadataExtractor.extractFromBuffer(buffer, path.basename(filePath));
    if (extracted?.duration && !doc.duration) {
      doc.duration = extracted.duration;
    }
  } catch {
    // optional
  }

  await doc.save();
  return { skipped: false, fileUrl };
}

module.exports = {
  uploadToR2,
  attachToMedia,
  createMediaWithPendingRights,
};
