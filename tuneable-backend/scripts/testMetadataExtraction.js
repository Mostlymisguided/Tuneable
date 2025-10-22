const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const MetadataExtractor = require('../utils/metadataExtractor');

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/tuneable', {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

async function testMetadataExtraction() {
  console.log('🧪 Testing Metadata Extraction...\n');
  
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
    
    console.log('\n📊 Extracted Metadata:');
    console.log('====================');
    console.log(`Title: ${extractedData.title || 'N/A'}`);
    console.log(`Artist: ${extractedData.artist || 'N/A'}`);
    console.log(`Album: ${extractedData.album || 'N/A'}`);
    console.log(`Year: ${extractedData.year || 'N/A'}`);
    console.log(`Genre: ${extractedData.genre || 'N/A'}`);
    console.log(`Duration: ${extractedData.duration}s`);
    console.log(`Bitrate: ${extractedData.bitrate}bps`);
    console.log(`Sample Rate: ${extractedData.sampleRate}Hz`);
    console.log(`Channels: ${extractedData.channels}`);
    console.log(`Codec: ${extractedData.codec}`);
    console.log(`Lossless: ${extractedData.lossless}`);
    console.log(`BPM: ${extractedData.bpm || 'N/A'}`);
    console.log(`Key: ${extractedData.key || 'N/A'}`);
    console.log(`ISRC: ${extractedData.isrc || 'N/A'}`);
    console.log(`UPC: ${extractedData.upc || 'N/A'}`);
    console.log(`Explicit: ${extractedData.explicit}`);
    console.log(`Language: ${extractedData.language || 'N/A'}`);
    console.log(`Artwork: ${extractedData.artwork.length} image(s)`);
    
    if (extractedData.artwork.length > 0) {
      console.log('\n🖼️ Artwork Details:');
      extractedData.artwork.forEach((art, index) => {
        console.log(`  ${index + 1}. Type: ${art.type}, Format: ${art.format}, Size: ${art.data.length} bytes`);
      });
    }
    
    console.log('\n🔍 Validation Results:');
    const validation = MetadataExtractor.validateMetadata(extractedData);
    console.log(`Valid: ${validation.isValid}`);
    if (validation.warnings.length > 0) {
      console.log('Warnings:', validation.warnings);
    }
    if (validation.errors.length > 0) {
      console.log('Errors:', validation.errors);
    }
    
    console.log('\n📋 Mapped to Media Model:');
    const mappedData = MetadataExtractor.mapToMediaModel(extractedData, 'test-user-id');
    console.log('Basic Info:', {
      title: mappedData.title,
      album: mappedData.album,
      duration: mappedData.duration,
      explicit: mappedData.explicit
    });
    console.log('Creators:', {
      artist: mappedData.artist,
      producer: mappedData.producer,
      songwriter: mappedData.songwriter,
      composer: mappedData.composer
    });
    console.log('Technical:', {
      bitrate: mappedData.bitrate,
      sampleRate: mappedData.sampleRate,
      bpm: mappedData.bpm,
      key: mappedData.key
    });
    console.log('Content:', {
      genres: mappedData.genres,
      language: mappedData.language,
      isrc: mappedData.isrc,
      upc: mappedData.upc
    });
    
    console.log('\n✅ Metadata extraction test completed successfully!');
    
  } catch (error) {
    console.error('❌ Error testing metadata extraction:', error.message);
    console.error(error.stack);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

// Run the test
testMetadataExtraction();
