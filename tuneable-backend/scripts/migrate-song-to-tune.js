/**
 * Migration Script: Change contentForm 'song' to 'tune'
 * 
 * This script updates all Media documents that have 'song' in their
 * contentForm array to use 'tune' instead.
 * 
 * Run this BEFORE deploying code changes to the Media model.
 */

const mongoose = require('mongoose');
require('dotenv').config();

async function migrateSongToTune() {
  try {
    console.log('🚀 Starting song → tune migration...');
    
    // Connect to MongoDB
    const MONGODB_URI = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/tuneable';
    console.log('🔗 Connecting to:', MONGODB_URI.includes('mongodb+srv') ? 'Atlas Cloud Database' : 'Local Database');
    await mongoose.connect(MONGODB_URI);
    console.log('📦 Connected to MongoDB');
    
    const db = mongoose.connection.db;
    const Media = db.collection('media');
    
    // Count documents with 'song' in contentForm
    const songCount = await Media.countDocuments({ contentForm: 'song' });
    console.log(`\n📊 Migration Preview:`);
    console.log(`   - Media with 'song' contentForm: ${songCount}`);
    console.log('');
    
    if (songCount === 0) {
      console.log('✅ No documents to migrate - already up to date!');
      await mongoose.disconnect();
      process.exit(0);
    }
    
    // Update all contentForm arrays containing 'song' to 'tune'
    console.log('🔄 Updating Media documents...');
    const result = await Media.updateMany(
      { contentForm: 'song' },
      { $set: { 'contentForm.$': 'tune' } }
    );
    
    console.log(`   ✅ Modified ${result.modifiedCount} media documents`);
    console.log(`   📝 Matched ${result.matchedCount} media documents`);
    
    // Verify migration
    console.log('\n🔍 Verifying migration...');
    const remainingSongs = await Media.countDocuments({ contentForm: 'song' });
    const tuneCount = await Media.countDocuments({ contentForm: 'tune' });
    
    if (remainingSongs === 0) {
      console.log('   ✅ Migration verified - no "song" references remain');
      console.log(`   ✅ Found ${tuneCount} documents with "tune" contentForm`);
    } else {
      console.warn(`   ⚠️  Warning: ${remainingSongs} documents still have "song" contentForm`);
    }
    
    // Sample check - show one updated media
    const sampleMedia = await Media.findOne({ contentForm: 'tune' });
    if (sampleMedia) {
      console.log('\n📋 Sample Media after migration:');
      console.log(`   - Title: ${sampleMedia.title}`);
      console.log(`   - Artist: ${sampleMedia.artist?.[0]?.name || 'Unknown'}`);
      console.log(`   - ContentForm: ${sampleMedia.contentForm.join(', ')}`);
    }
    
    console.log('\n🎉 Migration complete!');
    console.log('✅ You can now deploy the updated code\n');
    
    await mongoose.disconnect();
    process.exit(0);
    
  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    console.error('Stack trace:', error.stack);
    await mongoose.disconnect();
    process.exit(1);
  }
}

// Run migration
migrateSongToTune();

