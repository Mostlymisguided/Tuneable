const { parseFile } = require('music-metadata');
const { createMediaUpload, getPublicUrl } = require('./r2Upload');
const crypto = require('crypto');

/**
 * Metadata Extractor Service
 * Extracts metadata and artwork from audio files using music-metadata library
 */
class MetadataExtractor {
  
  /**
   * Extract metadata from file buffer
   * @param {Buffer} fileBuffer - The audio file buffer
   * @param {string} filename - Original filename
   * @returns {Promise<Object>} Extracted metadata and artwork
   */
  static async extractFromBuffer(fileBuffer, filename) {
    try {
      console.log(`🔍 Extracting metadata from: ${filename}`);
      
      // Parse the audio file - parseFile expects a file path, not a buffer
      // We need to use parseBuffer for buffer input
      const { parseBuffer } = require('music-metadata');
      const metadata = await parseBuffer(fileBuffer);
      
      // Extract basic metadata
      const extractedData = {
        // Basic information
        title: metadata.common.title || null,
        artist: metadata.common.artist || null,
        album: metadata.common.album || null,
        year: metadata.common.year || null,
        genre: metadata.common.genre || null,
        trackNumber: metadata.common.track?.no || null,
        totalTracks: metadata.common.track?.of || null,
        discNumber: metadata.common.disk?.no || null,
        totalDiscs: metadata.common.disk?.of || null,
        
        // Technical metadata
        duration: Math.floor(metadata.format.duration || 0),
        bitrate: metadata.format.bitrate || null,
        sampleRate: metadata.format.sampleRate || null,
        channels: metadata.format.numberOfChannels || null,
        codec: metadata.format.codec || null,
        codecProfile: metadata.format.codecProfile || null,
        lossless: metadata.format.lossless || false,
        
        // Advanced metadata
        bpm: metadata.common.bpm || null,
        key: metadata.common.key || null,
        isrc: metadata.common.isrc || null,
        upc: metadata.common.barcode || null,
        lyrics: metadata.common.lyrics?.[0]?.text || null,
        comment: metadata.common.comment?.[0] || null,
        
        // Creator information
        composer: metadata.common.composer || null,
        songwriter: metadata.common.songwriter || null,
        producer: metadata.common.producer || null,
        publisher: metadata.common.publisher || null,
        label: metadata.common.label || null,
        encodedBy: metadata.common.encodedBy || null,
        
        // Content flags
        explicit: metadata.common.explicit || false,
        language: metadata.common.language || null,
        
        // Artwork
        artwork: metadata.common.picture || [],
        
        // Raw metadata for debugging
        rawMetadata: {
          common: metadata.common,
          format: metadata.format,
          native: metadata.native
        }
      };
      
      console.log(`✅ Extracted metadata: ${extractedData.title} by ${extractedData.artist}`);
      console.log(`📊 Duration: ${extractedData.duration}s, Bitrate: ${extractedData.bitrate}bps`);
      console.log(`🖼️ Artwork found: ${extractedData.artwork.length} image(s)`);
      
      return extractedData;
      
    } catch (error) {
      console.error('❌ Error extracting metadata:', error.message);
      throw new Error(`Failed to extract metadata: ${error.message}`);
    }
  }
  
  /**
   * Process and save extracted artwork
   * @param {Array} artworkArray - Array of artwork objects from metadata
   * @param {string} mediaId - Media ID for naming
   * @returns {Promise<string|null>} URL of saved artwork or null
   */
  static async processArtwork(artworkArray, mediaId) {
    if (!artworkArray || artworkArray.length === 0) {
      console.log('📷 No artwork found in metadata');
      return null;
    }
    
    try {
      // Get the first (usually primary) artwork
      const artwork = artworkArray[0];
      console.log(`🖼️ Processing artwork: ${artwork.type} (${artwork.format})`);
      
      // Generate unique filename
      const timestamp = Date.now();
      const hash = crypto.createHash('md5').update(artwork.data).digest('hex').substring(0, 8);
      const filename = `artwork-${mediaId}-${timestamp}-${hash}.${artwork.format.toLowerCase()}`;
      
      // Save artwork to R2 or local storage
      const artworkUrl = await this.saveArtworkToStorage(artwork.data, filename);
      
      console.log(`✅ Artwork saved: ${artworkUrl}`);
      return artworkUrl;
      
    } catch (error) {
      console.error('❌ Error processing artwork:', error.message);
      return null;
    }
  }
  
  /**
   * Save artwork to storage (R2 or local)
   * @param {Buffer} imageBuffer - Image data buffer
   * @param {string} filename - Filename for the artwork
   * @returns {Promise<string>} URL of saved artwork
   */
  static async saveArtworkToStorage(imageBuffer, filename) {
    try {
      // Use the same R2 upload service as media files
      const { uploadToR2 } = require('./r2Upload');
      
      // Upload to R2
      const key = `artwork/${filename}`;
      const url = await uploadToR2(imageBuffer, key, 'image/jpeg');
      
      return url;
      
    } catch (error) {
      console.error('❌ Error saving artwork to R2:', error.message);
      
      // Fallback to local storage
      const fs = require('fs');
      const path = require('path');
      
      const localPath = path.join(__dirname, '../uploads/artwork', filename);
      const publicPath = `/uploads/artwork/${filename}`;
      
      // Ensure directory exists
      const dir = path.dirname(localPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      // Save file
      fs.writeFileSync(localPath, imageBuffer);
      
      return getPublicUrl(publicPath);
    }
  }
  
  /**
   * Map extracted metadata to Media model format
   * @param {Object} extractedData - Extracted metadata
   * @param {string} userId - User ID for creator verification
   * @returns {Object} Mapped data for Media model
   */
  static mapToMediaModel(extractedData, userId) {
    const mappedData = {
      // Basic information
      title: extractedData.title || 'Untitled',
      album: extractedData.album || null,
      releaseDate: extractedData.year ? new Date(extractedData.year, 0, 1) : null,
      
      // Creators (map to our creator structure)
      artist: extractedData.artist ? [{
        name: extractedData.artist,
        userId: userId, // Auto-verify uploader as artist
        verified: true
      }] : [],
      
      producer: extractedData.producer ? [{
        name: extractedData.producer,
        userId: null,
        verified: false
      }] : [],
      
      songwriter: extractedData.songwriter ? [{
        name: extractedData.songwriter,
        userId: null,
        verified: false
      }] : [],
      
      composer: extractedData.composer ? [{
        name: extractedData.composer,
        userId: null,
        verified: false
      }] : [],
      
      // Technical metadata
      duration: extractedData.duration || null,
      bitrate: extractedData.bitrate || null,
      sampleRate: extractedData.sampleRate || null,
      explicit: extractedData.explicit || false,
      
      // Advanced metadata
      bpm: extractedData.bpm || null,
      key: extractedData.key || null,
      isrc: extractedData.isrc || null,
      upc: extractedData.upc || null,
      lyrics: extractedData.lyrics || null,
      
      // Content classification
      genres: extractedData.genre ? (Array.isArray(extractedData.genre) ? extractedData.genre : [extractedData.genre]) : [],
      language: extractedData.language || 'en',
      
      // Track information
      trackNumber: extractedData.trackNumber || null,
      discNumber: extractedData.discNumber || null,
      
      // Publisher information
      publisher: extractedData.publisher || null,
      label: extractedData.label ? [{
        name: extractedData.label,
        userId: null,
        verified: false
      }] : [],
      
      // Additional metadata
      encodedBy: extractedData.encodedBy || null,
      comment: extractedData.comment || null,
      
      // Content type (determine from file)
      contentType: ['music'],
      contentForm: ['tune'],
      mediaType: ['mp3']
    };
    
    return mappedData;
  }
  
  /**
   * Validate extracted metadata
   * @param {Object} extractedData - Extracted metadata
   * @returns {Object} Validation results
   */
  static validateMetadata(extractedData) {
    const validation = {
      isValid: true,
      warnings: [],
      errors: []
    };
    
    // Check for required fields
    if (!extractedData.title) {
      validation.warnings.push('No title found in metadata');
    }
    
    if (!extractedData.artist) {
      validation.warnings.push('No artist found in metadata');
    }
    
    if (!extractedData.duration || extractedData.duration === 0) {
      validation.warnings.push('No duration found in metadata');
    }
    
    // Check for quality indicators
    if (extractedData.bitrate && extractedData.bitrate < 128000) {
      validation.warnings.push('Low bitrate detected - audio quality may be poor');
    }
    
    if (extractedData.sampleRate && extractedData.sampleRate < 44100) {
      validation.warnings.push('Low sample rate detected - audio quality may be poor');
    }
    
    // Check for missing artwork
    if (!extractedData.artwork || extractedData.artwork.length === 0) {
      validation.warnings.push('No artwork found in metadata');
    }
    
    return validation;
  }
}

module.exports = MetadataExtractor;
