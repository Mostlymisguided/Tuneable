/**
 * Check bid aggregate values in the database
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Bid = require('../models/Bid');
const Party = require('../models/Party');

async function checkAggregates() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB\n');
    
    // Count bids with aggregates
    const total = await Bid.countDocuments();
    const withParty = await Bid.countDocuments({ partyAggregateBidValue: { $exists: true, $gt: 0 } });
    const withGlobal = await Bid.countDocuments({ globalAggregateBidValue: { $exists: true, $gt: 0 } });
    
    console.log(`📊 Statistics:`);
    console.log(`Total bids: ${total}`);
    console.log(`Bids with partyAggregateBidValue > 0: ${withParty}`);
    console.log(`Bids with globalAggregateBidValue > 0: ${withGlobal}`);
    console.log(`Bids WITHOUT aggregates: ${total - Math.max(withParty, withGlobal)}\n`);
    
    // Show most recent bids
    const recentBids = await Bid.find()
      .sort({ createdAt: -1 })
      .limit(10)
      .select('username mediaTitle amount partyAggregateBidValue globalAggregateBidValue createdAt partyId mediaId userId')
      .populate('partyId', 'name')
      .lean();
      
    console.log('🔍 Most Recent 10 Bids:\n');
    recentBids.forEach((bid, index) => {
      console.log(`${index + 1}. ${bid.username} → ${bid.mediaTitle || 'Unknown'}`);
      console.log(`   Amount: £${bid.amount.toFixed(2)}`);
      console.log(`   Party Aggregate: £${(bid.partyAggregateBidValue || 0).toFixed(2)} ${!bid.partyAggregateBidValue ? '❌ NOT SET' : '✅'}`);
      console.log(`   Global Aggregate: £${(bid.globalAggregateBidValue || 0).toFixed(2)} ${!bid.globalAggregateBidValue ? '❌ NOT SET' : '✅'}`);
      console.log(`   Party: ${bid.partyId?.name || 'Unknown'}`);
      console.log(`   Created: ${new Date(bid.createdAt).toLocaleString()}\n`);
    });

    // Find duplicate bids on same media
    console.log('🔍 Looking for users who bid multiple times on same media...\n');
    const duplicateBids = await Bid.aggregate([
      {
        $group: {
          _id: { userId: '$userId', mediaId: '$mediaId', partyId: '$partyId' },
          count: { $sum: 1 },
          bids: { $push: { amount: '$amount', partyAggregate: '$partyAggregateBidValue', globalAggregate: '$globalAggregateBidValue', createdAt: '$createdAt' } }
        }
      },
      {
        $match: { count: { $gt: 1 } }
      },
      {
        $sort: { '_id.createdAt': -1 }
      },
      {
        $limit: 5
      }
    ]);

    if (duplicateBids.length > 0) {
      console.log('Found users with multiple bids on same media in same party:');
      for (const group of duplicateBids) {
        console.log(`\nUser: ${group._id.userId}`);
        console.log(`Media: ${group._id.mediaId}`);
        console.log(`Party: ${group._id.partyId}`);
        console.log(`Total bids: ${group.count}`);
        console.log('Bid progression:');
        group.bids.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
        group.bids.forEach((bid, i) => {
          console.log(`  ${i + 1}. Amount: £${bid.amount}, Party Agg: £${bid.partyAggregate || 'NOT SET'}, Global Agg: £${bid.globalAggregate || 'NOT SET'}`);
        });
      }
    } else {
      console.log('No users have bid multiple times on same media yet.');
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\n👋 Disconnected from MongoDB');
    process.exit(0);
  }
}

checkAggregates();

