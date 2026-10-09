const { S3Client } = require('@aws-sdk/client-s3');
const multer = require('multer');
const multerS3 = require('multer-s3');
const path = require('path');
const sharp = require('sharp');
const { buildReadableAudioKey, buildReadableCoverKey } = require('./readableUploadKey');

const MB = 1024 * 1024;
const MP3_MAX_BYTES = 50 * MB;
const WAV_MAX_BYTES = 100 * MB;
/** Multer limit for audio fields; per-format caps are enforced by checkUploadAudioFile. */
const MAX_AUDIO_UPLOAD_BYTES = WAV_MAX_BYTES;

const WAV_MIMES = new Set([
  'audio/wav',
  'audio/x-wav',
  'audio/wave',
  'audio/vnd.wave',
  'audio/x-pn-wav',
]);
const FLAC_EXTS = new Set(['.flac']);
const FLAC_MIMES = new Set(['audio/flac', 'audio/x-flac']);

const FLAC_UPLOAD_COMING_SOON = 'FLAC uploads are coming soon. Please upload MP3 or WAV.';

const AUDIO_UPLOAD_FORMATS = {
  mp3: { mediaType: 'mp3', contentType: 'audio/mpeg', ext: '.mp3', maxBytes: MP3_MAX_BYTES },
  wav: { mediaType: 'wav', contentType: 'audio/wav', ext: '.wav', maxBytes: WAV_MAX_BYTES },
};

/** @returns {'mp3' | 'wav' | null} */
function detectUploadAudioFormat(file) {
  const ext = path.extname(file.originalname || '').toLowerCase();
  const mime = (file.mimetype || '').toLowerCase();
  if (ext === '.mp3' && (mime === 'audio/mpeg' || mime === 'audio/mp3')) return 'mp3';
  // Some pickers report WAV as octet-stream or leave the type blank.
  const wavMimeOk = WAV_MIMES.has(mime) || mime === '' || mime === 'application/octet-stream';
  if ((ext === '.wav' || ext === '.wave') && wavMimeOk) return 'wav';
  return null;
}

function getUploadAudioFormat(file) {
  const format = detectUploadAudioFormat(file);
  return format ? AUDIO_UPLOAD_FORMATS[format] : null;
}

function isFlacAudioFile(file) {
  const ext = path.extname(file.originalname || '').toLowerCase();
  const mime = (file.mimetype || '').toLowerCase();
  return FLAC_EXTS.has(ext) || FLAC_MIMES.has(mime);
}

function hasWavHeader(buffer) {
  return Boolean(
    buffer
    && buffer.length >= 12
    && buffer.toString('ascii', 0, 4) === 'RIFF'
    && buffer.toString('ascii', 8, 12) === 'WAVE'
  );
}

/** Stored profile photos are resized to this. iPhone HEIC exports often exceed it as JPEG. */
const PROFILE_IMAGE_MAX_EDGE = 1600;
const PROFILE_IMAGE_MAX_BYTES = 5 * MB;
/** Raw upload cap. Phone exports are resized down before they are stored. */
const PROFILE_IMAGE_MAX_UPLOAD_BYTES = 20 * MB;

function replaceImageExt(name, ext) {
  const base = path.basename(name || 'profile', path.extname(name || ''));
  return `${base}${ext}`;
}

/**
 * Resize phone photos and convert HEIC to JPEG.
 * Returns null when the image is already small enough to store as-is.
 * @param {Buffer} buffer
 * @param {string} originalname
 * @returns {Promise<{ buffer: Buffer, mimetype: string, originalname: string } | null>}
 */
async function normalizeProfileImage(buffer, originalname) {
  let meta;
  try {
    meta = await sharp(buffer, { failOn: 'none', animated: false }).metadata();
  } catch (error) {
    console.error('Profile image read error:', error);
    throw new Error('Failed to process image. Please try a different photo.');
  }

  const format = (meta.format || '').toLowerCase();
  const width = meta.width || 0;
  const height = meta.height || 0;
  const isHeif = format === 'heif' || format === 'heic';
  const oversized =
    buffer.length > PROFILE_IMAGE_MAX_BYTES ||
    width > PROFILE_IMAGE_MAX_EDGE ||
    height > PROFILE_IMAGE_MAX_EDGE;

  if (!isHeif && !oversized) return null;

  try {
    let pipeline = sharp(buffer, { failOn: 'none', animated: false }).rotate();
    if (width > PROFILE_IMAGE_MAX_EDGE || height > PROFILE_IMAGE_MAX_EDGE) {
      pipeline = pipeline.resize({
        width: PROFILE_IMAGE_MAX_EDGE,
        height: PROFILE_IMAGE_MAX_EDGE,
        fit: 'inside',
        withoutEnlargement: true,
      });
    }

    let out;
    let mimetype;
    let ext;
    if (format === 'png') {
      out = await pipeline.png({ compressionLevel: 9 }).toBuffer();
      mimetype = 'image/png';
      ext = '.png';
    } else if (format === 'webp') {
      out = await pipeline.webp({ quality: 82 }).toBuffer();
      mimetype = 'image/webp';
      ext = '.webp';
    } else {
      out = await pipeline.jpeg({ quality: 82, mozjpeg: true }).toBuffer();
      mimetype = 'image/jpeg';
      ext = '.jpg';
    }

    if (out.length > PROFILE_IMAGE_MAX_BYTES) {
      out = await sharp(out)
        .resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 72, mozjpeg: true })
        .toBuffer();
      mimetype = 'image/jpeg';
      ext = '.jpg';
    }

    return {
      buffer: out,
      mimetype,
      originalname: replaceImageExt(originalname, ext),
    };
  } catch (error) {
    console.error('Profile image normalize error:', error);
    throw new Error('Failed to process image. Please try a different photo.');
  }
}

async function applyProfileImageNormalization(file) {
  if (!file?.buffer) return;
  const normalized = await normalizeProfileImage(file.buffer, file.originalname);
  if (!normalized) return;
  file.buffer = normalized.buffer;
  file.mimetype = normalized.mimetype;
  file.originalname = normalized.originalname;
  file.size = normalized.buffer.length;
}

/** Multer fileFilter helper: MP3 or WAV; FLAC gets a coming-soon error. */
function filterUploadAudioFile(file, cb, fallbackMessage = 'Only MP3 or WAV files are allowed') {
  if (detectUploadAudioFormat(file)) {
    return cb(null, true);
  }
  if (isFlacAudioFile(file)) {
    return cb(new Error(FLAC_UPLOAD_COMING_SOON));
  }
  return cb(new Error(fallbackMessage));
}

/**
 * Post-upload check for in-memory audio: per-format size cap and WAV header.
 * @returns {{ error: string } | { format: typeof AUDIO_UPLOAD_FORMATS.mp3 }}
 */
function checkUploadAudioFile(file) {
  const format = getUploadAudioFormat(file);
  if (!format) {
    return { error: 'Only MP3 or WAV files are allowed' };
  }
  if (file.size > format.maxBytes) {
    return { error: `${format.mediaType.toUpperCase()} files must be ${format.maxBytes / MB}MB or smaller` };
  }
  if (format.mediaType === 'wav' && file.buffer && !hasWavHeader(file.buffer)) {
    return { error: 'This file is not a valid WAV file' };
  }
  return { format };
}

// Check if R2 is configured
const isR2Configured = () => {
  return !!(process.env.R2_ENDPOINT && 
            process.env.R2_ACCESS_KEY_ID && 
            process.env.R2_SECRET_ACCESS_KEY && 
            process.env.R2_BUCKET_NAME);
};

// Initialize S3 client for R2
let s3Client = null;

if (isR2Configured()) {
  s3Client = new S3Client({
    region: 'auto',
    endpoint: process.env.R2_ENDPOINT,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  });
  console.log('✅ R2 storage configured');
} else {
  console.warn('⚠️ R2 not configured - using local filesystem for uploads');
}

// Get public URL for uploaded file
const getPublicUrl = (key) => {
  if (!key) {
    console.error('❌ getPublicUrl called with empty/null key');
    throw new Error('File key is required to generate public URL');
  }
  
  // If R2 is configured, try to use R2_PUBLIC_URL
  if (isR2Configured()) {
    if (process.env.R2_PUBLIC_URL) {
      // Remove leading slash from key if present to avoid double slashes
      const cleanKey = key.startsWith('/') ? key.slice(1) : key;
      // Remove trailing slash from R2_PUBLIC_URL if present
      const baseUrl = process.env.R2_PUBLIC_URL.replace(/\/$/, '');
      const fullUrl = `${baseUrl}/${cleanKey}`;
      console.log(`🔗 Generated public URL: ${fullUrl} (from key: ${key})`);
      return fullUrl;
    } else {
      // R2 is configured but R2_PUBLIC_URL is not set
      // Construct fallback URL using R2 endpoint (not ideal, but allows uploads to work)
      console.warn('⚠️ R2_PUBLIC_URL is not set but R2 is configured! Using fallback URL construction.');
      const cleanKey = key.startsWith('/') ? key.slice(1) : key;
      const endpoint = process.env.R2_ENDPOINT || '';
      const bucketName = process.env.R2_BUCKET_NAME || '';
      
      // Try to construct a public URL from the endpoint
      // R2_ENDPOINT format: https://<account-id>.r2.cloudflarestorage.com
      // R2 public URLs can be: https://<account-id>.r2.cloudflarestorage.com/<bucket-name>/<key>
      if (endpoint && bucketName) {
        try {
          // Remove trailing slash from endpoint if present
          const cleanEndpoint = endpoint.replace(/\/$/, '');
          // Construct R2 public URL: endpoint/bucket/key
          const fallbackUrl = `${cleanEndpoint}/${bucketName}/${cleanKey}`;
          console.warn(`⚠️ Using fallback R2 URL: ${fallbackUrl}`);
          console.warn(`⚠️ NOTE: R2_PUBLIC_URL should be set in production for proper custom domain URLs`);
          return fallbackUrl;
        } catch (error) {
          console.error('❌ Error constructing fallback URL:', error);
          // Last resort: return path-based URL
          const fallbackUrl = `/uploads/${cleanKey}`;
          console.warn(`⚠️ Using path-based fallback URL: ${fallbackUrl}`);
          return fallbackUrl;
        }
      } else {
        // Last resort: return path-based URL
        const fallbackUrl = `/uploads/${cleanKey}`;
        console.warn(`⚠️ Using path-based fallback URL: ${fallbackUrl} (R2_PUBLIC_URL should be set for proper URLs)`);
        return fallbackUrl;
      }
    }
  }
  
  // Fallback to local path if R2 not configured (development only)
  console.warn('⚠️ R2 not configured - using local path fallback');
  return `/uploads/${key}`;
};

// Create multer upload for creator applications
const createCreatorApplicationUpload = () => {
  if (isR2Configured()) {
    return multer({
      storage: multerS3({
        s3: s3Client,
        bucket: process.env.R2_BUCKET_NAME,
        acl: 'public-read',
        contentType: multerS3.AUTO_CONTENT_TYPE,
        key: function (req, file, cb) {
          const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
          const filename = `creator-applications/creator-proof-${uniqueSuffix}${path.extname(file.originalname)}`;
          cb(null, filename);
        }
      }),
      limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
      fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|pdf/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        
        if (mimetype && extname) {
          return cb(null, true);
        } else {
          cb(new Error('Only images (JPEG, PNG) and PDFs are allowed'));
        }
      }
    });
  } else {
    // Fallback to local filesystem
    const fs = require('fs');
    const localUploadDir = path.join(__dirname, '../uploads/creator-applications');
    if (!fs.existsSync(localUploadDir)) {
      fs.mkdirSync(localUploadDir, { recursive: true });
    }
    
    return multer({
      storage: multer.diskStorage({
        destination: (req, file, cb) => cb(null, localUploadDir),
        filename: (req, file, cb) => {
          const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
          cb(null, `creator-proof-${uniqueSuffix}${path.extname(file.originalname)}`);
        }
      }),
      limits: { fileSize: 10 * 1024 * 1024 },
      fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|pdf/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        
        if (mimetype && extname) {
          return cb(null, true);
        } else {
          cb(new Error('Only images (JPEG, PNG) and PDFs are allowed'));
        }
      }
    });
  }
};

// Create multer upload for claims
const createClaimUpload = () => {
  if (isR2Configured()) {
    return multer({
      storage: multerS3({
        s3: s3Client,
        bucket: process.env.R2_BUCKET_NAME,
        acl: 'public-read',
        contentType: multerS3.AUTO_CONTENT_TYPE,
        key: function (req, file, cb) {
          const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
          const filename = `claims/claim-${uniqueSuffix}${path.extname(file.originalname)}`;
          cb(null, filename);
        }
      }),
      limits: { fileSize: 10 * 1024 * 1024 },
      fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|pdf/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        
        if (mimetype && extname) {
          return cb(null, true);
        } else {
          cb(new Error('Only images (JPEG, PNG) and PDFs are allowed'));
        }
      }
    });
  } else {
    // Fallback to local filesystem
    const fs = require('fs');
    const localUploadDir = path.join(__dirname, '../uploads/claims');
    if (!fs.existsSync(localUploadDir)) {
      fs.mkdirSync(localUploadDir, { recursive: true });
    }
    
    return multer({
      storage: multer.diskStorage({
        destination: (req, file, cb) => cb(null, localUploadDir),
        filename: (req, file, cb) => {
          const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
          cb(null, `claim-${uniqueSuffix}${path.extname(file.originalname)}`);
        }
      }),
      limits: { fileSize: 10 * 1024 * 1024 },
      fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|pdf/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        
        if (mimetype && extname) {
          return cb(null, true);
        } else {
          cb(new Error('Only images (JPEG, PNG) and PDFs are allowed'));
        }
      }
    });
  }
};

/**
 * Middleware to convert HEIC images and upload to R2
 * Use after multer memory storage
 */
async function processAndUploadImage(req, res, next) {
  if (!req.file || !req.file.buffer) {
    return next();
  }

  try {
    await applyProfileImageNormalization(req.file);
    const buffer = req.file.buffer;
    const mimetype = req.file.mimetype;
    const originalname = req.file.originalname;

    // Upload to R2 if configured
    if (isR2Configured()) {
      const { PutObjectCommand } = require('@aws-sdk/client-s3');
      const userId = req.user?.userId || req.user?._id || 'user';
      const timestamp = Date.now();
      const ext = path.extname(originalname) || '.jpg';
      const key = `profile-pictures/${userId}-${timestamp}${ext}`;

      await s3Client.send(new PutObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: key,
        Body: buffer,
        ContentType: mimetype,
        ACL: 'public-read',
      }));

      // Attach the public URL to req.file
      req.file.location = getPublicUrl(key);
      req.file.key = key;
    }

    next();
  } catch (error) {
    console.error('Image processing error:', error);
    return res.status(400).json({ 
      error: error.message || 'Failed to process image'
    });
  }
}

// Create multer upload for profile pictures (using memory storage for HEIC support)
const createProfilePictureUpload = () => {
  if (isR2Configured()) {
    return multer({
      storage: multer.memoryStorage(),
      limits: { fileSize: PROFILE_IMAGE_MAX_UPLOAD_BYTES },
      fileFilter: (req, file, cb) => {
        if (!file.mimetype.startsWith('image/')) {
          return cb(new Error('Only image files are allowed'));
        }
        cb(null, true);
      }
    });
  } else {
    // Fallback to local filesystem
    const fs = require('fs');
    const localUploadDir = path.join(__dirname, '../uploads');
    if (!fs.existsSync(localUploadDir)) {
      fs.mkdirSync(localUploadDir, { recursive: true });
    }
    
    return multer({
      storage: multer.diskStorage({
        destination: (req, file, cb) => cb(null, localUploadDir),
        filename: (req, file, cb) => {
          const userId = req.user?.userId || req.user?._id || 'placeholder';
          const timestamp = Date.now();
          cb(null, `${userId}-${timestamp}-profilepic${path.extname(file.originalname)}`);
        }
      }),
      limits: { fileSize: PROFILE_IMAGE_MAX_UPLOAD_BYTES },
      fileFilter: (req, file, cb) => {
        if (!file.mimetype.startsWith('image/')) {
          return cb(new Error('Only image files are allowed'));
        }
        cb(null, true);
      }
    });
  }
};

// Create multer upload for media files (creator uploads)
const createMediaUpload = () => {
  if (isR2Configured()) {
    return multer({
      storage: multerS3({
        s3: s3Client,
        bucket: process.env.R2_BUCKET_NAME,
        acl: 'public-read',
        contentType: (req, file, cb) => {
          cb(null, getUploadAudioFormat(file)?.contentType || 'audio/mpeg');
        },
        metadata: function (req, file, cb) {
          cb(null, {
            'Content-Disposition': 'inline', // Enable streaming in browser
            'Cache-Control': 'public, max-age=31536000', // Cache for 1 year
          });
        },
        key: function (req, file, cb) {
          const title = req.body?.title;
          const artist = req.body?.artistName || req.body?.artist || req.user?.username;
          const filename = buildReadableAudioKey({
            title,
            artist,
            ext: path.extname(file.originalname) || '.mp3',
            fallbackBasename: path.basename(file.originalname, path.extname(file.originalname)),
          });
          cb(null, filename);
        }
      }),
      limits: { fileSize: MAX_AUDIO_UPLOAD_BYTES },
      fileFilter: (req, file, cb) => {
        filterUploadAudioFile(file, cb);
      }
    });
  } else {
    // Fallback to local filesystem
    const fs = require('fs');
    const localUploadDir = path.join(__dirname, '../uploads/media-uploads');
    if (!fs.existsSync(localUploadDir)) {
      fs.mkdirSync(localUploadDir, { recursive: true });
    }
    
    return multer({
      storage: multer.diskStorage({
        destination: (req, file, cb) => cb(null, localUploadDir),
        filename: (req, file, cb) => {
          const title = req.body?.title;
          const artist = req.body?.artistName || req.body?.artist || req.user?.username;
          const key = buildReadableAudioKey({
            title,
            artist,
            ext: path.extname(file.originalname) || '.mp3',
            fallbackBasename: path.basename(file.originalname, path.extname(file.originalname)),
          });
          // Local disk storage is relative to media-uploads/; strip the folder prefix
          cb(null, key.replace(/^media-uploads\//, ''));
        }
      }),
      limits: { fileSize: MAX_AUDIO_UPLOAD_BYTES },
      fileFilter: (req, file, cb) => {
        filterUploadAudioFile(file, cb);
      }
    });
  }
};

// Create multer upload for cover art files
const createCoverArtUpload = () => {
  if (isR2Configured()) {
    return multer({
      storage: multerS3({
        s3: s3Client,
        bucket: process.env.R2_BUCKET_NAME,
        acl: 'public-read',
        contentType: multerS3.AUTO_CONTENT_TYPE,
        key: function (req, file, cb) {
          const title = req.body?.title;
          const artist = req.body?.artistName || req.body?.artist;
          const filename = buildReadableCoverKey({
            title,
            artist,
            ext: path.extname(file.originalname) || '.jpg',
          });
          cb(null, filename);
        }
      }),
      limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
      fileFilter: (req, file, cb) => {
        if (!file.mimetype.startsWith('image/')) {
          return cb(new Error('Only image files are allowed for cover art'));
        }
        cb(null, true);
      }
    });
  } else {
    // Fallback to local filesystem
    const fs = require('fs');
    const localUploadDir = path.join(__dirname, '../uploads/cover-art');
    if (!fs.existsSync(localUploadDir)) {
      fs.mkdirSync(localUploadDir, { recursive: true });
    }
    
    return multer({
      storage: multer.diskStorage({
        destination: (req, file, cb) => cb(null, localUploadDir),
        filename: (req, file, cb) => {
          const title = req.body?.title;
          const artist = req.body?.artistName || req.body?.artist;
          const key = buildReadableCoverKey({
            title,
            artist,
            ext: path.extname(file.originalname) || '.jpg',
          });
          cb(null, key.replace(/^cover-art\//, ''));
        }
      }),
      limits: { fileSize: 5 * 1024 * 1024 },
      fileFilter: (req, file, cb) => {
        if (!file.mimetype.startsWith('image/')) {
          return cb(new Error('Only image files are allowed for cover art'));
        }
        cb(null, true);
      }
    });
  }
};

/**
 * Middleware to convert HEIC images and upload to R2 (for labels/collectives)
 * Use after multer memory storage
 */
async function processAndUploadLabelImage(req, res, next) {
  if (!req.file || !req.file.buffer) {
    return next();
  }

  try {
    await applyProfileImageNormalization(req.file);
    const buffer = req.file.buffer;
    const mimetype = req.file.mimetype;
    const originalname = req.file.originalname;

    // Upload to R2 if configured
    if (isR2Configured()) {
      const { PutObjectCommand } = require('@aws-sdk/client-s3');
      const labelId = req.params?.id || req.body?.labelId || req.user?._id?.toString() || req.user?.id?.toString() || Date.now().toString();
      const timestamp = Date.now();
      const ext = path.extname(originalname) || '.jpg';
      const key = `label-logos/${labelId}-${timestamp}${ext}`;

      await s3Client.send(new PutObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: key,
        Body: buffer,
        ContentType: mimetype,
        ACL: 'public-read',
      }));

      // Attach the public URL to req.file
      req.file.location = getPublicUrl(key);
      req.file.key = key;
    }

    next();
  } catch (error) {
    console.error('Label image processing error:', error);
    return res.status(400).json({ 
      error: error.message || 'Failed to process image'
    });
  }
}

// Create multer upload for label profile pictures (using memory storage for HEIC support)
const createLabelProfilePictureUpload = () => {
  if (!isR2Configured()) {
    throw new Error('R2 storage is required for label profile picture uploads');
  }

  return multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: PROFILE_IMAGE_MAX_UPLOAD_BYTES },
    fileFilter: (req, file, cb) => {
      if (!file.mimetype.startsWith('image/')) {
        return cb(new Error('Only image files are allowed'));
      }
      cb(null, true);
    }
  });
};

module.exports = {
  isR2Configured,
  getPublicUrl,
  createCreatorApplicationUpload,
  createClaimUpload,
  createProfilePictureUpload,
  createMediaUpload,
  createCoverArtUpload,
  createLabelProfilePictureUpload,
  processAndUploadImage,
  processAndUploadLabelImage,
  normalizeProfileImage,
  PROFILE_IMAGE_MAX_BYTES,
  PROFILE_IMAGE_MAX_EDGE,
  PROFILE_IMAGE_MAX_UPLOAD_BYTES,
  filterUploadAudioFile,
  getUploadAudioFormat,
  checkUploadAudioFile,
  MAX_AUDIO_UPLOAD_BYTES,
};

