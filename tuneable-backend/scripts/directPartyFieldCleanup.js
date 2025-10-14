#!/usr/bin/env node

/**
 * Direct cleanup script for Party field names using raw MongoDB operations
 * This bypasses Mongoose schema mapping to directly access and modify database fields
 */

const mongoose = require('mongoose');
require('dotenv').config();

async function directPartyFieldCleanup() {
  try {
    console.log('🧹 Starting direct Party field cleanup...');
    
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/Tuneable';
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');

    const db = mongoose.connection.db;
    const partiesCollection = db.collection('parties');

    // Find parties with old field names using raw MongoDB queries
    const partiesWithOldFields = await partiesCollection.find({
      $or: [
        { 'media.partyBidValue': { $exists: true } },
        { 'media.partyBidTop': { $exists: true } },
        { 'media.partyAggregateTop': { $exists: true } },
        { 'media.partyBidTopUser': { $exists: true } },
        { 'media.partyAggregateTopUser': { $exists: true } },
        { 'songs.partyBidValue': { $exists: true } },
        { 'songs.partyBidTop': { $exists: true } },
        { 'songs.partyAggregateTop': { $exists: true } },
        { 'songs.partyBidTopUser': { $exists: true } },
        { 'songs.partyAggregateTopUser': { $exists: true } }
      ]
    }).toArray();

    console.log(`📊 Found ${partiesWithOldFields.length} parties with old field names\n`);

    for (const party of partiesWithOldFields) {
      console.log(`Processing party: ${party.name} (${party._id})`);
      
      // Directly unset old field names from all array elements
      await partiesCollection.updateOne(
        { _id: party._id },
        {
          $unset: {
            'media.$[].partyBidValue': '',
            'media.$[].partyBidTop': '',
            'media.$[].partyAggregateTop': '',
            'media.$[].partyBidTopUser': '',
            'media.$[].partyAggregateTopUser': '',
            'songs.$[].partyBidValue': '',
            'songs.$[].partyBidTop': '',
            'songs.$[].partyAggregateTop': '',
            'songs.$[].partyBidTopUser': '',
            'songs.$[].partyAggregateTopUser': ''
          }
        }
      );
      
      console.log(`✅ Cleaned up party: ${party.name}`);
    }

    // Verification
    const remainingOldFields = await partiesCollection.countDocuments({
      $or: [
        { 'media.partyBidValue': { $exists: true } },
        { 'media.partyBidTop': { $exists: true } },
        { 'media.partyAggregateTop': { $exists: true } },
        { 'media.partyBidTopUser': { $exists: true } },
        { 'media.partyAggregateTopUser': { $exists: true } },
        { 'songs.partyBidValue': { $exists: true } },
        { 'songs.partyBidTop': { $exists: true } },
        { 'songs.partyAggregateTop': { $exists: true } },
        { 'songs.partyBidTopUser': { $exists: true } },
        { 'songs.partyAggregateTopUser': { $exists: true } }
      ]
    });

    console.log(`\n📊 Cleanup Summary:`);
    console.log(`✅ Processed: ${partiesWithOldFields.length} parties`);
    console.log(`📝 Remaining with old fields: ${remainingOldFields}`);

    if (remainingOldFields === 0) {
      console.log('✅ Verification: All old field names have been removed!');
    } else {
      console.warn(`⚠️  Verification: ${remainingOldFields} parties still have old field names`);
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
  directPartyFieldCleanup()
    .then(() => {
      console.log('🎉 Direct Party field cleanup completed!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Direct Party field cleanup failed:', error);
      process.exit(1);
    });
}

module.exports = directPartyFieldCleanup;

