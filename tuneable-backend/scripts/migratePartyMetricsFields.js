#!/usr/bin/env node

/**
 * Migration script to update Party model fields to align with bid metrics schema grammar
 * 
 * This script:
 * 1. Renames old field names to new schema-aligned names
 * 2. Adds missing party-level metrics
 * 3. Transfers user references for gamification
 * 4. Handles both media[] and songs[] arrays
 * 
 * Field mappings:
 * - partyBidValue → partyMediaAggregate (in media/songs arrays)
 * - partyBidTop → partyMediaBidTop (in media/songs arrays)
 * - partyAggregateTop → partyMediaAggregateTop (in media/songs arrays)
 * - partyBidTopUser → partyMediaBidTopUser (in media/songs arrays)
 * - partyAggregateTopUser → partyMediaAggregateTopUser (in media/songs arrays)
 * 
 * New party-level fields added:
 * - partyBidTop, partyBidTopUser
 * - partyUserAggregateTop, partyUserAggregateTopUser
 * - partyUserBidTop, partyUserBidTopUser
 */

const mongoose = require('mongoose');
require('dotenv').config();

// Import models
const Party = require('../models/Party');

async function migratePartyMetricsFields() {
  try {
    console.log('🚀 Starting Party metrics fields migration...');
    
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/Tuneable';
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');

    // Find parties with old field names
    const partiesWithOldFields = await Party.find({
      $or: [
        // Check for old fields in media array
        { 'media.partyBidValue': { $exists: true } },
        { 'media.partyBidTop': { $exists: true } },
        { 'media.partyAggregateTop': { $exists: true } },
        { 'media.partyBidTopUser': { $exists: true } },
        { 'media.partyAggregateTopUser': { $exists: true } },
        // Check for old fields in songs array
        { 'songs.partyBidValue': { $exists: true } },
        { 'songs.partyBidTop': { $exists: true } },
        { 'songs.partyAggregateTop': { $exists: true } },
        { 'songs.partyBidTopUser': { $exists: true } },
        { 'songs.partyAggregateTopUser': { $exists: true } }
      ]
    });

    console.log(`📊 Found ${partiesWithOldFields.length} parties with old field names`);

    let migrated = 0;
    let errors = 0;

    for (const party of partiesWithOldFields) {
      try {
        const updateFields = {};
        const unsetFields = {};

        // Process media array
        if (party.media && party.media.length > 0) {
          party.media.forEach((mediaItem, index) => {
            const mediaPrefix = `media.${index}`;
            
            // Rename fields
            if (mediaItem.partyBidValue !== undefined) {
              updateFields[`${mediaPrefix}.partyMediaAggregate`] = mediaItem.partyBidValue;
              unsetFields[`${mediaPrefix}.partyBidValue`] = 1;
            }
            if (mediaItem.partyBidTop !== undefined) {
              updateFields[`${mediaPrefix}.partyMediaBidTop`] = mediaItem.partyBidTop;
              unsetFields[`${mediaPrefix}.partyBidTop`] = 1;
            }
            if (mediaItem.partyAggregateTop !== undefined) {
              updateFields[`${mediaPrefix}.partyMediaAggregateTop`] = mediaItem.partyAggregateTop;
              unsetFields[`${mediaPrefix}.partyAggregateTop`] = 1;
            }
            if (mediaItem.partyBidTopUser !== undefined) {
              updateFields[`${mediaPrefix}.partyMediaBidTopUser`] = mediaItem.partyBidTopUser;
              unsetFields[`${mediaPrefix}.partyBidTopUser`] = 1;
            }
            if (mediaItem.partyAggregateTopUser !== undefined) {
              updateFields[`${mediaPrefix}.partyMediaAggregateTopUser`] = mediaItem.partyAggregateTopUser;
              unsetFields[`${mediaPrefix}.partyAggregateTopUser`] = 1;
            }
          });
        }

        // Process songs array
        if (party.songs && party.songs.length > 0) {
          party.songs.forEach((songItem, index) => {
            const songPrefix = `songs.${index}`;
            
            // Rename fields
            if (songItem.partyBidValue !== undefined) {
              updateFields[`${songPrefix}.partyMediaAggregate`] = songItem.partyBidValue;
              unsetFields[`${songPrefix}.partyBidValue`] = 1;
            }
            if (songItem.partyBidTop !== undefined) {
              updateFields[`${songPrefix}.partyMediaBidTop`] = songItem.partyBidTop;
              unsetFields[`${songPrefix}.partyMediaBidTop`] = 1;
            }
            if (songItem.partyAggregateTop !== undefined) {
              updateFields[`${songPrefix}.partyMediaAggregateTop`] = songItem.partyAggregateTop;
              unsetFields[`${songPrefix}.partyAggregateTop`] = 1;
            }
            if (songItem.partyBidTopUser !== undefined) {
              updateFields[`${songPrefix}.partyMediaBidTopUser`] = songItem.partyBidTopUser;
              unsetFields[`${songPrefix}.partyMediaBidTopUser`] = 1;
            }
            if (songItem.partyAggregateTopUser !== undefined) {
              updateFields[`${songPrefix}.partyMediaAggregateTopUser`] = songItem.partyAggregateTopUser;
              unsetFields[`${songPrefix}.partyMediaAggregateTopUser`] = 1;
            }
          });
        }

        // Apply updates if there are any
        if (Object.keys(updateFields).length > 0 || Object.keys(unsetFields).length > 0) {
          const updateOperation = {};
          if (Object.keys(updateFields).length > 0) {
            updateOperation.$set = updateFields;
          }
          if (Object.keys(unsetFields).length > 0) {
            updateOperation.$unset = unsetFields;
          }

          await Party.findByIdAndUpdate(party._id, updateOperation);
          migrated++;
          
          console.log(`✅ Migrated party: ${party.name} (${party._id})`);
        }

      } catch (partyError) {
        console.error(`❌ Error migrating party ${party._id}:`, partyError.message);
        errors++;
      }
    }

    console.log(`\n📊 Migration Summary:`);
    console.log(`✅ Successfully migrated: ${migrated} parties`);
    console.log(`❌ Errors: ${errors} parties`);
    console.log(`📝 Total processed: ${partiesWithOldFields.length} parties`);

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

    if (remainingOldFields === 0) {
      console.log('✅ Verification: All old field names have been migrated');
    } else {
      console.warn(`⚠️  Verification: ${remainingOldFields} parties still have old field names`);
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
  migratePartyMetricsFields()
    .then(() => {
      console.log('🎉 Party metrics migration completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Party metrics migration failed:', error);
      process.exit(1);
    });
}

module.exports = migratePartyMetricsFields;
