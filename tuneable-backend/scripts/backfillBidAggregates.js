/**
 * Backfill partyAggregateBidValue and globalAggregateBidValue for existing bids
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Bid = require('../models/Bid');

async function backfillAggregates() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    // Find all bids without aggregates
    const bidsToUpdate = await Bid.find({
      $or: [
        { partyAggregateBidValue: { $exists: false } },
        { globalAggregateBidValue: { $exists: false } },
        { partyAggregateBidValue: 0 },
        { globalAggregateBidValue: 0 }
      ]
    }).sort({ createdAt: 1 }); // Process in chronological order

    console.log(`📊 Found ${bidsToUpdate.length} bids to backfill\n`);

    if (bidsToUpdate.length === 0) {
      console.log('✅ All bids already have aggregates!');
      process.exit(0);
    }

    let updated = 0;
    const processedCombos = new Map(); // Track user+media+party combinations

    for (const bid of bidsToUpdate) {
      try {
        // Calculate aggregates up to this bid's timestamp
        const partyAggResult = await Bid.aggregate([
          {
            $match: {
              userId: bid.userId,
              mediaId: bid.mediaId,
              partyId: bid.partyId,
              createdAt: { $lte: bid.createdAt },
              status: { $in: ['active', 'played'] }
            }
          },
          {
            $group: {
              _id: null,
              total: { $sum: '$amount' }
            }
          }
        ]);

        const globalAggResult = await Bid.aggregate([
          {
            $match: {
              userId: bid.userId,
              mediaId: bid.mediaId,
              createdAt: { $lte: bid.createdAt },
              status: { $in: ['active', 'played'] }
            }
          },
          {
            $group: {
              _id: null,
              total: { $sum: '$amount' }
            }
          }
        ]);

        const partyAggregate = partyAggResult.length > 0 ? partyAggResult[0].total : 0;
        const globalAggregate = globalAggResult.length > 0 ? globalAggResult[0].total : 0;

        // Update the bid document directly
        await mongoose.connection.collection('bids').updateOne(
          { _id: bid._id },
          {
            $set: {
              partyAggregateBidValue: partyAggregate,
              globalAggregateBidValue: globalAggregate
            }
          }
        );

        updated++;
        
        if (updated % 10 === 0) {
          console.log(`✅ Processed ${updated}/${bidsToUpdate.length} bids...`);
        }

      } catch (error) {
        console.error(`❌ Error processing bid ${bid._id}:`, error.message);
      }
    }

    console.log(`\n🎉 Backfill complete! Updated ${updated} bids.`);
    
    // Verify results
    console.log('\n📊 Verification:');
    const withParty = await Bid.countDocuments({ partyAggregateBidValue: { $exists: true, $gt: 0 } });
    const withGlobal = await Bid.countDocuments({ globalAggregateBidValue: { $exists: true, $gt: 0 } });
    const total = await Bid.countDocuments();
    
    console.log(`Total bids: ${total}`);
    console.log(`Bids with partyAggregateBidValue > 0: ${withParty}`);
    console.log(`Bids with globalAggregateBidValue > 0: ${withGlobal}`);
    
  } catch (error) {
    console.error('❌ Migration error:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\n👋 Disconnected from MongoDB');
    process.exit(0);
  }
}

backfillAggregates();

