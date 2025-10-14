#!/usr/bin/env node

/**
 * Direct migration script for Media field names
 * Uses raw MongoDB operations to rename fields in the database
 */

const mongoose = require('mongoose');
require('dotenv').config();

async function directMediaFieldMigration() {
  try {
    console.log('🚀 Starting direct Media field migration...');
    
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/Tuneable';
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');

    const db = mongoose.connection.db;
    const mediaCollection = db.collection('media');

    // Step 1a: Rename topGlobal* fields first
    console.log('\n📝 Step 1a: Renaming topGlobal* fields...');
    
    const rename1 = await mediaCollection.updateMany(
      {},
      {
        $rename: {
          'topGlobalBidValue': 'globalMediaBidTop',
          'topGlobalBidUser': 'globalMediaBidTopUser',
          'topGlobalAggregateBidValue': 'globalMediaAggregateTop',
          'topGlobalAggregateUser': 'globalMediaAggregateTopUser'
        }
      }
    );

    console.log(`✅ Renamed topGlobal* fields in ${rename1.modifiedCount} documents`);

    // Step 1b: Rename global* fields (that don't conflict)
    console.log('\n📝 Step 1b: Renaming global* fields...');
    
    const rename2 = await mediaCollection.updateMany(
      {},
      {
        $rename: {
          'globalBidValue': 'globalMediaAggregate',
          // globalBidTop -> already handled by topGlobalBidValue above
          // globalAggregateTop -> already handled by topGlobalAggregateBidValue above
          // globalBidTopUser -> already handled by topGlobalBidUser above
          // globalAggregateTopUser -> already handled by topGlobalAggregateUser above
        }
      }
    );

    console.log(`✅ Renamed global* fields in ${rename2.modifiedCount} documents`);

    // Step 2: Set defaults for documents that don't have these fields
    console.log('\n📝 Step 2: Setting defaults for missing fields...');
    
    const defaultsResult = await mediaCollection.updateMany(
      { globalMediaAggregate: { $exists: false } },
      {
        $set: {
          globalMediaAggregate: 0,
          globalMediaBidTop: 0,
          globalMediaAggregateTop: 0
        }
      }
    );

    console.log(`✅ Set defaults in ${defaultsResult.modifiedCount} documents`);

    // Step 3: Verification
    console.log('\n📝 Step 3: Verification...');
    
    const withNewFields = await mediaCollection.countDocuments({
      globalMediaAggregate: { $exists: true }
    });
    
    const withOldFields = await mediaCollection.countDocuments({
      $or: [
        { topGlobalBidValue: { $exists: true } },
        { topGlobalAggregateBidValue: { $exists: true } },
        { globalBidValue: { $exists: true } }
      ]
    });

    const totalDocs = await mediaCollection.countDocuments({});

    console.log(`\n📊 Migration Summary:`);
    console.log(`  Total documents: ${totalDocs}`);
    console.log(`  Documents with new field names: ${withNewFields}`);
    console.log(`  Documents with old field names: ${withOldFields}`);

    if (withOldFields === 0 && withNewFields === totalDocs) {
      console.log('\n✅ Migration successful! All documents updated.');
    } else {
      console.warn(`\n⚠️  Migration incomplete. ${withOldFields} documents still have old field names.`);
    }

    // Show a sample migrated document
    console.log('\n📄 Sample migrated document:');
    const sample = await mediaCollection.findOne({ globalMediaAggregate: { $exists: true } });
    if (sample) {
      console.log('Bid-related fields:', {
        globalMediaAggregate: sample.globalMediaAggregate,
        globalMediaBidTop: sample.globalMediaBidTop,
        globalMediaBidTopUser: sample.globalMediaBidTopUser,
        globalMediaAggregateTop: sample.globalMediaAggregateTop,
        globalMediaAggregateTopUser: sample.globalMediaAggregateTopUser
      });
    }

  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

// Run migration if called directly
if (require.main === module) {
  directMediaFieldMigration()
    .then(() => {
      console.log('🎉 Direct Media field migration completed!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Direct Media field migration failed:', error);
      process.exit(1);
    });
}

module.exports = directMediaFieldMigration;

