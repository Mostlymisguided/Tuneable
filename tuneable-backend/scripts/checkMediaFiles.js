const mongoose = require('mongoose');
const Media = require('../models/Media');
require('dotenv').config();

async function checkMediaFiles() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB');

    // Get all media with upload sources
    const mediaWithUploads = await Media.find({
      'sources.upload': { $exists: true, $ne: null }
    }).select('title sources.upload addedBy');

    console.log(`\n📊 Found ${mediaWithUploads.length} media items with upload sources:`);
    
    if (mediaWithUploads.length === 0) {
      console.log('✅ No media with upload sources found - nothing to worry about!');
      return;
    }

    // Group by upload source type
    const uploadSources = {};
    mediaWithUploads.forEach(media => {
      const uploadUrl = media.sources.upload;
      if (uploadUrl) {
        if (uploadUrl.includes('media-uploads/')) {
          uploadSources['R2 media-uploads'] = (uploadSources['R2 media-uploads'] || 0) + 1;
        } else if (uploadUrl.includes('/uploads/')) {
          uploadSources['Local uploads'] = (uploadSources['Local uploads'] || 0) + 1;
        } else {
          uploadSources['Other'] = (uploadSources['Other'] || 0) + 1;
        }
      }
    });

    console.log('\n📁 Upload source breakdown:');
    Object.entries(uploadSources).forEach(([type, count]) => {
      console.log(`  ${type}: ${count} files`);
    });

    // Show sample files
    console.log('\n📄 Sample files that would be affected:');
    mediaWithUploads.slice(0, 5).forEach(media => {
      console.log(`  - "${media.title}" by ${media.addedBy?.username || 'Unknown'}`);
      console.log(`    URL: ${media.sources.upload}`);
    });

    if (mediaWithUploads.length > 5) {
      console.log(`  ... and ${mediaWithUploads.length - 5} more files`);
    }

    console.log('\n🔧 Next steps:');
    console.log('1. Check your R2 bucket for the media-uploads/ directory');
    console.log('2. If files are missing, you may need to:');
    console.log('   - Re-upload the original files');
    console.log('   - Update the database to remove broken references');
    console.log('   - Or restore from backup if available');

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  }
}

checkMediaFiles();
