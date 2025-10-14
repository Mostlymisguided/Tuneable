#!/usr/bin/env node

/**
 * Verification script to check actual field names in Media collection
 * Uses raw MongoDB queries to see what's really in the database
 */

const mongoose = require('mongoose');
require('dotenv').config();

async function verifyMediaFieldNames() {
  try {
    console.log('🔍 Verifying Media collection field names...');
    
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/Tuneable';
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');

    const db = mongoose.connection.db;
    const mediaCollection = db.collection('media');

    // Get a sample document to see actual field names
    const sampleDoc = await mediaCollection.findOne({});
    
    if (sampleDoc) {
      console.log('\n📄 Sample Media document fields:');
      console.log('Field names:', Object.keys(sampleDoc).sort());
      
      // Check for old field names
      const oldFields = [
        'globalBidValue',
        'globalBidTop',
        'globalAggregateTop',
        'topGlobalBidValue',
        'topGlobalBidUser',
        'topGlobalAggregateBidValue',
        'topGlobalAggregateUser',
        'globalBidTopUser',
        'globalAggregateTopUser'
      ];
      
      const newFields = [
        'globalMediaAggregate',
        'globalMediaBidTop',
        'globalMediaAggregateTop',
        'globalMediaBidTopUser',
        'globalMediaAggregateTopUser'
      ];
      
      console.log('\n🔍 Old field names present:');
      oldFields.forEach(field => {
        if (sampleDoc.hasOwnProperty(field)) {
          console.log(`  ✅ ${field}: ${sampleDoc[field]}`);
        } else {
          console.log(`  ❌ ${field}: not found`);
        }
      });
      
      console.log('\n🔍 New field names present:');
      newFields.forEach(field => {
        if (sampleDoc.hasOwnProperty(field)) {
          console.log(`  ✅ ${field}: ${sampleDoc[field]}`);
        } else {
          console.log(`  ❌ ${field}: not found`);
        }
      });
    }
    
    // Count documents with old vs new field names
    const withOldFields = await mediaCollection.countDocuments({
      $or: [
        { globalBidValue: { $exists: true } },
        { topGlobalBidValue: { $exists: true } },
        { topGlobalAggregateBidValue: { $exists: true } }
      ]
    });
    
    const withNewFields = await mediaCollection.countDocuments({
      $or: [
        { globalMediaAggregate: { $exists: true } },
        { globalMediaBidTop: { $exists: true } },
        { globalMediaAggregateTop: { $exists: true } }
      ]
    });
    
    console.log(`\n📊 Statistics:`);
    console.log(`  Documents with old field names: ${withOldFields}`);
    console.log(`  Documents with new field names: ${withNewFields}`);
    console.log(`  Total documents: ${await mediaCollection.countDocuments({})}`);

  } catch (error) {
    console.error('❌ Verification failed:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

// Run verification if called directly
if (require.main === module) {
  verifyMediaFieldNames()
    .then(() => {
      console.log('🎉 Verification complete!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Verification failed:', error);
      process.exit(1);
    });
}

module.exports = verifyMediaFieldNames;

