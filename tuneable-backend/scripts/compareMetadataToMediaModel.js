const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const MetadataExtractor = require('../utils/metadataExtractor');
const Media = require('../models/Media');

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/tuneable', {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

async function compareMetadataToMediaModel() {
  console.log('🔍 Comparing Extracted Metadata to Media Model...\n');
  
  try {
    // Test with a sample MP3 file (if available)
    const sampleMp3Path = path.join(__dirname, '../uploads/sample.mp3');
    
    if (!fs.existsSync(sampleMp3Path)) {
      console.log('❌ No sample MP3 file found at:', sampleMp3Path);
      console.log('📝 To test metadata extraction:');
      console.log('   1. Place a sample MP3 file at:', sampleMp3Path);
      console.log('   2. Run this script again');
      return;
    }
    
    console.log('📁 Reading sample MP3 file...');
    const fileBuffer = fs.readFileSync(sampleMp3Path);
    
    console.log('🔍 Extracting metadata...');
    const extractedData = await MetadataExtractor.extractFromBuffer(fileBuffer, 'sample.mp3');
    
    console.log('\n📊 Extracted Metadata Fields:');
    console.log('============================');
    const extractedFields = Object.keys(extractedData).filter(key => 
      extractedData[key] !== null && extractedData[key] !== undefined && extractedData[key] !== ''
    );
    extractedFields.forEach(field => {
      console.log(`  ${field}: ${extractedData[field]}`);
    });
    
    console.log('\n📋 Media Model Schema Fields:');
    console.log('============================');
    const mediaSchema = Media.schema.obj;
    const mediaFields = Object.keys(mediaSchema);
    mediaFields.forEach(field => {
      console.log(`  ${field}: ${mediaSchema[field].type || 'Mixed'}`);
    });
    
    console.log('\n🔄 Field Mapping Analysis:');
    console.log('==========================');
    
    // Direct mappings
    const directMappings = {
      'title': 'title',
      'album': 'album',
      'duration': 'duration',
      'explicit': 'explicit',
      'bpm': 'bpm',
      'key': 'key',
      'isrc': 'isrc',
      'upc': 'upc',
      'lyrics': 'lyrics',
      'bitrate': 'bitrate',
      'sampleRate': 'sampleRate',
      'language': 'language',
      'trackNumber': 'trackNumber',
      'discNumber': 'discNumber',
      'publisher': 'publisher',
      'encodedBy': 'encodedBy',
      'comment': 'comment'
    };
    
    console.log('✅ Direct Mappings:');
    Object.entries(directMappings).forEach(([extracted, media]) => {
      const hasValue = extractedData[extracted] !== null && extractedData[extracted] !== undefined;
      console.log(`  ${extracted} → ${media} ${hasValue ? '✅' : '❌'}`);
    });
    
    // Complex mappings
    console.log('\n🔄 Complex Mappings:');
    
    // Artist mapping
    const artistMapped = extractedData.artist ? 
      `[${extractedData.artist}]` : 'N/A';
    console.log(`  artist → artist array: ${artistMapped}`);
    
    // Genre mapping
    const genreMapped = extractedData.genre ? 
      (Array.isArray(extractedData.genre) ? extractedData.genre : [extractedData.genre]) : 'N/A';
    console.log(`  genre → genres array: ${genreMapped}`);
    
    // Year mapping
    const yearMapped = extractedData.year ? 
      new Date(extractedData.year, 0, 1) : 'N/A';
    console.log(`  year → releaseDate: ${yearMapped}`);
    
    // Creator mappings
    const creatorMappings = {
      'producer': 'producer',
      'songwriter': 'songwriter',
      'composer': 'composer',
      'label': 'label'
    };
    
    Object.entries(creatorMappings).forEach(([extracted, media]) => {
      const hasValue = extractedData[extracted] !== null && extractedData[extracted] !== undefined;
      console.log(`  ${extracted} → ${media} array: ${hasValue ? '✅' : '❌'}`);
    });
    
    // Unmapped fields
    console.log('\n❌ Unmapped Extracted Fields:');
    const unmappedFields = Object.keys(extractedData).filter(field => 
      !directMappings[field] && 
      !['artist', 'genre', 'year', 'producer', 'songwriter', 'composer', 'label', 'artwork', 'rawMetadata'].includes(field)
    );
    unmappedFields.forEach(field => {
      console.log(`  ${field}: ${extractedData[field]}`);
    });
    
    // Missing Media Model fields
    console.log('\n❌ Missing from Extracted Metadata:');
    const missingFields = [
      'uuid', 'addedBy', 'uploadedAt', 'mediaOwners', 'editHistory',
      'contentType', 'contentForm', 'mediaType', 'sources', 'coverArt',
      'tags', 'description', 'verified', 'createdAt', 'updatedAt'
    ];
    missingFields.forEach(field => {
      console.log(`  ${field}: Not in extracted metadata (system/manual fields)`);
    });
    
    // Test the mapping function
    console.log('\n🧪 Testing Mapping Function:');
    const mappedData = MetadataExtractor.mapToMediaModel(extractedData, 'test-user-id');
    
    console.log('Mapped Data Structure:');
    Object.keys(mappedData).forEach(key => {
      const value = mappedData[key];
      if (Array.isArray(value)) {
        console.log(`  ${key}: [${value.length} items]`);
      } else if (typeof value === 'object' && value !== null) {
        console.log(`  ${key}: {${Object.keys(value).join(', ')}}`);
      } else {
        console.log(`  ${key}: ${value}`);
      }
    });
    
    // Validation
    console.log('\n✅ Validation Results:');
    const validation = MetadataExtractor.validateMetadata(extractedData);
    console.log(`Valid: ${validation.isValid}`);
    if (validation.warnings.length > 0) {
      console.log('Warnings:', validation.warnings);
    }
    if (validation.errors.length > 0) {
      console.log('Errors:', validation.errors);
    }
    
    console.log('\n📊 Summary:');
    console.log('===========');
    console.log(`Total extracted fields: ${Object.keys(extractedData).length}`);
    console.log(`Direct mappings: ${Object.keys(directMappings).length}`);
    console.log(`Complex mappings: ${Object.keys(creatorMappings).length + 3}`);
    console.log(`Unmapped fields: ${unmappedFields.length}`);
    console.log(`Missing fields: ${missingFields.length}`);
    
    console.log('\n✅ Metadata comparison completed successfully!');
    
  } catch (error) {
    console.error('❌ Error comparing metadata:', error.message);
    console.error(error.stack);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

// Run the comparison
compareMetadataToMediaModel();
