/**
 * Test Script: Verify Global Party System
 * 
 * This script tests the new Global Party system to ensure it's working correctly.
 */

const mongoose = require('mongoose');
const Party = require('../models/Party');
const Media = require('../models/Media');
const Bid = require('../models/Bid');

const atlasUri = 'mongodb+srv://admin:superstrongkiwisflytoindiaonpigs@tuneablecluster0.lc0zk.mongodb.net/Tuneable?retryWrites=true&w=majority&appName=TuneableCluster0';

async function testGlobalPartySystem() {
  try {
    console.log('🧪 Testing Global Party System...');
    
    // Test 1: Get Global Party by type
    console.log('\n📋 Test 1: Getting Global Party by type');
    const globalParty = await Party.getGlobalParty();
    if (globalParty) {
      console.log('✅ Global Party found by type');
      console.log(`   Name: ${globalParty.name}`);
      console.log(`   Type: ${globalParty.type}`);
      console.log(`   ID: ${globalParty._id}`);
    } else {
      console.log('❌ Global Party not found by type');
      return;
    }
    
    // Test 2: Count global bids
    console.log('\n📋 Test 2: Counting global bids');
    const globalBids = await Bid.find({ bidScope: 'global' });
    console.log(`✅ Found ${globalBids.length} global bids`);
    
    // Test 3: Count media with bids
    console.log('\n📋 Test 3: Counting media with bids');
    const mediaWithBids = await Media.find({ bids: { $exists: true, $ne: [] } });
    console.log(`✅ Found ${mediaWithBids.length} media items with bids`);
    
    // Test 4: Count media with globalBids array
    console.log('\n📋 Test 4: Counting media with globalBids array');
    const mediaWithGlobalBids = await Media.find({ globalBids: { $exists: true, $ne: [] } });
    console.log(`✅ Found ${mediaWithGlobalBids.length} media items with globalBids array`);
    
    // Test 5: Sample data
    if (globalBids.length > 0) {
      console.log('\n📋 Test 5: Sample global bid data');
      const sampleBid = globalBids[0];
      console.log(`   Media: ${sampleBid.mediaTitle}`);
      console.log(`   Amount: £${sampleBid.amount}`);
      console.log(`   Scope: ${sampleBid.bidScope}`);
      console.log(`   Party: ${sampleBid.partyName}`);
    }
    
    // Test 6: Simulate Global Party aggregation
    console.log('\n📋 Test 6: Simulating Global Party aggregation');
    const allMediaWithBids = await Media.find({
      bids: { $exists: true, $ne: [] }
    })
    .populate({
      path: 'bids',
      model: 'Bid',
      populate: {
        path: 'userId',
        select: 'username'
      }
    })
    .limit(5); // Limit for testing
    
    console.log(`✅ Successfully aggregated ${allMediaWithBids.length} media items for Global Party`);
    
    allMediaWithBids.forEach((media, index) => {
      console.log(`   ${index + 1}. "${media.title}" - ${media.bids.length} bids`);
    });
    
    console.log('\n🎉 Global Party System test completed successfully!');
    console.log('\nThe Global Party should now display ALL media with ANY bids across the platform.');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run test
mongoose.connect(atlasUri)
  .then(async () => {
    console.log('Connected to MongoDB');
    await testGlobalPartySystem();
    process.exit(0);
  })
  .catch(error => {
    console.error('Failed to connect to MongoDB:', error);
    process.exit(1);
  });
