/**
 * Debug specific bid aggregate calculations
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Bid = require('../models/Bid');

async function debugBids() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB\n');
    
    // Get the two most recent bids by Tuneable user
    const tuneable = await Bid.find({ username: 'Tuneable' })
      .sort({ createdAt: -1 })
      .limit(5)
      .select('username mediaTitle amount partyAggregateBidValue globalAggregateBidValue createdAt userId mediaId partyId')
      .lean();
      
    console.log('🔍 Recent Tuneable bids:\n');
    tuneable.forEach((bid, i) => {
      console.log(`Bid ${i + 1}:`);
      console.log(`  Title: ${bid.mediaTitle}`);
      console.log(`  Amount: £${bid.amount}`);
      console.log(`  Party Aggregate: £${bid.partyAggregateBidValue}`);
      console.log(`  Global Aggregate: £${bid.globalAggregateBidValue}`);
      console.log(`  Created: ${new Date(bid.createdAt).toLocaleString()}`);
      console.log(`  UserID: ${bid.userId}`);
      console.log(`  MediaID: ${bid.mediaId}`);
      console.log(`  PartyID: ${bid.partyId}\n`);
    });

    // For the most recent media, check ALL bids on it
    if (tuneable.length > 0) {
      const latestBid = tuneable[0];
      console.log('🔍 All bids on this media:\n');
      
      const allBidsOnMedia = await Bid.find({ 
        mediaId: latestBid.mediaId 
      })
        .sort({ createdAt: 1 })
        .select('username amount partyAggregateBidValue globalAggregateBidValue partyId createdAt')
        .lean();
        
      allBidsOnMedia.forEach((bid, i) => {
        console.log(`${i + 1}. ${bid.username} - £${bid.amount}`);
        console.log(`   Party Agg: £${bid.partyAggregateBidValue} | Global Agg: £${bid.globalAggregateBidValue}`);
        console.log(`   Party: ${bid.partyId}`);
        console.log(`   Time: ${new Date(bid.createdAt).toLocaleString()}\n`);
      });

      // Check if they're in the same party
      const partyIds = [...new Set(allBidsOnMedia.map(b => b.partyId.toString()))];
      console.log(`📊 This media has been bid on in ${partyIds.length} different ${partyIds.length === 1 ? 'party' : 'parties'}`);
      
      if (partyIds.length === 1) {
        console.log('⚠️  All bids are in ONE party - party and global aggregates SHOULD be the same!\n');
        
        // Manual verification
        const tuneableBids = allBidsOnMedia.filter(b => b.username === 'Tuneable');
        console.log(`Tuneable made ${tuneableBids.length} bids on this media:`);
        let manualPartyTotal = 0;
        let manualGlobalTotal = 0;
        tuneableBids.forEach((bid, i) => {
          manualPartyTotal += bid.amount;
          manualGlobalTotal += bid.amount;
          console.log(`  Bid ${i + 1}: £${bid.amount} → Should be Party: £${manualPartyTotal.toFixed(2)}, Global: £${manualGlobalTotal.toFixed(2)}`);
          console.log(`           Actual stored: Party: £${bid.partyAggregateBidValue}, Global: £${bid.globalAggregateBidValue}`);
          
          if (Math.abs(bid.partyAggregateBidValue - manualPartyTotal) > 0.01) {
            console.log(`           ❌ PARTY AGGREGATE MISMATCH!`);
          }
          if (Math.abs(bid.globalAggregateBidValue - manualGlobalTotal) > 0.01) {
            console.log(`           ❌ GLOBAL AGGREGATE MISMATCH!`);
          }
        });
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\n👋 Disconnected from MongoDB');
    process.exit(0);
  }
}

debugBids();

