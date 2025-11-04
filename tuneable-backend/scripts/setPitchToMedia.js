/**
 * Migration script to set pitch to 440 for all existing media
 * Run this once to initialize pitch for media created before this field was added or set to a different value
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Media = require('../models/Media');

async function setPitchToMedia() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB');

    // Find all media without pitch set (or with null/undefined/0) or that needs updating
    const mediaWithoutPitch = await Media.find({
      $or: [
        { pitch: { $exists: false } },
        { pitch: null },
        { pitch: undefined },
        { pitch: 0 }
      ]
    });
    
    console.log(`📊 Found ${mediaWithoutPitch.length} media items without pitch set to 440`);

    if (mediaWithoutPitch.length === 0) {
      console.log('✅ All media already have pitch set to 440!');
      process.exit(0);
    }

    let updated = 0;

    // Use bulk update for better performance
    const result = await mongoose.connection.collection('media').updateMany(
      {
        $or: [
          { pitch: { $exists: false } },
          { pitch: null },
          { pitch: undefined },
          { pitch: 0 }
        ]
      },
      { 
        $set: { 
          pitch: 440
        } 
      }
    );

    updated = result.modifiedCount;

    console.log(`\n🎉 Migration complete! Updated ${updated} media items with pitch: 440.`);
    console.log(`📝 Matched: ${result.matchedCount}, Modified: ${result.modifiedCount}`);
    
  } catch (error) {
    console.error('❌ Migration error:', error);
  } finally {
    await mongoose.connection.close();
    console.log('👋 Disconnected from MongoDB');
    process.exit(0);
  }
}

// Run the migration
setPitchToMedia();

