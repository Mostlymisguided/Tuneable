#!/usr/bin/env node

/**
 * Cleanup Script: Remove Old Media Field Names
 * 
 * This script directly removes the old field names from Media documents.
 */

const mongoose = require('mongoose');
require('dotenv').config();

async function cleanupOldMediaFields() {
  try {
    console.log('🔄 Starting cleanup of old Media field names...');
    
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/tuneable');
    console.log('✅ Connected to MongoDB');

    // Use direct MongoDB operations to remove old fields
    const result = await mongoose.connection.db.collection('media').updateMany(
      {
        $or: [
          { globalBidValue: { $exists: true } },
          { globalBidTop: { $exists: true } },
          { globalAggregateTop: { $exists: true } }
        ]
      },
      {
        $unset: {
          globalBidValue: 1,
          globalBidTop: 1,
          globalAggregateTop: 1
        }
      }
    );

    console.log(`✅ Cleanup complete: ${result.modifiedCount} documents updated`);
    
    // Verify cleanup
    const remainingOldFields = await mongoose.connection.db.collection('media').countDocuments({
      $or: [
        { globalBidValue: { $exists: true } },
        { globalBidTop: { $exists: true } },
        { globalAggregateTop: { $exists: true } }
      ]
    });
    
    if (remainingOldFields === 0) {
      console.log('✅ Verification: All old field names have been removed');
    } else {
      console.log(`⚠️  Warning: ${remainingOldFields} documents still have old field names`);
    }

  } catch (error) {
    console.error('❌ Cleanup failed:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

// Run cleanup if called directly
if (require.main === module) {
  cleanupOldMediaFields()
    .then(() => {
      console.log('🏁 Cleanup script completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Cleanup script failed:', error);
      process.exit(1);
    });
}

module.exports = cleanupOldMediaFields;
