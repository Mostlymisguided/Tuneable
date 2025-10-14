#!/usr/bin/env node

/**
 * Migration Script: Update Media Model Field Names
 * 
 * This script migrates existing Media documents to use the new bid metrics
 * field names that align with the bid metrics schema grammar.
 * 
 * Changes:
 * - globalBidValue → globalMediaAggregate
 * - globalBidTop → globalMediaBidTop  
 * - globalAggregateTop → globalMediaAggregateTop
 * - globalBidTopUser → globalMediaBidTopUser (keep same)
 * - globalAggregateTopUser → globalMediaAggregateTopUser (keep same)
 */

const mongoose = require('mongoose');
require('dotenv').config();

// Import models
const Media = require('../models/Media');

async function migrateMediaMetricsFields() {
  try {
    console.log('🔄 Starting Media metrics field migration...');
    
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/tuneable', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ Connected to MongoDB');

    // Find all Media documents that have old field names
    const mediaWithOldFields = await Media.find({
      $or: [
        { globalBidValue: { $exists: true } },
        { globalBidTop: { $exists: true } },
        { globalAggregateTop: { $exists: true } }
      ]
    });

    console.log(`📊 Found ${mediaWithOldFields.length} Media documents with old field names`);

    if (mediaWithOldFields.length === 0) {
      console.log('✅ No Media documents need migration');
      return;
    }

    let migrated = 0;
    let errors = 0;

    // Migrate each document
    for (const media of mediaWithOldFields) {
      try {
        const updateFields = {};
        
        // Migrate field names
        if (media.globalBidValue !== undefined) {
          updateFields.globalMediaAggregate = media.globalBidValue;
        }
        
        if (media.globalBidTop !== undefined) {
          updateFields.globalMediaBidTop = media.globalBidTop;
        }
        
        if (media.globalAggregateTop !== undefined) {
          updateFields.globalMediaAggregateTop = media.globalAggregateTop;
        }
        
        // User references stay the same (already correct names)
        if (media.globalBidTopUser !== undefined) {
          updateFields.globalMediaBidTopUser = media.globalBidTopUser;
        }
        
        if (media.globalAggregateTopUser !== undefined) {
          updateFields.globalMediaAggregateTopUser = media.globalAggregateTopUser;
        }

        // Update the document - remove old fields first, then set new ones
        await Media.findByIdAndUpdate(media._id, {
          $unset: {
            globalBidValue: 1,
            globalBidTop: 1,
            globalAggregateTop: 1
          }
        });
        
        await Media.findByIdAndUpdate(media._id, {
          $set: updateFields
        });

        migrated++;
        
        if (migrated % 100 === 0) {
          console.log(`📈 Migrated ${migrated}/${mediaWithOldFields.length} documents...`);
        }

      } catch (error) {
        console.error(`❌ Error migrating Media ${media._id}:`, error.message);
        errors++;
      }
    }

    console.log('\n🎉 Migration Complete!');
    console.log(`✅ Successfully migrated: ${migrated} documents`);
    console.log(`❌ Errors: ${errors} documents`);
    
    // Verify migration
    const remainingOldFields = await Media.find({
      $or: [
        { globalBidValue: { $exists: true } },
        { globalBidTop: { $exists: true } },
        { globalAggregateTop: { $exists: true } }
      ]
    });
    
    if (remainingOldFields.length === 0) {
      console.log('✅ Verification: All old field names have been migrated');
    } else {
      console.log(`⚠️  Warning: ${remainingOldFields.length} documents still have old field names`);
    }

  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

// Run migration if called directly
if (require.main === module) {
  migrateMediaMetricsFields()
    .then(() => {
      console.log('🏁 Migration script completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Migration script failed:', error);
      process.exit(1);
    });
}

module.exports = migrateMediaMetricsFields;