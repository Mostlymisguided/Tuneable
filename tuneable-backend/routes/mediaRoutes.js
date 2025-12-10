const express = require('express');
const multer = require('multer');
const path = require('path');
const router = express.Router();
const Media = require('../models/Media');
const Comment = require('../models/Comment');
const Claim = require('../models/Claim');
const User = require('../models/User');
const authMiddleware = require('../middleware/authMiddleware');
const { isValidObjectId } = require('../utils/validators');
// const { transformResponse } = require('../utils/uuidTransform'); // Removed - using ObjectIds directly
// const { resolveId } = require('../utils/idResolver'); // Removed - using ObjectIds directly
const { createMediaUpload, createCoverArtUpload, getPublicUrl } = require('../utils/r2Upload');
const { toCreatorSubdocs } = require('../utils/creatorHelpers');
const { parseArtistString, formatCreatorDisplay } = require('../utils/artistParser');
const { getMediaCoverArt, DEFAULT_COVER_ART } = require('../utils/coverArtUtils');
const MetadataExtractor = require('../utils/metadataExtractor');
const { canUploadMedia, canEditMedia } = require('../utils/permissionHelpers');

/**
 * Capitalize the first letter of each word in a tag (title case)
 * @param {string} tag - The tag to capitalize
 * @returns {string} - The capitalized tag
 */
const capitalizeTag = (tag) => {
  if (!tag || typeof tag !== 'string') return tag;
  return tag
    .trim()
    .split(/\s+/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
};

/**
 * Extract release year from releaseDate or use provided releaseYear
 * @param {Date|string|null} releaseDate - The release date
 * @param {number|null} releaseYear - The release year (if provided directly)
 * @returns {number|null} - The release year or null
 */
const extractReleaseYear = (releaseDate, releaseYear) => {
  // If releaseYear is provided directly, use it
  if (releaseYear && typeof releaseYear === 'number' && releaseYear >= 1900 && releaseYear <= 2100) {
    return releaseYear;
  }
  
  // Otherwise, extract from releaseDate
  if (releaseDate) {
    const date = releaseDate instanceof Date ? releaseDate : new Date(releaseDate);
    if (!isNaN(date.getTime())) {
      return date.getFullYear();
    }
  }
  
  return null;
};

const toPlainUserReference = (user) => {
  if (!user) return null;

  if (typeof user === 'string') {
    return {
      _id: user,
      username: null,
      email: null,
      profilePic: null,
      uuid: null
    };
  }

  if (user instanceof Date) {
    return null;
  }

  if (typeof user === 'object' && user !== null) {
    if (user._id || user.id || user.uuid) {
      const id = user._id || user.id || user.uuid;
      return {
        _id: id && id.toString ? id.toString() : id,
        username: user.username || null,
        email: user.email || null,
        profilePic: user.profilePic || null,
        uuid: user.uuid || null
      };
    }

    if (typeof user.toString === 'function') {
      return {
        _id: user.toString(),
        username: null,
        email: null,
        profilePic: null,
        uuid: null
      };
    }
  }

  return null;
};

const buildOwnershipResponse = (media) => {
  const owners = (media.mediaOwners || []).map(owner => {
    const userRef = toPlainUserReference(owner.userId);
    const verifiedByRef = toPlainUserReference(owner.verifiedBy);
    const addedByRef = toPlainUserReference(owner.addedBy);
    const lastUpdatedByRef = toPlainUserReference(owner.lastUpdatedBy);

    return {
      userId: userRef?._id || (owner.userId && owner.userId.toString ? owner.userId.toString() : owner.userId),
      ownershipPercentage: owner.percentage,
      role: owner.role,
      verified: owner.verified,
      verifiedAt: owner.verifiedAt,
      verifiedBy: verifiedByRef,
      verificationMethod: owner.verificationMethod || null,
      verificationNotes: owner.verificationNotes || null,
      verificationSource: owner.verificationSource || null,
      addedBy: addedByRef,
      addedAt: owner.addedAt || null,
      lastUpdatedAt: owner.lastUpdatedAt || null,
      lastUpdatedBy: lastUpdatedByRef,
      owner: userRef
    };
  });

  const history = (media.ownershipHistory || []).map(entry => ({
    action: entry.action,
    timestamp: entry.timestamp,
    actor: toPlainUserReference(entry.actor),
    summary: entry.note || null,
    diff: Array.isArray(entry.diff)
      ? entry.diff.map(diffEntry => ({
          field: diffEntry.field,
          from: diffEntry.from,
          to: diffEntry.to
        }))
      : []
  }));

  return { owners, history };
};

const parseArtistsPayload = (input) => {
  if (!input) return [];
  let parsed = input;
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed);
    } catch (error) {
      console.warn('Unable to parse artists payload:', error.message);
      return [];
    }
  }
  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed
    .map(entry => {
      if (!entry) return null;
      const name = typeof entry.name === 'string' ? entry.name.trim() : '';
      if (!name) return null;
      return {
        name,
        userId: entry.userId || null,
        relationToNext: entry.relationToNext || null
      };
    })
    .filter(Boolean);
};

const LANGUAGE_NAMES = {
  en: 'English',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  it: 'Italian',
  pt: 'Portuguese',
  ru: 'Russian',
  ja: 'Japanese',
  ko: 'Korean',
  zh: 'Chinese',
  ar: 'Arabic',
  hi: 'Hindi',
  tr: 'Turkish',
  pl: 'Polish',
  nl: 'Dutch',
  sv: 'Swedish',
  no: 'Norwegian',
  da: 'Danish',
  fi: 'Finnish',
  el: 'Greek',
  he: 'Hebrew',
  th: 'Thai',
  vi: 'Vietnamese',
  id: 'Indonesian',
  ms: 'Malay',
  cs: 'Czech',
  hu: 'Hungarian',
  ro: 'Romanian',
  uk: 'Ukrainian',
  bg: 'Bulgarian',
  hr: 'Croatian',
  sr: 'Serbian',
  sk: 'Slovak',
  sl: 'Slovenian',
  et: 'Estonian',
  lv: 'Latvian',
  lt: 'Lithuanian',
  ga: 'Irish',
  cy: 'Welsh',
  mt: 'Maltese',
  sw: 'Swahili',
  af: 'Afrikaans',
  sq: 'Albanian',
  az: 'Azerbaijani',
  be: 'Belarusian',
  bn: 'Bengali',
  bs: 'Bosnian',
  ca: 'Catalan',
  eu: 'Basque',
  fa: 'Persian',
  gl: 'Galician',
  is: 'Icelandic',
  mk: 'Macedonian',
  ml: 'Malayalam',
  mr: 'Marathi',
  ne: 'Nepali',
  pa: 'Punjabi',
  si: 'Sinhala',
  ta: 'Tamil',
  te: 'Telugu',
  ur: 'Urdu',
  zu: 'Zulu'
};

const ISO3_LANGUAGE_MAP = {
  eng: 'en',
  spa: 'es', esn: 'es',
  fra: 'fr', fre: 'fr',
  deu: 'de', ger: 'de',
  ita: 'it',
  por: 'pt',
  rus: 'ru',
  jpn: 'ja',
  zho: 'zh', chi: 'zh', cmn: 'zh',
  kor: 'ko',
  ara: 'ar',
  hin: 'hi',
  tur: 'tr',
  pol: 'pl',
  nld: 'nl', dut: 'nl',
  swe: 'sv',
  nor: 'no',
  dan: 'da',
  fin: 'fi',
  ell: 'el', gre: 'el',
  heb: 'he',
  tha: 'th',
  vie: 'vi',
  ind: 'id',
  msa: 'ms', may: 'ms',
  ces: 'cs', cze: 'cs',
  hun: 'hu',
  ron: 'ro', rum: 'ro',
  ukr: 'uk',
  bul: 'bg',
  hrv: 'hr',
  srp: 'sr',
  slk: 'sk', slo: 'sk',
  slv: 'sl',
  est: 'et',
  lav: 'lv',
  lit: 'lt',
  gle: 'ga',
  cym: 'cy', wel: 'cy',
  mlt: 'mt',
  swa: 'sw',
  afr: 'af',
  alb: 'sq',
  aze: 'az',
  bel: 'be',
  ben: 'bn',
  bos: 'bs',
  cat: 'ca',
  eus: 'eu',
  fas: 'fa', per: 'fa',
  glg: 'gl',
  isl: 'is',
  mkd: 'mk',
  mal: 'ml',
  mar: 'mr',
  nep: 'ne',
  pan: 'pa',
  sin: 'si',
  tam: 'ta',
  tel: 'te',
  urd: 'ur',
  zul: 'zu'
};

const normalizeLanguageInput = (value) => {
  if (!value && value !== 0) return 'en';

  const str = value.toString().trim();
  if (!str) return 'en';

  const lower = str.toLowerCase();

  // Direct match with supported codes
  if (LANGUAGE_NAMES[lower]) {
    return lower;
  }

  // Match by language name
  for (const [code, name] of Object.entries(LANGUAGE_NAMES)) {
    if (lower === name.toLowerCase()) {
      return code;
    }
  }

  // Handle locale strings like zh-CN, en-US, etc.
  if (lower.includes('-')) {
    const base = lower.split('-')[0];
    if (LANGUAGE_NAMES[base]) {
      return base;
    }
  }

  // ISO-639-3 to code mapping (fra -> fr, zho -> zh, etc.)
  if (ISO3_LANGUAGE_MAP[lower]) {
    return ISO3_LANGUAGE_MAP[lower];
  }

  // Fallback: if already a 2-letter code, just return lowercased version
  if (lower.length === 2) {
    return lower;
  }

  // As last resort, keep original trimmed lower-case value
  return lower;
};

// Configure media upload
const mediaUpload = createMediaUpload();
const coverArtUpload = createCoverArtUpload();

// Create a custom multer configuration that handles both files
const mixedUpload = multer({
  storage: multer.memoryStorage(),
  limits: { 
    fileSize: 50 * 1024 * 1024, // 50MB max
    files: 2 // Max 2 files (audio + cover art)
  },
  fileFilter: (req, file, cb) => {
    if (file.fieldname === 'audioFile') {
      // Only MP3 files for audio
      const allowedTypes = /mp3/;
      const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
      const mimetype = file.mimetype === 'audio/mpeg' || file.mimetype === 'audio/mp3';
      
      if (mimetype && extname) {
        return cb(null, true);
      } else {
        return cb(new Error('Only MP3 files are allowed for audio'));
      }
    } else if (file.fieldname === 'coverArtFile') {
      // Only image files for cover art
      if (file.mimetype.startsWith('image/')) {
        return cb(null, true);
      } else {
        return cb(new Error('Only image files are allowed for cover art'));
      }
    } else {
      return cb(new Error('Invalid field name'));
    }
  }
});

// Multer config for cover art upload only (for update endpoint)
const coverArtUploadSingle = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      return cb(null, true);
    } else {
      return cb(new Error('Only image files are allowed for cover art'));
    }
  }
});

// @route   POST /api/media/upload
// @desc    Upload media file (MP3) - Creator/Admin only
// @access  Private (Verified creators and admins)
router.post('/upload', authMiddleware, mixedUpload.fields([
  { name: 'audioFile', maxCount: 1 },
  { name: 'coverArtFile', maxCount: 1 }
]), async (req, res) => {
  try {
    const userId = req.user._id;
    
    // Check if user is a verified creator or admin
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    if (!canUploadMedia(user)) {
      return res.status(403).json({ error: 'Only verified creators and admins can upload media' });
    }
    
    if (!req.files || !req.files.audioFile || req.files.audioFile.length === 0) {
      return res.status(400).json({ error: 'No audio file uploaded' });
    }
    
    const audioFile = req.files.audioFile[0];
    const coverArtFile = req.files.coverArtFile ? req.files.coverArtFile[0] : null;
    
    console.log(`🎵 Processing upload: ${audioFile.originalname} (${audioFile.size} bytes)`);
    if (coverArtFile) {
      console.log(`🖼️ Cover art file: ${coverArtFile.originalname} (${coverArtFile.size} bytes)`);
    }
    
    // Extract metadata from uploaded file
    let extractedMetadata = null;
    
    try {
      console.log('🔍 Extracting metadata from uploaded file...');
      extractedMetadata = await MetadataExtractor.extractFromBuffer(audioFile.buffer, audioFile.originalname);
      
      // Validate extracted metadata
      const validation = MetadataExtractor.validateMetadata(extractedMetadata);
      if (validation.warnings.length > 0) {
        console.log('⚠️ Metadata validation warnings:', validation.warnings);
      }
      
    } catch (metadataError) {
      console.error('❌ Metadata extraction failed:', metadataError.message);
      // Continue with manual metadata if extraction fails
    }
    
    // Extract metadata from request (user-provided, takes priority over extracted)
    const {
      title,
      artistName,
      album,
      genre,
      releaseDate,
      releaseYear,
      duration,
      explicit,
      tags,
      description,
      coverArt,
      language,
      aiUsed,
      aiDisclosure,
      aiTools
    } = req.body;
    
    // Upload audio file to R2 manually
    let fileUrl;
    try {
      console.log('📤 Uploading audio file to R2...');
      const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
      const s3Client = new S3Client({
        region: 'auto',
        endpoint: process.env.R2_ENDPOINT,
        credentials: {
          accessKeyId: process.env.R2_ACCESS_KEY_ID,
          secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
        },
      });
      
      const username = user.username || 'unknown';
      const timestamp = Date.now();
      const safeFilename = audioFile.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
      const audioKey = `media-uploads/${username}-${timestamp}-${safeFilename}`;
      
      const audioCommand = new PutObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: audioKey,
        Body: audioFile.buffer,
        ContentType: 'audio/mpeg',
        ACL: 'public-read',
        CacheControl: 'public, max-age=31536000'
      });
      
      await s3Client.send(audioCommand);
      fileUrl = getPublicUrl(audioKey);
      console.log(`✅ Audio file uploaded to R2: ${fileUrl}`);
    } catch (uploadError) {
      console.error('❌ Error uploading audio file to R2:', uploadError.message);
      return res.status(500).json({ error: 'Failed to upload audio file' });
    }
    
    // Parse tags (comma-separated string to array) and capitalize them
    const parsedTags = tags ? tags.split(',').map(t => capitalizeTag(t.trim())).filter(t => t) : [];
    
    // Determine final values (user input takes priority over extracted metadata)
    const finalTitle = title || extractedMetadata?.title || 'Untitled';
    const finalArtistName = artistName?.trim() || extractedMetadata?.artist || user.creatorProfile?.artistName || user.username;
    const providedArtists = parseArtistsPayload(req.body.artists);
    const finalAlbum = album || extractedMetadata?.album || null;
    const finalGenres = genre ? [genre] : (extractedMetadata?.genres || []);
    const finalDuration = duration ? parseInt(duration) : (extractedMetadata?.duration || null);
    const finalExplicit = explicit === 'true' || explicit === true || extractedMetadata?.explicit || false;
    const finalCoverArt = coverArt || null;
    
    // Validate required fields
    if (!finalTitle) {
      return res.status(400).json({ error: 'Title is required' });
    }
    
    // Map extracted metadata to Media model format
    const mappedMetadata = extractedMetadata ? 
      MetadataExtractor.mapToMediaModel(extractedMetadata, userId) : {};
    
    const userIdString = userId?.toString();
    
    // Parse artists from payload or fallback to string parsing
    let artistArray = [];
    let featuringArray = [];
    
    if (providedArtists.length > 0) {
      artistArray = providedArtists.map((artist, index) => ({
        name: artist.name,
        userId: artist.userId || null,
        relationToNext: index === providedArtists.length - 1 ? null : (artist.relationToNext || null),
        verified: artist.userId && userIdString ? artist.userId.toString() === userIdString : false
      }));
    } else {
      // Parse artist string if it contains "ft.", "feat.", "&", "and", etc.
      const parsedArtist = parseArtistString(finalArtistName);
      
      // Build artist and featuring arrays from parsed data
      artistArray = parsedArtist.artists.map((name, index) => ({
        name: name.trim(),
        userId: name.trim() === user.creatorProfile?.artistName || name.trim() === user.username ? userId : null,
        relationToNext: index === parsedArtist.artists.length - 1 ? null : null,
        verified: name.trim() === user.creatorProfile?.artistName || name.trim() === user.username
      }));
      
      featuringArray = parsedArtist.featuring.map(name => ({
        name: name.trim(),
        userId: null,
        verified: false
      }));
    }
    
    // Generate creatorDisplay from parsed arrays
    const creatorDisplay = formatCreatorDisplay(artistArray, featuringArray);
    
    // Process release date and year
    const finalReleaseDate = releaseDate ? new Date(releaseDate) : (mappedMetadata.releaseDate || null);
    const finalReleaseYear = extractReleaseYear(finalReleaseDate, releaseYear ? parseInt(releaseYear) : null);
    
    // Create Media entry with extracted and manual metadata
    const media = new Media({
      // Basic information (user input takes priority)
      title: finalTitle,
      album: finalAlbum,
      releaseDate: finalReleaseDate,
      releaseYear: finalReleaseYear,
      
      // Creators (parsed from artist string or use extracted metadata)
      artist: artistArray.length > 0 ? artistArray : (mappedMetadata.artist || toCreatorSubdocs([{
        name: finalArtistName,
        userId: userId,
        verified: true
      }])),
      featuring: featuringArray.length > 0 ? featuringArray : (mappedMetadata.featuring || []),
      
      // Additional creators from metadata
      producer: mappedMetadata.producer || [],
      songwriter: mappedMetadata.songwriter || [],
      composer: mappedMetadata.composer || [],
      label: mappedMetadata.label || [],
      
      // Display field for UI
      creatorDisplay: creatorDisplay,
      
      // Technical metadata
      duration: finalDuration,
      bitrate: mappedMetadata.bitrate || null,
      sampleRate: mappedMetadata.sampleRate || null,
      explicit: finalExplicit,
      
      // Advanced metadata
      bpm: mappedMetadata.bpm || null,
      key: mappedMetadata.key || null,
      isrc: mappedMetadata.isrc || null,
      upc: mappedMetadata.upc || null,
      lyrics: mappedMetadata.lyrics || null,
      
      // Content classification
      genres: finalGenres,
      language: normalizeLanguageInput(language || mappedMetadata.language || 'en'),
      tags: parsedTags,
      description: description || '',
      coverArt: finalCoverArt,
      category: 'music', // Auto-assign 'music' category for creator uploads
      
      // Note: trackNumber, discNumber, and publisher fields don't exist in Media model
      encodedBy: mappedMetadata.encodedBy || null,
      comment: mappedMetadata.comment || null,
      
      // File information
      sources: { upload: fileUrl },
      contentType: ['music'],
      contentForm: ['tune'],
      mediaType: ['mp3'],
      fileSize: audioFile.size,
      
      // System fields
      addedBy: userId,
      uploadedAt: new Date(),
      
      // AI Usage fields
      aiUsage: {
        used: aiUsed === 'true' || aiUsed === true,
        disclosure: aiDisclosure || 'none',
        tools: (() => {
          try {
            if (aiTools) {
              const parsed = typeof aiTools === 'string' ? JSON.parse(aiTools) : aiTools;
              if (Array.isArray(parsed)) {
                return parsed.filter(tool => tool.name && tool.provider).map(tool => ({
                  category: tool.category || 'other',
                  name: tool.name,
                  provider: tool.provider
                }));
              }
            }
          } catch (e) {
            console.error('Error parsing AI tools:', e);
          }
          return [];
        })()
      },
      
      // Rights confirmation (assumed true when uploaded via checkbox)
      rightsCleared: true,
      rightsConfirmedBy: userId,
      rightsConfirmedAt: new Date(),
      
      // Auto-assign ownership to uploader
      mediaOwners: [{
        userId: userId,
        percentage: 100,
        role: 'creator',
        verified: true,
        verifiedAt: new Date(),
        verifiedBy: userId,
        verificationMethod: 'Self-upload',
        verificationNotes: null,
        verificationSource: 'upload',
        addedBy: userId,
        addedAt: new Date(),
        lastUpdatedAt: new Date(),
        lastUpdatedBy: userId
      }]
    });
    
    await media.save();
    
    // Process cover art file if provided
    if (coverArtFile) {
      try {
        console.log('🖼️ Processing cover art file...');
        
        // Upload cover art to R2 manually
        const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
        const s3Client = new S3Client({
          region: 'auto',
          endpoint: process.env.R2_ENDPOINT,
          credentials: {
            accessKeyId: process.env.R2_ACCESS_KEY_ID,
            secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
          },
        });
        
        const timestamp = Date.now();
        const safeTitle = finalTitle.replace(/[^a-zA-Z0-9]/g, '_');
        const coverArtKey = `cover-art/${safeTitle}-${timestamp}.jpg`;
        
        const coverArtCommand = new PutObjectCommand({
          Bucket: process.env.R2_BUCKET_NAME,
          Key: coverArtKey,
          Body: coverArtFile.buffer,
          ContentType: coverArtFile.mimetype,
          ACL: 'public-read',
          CacheControl: 'public, max-age=31536000'
        });
        
        await s3Client.send(coverArtCommand);
        const coverArtUrl = getPublicUrl(coverArtKey);
        
        // Update media with cover art URL
        media.coverArt = coverArtUrl;
        await media.save();
        console.log(`✅ Cover art saved: ${coverArtUrl}`);
      } catch (coverArtError) {
        console.error('❌ Error processing cover art file:', coverArtError.message);
        // Continue without cover art - don't fail the upload
      }
    }
    // Process artwork if found in extracted metadata (fallback)
    else if (extractedMetadata && extractedMetadata.artwork && extractedMetadata.artwork.length > 0) {
      try {
        console.log('🖼️ Processing extracted artwork...');
        const artworkUrl = await MetadataExtractor.processArtwork(extractedMetadata.artwork, media._id.toString());
        
        if (artworkUrl) {
          // Update media with artwork URL
          media.coverArt = artworkUrl;
          await media.save();
          console.log(`✅ Artwork saved: ${artworkUrl}`);
        }
      } catch (artworkError) {
        console.error('❌ Error processing artwork:', artworkError.message);
        // Continue without artwork - don't fail the upload
      }
    }
    
    // Set default cover art if none was provided or extracted
    if (!media.coverArt) {
      media.coverArt = DEFAULT_COVER_ART;
      await media.save();
      console.log('✅ Set default cover art for media');
    }
    
    console.log(`✅ Creator ${user.username} uploaded: ${title} (${media.uuid})`);
    
    res.status(201).json({
      message: 'Media uploaded successfully',
      media: {
        uuid: media.uuid,
        _id: media._id,
        title: media.title,
        artist: media.artist,
        coverArt: media.coverArt,
        sources: media.sources
      }
    });
    
  } catch (error) {
    console.error('Error uploading media:', error);
    res.status(500).json({ error: 'Failed to upload media', details: error.message });
  }
});

// @route   GET /api/media
// @desc    Get all media with pagination and filtering
// @access  Public
router.get('/', async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      sortBy = 'globalMediaAggregate',
      sortOrder = 'desc',
      genre,
      creator,
      search
    } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Build query
    const query = { contentType: { $in: ['music'] } };
    
    if (genre) {
      query.genres = { $in: [genre] };
    }
    
    if (creator) {
      query.creatorNames = { $regex: creator, $options: 'i' };
    }
    
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { 'artist.name': { $regex: search, $options: 'i' } },
        { creatorNames: { $regex: search, $options: 'i' } }
      ];
    }

    // Build sort object
    const sortObj = {};
    sortObj[sortBy] = sortOrder === 'desc' ? -1 : 1;
    sortObj.createdAt = -1; // Secondary sort by creation date

    const media = await Media.find(query)
      .sort(sortObj)
      .skip(skip)
      .limit(parseInt(limit))
      .populate('addedBy', 'username profilePic uuid')
      .lean();

    const total = await Media.countDocuments(query);

    res.json({
      media,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching media:', error);
    res.status(500).json({ error: 'Failed to fetch media' });
  }
});

// @route   GET /api/media/public
// @desc    Get public media (same as /api/media but with different access)
// @access  Public
router.get('/public', async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      sortBy = 'globalMediaAggregate',
      sortOrder = 'desc',
      genre,
      creator,
      search
    } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Build query for public media
    const query = { 
      contentType: { $in: ['music'] },
      // Add any public-specific filters here
    };
    
    if (genre) {
      query.genres = { $in: [genre] };
    }
    
    if (creator) {
      query.creatorNames = { $regex: creator, $options: 'i' };
    }
    
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { 'artist.name': { $regex: search, $options: 'i' } },
        { creatorNames: { $regex: search, $options: 'i' } }
      ];
    }

    // Build sort object
    const sortObj = {};
    sortObj[sortBy] = sortOrder === 'desc' ? -1 : 1;
    sortObj.createdAt = -1; // Secondary sort by creation date

    const media = await Media.find(query)
      .sort(sortObj)
      .skip(skip)
      .limit(parseInt(limit))
      .populate('addedBy', 'username profilePic uuid')
      .lean();

    const total = await Media.countDocuments(query);

    res.json({
      media,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching public media:', error);
    res.status(500).json({ error: 'Failed to fetch public media' });
  }
});

// @route   GET /api/media/top-tunes
// @desc    Get top media by global bid value for Top Tunes
// @access  Public
router.get('/top-tunes', async (req, res) => {
  try {
    const { sortBy = 'globalMediaAggregate', limit = 10, timePeriod = 'all-time', search, tags } = req.query;
    
    // Validate sortBy parameter - map to Media model fields
    const validSortFields = ['globalMediaAggregate', 'title', 'creators', 'duration', 'uploadedAt'];
    const sortField = validSortFields.includes(sortBy) ? sortBy : 'globalMediaAggregate';
    
    // Map field names to Media model fields
    const fieldMapping = {
      'title': 'title',
      'artist': 'creators', // Map artist to creators
      'duration': 'duration',
      'globalMediaAggregate': 'globalMediaAggregate', // Updated to schema grammar
      'uploadedAt': 'uploadedAt'
    };
    
    const mediaSortField = fieldMapping[sortField] || sortField;
    
    // Validate limit parameter
    const limitNum = Math.min(parseInt(limit) || 10, 100); // Max 100 items
    
    // Build sort object
    let sortObj = {};
    if (mediaSortField === 'globalMediaAggregate') {
      sortObj[mediaSortField] = -1; // Descending for bid value
    } else if (mediaSortField === 'title' || mediaSortField === 'creators') {
      sortObj[mediaSortField] = 1; // Ascending for text fields
    } else {
      sortObj[mediaSortField] = -1; // Descending for duration and date
    }
    
    // Build query object
    let query = { 
      globalMediaAggregate: { $gt: 0 }, // Updated to schema grammar
      contentType: { $in: ['music'] } // Only music content for now
    };
    
    // Ensure proper population by manually checking and populating if needed
    const Bid = require('../models/Bid');
    const User = require('../models/User');
    
    // Add time period filtering
    if (timePeriod !== 'all-time') {
      const now = new Date();
      let startDate;
      
      switch (timePeriod) {
        case 'today':
          startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          break;
        case 'week':
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case 'month':
          startDate = new Date(now.getFullYear(), now.getMonth(), 1);
          break;
        case 'year':
          startDate = new Date(now.getFullYear(), 0, 1);
          break;
        default:
          startDate = null;
      }
      
      if (startDate) {
        query.uploadedAt = { $gte: startDate };
      }
    }
    
    // Add search filtering
    if (search && search.trim()) {
      const searchRegex = new RegExp(search.trim(), 'i');
      query.$or = [
        { title: searchRegex },
        { 'artist.name': searchRegex },
        { creatorNames: searchRegex }
      ];
    }
    
    // Use new Media model, filtering for music content
    let media = await Media.find(query)
      .sort(sortObj)
      .limit(limitNum * 2) // Get more results for filtering
      .populate({
        path: 'bids',
        model: 'Bid',
        populate: {
          path: 'userId',
          model: 'User',
          select: 'username profilePic uuid',
        },
      })
      .select('title artist producer featuring creatorNames duration coverArt globalMediaAggregate uploadedAt bids uuid contentType contentForm genres category tags'); // Updated to schema grammar

    // Apply fuzzy tag matching on results if tags are specified
    if (tags && Array.isArray(tags) && tags.length > 0) {
      console.log('🔍 Tag filtering - tags received:', tags);
      
      // Create fuzzy matching function to normalize tags
      const normalizeTag = (tag) => {
        return tag.toLowerCase()
          .replace(/[\s\-_\.]+/g, '') // Remove spaces, hyphens, underscores, dots
          .replace(/[^\w]/g, ''); // Remove any other non-word characters
      };
      
      // Normalize search tags
      const normalizedSearchTags = tags.map(tag => normalizeTag(tag.trim()));
      console.log('🔍 Normalized search tags:', normalizedSearchTags);
      
      // Filter media items that have matching tags
      media = media.filter(item => {
        if (!item.tags || !Array.isArray(item.tags)) return false;
        
        return item.tags.some(storedTag => {
          const normalizedStoredTag = normalizeTag(storedTag);
          return normalizedSearchTags.includes(normalizedStoredTag);
        });
      }).slice(0, limitNum); // Limit to requested count
      
      console.log('🔍 Media found after tag filtering:', media.length, 'items');
    }

    console.log('🔍 Media found:', media.length, 'items');
    
    // Ensure proper population by manually checking and populating if needed
    for (let mediaItem of media) {
      if (mediaItem.bids && mediaItem.bids.length > 0) {
        for (let bid of mediaItem.bids) {
          // If userId is still a string, populate it manually
          if (typeof bid.userId === 'string') {
            const user = await User.findOne({ uuid: bid.userId }).select('username profilePic uuid');
            if (user) {
              bid.userId = user;
            }
          }
        }
      }
    }
    
    // Transform Media items to match expected frontend format
    const transformedSongs = media.map(item => ({
      id: item._id || item.uuid,
      uuid: item.uuid,
      title: item.title,
      artist: item.artist && item.artist.length > 0 ? item.artist[0].name : 'Unknown Artist', // Primary artist name (backward compatibility)
      artists: item.artist || [], // Full artist array with subdocuments
      creators: item.creatorNames || [], // All creator names
      creatorDisplay: item.creatorDisplay || formatCreatorDisplay(item.artist || [], item.featuring || []), // Display string for UI
      producer: item.producer || [],
      featuring: item.featuring || [],
      duration: item.duration,
      coverArt: item.coverArt,
      globalMediaAggregate: item.globalMediaAggregate, // Updated to schema grammar
      uploadedAt: item.uploadedAt,
      bids: item.bids,
      contentType: item.contentType,
      contentForm: item.contentForm,
      tags: item.tags || []
    }));
    
    res.json({
      success: true,
      songs: transformedSongs, // Keep field name for frontend compatibility
      total: transformedSongs.length,
      sortBy: sortField,
      limit: limitNum
    });
  } catch (err) {
    console.error('Error fetching Top Tunes:', err);
    res.status(500).json({ 
      success: false, 
      error: 'Error fetching Top Tunes', 
      details: err.message 
    });
  }
});

// @route   GET /api/media/:mediaId/profile
// @desc    Get comprehensive media details for Tune Profile page
// @access  Public (for viewing media details)
router.get('/:mediaId/profile', async (req, res) => {
  try {
    const { mediaId } = req.params;
    console.log('🔍 Media profile request for mediaId:', mediaId);

    // Find media by UUID or ObjectId
    let media;
    if (mediaId.includes('-')) {
      // UUID format
      console.log('🔍 Searching by UUID:', mediaId);
      media = await Media.findOne({ uuid: mediaId });
    } else if (isValidObjectId(mediaId)) {
      // ObjectId format
      console.log('🔍 Searching by ObjectId:', mediaId);
      media = await Media.findById(mediaId);
    } else {
      console.log('❌ Invalid media ID format:', mediaId);
      return res.status(400).json({ error: 'Invalid media ID format' });
    }

    if (!media) {
      console.log('❌ Media not found for ID:', mediaId);
      return res.status(404).json({ error: 'Media not found' });
    }
    
    console.log('✅ Media found:', media.title);

    // Populate media with bids and user data
    const populatedMedia = await Media.findById(media._id)
      .populate({
        path: 'bids',
        model: 'Bid',
        populate: {
          path: 'userId',
          model: 'User',
          select: 'username profilePic uuid',
        },
      })
      .populate({
        path: 'addedBy',
        model: 'User',
        select: 'username profilePic uuid',
      })
      .populate({
        path: 'label.labelId',
        model: 'Label',
        select: 'name slug logo verificationStatus stats.artistCount stats.releaseCount stats.globalLabelAggregate'
      })
      .populate({
        path: 'artist.userId',
        model: 'User',
        select: 'username profilePic uuid creatorProfile.artistName'
      })
      .populate({
        path: 'artist.collectiveId',
        model: 'Collective',
        select: 'name slug profilePicture verificationStatus'
      })
      .populate({
        path: 'producer.collectiveId',
        model: 'Collective',
        select: 'name slug profilePicture verificationStatus'
      })
      .populate({
        path: 'featuring.userId',
        model: 'User',
        select: 'username profilePic uuid creatorProfile.artistName'
      })
      .populate({
        path: 'featuring.collectiveId',
        model: 'Collective',
        select: 'name slug profilePicture verificationStatus'
      });

    // Fetch recent comments
    const recentComments = await Comment.find({ 
      mediaId: media._id,
      parentCommentId: null,
      isDeleted: false 
    })
      .populate('userId', 'username profilePic uuid')
      .sort({ createdAt: -1 })
      .limit(5);

    // Add comments to the response
    populatedMedia.comments = recentComments;

    // Calculate accurate globalMediaAggregate from all active bids
    // This ensures the displayed total matches the sum of all bids, even if stored value is stale
    const Bid = require('../models/Bid');
    const allBids = await Bid.find({
      mediaId: media._id,
      status: 'active'
    });
    
    const calculatedGlobalMediaAggregate = allBids.reduce((sum, bid) => sum + bid.amount, 0);
    
    console.log(`📊 Calculated globalMediaAggregate: ${calculatedGlobalMediaAggregate} (from ${allBids.length} bids) vs stored: ${populatedMedia.globalMediaAggregate || 0}`);

    // Update stored value if it's incorrect (self-healing mechanism)
    const storedValue = populatedMedia.globalMediaAggregate || 0;
    const tolerance = 0.01; // Allow small floating point differences
    if (Math.abs(calculatedGlobalMediaAggregate - storedValue) > tolerance) {
      console.log(`⚠️  Stored globalMediaAggregate is incorrect, updating from ${storedValue} to ${calculatedGlobalMediaAggregate}`);
      await Media.findByIdAndUpdate(media._id, { 
        globalMediaAggregate: calculatedGlobalMediaAggregate 
      });
      // Update the populatedMedia object so we use the corrected value below
      populatedMedia.globalMediaAggregate = calculatedGlobalMediaAggregate;
    }

    // Compute GlobalMediaAggregateRank (rank by total bid value) - use calculated value
    // Count how many media have a higher globalMediaAggregate value
    const rank = await Media.countDocuments({
      globalMediaAggregate: { $gt: calculatedGlobalMediaAggregate }
    }) + 1; // +1 because rank is 1-indexed

    // Convert sources Map to plain object BEFORE toObject()
    let sourcesObj = {};
    if (populatedMedia.sources) {
      if (populatedMedia.sources instanceof Map) {
        // Convert Map to plain object
        populatedMedia.sources.forEach((value, key) => {
          sourcesObj[key] = value;
        });
      } else if (typeof populatedMedia.sources === 'object' && populatedMedia.sources !== null) {
        // Handle if it's already an object
        sourcesObj = { ...populatedMedia.sources };
      }
    }
    
    console.log('📡 Backend sources conversion:', {
      originalType: populatedMedia.sources?.constructor?.name,
      isMap: populatedMedia.sources instanceof Map,
      convertedSources: sourcesObj
    });
    
    // Transform Media to match expected frontend format
    const mediaObj = populatedMedia.toObject();
    
    const transformedMedia = {
      ...mediaObj,
      sources: sourcesObj, // Use pre-converted sources
      artist: populatedMedia.artist && populatedMedia.artist.length > 0 ? 
              populatedMedia.artist[0].name : 'Unknown Artist', // Primary artist name (backward compatibility)
      artists: populatedMedia.artist || [], // Full artist subdocuments
      creators: populatedMedia.creatorNames || [], // All creator names
      creatorDisplay: populatedMedia.creatorDisplay || formatCreatorDisplay(populatedMedia.artist || [], populatedMedia.featuring || []), // Display string for UI
      globalMediaAggregateTopRank: rank, // Add computed rank
      globalMediaAggregate: calculatedGlobalMediaAggregate, // Override with calculated value from all bids
    };

    console.log('📤 Sending media profile response:', {
      message: 'Media profile fetched successfully',
      media: transformedMedia
    });
    
    res.json({
      message: 'Media profile fetched successfully',
      media: transformedMedia, // Updated to 'media' key for frontend compatibility
    });

  } catch (error) {
    console.error('Error fetching media profile:', error);
    res.status(500).json({ error: 'Error fetching media profile', details: error.message });
  }
});

// @route   GET /api/media/:mediaId/ownership
// @desc    Get ownership overview for a media item
// @access  Private (admins, media owners, or verified creators linked to the media)
router.get('/:mediaId/ownership', authMiddleware, async (req, res) => {
  try {
    const { mediaId } = req.params;

    if (!isValidObjectId(mediaId)) {
      return res.status(400).json({ error: 'Invalid media ID format' });
    }

    const media = await Media.findById(mediaId)
      .populate([
        { path: 'mediaOwners.userId', select: 'username email profilePic uuid' },
        { path: 'mediaOwners.verifiedBy', select: 'username email profilePic uuid' },
        { path: 'mediaOwners.addedBy', select: 'username email profilePic uuid' },
        { path: 'mediaOwners.lastUpdatedBy', select: 'username email profilePic uuid' },
        { path: 'ownershipHistory.actor', select: 'username email profilePic uuid' }
      ]);

    if (!media) {
      return res.status(404).json({ error: 'Media not found' });
    }

    if (!canEditMedia(req.user, media)) {
      return res.status(403).json({ error: 'Not authorized to view ownership for this media' });
    }

    const { owners, history } = buildOwnershipResponse(media);

    const claims = await Claim.find({ mediaId })
      .populate('userId', 'username email profilePic uuid')
      .populate('reviewedBy', 'username email profilePic uuid')
      .sort({ submittedAt: -1 });

    const formattedClaims = claims.map(claim => ({
      _id: claim._id,
      mediaId: claim.mediaId?.toString?.() || claim.mediaId,
      status: claim.status,
      proofText: claim.proofText,
      proofFiles: claim.proofFiles || [],
      submittedAt: claim.submittedAt,
      updatedAt: claim.updatedAt,
      reviewNotes: claim.reviewNotes || null,
      reviewedAt: claim.reviewedAt || null,
      claimant: toPlainUserReference(claim.userId),
      reviewer: toPlainUserReference(claim.reviewedBy)
    }));

    res.json({
      owners,
      claims: formattedClaims,
      history
    });
  } catch (error) {
    console.error('Error fetching media ownership:', error);
    res.status(500).json({ error: 'Failed to load ownership data', details: error.message });
  }
});

// @route   PUT /api/media/:mediaId/ownership
// @desc    Update ownership configuration for a media item
// @access  Private (admins, media owners, or verified creators linked to the media)
router.put('/:mediaId/ownership', authMiddleware, async (req, res) => {
  try {
    const { mediaId } = req.params;
    const { owners, note } = req.body || {};

    if (!isValidObjectId(mediaId)) {
      return res.status(400).json({ error: 'Invalid media ID format' });
    }

    if (!Array.isArray(owners) || owners.length === 0) {
      return res.status(400).json({ error: 'At least one ownership entry is required' });
    }

    const media = await Media.findById(mediaId);
    if (!media) {
      return res.status(404).json({ error: 'Media not found' });
    }

    if (!canEditMedia(req.user, media)) {
      return res.status(403).json({ error: 'Not authorized to update ownership for this media' });
    }

    try {
      media.replaceMediaOwners(owners, req.user._id, note);
    } catch (validationError) {
      return res.status(400).json({ error: validationError.message });
    }

    await media.save();

    const refreshedMedia = await Media.findById(mediaId)
      .populate([
        { path: 'mediaOwners.userId', select: 'username email profilePic uuid' },
        { path: 'mediaOwners.verifiedBy', select: 'username email profilePic uuid' },
        { path: 'mediaOwners.addedBy', select: 'username email profilePic uuid' },
        { path: 'mediaOwners.lastUpdatedBy', select: 'username email profilePic uuid' },
        { path: 'ownershipHistory.actor', select: 'username email profilePic uuid' }
      ]);

    const { owners: updatedOwners, history } = buildOwnershipResponse(refreshedMedia);

    const claims = await Claim.find({ mediaId })
      .populate('userId', 'username email profilePic uuid')
      .populate('reviewedBy', 'username email profilePic uuid')
      .sort({ submittedAt: -1 });

    const formattedClaims = claims.map(claim => ({
      _id: claim._id,
      mediaId: claim.mediaId?.toString?.() || claim.mediaId,
      status: claim.status,
      proofText: claim.proofText,
      proofFiles: claim.proofFiles || [],
      submittedAt: claim.submittedAt,
      updatedAt: claim.updatedAt,
      reviewNotes: claim.reviewNotes || null,
      reviewedAt: claim.reviewedAt || null,
      claimant: toPlainUserReference(claim.userId),
      reviewer: toPlainUserReference(claim.reviewedBy)
    }));

    res.json({
      message: 'Ownership updated successfully',
      owners: updatedOwners,
      claims: formattedClaims,
      history
    });
  } catch (error) {
    console.error('Error updating media ownership:', error);
    res.status(500).json({ error: 'Failed to update ownership', details: error.message });
  }
});

// @route   PUT /api/media/:id
// @desc    Update media details
// @access  Private (Admin or Verified Creator only)
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;
    
    // Use ObjectId directly (no resolution needed)
    if (!isValidObjectId(id)) {
      return res.status(400).json({ error: 'Invalid media ID format' });
    }
    
    // Find the media
    const media = await Media.findById(id);
    if (!media) {
      return res.status(404).json({ error: 'Media not found' });
    }
    
    // Check permissions: must be admin OR media owner OR verified creator
    if (!canEditMedia(req.user, media)) {
      return res.status(403).json({ error: 'Not authorized to edit this media' });
    }
    
    // Track changes for edit history
    const changes = [];
    
    // Update allowed fields
    // Note: 'sources' is handled separately below due to Map type
    const allowedUpdates = [
      'title', 'producer', 'album', 'genre',
      'releaseDate', 'releaseYear', 'duration', 'explicit', 'isrc', 'upc', 'bpm',
      'pitch', 'key', 'elements', 'tags', 'category', 'timeSignature',
      'lyrics', 'description', 'language', 'minimumBid'
      // Note: 'featuring' is handled separately below (needs subdocument conversion)
    ];
    
    allowedUpdates.forEach(field => {
      if (req.body[field] !== undefined) {
        let value = req.body[field];
        
        // Convert numeric fields from string to number if needed
        const numericFields = ['pitch', 'bpm', 'duration', 'bitrate', 'sampleRate', 'releaseYear', 'minimumBid'];
        if (numericFields.includes(field) && typeof value === 'string' && value.trim() !== '') {
          const numValue = field === 'releaseYear' ? parseInt(value) : parseFloat(value);
          if (!isNaN(numValue)) {
            value = numValue;
          }
        }
        
        // Validate minimumBid (must be at least 0.01 or null to clear override)
        if (field === 'minimumBid') {
          if (value !== null && value !== undefined && value !== '') {
            const numValue = typeof value === 'string' ? parseFloat(value) : value;
            if (isNaN(numValue) || numValue < 0.01) {
              return res.status(400).json({ error: 'Minimum bid must be at least £0.01 or null to clear override' });
            }
            value = numValue;
          } else {
            // Allow null/undefined/empty string to clear the media-level override
            value = null;
          }
        }
        
        // Handle releaseDate and releaseYear together
        if (field === 'releaseDate') {
          const dateValue = value ? new Date(value) : null;
          const yearValue = extractReleaseYear(dateValue, req.body.releaseYear ? parseInt(req.body.releaseYear) : null);
          if (media.releaseYear !== yearValue) {
            changes.push({
              field: 'releaseYear',
              oldValue: media.releaseYear,
              newValue: yearValue
            });
            media.releaseYear = yearValue;
          }
          value = dateValue;
        } else if (field === 'releaseYear') {
          // If releaseYear is set but releaseDate is not, extract from releaseDate if it exists
          if (!value && media.releaseDate) {
            const yearValue = extractReleaseYear(media.releaseDate, null);
            if (yearValue) {
              value = yearValue;
            }
          }
        }
        
        // Handle language field normalization
        if (field === 'language') {
          value = normalizeLanguageInput(value);
        }
        
        // Check if value actually changed
        if (media[field] !== value) {
          changes.push({
            field,
            oldValue: media[field],
            newValue: value
          });
          media[field] = value;
        }
      }
    });
    
    // Special handling for creator fields (convert strings/arrays to subdocument format)
    
    // Artist field (string or array -> array of subdocuments)
    // Parse artist string to extract primary artists and featuring artists
    if (req.body.artist !== undefined) {
      // Handle array format (from autocomplete selection with userId)
      if (Array.isArray(req.body.artist) && req.body.artist.length > 0) {
        media.artist = req.body.artist.map(artist => {
          // If artist is already in subdocument format
          if (typeof artist === 'object' && artist.name) {
            return {
              name: artist.name.trim(),
              userId: artist.userId || null,
              collectiveId: artist.collectiveId || req.body.artistCollectiveId || null,
              relationToNext: artist.relationToNext || null,
              verified: artist.verified || false
            };
          }
          // If it's just a string in the array
          return {
            name: typeof artist === 'string' ? artist.trim() : '',
            userId: null,
            collectiveId: req.body.artistCollectiveId || null,
            relationToNext: null,
            verified: false
          };
        });
      } else if (typeof req.body.artist === 'string' && req.body.artist.trim()) {
        const parsedArtist = parseArtistString(req.body.artist.trim());
        
        // Build artist array from parsed primary artists
        // Check if artistUserId or artistCollectiveId is provided
        const artistUserId = req.body.artistUserId || null;
        const artistCollectiveId = req.body.artistCollectiveId || null;
        
        media.artist = parsedArtist.artists.map(name => ({
          name: name.trim(),
          userId: artistUserId,
          collectiveId: artistCollectiveId,
          relationToNext: null,
          verified: false
        }));
        
        // Build featuring array from parsed featuring artists
        // Merge with existing featuring if it exists
        const newFeaturing = parsedArtist.featuring.map(name => ({
          name: name.trim(),
          userId: null,
          collectiveId: null, // Featuring collectiveId handled separately if needed
          verified: false
        }));
        
        if (req.body.featuring !== undefined && Array.isArray(req.body.featuring)) {
          // Merge parsed featuring with existing featuring array
          const existingFeaturing = req.body.featuring
            .filter(name => name && typeof name === 'string' && name.trim())
            .map(name => ({
              name: typeof name === 'string' ? name.trim() : name.name,
              userId: null,
              collectiveId: null,
              verified: false
            }));
          media.featuring = [...newFeaturing, ...existingFeaturing];
        } else {
          media.featuring = newFeaturing;
        }
      } else if (req.body.artist === '') {
        media.artist = [];
      }
    }
    
    // Handle collectiveId for artist if artistCollectiveId is provided separately
    if (req.body.artistCollectiveId !== undefined && media.artist && media.artist.length > 0) {
      const Collective = require('../models/Collective');
      const collectiveId = req.body.artistCollectiveId;
      
      if (collectiveId && collectiveId !== null && collectiveId !== '') {
        try {
          const collective = await Collective.findById(collectiveId);
          if (collective) {
            // Update collectiveId for all artist entries
            media.artist = media.artist.map(artist => ({
              ...artist,
              collectiveId: collective._id
            }));
          }
        } catch (error) {
          console.error('Error finding collective:', error);
        }
      } else {
        // Clear collectiveId if null/empty
        media.artist = media.artist.map(artist => ({
          ...artist,
          collectiveId: null
        }));
      }
    }
    
    // Producer field (string -> array of subdocuments)
    if (req.body.producer !== undefined) {
      if (typeof req.body.producer === 'string' && req.body.producer.trim()) {
        media.producer = [{
          name: req.body.producer.trim(),
          userId: null,
          verified: false
        }];
      } else if (req.body.producer === '') {
        media.producer = [];
      }
    }
    
    // Featuring field (array of strings -> array of subdocuments)
    // Only process if artist wasn't a string (already handled above)
    if (req.body.featuring !== undefined && typeof req.body.artist !== 'string') {
      if (Array.isArray(req.body.featuring)) {
        // Handle both string arrays and empty arrays
        if (req.body.featuring.length === 0) {
          media.featuring = [];
        } else {
          media.featuring = req.body.featuring
            .filter(name => name && typeof name === 'string' && name.trim().length > 0)
            .map(name => ({
              name: typeof name === 'string' ? name.trim() : name.name,
              userId: null,
              verified: false
            }));
        }
      } else if (req.body.featuring === '' || req.body.featuring === null) {
        // Clear featuring if empty string or null
        media.featuring = [];
      }
    }
    
    // Generate creatorDisplay from artist and featuring arrays after updates
    if (media.artist || media.featuring) {
      media.creatorDisplay = formatCreatorDisplay(media.artist || [], media.featuring || []);
    }
    
    // Genres field (array of strings -> genres array)
    // Handle both 'genre' (singular, for backward compatibility) and 'genres' (plural, array)
    if (req.body.genres !== undefined) {
      const oldGenres = media.genres || [];
      let newGenres = [];
      
      if (Array.isArray(req.body.genres)) {
        // If genres is already an array, use it directly (filter empty strings)
        newGenres = req.body.genres
          .filter(g => g && typeof g === 'string' && g.trim().length > 0)
          .map(g => g.trim());
      } else if (typeof req.body.genres === 'string' && req.body.genres.trim()) {
        // If genres is a string (comma-separated), split it
        newGenres = req.body.genres.split(',')
          .map(g => g.trim())
          .filter(g => g.length > 0);
      }
      
      // Only update if changed
      if (JSON.stringify(oldGenres.sort()) !== JSON.stringify(newGenres.sort())) {
        changes.push({
          field: 'genres',
          oldValue: oldGenres,
          newValue: newGenres
        });
        media.genres = newGenres;
      }
    } else if (req.body.genre !== undefined) {
      // Backward compatibility: handle singular 'genre' field
      const oldGenres = media.genres || [];
      const newGenres = req.body.genre ? [req.body.genre] : [];
      if (JSON.stringify(oldGenres) !== JSON.stringify(newGenres)) {
        changes.push({
          field: 'genres',
          oldValue: oldGenres,
          newValue: newGenres
        });
        media.genres = newGenres;
      }
    }
    
    // Label field (handle label linking)
    if (req.body.label !== undefined || req.body.labelId !== undefined) {
      const Label = require('../models/Label');
      const oldLabel = media.label && media.label.length > 0 ? media.label[0] : null;
      
      // If labelId is provided, link to existing label
      if (req.body.labelId && req.body.labelId !== null && req.body.labelId !== '') {
        try {
          const labelToLink = await Label.findById(req.body.labelId);
          if (labelToLink) {
            media.label = [{
              name: labelToLink.name,
              labelId: labelToLink._id,
              verified: false, // Leave false for MVP as per user request
              catalogNumber: req.body.catalogNumber || null,
              releaseDate: req.body.labelReleaseDate ? new Date(req.body.labelReleaseDate) : null
            }];
            
            if (JSON.stringify(oldLabel) !== JSON.stringify(media.label[0])) {
              changes.push({
                field: 'label',
                oldValue: oldLabel,
                newValue: media.label[0]
              });
            }
          } else {
            // Label ID provided but not found - just use name
            let labelName = '';
            if (Array.isArray(req.body.label)) {
              labelName = req.body.label.length > 0 && typeof req.body.label[0] === 'string' 
                ? req.body.label[0] 
                : '';
            } else if (typeof req.body.label === 'string') {
              labelName = req.body.label;
            }
            
            if (labelName && labelName.trim()) {
              media.label = [{
                name: labelName.trim(),
                userId: null,
                labelId: null,
                verified: false
              }];
            } else {
              media.label = [];
            }
          }
        } catch (error) {
          console.error('Error finding label:', error);
          // Fallback to just name
          let labelName = '';
          if (Array.isArray(req.body.label)) {
            labelName = req.body.label.length > 0 && typeof req.body.label[0] === 'string' 
              ? req.body.label[0] 
              : '';
          } else if (typeof req.body.label === 'string') {
            labelName = req.body.label;
          }
          
          if (labelName && labelName.trim()) {
            media.label = [{
              name: labelName.trim(),
              userId: null,
              labelId: null,
              verified: false
            }];
          } else {
            media.label = [];
          }
        }
      } else if (req.body.label !== undefined) {
        // Just label name provided (no labelId)
        // Handle both string and array formats
        let labelName = '';
        if (Array.isArray(req.body.label)) {
          // If it's an array, use the first element if it's a string, otherwise ignore
          labelName = req.body.label.length > 0 && typeof req.body.label[0] === 'string' 
            ? req.body.label[0] 
            : '';
        } else if (typeof req.body.label === 'string') {
          labelName = req.body.label;
        }
        
        if (labelName && labelName.trim()) {
          // Try to find label by name
          const labelByName = await Label.findOne({ name: labelName.trim() });
          if (labelByName) {
            media.label = [{
              name: labelByName.name,
              labelId: labelByName._id,
              verified: false,
              catalogNumber: req.body.catalogNumber || null,
              releaseDate: req.body.labelReleaseDate ? new Date(req.body.labelReleaseDate) : null
            }];
          } else {
            // Label not found - just store name
            media.label = [{
              name: labelName.trim(),
              userId: null,
              labelId: null,
              verified: false
            }];
          }
        } else {
          // Empty label - remove it
          media.label = [];
        }
        
        if (JSON.stringify(oldLabel) !== JSON.stringify(media.label.length > 0 ? media.label[0] : null)) {
          changes.push({
            field: 'label',
            oldValue: oldLabel,
            newValue: media.label.length > 0 ? media.label[0] : null
          });
        }
      }
    }
    
    // Special handling for sources field (Map type)
    if (req.body.sources !== undefined) {
      // Get old sources before modifying
      const oldSources = media.sources instanceof Map 
        ? Object.fromEntries(media.sources) 
        : (media.sources || {});
      
      // Convert object to Map if needed
      if (req.body.sources && typeof req.body.sources === 'object' && !(req.body.sources instanceof Map)) {
        // Clear existing sources
        if (media.sources instanceof Map) {
          media.sources.clear();
        } else {
          media.sources = new Map();
        }
        
        // Add new sources from object
        Object.entries(req.body.sources).forEach(([key, value]) => {
          if (value && typeof value === 'string' && value.trim()) {
            media.sources.set(key, value.trim());
          }
        });
        
        // Track change
        const newSources = Object.fromEntries(media.sources);
        if (JSON.stringify(oldSources) !== JSON.stringify(newSources)) {
          changes.push({
            field: 'sources',
            oldValue: oldSources,
            newValue: newSources
          });
        }
      } else if (req.body.sources === null || req.body.sources === '') {
        // Clear sources
        if (media.sources instanceof Map) {
          media.sources.clear();
        } else {
          media.sources = new Map();
        }
        
        // Track change if sources were cleared
        if (Object.keys(oldSources).length > 0) {
          changes.push({
            field: 'sources',
            oldValue: oldSources,
            newValue: {}
          });
        }
      }
    }
    
    // Add to edit history if there are changes
    if (changes.length > 0) {
      // Ensure editHistory array exists
      if (!media.editHistory) {
        media.editHistory = [];
      }
      media.editHistory.push({
        editedBy: userId,
        editedAt: new Date(),
        changes: changes
      });
    }
    
    await media.save();
    
    // Return media with ObjectId directly
    res.json({ 
      message: 'Media updated successfully',
      media: media 
    });
  } catch (error) {
    console.error('Error updating media:', error);
    console.error('Error stack:', error.stack);
    console.error('Request body:', req.body);
    console.error('Media ID:', req.params.id);
    res.status(500).json({ 
      error: 'Failed to update media',
      details: error.message 
    });
  }
});

// @route   PUT /api/media/:id/cover-art
// @desc    Upload cover art for existing media
// @access  Private (Admin or Verified Creator only)
router.put('/:id/cover-art', authMiddleware, coverArtUploadSingle.single('coverArtFile'), async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;
    
    // Validate media ID
    if (!isValidObjectId(id)) {
      return res.status(400).json({ error: 'Invalid media ID format' });
    }
    
    // Find the media
    const media = await Media.findById(id);
    if (!media) {
      return res.status(404).json({ error: 'Media not found' });
    }
    
    // Check permissions: must be admin OR media owner OR verified creator
    if (!canEditMedia(req.user, media)) {
      return res.status(403).json({ error: 'Not authorized to edit this media' });
    }
    
    // Check if file was uploaded
    if (!req.file) {
      return res.status(400).json({ error: 'No cover art file uploaded' });
    }
    
    try {
      console.log('🖼️ Processing cover art upload for media:', id);
      
      // Upload cover art to R2 manually
      const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
      const s3Client = new S3Client({
        region: 'auto',
        endpoint: process.env.R2_ENDPOINT,
        credentials: {
          accessKeyId: process.env.R2_ACCESS_KEY_ID,
          secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
        },
      });
      
      const timestamp = Date.now();
      const safeTitle = (media.title || 'cover').replace(/[^a-zA-Z0-9.-]/g, '_');
      const fileExt = path.extname(req.file.originalname) || '.jpg';
      const coverArtKey = `cover-art/${safeTitle}-${timestamp}${fileExt}`;
      
      const coverArtCommand = new PutObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: coverArtKey,
        Body: req.file.buffer,
        ContentType: req.file.mimetype,
        ACL: 'public-read',
        CacheControl: 'public, max-age=31536000'
      });
      
      await s3Client.send(coverArtCommand);
      const coverArtUrl = getPublicUrl(coverArtKey);
      
      // Update media with cover art URL
      media.coverArt = coverArtUrl;
      await media.save();
      
      console.log(`✅ Cover art uploaded and saved: ${coverArtUrl}`);
      
      res.json({
        success: true,
        coverArt: coverArtUrl,
        message: 'Cover art uploaded successfully'
      });
    } catch (uploadError) {
      console.error('❌ Error uploading cover art:', uploadError.message);
      res.status(500).json({ 
        error: 'Failed to upload cover art',
        details: uploadError.message 
      });
    }
  } catch (error) {
    console.error('Error uploading cover art:', error);
    res.status(500).json({ 
      error: 'Failed to upload cover art',
      details: error.message 
    });
  }
});

// @route   GET /api/media/:mediaId/comments
// @desc    Get all comments for a media item
// @access  Public
router.get('/:mediaId/comments', async (req, res) => {
  try {
    const { mediaId } = req.params;
    const { page = 1, limit = 20, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;

    // Find media
    let media;
    if (mediaId.includes('-')) {
      media = await Media.findOne({ uuid: mediaId });
    } else if (isValidObjectId(mediaId)) {
      media = await Media.findById(mediaId);
    } else {
      return res.status(400).json({ error: 'Invalid media ID format' });
    }

    if (!media) {
      return res.status(404).json({ error: 'Media not found' });
    }

    // Build sort object
    const sortObj = {};
    sortObj[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Fetch comments
    const comments = await Comment.find({ 
      mediaId: media._id,
      parentCommentId: null,
      isDeleted: false 
    })
      .populate('userId', 'username profilePic uuid')
      .sort(sortObj)
      .skip(skip)
      .limit(parseInt(limit));

    // Get total count
    const totalComments = await Comment.countDocuments({ 
      mediaId: media._id,
      parentCommentId: null,
      isDeleted: false 
    });

    res.json({
      message: 'Comments fetched successfully',
      comments,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalComments,
        pages: Math.ceil(totalComments / parseInt(limit)),
      },
    });

  } catch (error) {
    console.error('Error fetching comments:', error);
    res.status(500).json({ error: 'Error fetching comments', details: error.message });
  }
});

// @route   POST /api/media/:mediaId/comments
// @desc    Create a new comment on a media item
// @access  Private (requires authentication)
router.post('/:mediaId/comments', authMiddleware, async (req, res) => {
  try {
    const { mediaId } = req.params;
    const { content, parentCommentId } = req.body;
    const userId = req.user._id;

    // Validate content
    if (!content || content.trim().length === 0) {
      return res.status(400).json({ error: 'Comment content is required' });
    }

    if (content.length > 1000) {
      return res.status(400).json({ error: 'Comment must be less than 1000 characters' });
    }

    // Validate media exists
    let media;
    if (mediaId.includes('-')) {
      media = await Media.findOne({ uuid: mediaId });
    } else if (isValidObjectId(mediaId)) {
      media = await Media.findById(mediaId);
    } else {
      return res.status(400).json({ error: 'Invalid media ID format' });
    }

    if (!media) {
      return res.status(404).json({ error: 'Media not found' });
    }

    // Create comment with mediaId
    const comment = new Comment({
      content: content.trim(),
      userId,
      mediaId: media._id,
      parentCommentId: parentCommentId || null,
    });

    await comment.save();

    // Populate user data for response
    await comment.populate('userId', 'username profilePic uuid');

    // Send notification if this is a reply to another comment
    if (parentCommentId) {
      try {
        const notificationService = require('../services/notificationService');
        const parentComment = await Comment.findById(parentCommentId);
        if (parentComment && parentComment.userId.toString() !== userId.toString()) {
          notificationService.notifyCommentReply(
            parentComment.userId.toString(),
            userId.toString(),
            media._id.toString(),
            parentCommentId,
            comment._id.toString(),
            media.title
          ).catch(err => console.error('Error sending comment reply notification:', err));
        }
      } catch (error) {
        console.error('Error setting up comment reply notification:', error);
      }
    }

    res.status(201).json({
      message: 'Comment created successfully',
      comment,
    });

  } catch (error) {
    console.error('Error creating comment:', error);
    res.status(500).json({ error: 'Error creating comment', details: error.message });
  }
});

// @route   POST /api/comments/:commentId/like
// @desc    Like/unlike a comment
// @access  Private (requires authentication)
router.post('/comments/:commentId/like', authMiddleware, async (req, res) => {
  try {
    const { commentId } = req.params;
    const userId = req.user._id;

    if (!isValidObjectId(commentId)) {
      return res.status(400).json({ error: 'Invalid comment ID format' });
    }

    const comment = await Comment.findById(commentId);
    if (!comment) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    // Check if user already liked the comment
    const hasLiked = comment.likes.includes(userId);

    if (hasLiked) {
      // Unlike
      comment.likes.pull(userId);
    } else {
      // Like
      comment.likes.push(userId);
    }

    await comment.save();
    await comment.populate('userId', 'username profilePic uuid');

    res.json({
      message: hasLiked ? 'Comment unliked' : 'Comment liked',
      comment,
      hasLiked: !hasLiked,
    });

  } catch (error) {
    console.error('Error toggling comment like:', error);
    res.status(500).json({ error: 'Error toggling comment like', details: error.message });
  }
});

// @route   DELETE /api/comments/:commentId
// @desc    Delete a comment (soft delete)
// @access  Private (comment owner only)
router.delete('/comments/:commentId', authMiddleware, async (req, res) => {
  try {
    const { commentId } = req.params;
    const userId = req.user._id;

    if (!isValidObjectId(commentId)) {
      return res.status(400).json({ error: 'Invalid comment ID format' });
    }

    const comment = await Comment.findById(commentId);
    if (!comment) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    // Check if user owns the comment
    if (comment.userId.toString() !== userId.toString()) {
      return res.status(403).json({ error: 'You can only delete your own comments' });
    }

    // Soft delete
    comment.isDeleted = true;
    comment.deletedAt = new Date();
    await comment.save();

    res.json({
      message: 'Comment deleted successfully',
    });

  } catch (error) {
    console.error('Error deleting comment:', error);
    res.status(500).json({ error: 'Error deleting comment', details: error.message });
  }
});

// @route   POST /api/media/:mediaId/global-bid
// @desc    Place a global bid (chart support) on a media item
// @access  Private
router.post('/:mediaId/global-bid', authMiddleware, async (req, res) => {
  try {
    const { mediaId } = req.params;
    const { amount, externalMedia } = req.body;
    const userId = req.user._id;

    // Validate amount
    if (!amount || amount < 0.01) {
      return res.status(400).json({ error: 'Minimum bid is £0.01' });
    }

    // Get user and check balance
    const User = require('../models/User');
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Convert bid amount from pounds to pence (user input is in pounds)
    const bidAmountPence = Math.round(amount * 100);
    
    // Balance is already stored in pence
    if (user.balance < bidAmountPence) {
      return res.status(400).json({ 
        error: 'Insufficient balance',
        required: amount,
        available: user.balance / 100  // Convert to pounds for error message
      });
    }

    // Find media by ObjectId (preferred) or UUID (fallback)
    // Note: ObjectId is preferred for consistency with other routes, UUID is fallback for compatibility
    let media;
    const isObjectId = isValidObjectId(mediaId);
    const isUuid = !isObjectId && mediaId.includes('-');
    const isExternalRequest = !isObjectId && !isUuid;

    if (isObjectId) {
      // ObjectId format (preferred)
      media = await Media.findById(mediaId);
    } else if (isUuid) {
      // UUID format (fallback)
      media = await Media.findOne({ uuid: mediaId });
    } else {
      media = null; // Treat as external creation request
    }

    if (!media && isExternalRequest) {
      if (!externalMedia) {
        return res.status(400).json({ error: 'External media metadata is required to create a new track.' });
      }

      const { title, artist, sources, coverArt, duration, tags, category } = externalMedia;
      if (!title || !artist) {
        return res.status(400).json({ error: 'Title and artist are required for new media.' });
      }

      const sourceEntries = sources && typeof sources === 'object' ? Object.entries(sources).filter(([, url]) => !!url) : [];
      if (sourceEntries.length === 0) {
        return res.status(400).json({ error: 'At least one media source is required for new media.' });
      }

      const sourcesMap = new Map(sourceEntries);

      media = new Media({
        title,
        artist: [{ name: artist, userId: null, verified: false }],
        coverArt: coverArt || DEFAULT_COVER_ART,
        duration: duration || 0,
        sources: sourcesMap,
        tags: Array.isArray(tags) ? tags.map(tag => capitalizeTag(tag)) : [],
        category: category || 'Unknown',
        addedBy: userId,
        globalMediaAggregate: 0,
        contentType: ['music'],
        contentForm: ['tune'],
        mediaType: ['mp3']
      });

      await media.save();
      console.log(`✅ Created new media via global bid: "${media.title}" (${media._id})`);
    }

    if (!media) {
      return res.status(404).json({ error: 'Media not found' });
    }

    // Get Global Party using new system
    const Party = require('../models/Party');
    const globalParty = await Party.getGlobalParty();
    
    if (!globalParty) {
      return res.status(500).json({ error: 'Global Party not found. Please contact support.' });
    }

    // Check if media already exists in global party
    let partyMediaEntry = globalParty.media.find(m => m.mediaId && m.mediaId.toString() === media._id.toString());
    
    // Create bid using standard party bid flow
    const Bid = require('../models/Bid');
    // Store amount in pence (convert from pounds input)
    const bid = new Bid({
      userId,
      partyId: globalParty._id,
      mediaId: media._id,
      amount: bidAmountPence, // Store in pence
      status: 'active',
      bidScope: 'global', // Mark as global bid
      username: user.username,
      partyName: globalParty.name, // 'Global Party'
      partyType: globalParty.type, // 'global'
      mediaTitle: media.title,
      mediaArtist: media.artist?.[0]?.name || 'Unknown',
      mediaCoverArt: media.coverArt,
      isInitialBid: !partyMediaEntry,
      mediaContentType: media.contentType,
      mediaContentForm: media.contentForm,
      mediaDuration: media.duration
    });

    await bid.save();

    // Allocate artist escrow for this bid (async, don't block response)
    try {
      const artistEscrowService = require('../services/artistEscrowService');
      artistEscrowService.allocateEscrowForBid(bid._id, media._id, bidAmountPence).catch(error => {
        console.error('Failed to allocate escrow for bid:', bid._id, error);
        // Don't fail the bid if escrow allocation fails - log and continue
      });
    } catch (error) {
      console.error('Error setting up escrow allocation:', error);
      // Don't fail the bid if escrow setup fails
    }

    // Calculate and award TuneBytes for this bid (async, don't block response)
    try {
      const tuneBytesService = require('../services/tuneBytesService');
      tuneBytesService.awardTuneBytesForBid(bid._id).catch(error => {
        console.error('Failed to calculate TuneBytes for bid:', bid._id, error);
      });
    } catch (error) {
      console.error('Error setting up TuneBytes calculation:', error);
    }

    // Invalidate and recalculate tag rankings for this user (async, don't block response)
    try {
      const tagRankingsService = require('../services/tagRankingsService');
      tagRankingsService.invalidateUserTagRankings(userId).catch(error => {
        console.error('Failed to invalidate tag rankings:', error);
      });
      // Recalculate tag rankings in background
      tagRankingsService.calculateAndUpdateUserTagRankings(userId, 10).catch(error => {
        console.error('Failed to recalculate tag rankings:', error);
      });
    } catch (error) {
      console.error('Error setting up tag rankings calculation:', error);
    }

    // Update label stats if media has a label (async, don't block response)
    try {
      const labelStatsService = require('../services/labelStatsService');
      if (media.label && Array.isArray(media.label) && media.label.length > 0) {
        // Get all unique labelIds from media's label array
        const labelIds = media.label
          .map(l => l.labelId)
          .filter(id => id != null)
          .filter((id, index, self) => self.indexOf(id) === index); // Remove duplicates
        
        // Update stats for each label
        labelIds.forEach(labelId => {
          labelStatsService.calculateAndUpdateLabelStats(labelId).catch(error => {
            console.error(`Failed to update stats for label ${labelId}:`, error);
          });
        });
      }
    } catch (error) {
      console.error('Error setting up label stats calculation:', error);
    }

    // Add or update media in global party
    if (!partyMediaEntry) {
      partyMediaEntry = {
        mediaId: media._id,
        media_uuid: media.uuid,
        addedBy: userId,
        partyMediaAggregate: bidAmountPence, // Use pence
        partyBids: [bid._id],
        status: 'active',
        queuedAt: new Date(),
        partyMediaBidTop: bidAmountPence, // Use pence
        partyMediaBidTopUser: userId,
        partyMediaAggregateTop: bidAmountPence, // Use pence
        partyMediaAggregateTopUser: userId
      };
      globalParty.media.push(partyMediaEntry);
    } else {
      partyMediaEntry.partyMediaAggregate = (partyMediaEntry.partyMediaAggregate || 0) + bidAmountPence; // Use pence
      partyMediaEntry.partyBids = partyMediaEntry.partyBids || [];
      partyMediaEntry.partyBids.push(bid._id);
      // Ensure status is valid (fix any legacy 'queued' status)
      if (partyMediaEntry.status !== 'active' && partyMediaEntry.status !== 'vetoed') {
        partyMediaEntry.status = 'active';
      }
    }
    
    // Fix any legacy 'queued' statuses in all media entries before saving
    globalParty.media.forEach(entry => {
      if (entry.status && entry.status !== 'active' && entry.status !== 'vetoed') {
        entry.status = 'active';
      }
    });
    
    await globalParty.save();

    // Store previous top bid info for outbid notification
    const previousTopBidAmount = media.globalMediaBidTop || 0; // Already in pence
    const previousTopBidderId = media.globalMediaBidTopUser;
    const wasNewTopBid = bidAmountPence > previousTopBidAmount; // Compare pence to pence

    // Capture PRE balances BEFORE updating media and user
    const userBalancePre = user.balance;
    const mediaAggregatePre = media.globalMediaAggregate || 0;
    
    // Calculate user aggregate PRE (sum of all active bids BEFORE this one)
    const userBidsPre = await Bid.find({
      userId: userId,
      status: 'active'
    }).lean();
    const userAggregatePre = userBidsPre.reduce((sum, b) => sum + (b.amount || 0), 0);

    // Update media's bid arrays (BidMetricsEngine will handle aggregates)
    media.bids = media.bids || [];
    media.bids.push(bid._id);
    
    // Update top bid if this is higher
    if (wasNewTopBid) {
      media.globalMediaBidTop = bidAmountPence; // Use pence
      media.globalMediaBidTopUser = userId;
    }
    
    // Note: media.bids array already contains this bid (added above)
    // No need to maintain separate globalBids array - bidScope field on Bid model is sufficient
    await media.save();

    // Create ledger entry FIRST (before balance update) to capture accurate PRE balances
    try {
      const tuneableLedgerService = require('../services/tuneableLedgerService');
      await tuneableLedgerService.createTipEntry({
        userId,
        mediaId: media._id,
        partyId: globalParty._id,
        bidId: bid._id,
        amount: bidAmountPence,
        userBalancePre,
        userAggregatePre,
        mediaAggregatePre,
        referenceTransactionId: bid._id,
        metadata: {
          bidScope: 'global',
          isNewMedia: !partyMediaEntry,
          platform: 'global-bid'
        }
      });
      console.log(`✅ Ledger entry created for global bid ${bid._id}`);
    } catch (error) {
      console.error('❌ Failed to create ledger entry for global bid:', bid._id);
      console.error('Ledger error details:', {
        userId,
        mediaId: media._id,
        bidId: bid._id,
        amount: bidAmountPence,
        userBalancePre,
        userAggregatePre,
        mediaAggregatePre,
        error: error.message,
        stack: error.stack
      });
      // Don't fail the bid if ledger entry fails - log and continue
    }

    // Send notifications (async, don't block response)
    try {
      const notificationService = require('../services/notificationService');
      
      // Notify media owner if bidder is not the owner
      const mediaOwnerId = media.addedBy?.toString() || media.addedBy?._id?.toString();
      if (mediaOwnerId && mediaOwnerId !== userId.toString()) {
        notificationService.notifyBidReceived(
          mediaOwnerId,
          userId.toString(),
          media._id.toString(),
          bid._id.toString(),
          bidAmountPence, // Use pence
          media.title
        ).catch(err => console.error('Error sending bid received notification:', err));
      }
      
      // Notify previous top bidder if they were outbid (and it's not the same user)
      if (wasNewTopBid && previousTopBidderId && previousTopBidderId.toString() !== userId.toString()) {
        notificationService.notifyOutbid(
          previousTopBidderId.toString(),
          media._id.toString(),
          bid._id.toString(),
          bidAmountPence, // Use pence
          media.title
        ).catch(err => console.error('Error sending outbid notification:', err));
      }
    } catch (error) {
      console.error('Error setting up notifications:', error);
    }

    // Update user balance (already in pence, no conversion needed) - AFTER ledger entry
    user.balance = user.balance - bidAmountPence;
    await user.save();

    // Send high-value bid notification
    // Note: bid.amount is in pence, threshold is in pounds (£10 = 1000 pence)
    const { sendHighValueBidNotification } = require('../utils/emailService');
    const HIGH_VALUE_THRESHOLD_PENCE = 1000; // £10 in pence
    if (bidAmountPence >= HIGH_VALUE_THRESHOLD_PENCE) {
      try {
        await sendHighValueBidNotification(bid, media, user, 10); // Pass threshold in pounds
      } catch (emailError) {
        console.error('Failed to send high-value bid notification:', emailError);
      }
    }

    res.json({
      message: 'Global bid placed successfully',
      bid,
      updatedBalance: user.balance,
      globalPartyId: globalParty._id
    });
  } catch (error) {
    console.error('Error placing global bid:', error);
    res.status(500).json({ error: 'Failed to place global bid', details: error.message });
  }
});

// @route   GET /api/media/:mediaId/top-parties
// @desc    Get top parties where this media appears
// @access  Public
router.get('/:mediaId/top-parties', async (req, res) => {
  try {
    const { mediaId } = req.params;
    const { limit = 10 } = req.query;

    console.log('🎪 Top parties request for media:', mediaId);

    // Handle both ObjectIds and UUIDs
    let actualMediaId = mediaId;
    if (!isValidObjectId(mediaId)) {
      // If it's not an ObjectId, try to find by UUID
      const media = await Media.findOne({ uuid: mediaId }).select('_id');
      if (!media) {
        return res.status(404).json({ error: 'Media not found' });
      }
      actualMediaId = media._id;
    }

    console.log('✅ Using media ID:', actualMediaId);

    // Find all parties that contain this media
    const Party = require('../models/Party');
    // TODO: Exclude Global Party once we have many parties
    // const GLOBAL_PARTY_ID = '67c6a02895baad05d3a97cf4';
    
    const parties = await Party.find({
      'media.mediaId': actualMediaId,
      status: { $in: ['active', 'scheduled'] }
      // _id: { $ne: GLOBAL_PARTY_ID } // Temporarily include Global Party for visibility
    })
      .populate('host', 'username uuid profilePic')
      .lean();

    console.log('📊 Found parties containing this media:', parties.length);

    // Extract party info and bid totals for this media
    const partyStats = parties.map(party => {
      const mediaEntry = party.media.find(m => m.mediaId.toString() === actualMediaId.toString());
      console.log(`  Party "${party.name}": aggregate=${mediaEntry?.partyMediaAggregate || 0}, bids=${mediaEntry?.partyBids?.length || 0}`);
      return {
        _id: party._id,
        name: party.name,
        location: party.location,
        host: party.host,
        partyMediaAggregate: mediaEntry?.partyMediaAggregate || 0,
        bidCount: mediaEntry?.partyBids?.length || 0,
        status: party.status
      };
    })
      .filter(p => p.partyMediaAggregate > 0) // Only include parties with bids
      .sort((a, b) => b.partyMediaAggregate - a.partyMediaAggregate) // Sort by bid total
      .slice(0, parseInt(limit) || 10);

    console.log('✅ Returning', partyStats.length, 'parties with bids');

    res.json({
      parties: partyStats
    });
  } catch (error) {
    console.error('Error fetching top parties:', error);
    res.status(500).json({ error: 'Failed to fetch top parties' });
  }
});

// @route   GET /api/media/:mediaId/tag-rankings
// @desc    Get tag rankings for a specific media item
// @access  Public
router.get('/:mediaId/tag-rankings', async (req, res) => {
  try {
    const { mediaId } = req.params;

    console.log('🏷️ Tag rankings request for media:', mediaId);

    // Handle both ObjectIds and UUIDs
    let actualMediaId = mediaId;
    if (!isValidObjectId(mediaId)) {
      // If it's not an ObjectId, try to find by UUID
      const mediaByUuid = await Media.findOne({ uuid: mediaId }).select('_id');
      if (!mediaByUuid) {
        return res.status(404).json({ error: 'Media not found' });
      }
      actualMediaId = mediaByUuid._id;
    }

    const media = await Media.findById(actualMediaId);
    if (!media) {
      return res.status(404).json({ error: 'Media not found' });
    }

    if (!media.tags || media.tags.length === 0) {
      return res.json({ tagRankings: [] });
    }

    console.log('📊 Computing rankings for tags:', media.tags);

    // Calculate ranking for each tag
    const tagRankings = [];
    
    for (const tag of media.tags) {
      // Find all media with this tag, sorted by globalMediaAggregate
      const mediaWithTag = await Media.find({ 
        tags: tag,
        contentType: { $in: ['music'] } // Only music for now
      })
        .sort({ globalMediaAggregate: -1 })
        .select('uuid title globalMediaAggregate')
        .lean();
      
      // Find this media's rank
      const rankIndex = mediaWithTag.findIndex(m => m._id.toString() === actualMediaId.toString());
      const rank = rankIndex + 1;
      const total = mediaWithTag.length;
      const percentile = total > 0 ? ((total - rank) / total * 100).toFixed(1) : '0';
      
      tagRankings.push({
        tag,
        rank,
        total,
        percentile: parseFloat(percentile),
        aggregate: media.globalMediaAggregate || 0
      });
      
      console.log(`  Tag "${tag}": Rank #${rank} of ${total} (Top ${percentile}%)`);
    }

    // Sort by best rank (lowest number)
    tagRankings.sort((a, b) => a.rank - b.rank);

    console.log('✅ Returning', tagRankings.length, 'tag rankings');

    res.json({
      tagRankings
    });
  } catch (error) {
    console.error('Error fetching tag rankings:', error);
    res.status(500).json({ error: 'Failed to fetch tag rankings' });
  }
});

// @route   GET /api/media/admin/stats
// @desc    Get media statistics (admin only)
// @access  Private (Admin)
router.get('/admin/stats', authMiddleware, async (req, res) => {
  try {
    // Check if user is admin
    if (!req.user.role || !req.user.role.includes('admin')) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const totalMedia = await Media.countDocuments({ contentType: { $in: ['music'] } });
    
    res.json({
      totalMedia
    });
  } catch (error) {
    console.error('Error fetching media stats:', error);
    res.status(500).json({ error: 'Failed to fetch media stats' });
  }
});

// @route   GET /api/media/admin/all
// @desc    Get all media with filtering, sorting, and pagination (admin only)
// @access  Private (Admin)
router.get('/admin/all', authMiddleware, async (req, res) => {
  try {
    // Check if user is admin
    if (!req.user.role || !req.user.role.includes('admin')) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const {
      page = 1,
      limit = 50,
      sortBy = 'uploadedAt',
      sortOrder = 'desc',
      contentType,
      contentForm,
      search,
      addedBy,
      labelId,
      rightsCleared,
      dateFrom,
      dateTo
    } = req.query;

    // Build query
    const query = {};

    // Content type filter
    if (contentType) {
      if (Array.isArray(contentType)) {
        query.contentType = { $in: contentType };
      } else {
        query.contentType = contentType;
      }
    }

    // Content form filter
    if (contentForm) {
      if (Array.isArray(contentForm)) {
        query.contentForm = { $in: contentForm };
      } else {
        query.contentForm = contentForm;
      }
    }

    // Added by filter
    if (addedBy && isValidObjectId(addedBy)) {
      query.addedBy = addedBy;
    }

    // Label filter (check if media has this label in label array)
    if (labelId && isValidObjectId(labelId)) {
      query['label.labelId'] = labelId;
    }

    // Rights cleared filter
    if (rightsCleared !== undefined) {
      query.rightsCleared = rightsCleared === 'true';
    }

    // Search filter (searches title, artist names, tags, genres)
    if (search && search.trim().length > 0) {
      const searchRegex = new RegExp(search.trim(), 'i');
      query.$or = [
        { title: searchRegex },
        { 'artist.name': searchRegex },
        { creatorNames: searchRegex },
        { tags: searchRegex },
        { genres: searchRegex }
      ];
    }

    // Date range filter
    if (dateFrom || dateTo) {
      query.uploadedAt = {};
      if (dateFrom) {
        query.uploadedAt.$gte = new Date(dateFrom);
      }
      if (dateTo) {
        query.uploadedAt.$lte = new Date(dateTo);
      }
    }

    // Build sort object
    const sort = {};
    const validSortFields = ['uploadedAt', 'title', 'globalMediaAggregate', 'globalMediaBidTop', 'playCount', 'popularity', 'createdAt', 'duration', 'fileSize', 'creatorNames'];
    let sortField = validSortFields.includes(sortBy) ? sortBy : 'uploadedAt';
    
    // Special handling for artist sorting - use creatorNames array first element
    if (sortBy === 'artist') {
      sortField = 'creatorNames';
    }
    
    sort[sortField] = sortOrder === 'asc' ? 1 : -1;

    // Fetch media with populated references
    const media = await Media.find(query)
      .populate('addedBy', 'username profilePic uuid')
      .populate('globalMediaBidTopUser', 'username uuid')
      .populate('globalMediaAggregateTopUser', 'username uuid')
      .populate('mediaOwners.userId', 'username uuid')
      .populate('label.labelId', 'name slug')
      .populate({
        path: 'artist.userId',
        model: 'User',
        select: 'username profilePic uuid creatorProfile.artistName'
      })
      .populate({
        path: 'artist.collectiveId',
        model: 'Collective',
        select: 'name slug profilePicture verificationStatus'
      })
      .populate({
        path: 'featuring.userId',
        model: 'User',
        select: 'username profilePic uuid creatorProfile.artistName'
      })
      .sort(sort)
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));

    const total = await Media.countDocuments(query);

    // Format response
    const formattedMedia = media.map(item => {
      const artistNames = item.artist && item.artist.length > 0
        ? item.artist.map(a => a.name).join(', ')
        : (item.creatorNames && item.creatorNames.length > 0 ? item.creatorNames[0] : 'Unknown Artist');

      const totalOwnership = item.mediaOwners && item.mediaOwners.length > 0
        ? item.mediaOwners.reduce((sum, owner) => sum + (owner.percentage || 0), 0)
        : 0;

      return {
        _id: item._id,
        uuid: item.uuid,
        title: item.title,
        artist: artistNames,
        artists: item.artist || [], // Full artist array with userIds for ClickableArtistDisplay
        artistArray: item.artist || [],
        coverArt: item.coverArt,
        contentType: item.contentType || [],
        contentForm: item.contentForm || [],
        mediaType: item.mediaType || [],
        duration: item.duration,
        fileSize: item.fileSize,
        tags: item.tags || [],
        genres: item.genres || [],
        explicit: item.explicit || false,
        rightsCleared: item.rightsCleared || false,
        uploadedAt: item.uploadedAt || item.createdAt,
        createdAt: item.createdAt,
        addedBy: item.addedBy ? {
          _id: item.addedBy._id,
          username: item.addedBy.username,
          profilePic: item.addedBy.profilePic,
          uuid: item.addedBy.uuid
        } : null,
        globalMediaAggregate: item.globalMediaAggregate || 0,
        globalMediaBidTop: item.globalMediaBidTop || 0,
        globalMediaBidTopUser: item.globalMediaBidTopUser ? {
          _id: item.globalMediaBidTopUser._id,
          username: item.globalMediaBidTopUser.username,
          uuid: item.globalMediaBidTopUser.uuid
        } : null,
        globalMediaAggregateTopUser: item.globalMediaAggregateTopUser ? {
          _id: item.globalMediaAggregateTopUser._id,
          username: item.globalMediaAggregateTopUser.username,
          uuid: item.globalMediaAggregateTopUser.uuid
        } : null,
        playCount: item.playCount || 0,
        popularity: item.popularity || 0,
        mediaOwners: item.mediaOwners ? item.mediaOwners.map(owner => ({
          userId: owner.userId?._id || owner.userId,
          username: owner.userId?.username,
          percentage: owner.percentage,
          role: owner.role,
          verified: owner.verified
        })) : [],
        totalOwnership: totalOwnership,
        ownerCount: item.mediaOwners ? item.mediaOwners.length : 0,
        label: item.label && item.label.length > 0 ? item.label.map(l => ({
          labelId: l.labelId?._id || l.labelId,
          name: l.labelId?.name || 'Unknown',
          slug: l.labelId?.slug
        })) : []
      };
    });

    res.json({
      media: formattedMedia,
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(total / parseInt(limit))
    });
  } catch (error) {
    console.error('Error fetching media:', error);
    res.status(500).json({ error: 'Failed to fetch media', details: error.message });
  }
});

// @route   PUT /api/media/admin/:mediaId
// @desc    Update media metadata (admin only)
// @access  Private (Admin)
router.put('/admin/:mediaId', authMiddleware, async (req, res) => {
  try {
    // Check if user is admin
    if (!req.user.role || !req.user.role.includes('admin')) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { mediaId } = req.params;
    const { title, artist, artists } = req.body;

    if (!isValidObjectId(mediaId)) {
      return res.status(400).json({ error: 'Invalid media ID format' });
    }

    const media = await Media.findById(mediaId);
    if (!media) {
      return res.status(404).json({ error: 'Media not found' });
    }

    // Update title if provided
    if (title !== undefined) {
      if (!title || title.trim().length === 0) {
        return res.status(400).json({ error: 'Title cannot be empty' });
      }
      media.title = title.trim();
    }

    // Store old artist for edit history
    const oldArtist = media.artist && media.artist.length > 0 
      ? media.artist.map(a => a.name).join(', ')
      : '';

    // Update artist if provided (handle both array and string formats)
    let newArtistNames = null;
    if (artists !== undefined && Array.isArray(artists)) {
      // Handle artists array format (from MultiArtistInput)
      if (artists.length === 0) {
        return res.status(400).json({ error: 'At least one artist is required' });
      }
      
      media.artist = artists.map((artistEntry, index) => {
        if (typeof artistEntry === 'object' && artistEntry.name) {
          return {
            name: artistEntry.name.trim(),
            userId: artistEntry.userId || null,
            collectiveId: artistEntry.collectiveId || null,
            relationToNext: index === artists.length - 1 ? null : (artistEntry.relationToNext || null),
            verified: artistEntry.verified || false
          };
        }
        // Fallback if it's just a string
        return {
          name: typeof artistEntry === 'string' ? artistEntry.trim() : '',
          userId: null,
          collectiveId: null,
          relationToNext: null,
          verified: false
        };
      });
      
      newArtistNames = media.artist.map(a => a.name);
      media.creatorNames = newArtistNames;
    } else if (artist !== undefined) {
      // Handle legacy string format or array format in artist field
      if (Array.isArray(artist) && artist.length > 0) {
        // Array format in artist field
        media.artist = artist.map((artistEntry, index) => {
          if (typeof artistEntry === 'object' && artistEntry.name) {
            return {
              name: artistEntry.name.trim(),
              userId: artistEntry.userId || null,
              collectiveId: artistEntry.collectiveId || null,
              relationToNext: index === artist.length - 1 ? null : (artistEntry.relationToNext || null),
              verified: artistEntry.verified || false
            };
          }
          return {
            name: typeof artistEntry === 'string' ? artistEntry.trim() : '',
            userId: null,
            collectiveId: null,
            relationToNext: null,
            verified: false
          };
        });
        newArtistNames = media.artist.map(a => a.name);
      } else if (typeof artist === 'string' && artist.trim().length > 0) {
        // String format - parse comma-separated
        newArtistNames = artist.split(',').map(name => name.trim()).filter(name => name.length > 0);
        if (newArtistNames.length === 0) {
          return res.status(400).json({ error: 'At least one artist name is required' });
        }

        // Convert to artist subdocuments
        media.artist = newArtistNames.map(name => ({
          name: name,
          userId: null,
          collectiveId: null,
          verified: false
        }));
      } else {
        return res.status(400).json({ error: 'Artist cannot be empty' });
      }

      // Update creatorNames for search
      media.creatorNames = newArtistNames;
    }

    // Add to edit history
    if (!media.editHistory) {
      media.editHistory = [];
    }
    
    const changes = [];
    if (title !== undefined && title.trim() !== media.title) {
      changes.push({
        field: 'title',
        oldValue: media.title,
        newValue: title.trim()
      });
    }
    if (artist !== undefined && newArtistNames) {
      const newArtist = newArtistNames.join(', ');
      if (oldArtist !== newArtist) {
        changes.push({
          field: 'artist',
          oldValue: oldArtist,
          newValue: newArtist
        });
      }
    }

    if (changes.length > 0) {
      media.editHistory.push({
        editedBy: req.user._id,
        editedAt: new Date(),
        changes: changes
      });
    }

    await media.save();

    // Format response
    const artistNames = media.artist && media.artist.length > 0
      ? media.artist.map(a => a.name).join(', ')
      : (media.creatorNames && media.creatorNames.length > 0 ? media.creatorNames[0] : 'Unknown Artist');

    res.json({
      message: 'Media updated successfully',
      media: {
        _id: media._id,
        uuid: media.uuid,
        title: media.title,
        artist: artistNames,
        artistArray: media.artist || []
      }
    });
  } catch (error) {
    console.error('Error updating media:', error);
    res.status(500).json({ error: 'Failed to update media', details: error.message });
  }
});

// @route   GET /api/media/share/:id
// @desc    Serve HTML with Open Graph meta tags for Facebook sharing
// @access  Public
router.get('/share/:id', async (req, res) => {
  // Log immediately to ensure route is being hit
  // This will appear in BACKEND server logs, not browser console
  console.log('🔵🔵🔵 SHARE ROUTE HIT 🔵🔵🔵');
  console.log('Request details:', {
    id: req.params.id,
    url: req.url,
    path: req.path,
    originalUrl: req.originalUrl,
    userAgent: req.headers['user-agent']?.substring(0, 100),
    referer: req.headers['referer'],
    query: req.query,
    headers: Object.keys(req.headers)
  });
  
  try {
    const { id } = req.params;
    
    // Clean up ID - remove any extra slashes or whitespace
    const cleanId = id ? id.trim().replace(/^\/+|\/+$/g, '') : null;
    
    if (!cleanId) {
      console.error('❌ No ID provided in share route');
      return res.status(400).send('Invalid media ID');
    }
    
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    
    // Detect if this is Facebook's crawler (or other social media crawlers)
    const userAgent = req.headers['user-agent'] || '';
    const requestUrl = req.url || '';
    
    // Facebook uses facebookexternalhit/1.1 or facebookexternalhit/2.0 or Facebot
    // Also check for any request with fbclid parameter (Facebook link tracking)
    const isFacebookCrawler = /facebookexternalhit|Facebot/i.test(userAgent);
    const isInstagramCrawler = /InstagramExternalHit|Instagram/i.test(userAgent);
    const isOtherSocialBot = /Twitterbot|LinkedInBot|WhatsApp|Slackbot|SkypeUriPreview|Applebot|Googlebot/i.test(userAgent);
    
    // Check for Facebook's specific headers or query params
    const hasFbclid = !!req.query.fbclid;
    const hasFacebookHeader = !!req.headers['x-facebook-request-id'] || !!req.headers['x-forwarded-for'];
    
    // Facebook Sharing Debugger might not have typical user-agent - check for fbclid in URL
    // This is a reliable indicator that Facebook is accessing the link
    const isFacebookShareDebugger = hasFbclid || /fbclid=/i.test(requestUrl);
    
    // More lenient detection - if user-agent contains 'facebook', 'bot', 'crawler', 'spider', or 'scraper'
    // OR if it's missing a typical browser user-agent, treat as potential crawler
    const isGenericBot = /bot|crawler|spider|scraper|facebook/i.test(userAgent);
    const looksLikeBrowser = /mozilla|chrome|safari|firefox|edge|opera/i.test(userAgent);
    
    // CRITICAL: If URL contains /api/media/share/ - ALWAYS treat as potential crawler
    // This ensures Facebook's crawler NEVER gets redirected before reading meta tags
    const isShareRoute = /\/api\/media\/share\//i.test(requestUrl);
    
    // CRITICAL: For /api/media/share/ route, ALWAYS treat as crawler - NEVER redirect
    // This ensures Facebook's crawler ALWAYS gets meta tags, never redirected
    // NO EXCEPTIONS - share route NEVER redirects
    const isCrawler = true; // ALWAYS true for share route - never redirect
    
    // For debugging - log what we detect
    const shouldServeMetaTags = isCrawler; // Serve meta tags without redirect for crawlers

    // Find media by _id (ObjectId) or UUID (for backward compatibility)
    let media;
    if (id.includes('-') && id.length > 20) {
      // UUID format (has dashes and is longer)
      media = await Media.findOne({ uuid: id });
    } else if (isValidObjectId(id)) {
      // ObjectId format (shorter, 24 characters)
      media = await Media.findById(id);
    } else {
      // For share route, always return error page with meta tags (never redirect)
      console.error('❌ Invalid media ID in share route:', cleanId);
      return res.status(400).send(`
        <!DOCTYPE html>
        <html prefix="og: http://ogp.me/ns# fb: http://ogp.me/ns/fb#">
        <head>
          <meta charset="UTF-8">
          <meta property="og:title" content="Tuneable - Invalid ID" />
          <meta property="og:description" content="The tune you're looking for could not be found." />
          <meta property="og:url" content="${frontendUrl}" />
          <meta property="og:image" content="${DEFAULT_COVER_ART}" />
          <meta property="fb:app_id" content="${process.env.FACEBOOK_APP_ID || '2050833255363564'}" />
          <title>Tuneable - Invalid ID</title>
        </head>
        <body>
          <p>Invalid media ID.</p>
        </body>
        </html>
      `);
      // For regular browsers, redirect
      return res.status(400).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta http-equiv="refresh" content="0;url=${frontendUrl}">
          <title>Tuneable - Invalid ID</title>
        </head>
        <body>
          <p>Invalid media ID. Redirecting to <a href="${frontendUrl}">Tuneable</a>...</p>
        </body>
        </html>
      `);
    }

    if (!media) {
      // For share route, always return error page with meta tags (never redirect)
      console.error('❌ Media not found in share route:', cleanId);
      return res.status(404).send(`
        <!DOCTYPE html>
        <html prefix="og: http://ogp.me/ns# fb: http://ogp.me/ns/fb#">
        <head>
          <meta charset="UTF-8">
          <meta property="og:title" content="Tuneable - Tune Not Found" />
          <meta property="og:description" content="The tune you're looking for could not be found." />
          <meta property="og:url" content="${frontendUrl}/tune/${cleanId}" />
          <meta property="og:image" content="${DEFAULT_COVER_ART}" />
          <meta property="fb:app_id" content="${process.env.FACEBOOK_APP_ID || '2050833255363564'}" />
          <title>Tuneable - Tune Not Found</title>
        </head>
        <body>
          <p>Tune not found.</p>
        </body>
        </html>
      `);
      // For regular browsers, redirect
      return res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta http-equiv="refresh" content="0;url=${frontendUrl}/tune/${id}">
          <title>Tuneable - Tune Not Found</title>
        </head>
        <body>
          <p>Redirecting to <a href="${frontendUrl}/tune/${id}">Tuneable</a>...</p>
        </body>
        </html>
      `);
    }

    // Get cover art using the utility function (handles fallback chain)
    const coverArtUrl = getMediaCoverArt(media);
    
    // Get absolute image URL - ensure it's always a full URL
    const getAbsoluteImageUrl = (imageUrl) => {
      if (!imageUrl || imageUrl.trim() === '') {
        console.warn('⚠️ No cover art URL, using default');
        return DEFAULT_COVER_ART;
      }
      
      const trimmed = imageUrl.trim();
      
      // Already a full URL
      if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
        return trimmed;
      }
      
      // Relative path starting with /
      if (trimmed.startsWith('/')) {
        // If it's already a full path like /uploads/..., use frontend URL
        if (trimmed.startsWith('/uploads/') || trimmed.startsWith('/cover-art/')) {
          return `${frontendUrl}${trimmed}`;
        }
        return `${frontendUrl}${trimmed}`;
      }
      
      // Relative path without leading slash
      return `${frontendUrl}/${trimmed}`;
    };

    // Helper function to escape HTML
    const escapeHtml = (text) => {
      if (!text) return '';
      return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    };

    // Use creatorDisplay field (already a formatted string from artist/featuring arrays)
    // If creatorDisplay doesn't exist, try to build it from artist array
    let creatorDisplay = media.creatorDisplay;
    if (!creatorDisplay && media.artist && Array.isArray(media.artist) && media.artist.length > 0) {
      creatorDisplay = media.artist.map(a => a.name || a).join(', ');
    }
    
    const artistText = creatorDisplay ? ` by ${creatorDisplay}` : '';
    const mediaTitle = (media.title && media.title.trim()) || 'Untitled Tune';
    
    // Ensure we have a valid cover art URL
    const ogImage = getAbsoluteImageUrl(coverArtUrl);
    
    // Build title and description
    const ogTitle = escapeHtml(`${mediaTitle}${artistText} | Tuneable`);
    const ogDescription = escapeHtml(`Support your Favourite Tunes and Artists on Tuneable! Check out "${mediaTitle}"${artistText} and join the community.`);
    // Use _id for shorter URLs
    const ogUrl = `${frontendUrl}/tune/${media._id}`;
    const escapedTitle = escapeHtml(mediaTitle);
    const escapedId = escapeHtml(media._id.toString());
    
    // Log for debugging (including production for troubleshooting)
    console.log('🔍 Share route debug:', {
      mediaId: id,
      mediaFound: !!media,
      mediaTitle: media?.title,
      mediaCreatorDisplay: media?.creatorDisplay,
      computedCreatorDisplay: creatorDisplay,
      coverArtUrl: coverArtUrl,
      ogImage: ogImage,
      ogTitle: ogTitle,
      ogDescription: ogDescription,
      ogUrl: ogUrl,
      isFacebookCrawler: isFacebookCrawler,
      isInstagramCrawler: isInstagramCrawler,
      isOtherSocialBot: isOtherSocialBot,
      hasFbclid: hasFbclid,
      hasFacebookHeader: hasFacebookHeader,
      isFromFacebook: isFromFacebook,
      isShareRoute: isShareRoute,
      isCrawler: isCrawler,
      shouldServeMetaTags: shouldServeMetaTags,
      userAgent: userAgent.substring(0, 150), // First 150 chars of UA
      referer: referer.substring(0, 100) // First 100 chars of referer
    });

    // Serve HTML with proper meta tags
    // CRITICAL: Meta tags MUST be in <head> before any redirect meta tags
    // Facebook's crawler needs time to read meta tags before redirect
    const html = `<!DOCTYPE html>
<html lang="en" prefix="og: http://ogp.me/ns# fb: http://ogp.me/ns/fb# music: http://ogp.me/ns/music#">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="canonical" href="${ogUrl}" />
  <title>${ogTitle}</title>
  <meta name="description" content="${ogDescription}">
  
  <!-- Open Graph / Facebook - MUST be in this order for Facebook -->
  <meta property="og:type" content="music.song" />
  <meta property="og:url" content="${ogUrl}" />
  <meta property="og:title" content="${ogTitle}" />
  <meta property="og:description" content="${ogDescription}" />
  <meta property="og:image" content="${ogImage}" />
  <meta property="og:image:secure_url" content="${ogImage}" />
  <meta property="og:image:type" content="image/png" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:image:alt" content="${escapeHtml(mediaTitle + artistText)}" />
  <meta property="og:site_name" content="Tuneable" />
  <meta property="og:locale" content="en_US" />
  <meta property="fb:app_id" content="${process.env.FACEBOOK_APP_ID ? escapeHtml(process.env.FACEBOOK_APP_ID) : '2050833255363564'}" />
  
  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:url" content="${ogUrl}" />
  <meta name="twitter:title" content="${ogTitle}" />
  <meta name="twitter:description" content="${ogDescription}" />
  <meta name="twitter:image" content="${ogImage}" />
  
  ${!isCrawler ? `
  <!-- Redirect to frontend after a delay (only for regular browsers, not crawlers) -->
  <!-- Note: Meta tags above are already served, so crawlers can read them before redirect -->
  <!-- Increased delay to 5 seconds to ensure crawlers have time to read meta tags -->
  <meta http-equiv="refresh" content="5;url=${ogUrl}">
  
  <!-- Fallback redirect via JavaScript (delayed to allow crawlers to read meta tags) -->
  <script>
    // Only redirect if this is definitely a browser (not a crawler)
    // Crawlers typically don't execute JavaScript, but we add this as a fallback
    setTimeout(function() {
      // Double-check we're not a crawler before redirecting
      if (navigator.userAgent && !/bot|crawler|spider|facebookexternalhit|facebot|instagram/i.test(navigator.userAgent.toLowerCase())) {
        window.location.href = "${ogUrl}";
      }
    }, 5000); // 5 second delay to allow crawlers to read meta tags
  </script>
  ` : ''}
</head>
<body>
  ${isCrawler ? `
  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; text-align: center;">
    <h1>${escapedTitle}</h1>
    <p>${ogDescription}</p>
    <p><a href="${ogUrl}">Listen on Tuneable</a></p>
  </div>
  ` : `
  <p>Redirecting to <a href="${ogUrl}">${escapedTitle}</a> on Tuneable...</p>
  `}
</body>
</html>`;

    // Ensure we always send HTML with proper headers
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=300'); // Cache for 5 minutes
    res.send(html);
  } catch (error) {
    console.error('❌ Error serving share page:', error);
    console.error('Error stack:', error.stack);
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    
    // Detect if this is a crawler even in error case
    const userAgent = req.headers['user-agent'] || '';
    const hasFbclid = !!req.query.fbclid;
    const isCrawler = /facebookexternalhit|Facebot|Twitterbot|LinkedInBot|WhatsApp|Slackbot|SkypeUriPreview|Applebot|Googlebot|bot|crawler|spider|scraper/i.test(userAgent) || hasFbclid;
    
    // For crawlers, serve error page with meta tags instead of redirecting
    if (isCrawler) {
      return res.status(500).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta property="og:title" content="Tuneable - Error" />
          <meta property="og:description" content="Sorry, there was an error loading this tune." />
          <meta property="og:url" content="${frontendUrl}" />
          <meta property="og:image" content="${DEFAULT_COVER_ART}" />
          <meta property="og:site_name" content="Tuneable" />
          <meta property="fb:app_id" content="${process.env.FACEBOOK_APP_ID ? process.env.FACEBOOK_APP_ID : '2050833255363564'}" />
          <title>Tuneable - Error</title>
        </head>
        <body>
          <p>Sorry, there was an error loading this tune.</p>
        </body>
        </html>
      `);
    }
    
    // For regular browsers, redirect
    res.status(500).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta http-equiv="refresh" content="0;url=${frontendUrl}">
        <title>Tuneable - Error</title>
      </head>
      <body>
        <p>Error loading tune. Redirecting to <a href="${frontendUrl}">Tuneable</a>...</p>
      </body>
      </html>
    `);
  }
});

// ========================================
// GLOBAL VETO ENDPOINTS (Admin only)
// ========================================

const adminMiddleware = require('../middleware/adminMiddleware');

/**
 * @route   POST /api/media/:mediaId/veto
 * @desc    Globally veto a media item (admin only)
 * @access  Private (admin)
 * 
 * This endpoint performs a complete global veto:
 * - Updates Media.status to 'vetoed'
 * - Refunds ALL active bids across ALL parties
 * - Updates ALL bid statuses to 'vetoed'
 * - Updates party.media[].status to 'vetoed' for ALL parties that have this media
 * - Sends notifications to all affected users
 */
router.post('/:mediaId/veto', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { mediaId } = req.params;
    const { reason } = req.body;
    const mongoose = require('mongoose');
    const Bid = require('../models/Bid');
    const User = require('../models/User');
    const Party = require('../models/Party');
    const notificationService = require('../services/notificationService');

    // Handle both ObjectId and UUID formats
    let actualMediaId = mediaId;
    let media = null;
    
    if (mongoose.isValidObjectId(mediaId)) {
      media = await Media.findById(mediaId);
      actualMediaId = mediaId;
    } else {
      media = await Media.findOne({ uuid: mediaId });
      if (media) {
        actualMediaId = media._id.toString();
      }
    }

    if (!media) {
      return res.status(404).json({ error: 'Media not found' });
    }

    if (media.status === 'vetoed') {
      return res.status(400).json({ error: 'Media is already globally vetoed' });
    }

    // Ensure actualMediaId is an ObjectId for queries
    const mediaObjectIdForQuery = mongoose.isValidObjectId(actualMediaId) 
      ? new mongoose.Types.ObjectId(actualMediaId)
      : actualMediaId;

    // Find ALL active bids for this media across ALL parties
    const bidsToRefund = await Bid.find({
      mediaId: mediaObjectIdForQuery,
      status: 'active'
    }).populate('userId', 'balance uuid username');
    
    console.log(`🌍 Global veto: Found ${bidsToRefund.length} total active bids for this media across all parties`);

    // Group bids by userId for efficient refunds
    const refundsByUser = new Map();
    
    for (const bid of bidsToRefund) {
      // Skip bids with null or invalid userId (e.g., deleted users)
      if (!bid.userId || !bid.userId._id) {
        console.warn(`⚠️ Skipping bid ${bid._id} - user not found (likely deleted)`);
        // Still mark the bid as vetoed even if we can't refund
        await Bid.findByIdAndUpdate(bid._id, { status: 'vetoed' });
        continue;
      }
      
      const userId = bid.userId._id.toString();
      
      if (!refundsByUser.has(userId)) {
        refundsByUser.set(userId, {
          user: bid.userId,
          totalAmount: 0,
          bidIds: []
        });
      }
      
      const refund = refundsByUser.get(userId);
      refund.totalAmount += bid.amount;
      refund.bidIds.push(bid._id);
    }

    // Refund all users and update bid statuses
    const refundPromises = [];
    
    for (const [userId, refund] of refundsByUser) {
      // Get user and media for PRE balances
      const user = await User.findById(userId);
      
      if (!user || !media) {
        console.warn(`⚠️ Skipping refund - user or media not found`);
        continue;
      }
      
      // Capture PRE balances BEFORE updating
      const userBalancePre = user.balance || 0;
      const mediaAggregatePre = media.globalMediaAggregate || 0;
      
      // Calculate user aggregate PRE (sum of all active bids BEFORE refund)
      const Bid = require('../models/Bid');
      const userBidsPre = await Bid.find({
        userId: userId,
        status: 'active'
      }).lean();
      const userAggregatePre = userBidsPre.reduce((sum, bid) => sum + (bid.amount || 0), 0);
      
      // Create ledger entries for each bid being refunded BEFORE balance update
      // Process bids in order to maintain accurate balance and aggregate tracking
      let runningUserBalance = userBalancePre;
      let runningUserAggregate = userAggregatePre;
      let runningMediaAggregate = mediaAggregatePre;
      
      for (const bidId of refund.bidIds) {
        try {
          const bid = await Bid.findById(bidId);
          if (bid) {
            const tuneableLedgerService = require('../services/tuneableLedgerService');
            await tuneableLedgerService.createRefundEntry({
              userId: user._id,
              mediaId: media._id,
              partyId: bid.partyId || null,
              bidId: bid._id,
              amount: bid.amount,
              userBalancePre: runningUserBalance, // Cumulative balance
              userAggregatePre: runningUserAggregate, // Adjust per bid
              mediaAggregatePre: runningMediaAggregate, // Adjust per bid
              referenceTransactionId: null,
              metadata: {
                reason: 'Media globally vetoed',
                vetoedBy: req.user._id.toString()
              }
            });
            
            // Update running balances/aggregates for next bid
            runningUserBalance = runningUserBalance + bid.amount;
            runningUserAggregate = Math.max(0, runningUserAggregate - bid.amount);
            runningMediaAggregate = Math.max(0, runningMediaAggregate - bid.amount);
          }
        } catch (ledgerError) {
          console.error(`Failed to create ledger entry for refund bid ${bidId}:`, ledgerError);
          // Don't fail the refund if ledger entry fails
        }
      }
      
      // Refund user balance (add back the amount) AFTER ledger entries are created
      refundPromises.push(
        User.findByIdAndUpdate(userId, {
          $inc: { balance: refund.totalAmount }
        })
      );
      
      const username = refund.user?.username || 'Unknown User';
      console.log(`💰 Refunding £${(refund.totalAmount / 100).toFixed(2)} to user ${username}`);
      
      // Update all bids for this user to 'vetoed' status
      refundPromises.push(
        Bid.updateMany(
          { _id: { $in: refund.bidIds } },
          { 
            $set: { 
              status: 'vetoed',
              vetoedBy: req.user._id,
              vetoedReason: reason || null,
              vetoedAt: new Date()
            } 
          }
        )
      );
    }
    
    await Promise.all(refundPromises);

    // Update Media.status to 'vetoed'
    media.status = 'vetoed';
    media.vetoedAt = new Date();
    media.vetoedBy = req.user._id;
    media.vetoedReason = reason || null;
    await media.save();

    // Update party.media[].status to 'vetoed' for ALL parties that have this media
    const partyUpdateResult = await Party.updateMany(
      { 'media.mediaId': mediaObjectIdForQuery },
      {
        $set: {
          'media.$.status': 'vetoed',
          'media.$.vetoedAt': new Date(),
          'media.$.vetoedBy': req.user._id
        }
      }
    );
    console.log(`📋 Updated party.media[] status for ${partyUpdateResult.modifiedCount} party entries`);

    // Send notifications to all users who bid on this media
    try {
      for (const [userId, refund] of refundsByUser) {
        // For global veto, we don't have a specific partyId, so we'll use null
        // The notification service should handle this gracefully
        notificationService.notifyMediaVetoed(
          userId,
          actualMediaId,
          media.title,
          null, // partyId - null for global veto
          'Global', // partyName
          refund.totalAmount,
          reason || null
        ).catch(err => console.error(`Error sending veto notification to user ${userId}:`, err));
      }
    } catch (notifError) {
      console.error('Error setting up notifications:', notifError);
      // Don't fail the veto if notifications fail
    }

    const totalRefunded = Array.from(refundsByUser.values()).reduce((sum, r) => sum + r.totalAmount, 0);

    res.json({
      message: 'Media globally vetoed successfully',
      media: {
        _id: media._id,
        uuid: media.uuid,
        title: media.title,
        status: media.status,
        vetoedAt: media.vetoedAt,
        vetoedBy: media.vetoedBy,
        vetoedReason: media.vetoedReason
      },
      refundedBidsCount: bidsToRefund.length,
      refundedUsersCount: refundsByUser.size,
      refundedAmount: totalRefunded,
      partyEntriesUpdated: partyUpdateResult.modifiedCount,
      notificationsSent: refundsByUser.size
    });
  } catch (error) {
    console.error('Error vetoing media:', error);
    res.status(500).json({ error: 'Error vetoing media', details: error.message });
  }
});

/**
 * @route   POST /api/media/:mediaId/unveto
 * @desc    Remove global veto from a media item (admin only)
 * @access  Private (admin)
 */
router.post('/:mediaId/unveto', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { mediaId } = req.params;

    if (!isValidObjectId(mediaId)) {
      return res.status(400).json({ error: 'Invalid media ID format' });
    }

    const media = await Media.findById(mediaId);
    if (!media) {
      return res.status(404).json({ error: 'Media not found' });
    }

    if (media.status !== 'vetoed') {
      return res.status(400).json({ error: 'Media is not globally vetoed' });
    }

    // Remove global veto
    media.status = 'active';
    media.vetoedAt = null;
    media.vetoedBy = null;
    media.vetoedReason = null;

    await media.save();

    // Send notifications to users who had bids on this media
    try {
      const notificationService = require('../services/notificationService');
      const Bid = require('../models/Bid');
      
      // Find all users who have vetoed bids on this media
      const bids = await Bid.find({ 
        mediaId: media._id, 
        status: 'vetoed' 
      }).populate('userId', '_id');

      const userIds = [...new Set(bids.map(bid => bid.userId._id.toString()))];

      // Send notifications
      for (const userId of userIds) {
        notificationService.notifyMediaUnvetoed(
          userId,
          media._id,
          media.title
        ).catch(err => console.error(`Error sending unveto notification to user ${userId}:`, err));
      }
    } catch (notifError) {
      console.error('Error sending unveto notifications:', notifError);
      // Don't fail the unveto if notifications fail
    }

    res.json({
      message: 'Global veto removed successfully',
      media: {
        _id: media._id,
        uuid: media.uuid,
        title: media.title,
        status: media.status
      },
      note: 'Media can now be added to parties again. Existing party vetoes remain in effect.'
    });
  } catch (error) {
    console.error('Error unvetoing media:', error);
    res.status(500).json({ error: 'Error unvetoing media', details: error.message });
  }
});

/**
 * @route   GET /api/media/vetoed
 * @desc    Get all globally vetoed media (admin only)
 * @access  Private (admin)
 */
router.get('/vetoed', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { page = 1, limit = 50, sortBy = 'vetoedAt', sortOrder = 'desc' } = req.query;

    const query = { status: 'vetoed' };
    const sort = {};
    
    if (sortBy === 'vetoedAt') {
      sort.vetoedAt = sortOrder === 'desc' ? -1 : 1;
    } else if (sortBy === 'title') {
      sort.title = sortOrder === 'desc' ? -1 : 1;
    } else {
      sort.vetoedAt = -1; // Default sort
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [vetoedMedia, total] = await Promise.all([
      Media.find(query)
        .populate('vetoedBy', 'username uuid')
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Media.countDocuments(query)
    ]);

    const formattedMedia = vetoedMedia.map(media => ({
      _id: media._id,
      uuid: media.uuid,
      title: media.title,
      artist: Array.isArray(media.artist) && media.artist.length > 0 ? media.artist[0].name : 'Unknown',
      coverArt: media.coverArt,
      status: media.status,
      vetoedAt: media.vetoedAt,
      vetoedBy: media.vetoedBy ? {
        _id: media.vetoedBy._id,
        username: media.vetoedBy.username,
        uuid: media.vetoedBy.uuid
      } : null,
      vetoedReason: media.vetoedReason
    }));

    res.json({
      vetoedMedia: formattedMedia,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching vetoed media:', error);
    res.status(500).json({ error: 'Failed to fetch vetoed media', details: error.message });
  }
});

module.exports = router;

