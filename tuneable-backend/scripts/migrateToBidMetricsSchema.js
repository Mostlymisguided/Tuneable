/**
 * Migration Script: Transition to Bid Metrics Schema
 * 
 * This script migrates the existing hardcoded bid metric fields to the new
 * dynamic bid metrics system using the BidMetricsEngine.
 * 
 * Changes:
 * - Bid model: Removes partyAggregateBidValue, globalAggregateBidValue
 * - Media model: Renames topGlobalBidValue -> globalBidTop, etc.
 * - Party model: Renames topPartyBidValue -> partyBidTop, etc.
 */

const mongoose = require('mongoose');
const Bid = require('../models/Bid');
const Media = require('../models/Media');
const Party = require('../models/Party');
const bidMetricsEngine = require('../services/bidMetricsEngine');

async function migrateToBidMetricsSchema() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/tuneable');
    console.log('Connected to MongoDB');

    console.log('🚀 Starting migration to Bid Metrics Schema...');

    // Step 1: Update Media model field names
    console.log('\n📊 Step 1: Updating Media model field names...');
    const mediaUpdateResult = await Media.updateMany(
      {},
      {
        $rename: {
          'topGlobalBidValue': 'globalBidTop',
          'topGlobalBidUser': 'globalBidTopUser',
          'topGlobalAggregateBidValue': 'globalAggregateTop',
          'topGlobalAggregateUser': 'globalAggregateTopUser'
        }
      }
    );
    console.log(`✅ Updated ${mediaUpdateResult.modifiedCount} Media documents`);

    // Step 2: Update Party model field names
    console.log('\n🎉 Step 2: Updating Party model field names...');
    const partyUpdateResult = await Party.updateMany(
      {},
      {
        $rename: {
          'media.$[].topPartyBidValue': 'media.$[].partyBidTop',
          'media.$[].topPartyBidUser': 'media.$[].partyBidTopUser',
          'media.$[].topPartyAggregateBidValue': 'media.$[].partyAggregateTop',
          'media.$[].topPartyAggregateUser': 'media.$[].partyAggregateTopUser',
          'songs.$[].topPartyBidValue': 'songs.$[].partyBidTop',
          'songs.$[].topPartyBidUser': 'songs.$[].partyBidTopUser',
          'songs.$[].topPartyAggregateBidValue': 'songs.$[].partyAggregateTop',
          'songs.$[].topPartyAggregateUser': 'songs.$[].partyAggregateTopUser'
        }
      },
      {
        arrayFilters: [{}] // Empty filter to match all array elements
      }
    );
    console.log(`✅ Updated ${partyUpdateResult.modifiedCount} Party documents`);

    // Step 3: Remove old aggregate fields from Bid model
    console.log('\n💾 Step 3: Removing old aggregate fields from Bid model...');
    const bidUpdateResult = await Bid.updateMany(
      {},
      {
        $unset: {
          'partyAggregateBidValue': '',
          'globalAggregateBidValue': ''
        }
      }
    );
    console.log(`✅ Removed old fields from ${bidUpdateResult.modifiedCount} Bid documents`);

    // Step 4: Recompute all stored metrics using the new engine
    console.log('\n🔄 Step 4: Recomputing stored metrics...');
    
    // Get all unique media IDs
    const mediaIds = await Media.distinct('_id');
    console.log(`📺 Found ${mediaIds.length} media items to recompute`);
    
    for (let i = 0; i < mediaIds.length; i++) {
      const mediaId = mediaIds[i];
      try {
        await bidMetricsEngine.recomputeMediaMetrics(mediaId);
        if ((i + 1) % 10 === 0) {
          console.log(`📊 Processed ${i + 1}/${mediaIds.length} media items`);
        }
      } catch (error) {
        console.error(`❌ Error recomputing metrics for media ${mediaId}:`, error.message);
      }
    }

    // Get all unique party IDs
    const partyIds = await Party.distinct('_id');
    console.log(`🎉 Found ${partyIds.length} parties to recompute`);
    
    for (let i = 0; i < partyIds.length; i++) {
      const partyId = partyIds[i];
      try {
        await bidMetricsEngine.recomputePartyMetrics(partyId);
        if ((i + 1) % 10 === 0) {
          console.log(`📊 Processed ${i + 1}/${partyIds.length} parties`);
        }
      } catch (error) {
        console.error(`❌ Error recomputing metrics for party ${partyId}:`, error.message);
      }
    }

    console.log('\n✅ Migration to Bid Metrics Schema complete!');
    console.log('\n📋 Summary:');
    console.log(`- Updated ${mediaUpdateResult.modifiedCount} Media documents`);
    console.log(`- Updated ${partyUpdateResult.modifiedCount} Party documents`);
    console.log(`- Cleaned ${bidUpdateResult.modifiedCount} Bid documents`);
    console.log(`- Recomputed metrics for ${mediaIds.length} media items`);
    console.log(`- Recomputed metrics for ${partyIds.length} parties`);

    console.log('\n🎯 Next steps:');
    console.log('1. Update frontend to use new field names (globalBidTop, partyBidTop, etc.)');
    console.log('2. Update any existing code that references old field names');
    console.log('3. Test the new BidMetricsEngine functionality');

  } catch (error) {
    console.error('❌ Migration failed:', error);
  } finally {
    await mongoose.connection.close();
    console.log('🔌 Database connection closed');
  }
}

// Run migration if called directly
if (require.main === module) {
  migrateToBidMetricsSchema();
}

module.exports = migrateToBidMetricsSchema;
