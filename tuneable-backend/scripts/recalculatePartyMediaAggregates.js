/**
 * Recalculate All Party Media Aggregates
 * 
 * This script recalculates partyMediaAggregate for all media entries in all parties
 * based on the actual sum of active bids from the Bid collection.
 * 
 * This is needed because:
 * 1. The migration script changed all bids to £0.01, but didn't update aggregates
 * 2. Manual calculations in routes may have included vetoed bids
 * 3. BidMetricsEngine should be the source of truth
 * 
 * Usage: node scripts/recalculatePartyMediaAggregates.js
 */

const mongoose = require('mongoose');
const Bid = require('../models/Bid');
const Party = require('../models/Party');
const bidMetricsEngine = require('../services/bidMetricsEngine');

// Connect to database
async function connectDB() {
  try {
    const mongoURI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/tuneable';
    console.log('🔗 Connecting to MongoDB...');
    // Log URI without credentials for security
    const uriDisplay = mongoURI.includes('@') 
      ? mongoURI.split('@')[0].split('://')[0] + '://***@' + mongoURI.split('@')[1]
      : mongoURI;
    console.log('   URI:', uriDisplay);
    await mongoose.connect(mongoURI);
    console.log('✅ Connected to MongoDB');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
}

async function recalculatePartyMediaAggregates() {
  try {
    console.log('\n🔄 Starting party media aggregate recalculation...\n');

    // First, check total active bids in the database
    const totalActiveBids = await Bid.countDocuments({ status: 'active' });
    console.log(`📊 Total active bids in database: ${totalActiveBids}`);
    
    if (totalActiveBids === 0) {
      console.log('⚠️  WARNING: No active bids found in database!');
      console.log('   This might indicate:');
      console.log('   - All bids were vetoed/refunded');
      console.log('   - You\'re connected to the wrong database');
      console.log('   - The migration script needs to be run\n');
    }

    // Get all parties
    const parties = await Party.find({});
    console.log(`📊 Found ${parties.length} parties to process\n`);

    let updatedCount = 0;
    let errorCount = 0;
    let totalMediaEntries = 0;

    for (const party of parties) {
      if (!party.media || party.media.length === 0) {
        continue;
      }

      console.log(`📀 Processing party: ${party.name} (${party._id})`);
      let partyUpdated = false;

      for (const mediaEntry of party.media) {
        if (!mediaEntry.mediaId) {
          continue;
        }

        totalMediaEntries++;

        try {
          // Calculate the actual aggregate from active bids
          const result = await bidMetricsEngine.computeMetric('PartyMediaAggregate', {
            partyId: party._id.toString(),
            mediaId: mediaEntry.mediaId.toString()
          });

          const correctAggregate = result.amount || 0;
          const currentAggregate = mediaEntry.partyMediaAggregate || 0;

          // Only update if different
          if (correctAggregate !== currentAggregate) {
            // Update using findOneAndUpdate to properly update the nested array
            await Party.findOneAndUpdate(
              {
                _id: party._id,
                'media.mediaId': mediaEntry.mediaId
              },
              {
                $set: {
                  'media.$.partyMediaAggregate': correctAggregate
                }
              }
            );

            console.log(`   ✅ Updated media ${mediaEntry.mediaId}: ${currentAggregate} → ${correctAggregate} pence`);
            partyUpdated = true;
            updatedCount++;
          } else {
            console.log(`   ✓ Media ${mediaEntry.mediaId}: already correct (${correctAggregate} pence)`);
          }
        } catch (error) {
          console.error(`   ❌ Error processing media ${mediaEntry.mediaId}:`, error.message);
          errorCount++;
        }
      }

      if (partyUpdated) {
        console.log(`   ✅ Party ${party.name} updated\n`);
      } else {
        console.log(`   ✓ Party ${party.name} already correct\n`);
      }
    }

    // Summary
    console.log('\n📊 Recalculation Summary:');
    console.log(`   - Parties processed: ${parties.length}`);
    console.log(`   - Media entries checked: ${totalMediaEntries}`);
    console.log(`   - Media entries updated: ${updatedCount}`);
    console.log(`   - Errors: ${errorCount}`);
    console.log('\n✅ Recalculation completed successfully!');

    return {
      partiesProcessed: parties.length,
      mediaEntriesChecked: totalMediaEntries,
      mediaEntriesUpdated: updatedCount,
      errors: errorCount
    };

  } catch (error) {
    console.error('\n❌ Error during recalculation:', error);
    throw error;
  }
}

// Main execution
async function main() {
  try {
    await connectDB();
    await recalculatePartyMediaAggregates();
  } catch (error) {
    console.error('❌ Script failed:', error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('\n👋 Database connection closed');
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { recalculatePartyMediaAggregates };

