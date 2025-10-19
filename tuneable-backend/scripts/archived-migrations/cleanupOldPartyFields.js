#!/usr/bin/env node

/**
 * Cleanup script to remove old field names from Party model
 * 
 * This script removes the following old field names from all Party documents:
 * - media[].partyBidValue
 * - media[].partyBidTop
 * - media[].partyAggregateTop
 * - media[].partyBidTopUser
 * - media[].partyAggregateTopUser
 * - songs[].partyBidValue
 * - songs[].partyBidTop
 * - songs[].partyAggregateTop
 * - songs[].partyBidTopUser
 * - songs[].partyAggregateTopUser
 * 
 * These fields have been renamed to align with the bid metrics schema grammar.
 */

const mongoose = require('mongoose');
require('dotenv').config();

// Import models
const Party = require('../models/Party');

async function cleanupOldPartyFields() {
  try {
    console.log('🧹 Starting cleanup of old Party field names...');
    
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/Tuneable';
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');

    // Count parties with old fields before cleanup
    const partiesWithOldFields = await Party.countDocuments({
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

    console.log(`📊 Found ${partiesWithOldFields} parties with old field names`);

    if (partiesWithOldFields === 0) {
      console.log('✅ No old field names found. Cleanup not needed.');
      return;
    }

    // Process each party individually to handle nested arrays properly
    let mediaUpdated = 0;
    let songsUpdated = 0;

    for (const party of partiesWithOldFields) {
      const updates = {};
      
      // Check media array
      if (party.media && party.media.length > 0) {
        party.media.forEach((item, idx) => {
          if (item.partyBidValue !== undefined) {
            updates[`media.${idx}.partyMediaAggregate`] = item.partyBidValue;
            updates[`media.${idx}.partyBidValue`] = "";
          }
        });
      }
      
      // Check songs array
      if (party.songs && party.songs.length > 0) {
        party.songs.forEach((item, idx) => {
          if (item.partyBidValue !== undefined) {
            updates[`songs.${idx}.partyMediaAggregate`] = item.partyBidValue;
            updates[`songs.${idx}.partyBidValue`] = "";
          }
        });
      }
      
      if (Object.keys(updates).length > 0) {
        // Use direct MongoDB collection to bypass Mongoose schema mapping
        const unsetFields = {};
        const setFields = {};
        
        Object.keys(updates).forEach(key => {
          if (key.includes('partyBidValue') || key.includes('partyBidTop') || key.includes('partyAggregateTop') || 
              key.includes('partyBidTopUser') || key.includes('partyAggregateTopUser')) {
            if (updates[key] === "") {
              unsetFields[key] = "";
            }
          } else {
            setFields[key] = updates[key];
          }
        });
        
        const operation = {};
        if (Object.keys(setFields).length > 0) operation.$set = setFields;
        if (Object.keys(unsetFields).length > 0) operation.$unset = unsetFields;
        
        await mongoose.connection.collection('parties').updateOne(
          { _id: party._id },
          operation
        );
        
        if (party.media && party.media.length > 0) mediaUpdated++;
        if (party.songs && party.songs.length > 0) songsUpdated++;
      }
    }

    console.log(`🧹 Media array cleanup: ${mediaUpdated} parties updated`);
    console.log(`🧹 Songs array cleanup: ${songsUpdated} parties updated`);

    // Verification step
    const remainingOldFields = await Party.countDocuments({
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
    console.log(`🧹 Media array: ${mediaUpdated} parties updated`);
    console.log(`🧹 Songs array: ${songsUpdated} parties updated`);
    console.log(`📝 Total parties with old fields before: ${partiesWithOldFields.length}`);
    console.log(`📝 Total parties with old fields after: ${remainingOldFields}`);

    if (remainingOldFields === 0) {
      console.log('✅ Verification: All old field names have been removed');
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
  cleanupOldPartyFields()
    .then(() => {
      console.log('🎉 Party field cleanup completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Party field cleanup failed:', error);
      process.exit(1);
    });
}

module.exports = cleanupOldPartyFields;
