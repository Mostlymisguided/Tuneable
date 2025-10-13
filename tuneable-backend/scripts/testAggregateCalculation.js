/**
 * Test the aggregate calculation functions
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Bid = require('../models/Bid');
const { calculatePartyAggregateBidValue, calculateGlobalAggregateBidValue } = require('../utils/bidCalculations');

async function test() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB\n');
    
    // Get Tuneable's recent bids on the same media
    const bids = await Bid.find({ username: 'Tuneable' })
      .sort({ createdAt: -1 })
      .limit(2)
      .lean();
      
    if (bids.length < 2) {
      console.log('Need at least 2 bids to test!');
      process.exit(0);
    }

    const bid1 = bids[1]; // Older bid
    const bid2 = bids[0]; // Newer bid
    
    console.log('Testing with these bids:');
    console.log(`Bid 1: ${bid1.mediaTitle} - £${bid1.amount} (${new Date(bid1.createdAt).toLocaleString()})`);
    console.log(`Bid 2: ${bid2.mediaTitle} - £${bid2.amount} (${new Date(bid2.createdAt).toLocaleString()})`);
    console.log(`\nSame media? ${bid1.mediaId.toString() === bid2.mediaId.toString()}`);
    console.log(`Same party? ${bid1.partyId.toString() === bid2.partyId.toString()}\n`);

    // Test calculation AFTER bid 2 was placed
    console.log('Testing calculatePartyAggregateBidValue...');
    const partyResult = await calculatePartyAggregateBidValue(
      bid2.userId,
      bid2.mediaId,
      bid2.partyId
    );
    console.log(`Result: £${partyResult}`);
    console.log(`Expected: £${bid1.amount + bid2.amount}`);
    console.log(`Match: ${Math.abs(partyResult - (bid1.amount + bid2.amount)) < 0.01 ? '✅' : '❌'}\n`);

    console.log('Testing calculateGlobalAggregateBidValue...');
    const globalResult = await calculateGlobalAggregateBidValue(
      bid2.userId,
      bid2.mediaId
    );
    console.log(`Result: £${globalResult}`);
    console.log(`Expected: £${bid1.amount + bid2.amount}`);
    console.log(`Match: ${Math.abs(globalResult - (bid1.amount + bid2.amount)) < 0.01 ? '✅' : '❌'}\n`);

    // Check what's actually in the database for these IDs
    console.log('🔍 Raw database query for partyAggregate:');
    const rawBids = await Bid.find({
      userId: bid2.userId,
      mediaId: bid2.mediaId,
      partyId: bid2.partyId,
      status: { $in: ['active', 'played'] }
    }).select('amount username createdAt').lean();
    
    console.log(`Found ${rawBids.length} matching bids:`);
    rawBids.forEach(b => {
      console.log(`  - £${b.amount} by ${b.username} at ${new Date(b.createdAt).toLocaleString()}`);
    });
    const manualSum = rawBids.reduce((sum, b) => sum + b.amount, 0);
    console.log(`Manual sum: £${manualSum}`);
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\n👋 Disconnected from MongoDB');
    process.exit(0);
  }
}

test();

