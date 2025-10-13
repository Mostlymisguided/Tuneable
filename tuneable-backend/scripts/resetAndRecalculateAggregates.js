/**
 * Reset and recalculate ALL bid aggregates with the fixed calculation
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Bid = require('../models/Bid');

async function resetAndRecalculate() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    // Get all bids sorted by creation time
    const allBids = await Bid.find().sort({ createdAt: 1 }).lean();
    
    console.log(`📊 Found ${allBids.length} total bids\n`);
    console.log('🔄 Recalculating aggregates in chronological order...\n');

    let updated = 0;

    for (const bid of allBids) {
      try {
        // Calculate aggregates up to and including this bid
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

        // Update the bid document
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
        
        if (updated % 20 === 0) {
          console.log(`✅ Processed ${updated}/${allBids.length} bids...`);
        }

      } catch (error) {
        console.error(`❌ Error processing bid ${bid._id}:`, error.message);
      }
    }

    console.log(`\n🎉 Recalculation complete! Updated ${updated} bids.`);
    
    // Verification
    console.log('\n📊 Verification:');
    const withParty = await Bid.countDocuments({ partyAggregateBidValue: { $exists: true, $gt: 0 } });
    const withGlobal = await Bid.countDocuments({ globalAggregateBidValue: { $exists: true, $gt: 0 } });
    const total = await Bid.countDocuments();
    
    console.log(`Total bids: ${total}`);
    console.log(`Bids with partyAggregateBidValue > 0: ${withParty}`);
    console.log(`Bids with globalAggregateBidValue > 0: ${withGlobal}`);
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\n👋 Disconnected from MongoDB');
    process.exit(0);
  }
}

resetAndRecalculate();

