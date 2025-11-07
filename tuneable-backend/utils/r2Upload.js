const { S3Client } = require('@aws-sdk/client-s3');
const multer = require('multer');
const multerS3 = require('multer-s3');
const path = require('path');

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
  if (process.env.R2_PUBLIC_URL) {
    return `${process.env.R2_PUBLIC_URL}/${key}`;
  }
  // Fallback to local path if R2 not configured
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

// Create multer upload for profile pictures
const createProfilePictureUpload = () => {
  if (isR2Configured()) {
    return multer({
      storage: multerS3({
        s3: s3Client,
        bucket: process.env.R2_BUCKET_NAME,
        acl: 'public-read',
        contentType: multerS3.AUTO_CONTENT_TYPE,
        key: function (req, file, cb) {
          const userId = req.user?.userId || req.user?._id || 'user';
          const timestamp = Date.now();
          const filename = `profile-pictures/${userId}-${timestamp}${path.extname(file.originalname)}`;
          cb(null, filename);
        }
      }),
      limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
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
      limits: { fileSize: 5 * 1024 * 1024 },
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
          // Explicitly set audio/mpeg for MP3 files
          cb(null, 'audio/mpeg');
        },
        metadata: function (req, file, cb) {
          cb(null, {
            'Content-Disposition': 'inline', // Enable streaming in browser
            'Cache-Control': 'public, max-age=31536000', // Cache for 1 year
          });
        },
        key: function (req, file, cb) {
          const username = req.user?.username || 'unknown';
          const timestamp = Date.now();
          const safeFilename = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
          const filename = `media-uploads/${username}-${timestamp}-${safeFilename}`;
          cb(null, filename);
        }
      }),
      limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max
      fileFilter: (req, file, cb) => {
        // Only MP3 files for MVP
        const allowedTypes = /mp3/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = file.mimetype === 'audio/mpeg' || file.mimetype === 'audio/mp3';
        
        if (mimetype && extname) {
          return cb(null, true);
        } else {
          cb(new Error('Only MP3 files are allowed for MVP'));
        }
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
          const username = req.user?.username || 'unknown';
          const timestamp = Date.now();
          const safeFilename = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
          cb(null, `${username}-${timestamp}-${safeFilename}`);
        }
      }),
      limits: { fileSize: 50 * 1024 * 1024 },
      fileFilter: (req, file, cb) => {
        const allowedTypes = /mp3/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = file.mimetype === 'audio/mpeg' || file.mimetype === 'audio/mp3';
        
        if (mimetype && extname) {
          return cb(null, true);
        } else {
          cb(new Error('Only MP3 files are allowed for MVP'));
        }
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
          const timestamp = Date.now();
          const filename = `cover-art/cover-${timestamp}${path.extname(file.originalname)}`;
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
          const timestamp = Date.now();
          cb(null, `cover-${timestamp}${path.extname(file.originalname)}`);
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

// Create multer upload for label profile pictures
const createLabelProfilePictureUpload = () => {
  if (!isR2Configured()) {
    throw new Error('R2 storage is required for label profile picture uploads');
  }

  return multer({
    storage: multerS3({
      s3: s3Client,
      bucket: process.env.R2_BUCKET_NAME,
      acl: 'public-read',
      contentType: multerS3.AUTO_CONTENT_TYPE,
      key: function (req, file, cb) {
        // For label creation, use user ID (will be updated after label creation if needed)
        // For label update, use the label ID from params
        const labelId = req.params?.id || req.body?.labelId || req.user?._id?.toString() || req.user?.id?.toString() || Date.now().toString();
        const timestamp = Date.now();
        const filename = `label-logos/${labelId}-${timestamp}${path.extname(file.originalname)}`;
        cb(null, filename);
      }
    }),
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
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
  createLabelProfilePictureUpload
};

