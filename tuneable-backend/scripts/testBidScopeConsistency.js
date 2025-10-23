/**
 * Test Script: Verify Bid Scope Consistency
 * 
 * This script tests that all bids in the Global Party have bidScope: 'global'
 * regardless of how they were created (via globalbid feature or regular party bidding).
 */

const mongoose = require('mongoose');
const Party = require('../models/Party');
const Media = require('../models/Media');
const Bid = require('../models/Bid');

const atlasUri = 'mongodb+srv://admin:superstrongkiwisflytoindiaonpigs@tuneablecluster0.lc0zk.mongodb.net/Tuneable?retryWrites=true&w=majority&appName=TuneableCluster0';

async function testBidScopeConsistency() {
  try {
    console.log('🧪 Testing Bid Scope Consistency...');
    
    // Get Global Party
    const globalParty = await Party.getGlobalParty();
    if (!globalParty) {
      console.log('❌ Global Party not found');
      return;
    }
    
    console.log(`✅ Found Global Party: "${globalParty.name}" (${globalParty._id})`);
    
    // Test 1: Check all bids in Global Party
    console.log('\n📋 Test 1: Checking all bids in Global Party');
    const allGlobalPartyBids = await Bid.find({ partyId: globalParty._id });
    console.log(`📊 Found ${allGlobalPartyBids.length} total bids in Global Party`);
    
    // Check bidScope distribution
    const globalBids = allGlobalPartyBids.filter(bid => bid.bidScope === 'global');
    const partyBids = allGlobalPartyBids.filter(bid => bid.bidScope === 'party');
    
    console.log(`   - Global scope: ${globalBids.length}`);
    console.log(`   - Party scope: ${partyBids.length}`);
    
    if (partyBids.length > 0) {
      console.log('⚠️  Found bids with party scope in Global Party - these should be global scope');
      partyBids.slice(0, 3).forEach(bid => {
        console.log(`     - "${bid.mediaTitle}" - £${bid.amount} - ${bid.bidScope}`);
      });
    } else {
      console.log('✅ All Global Party bids have correct bidScope: global');
    }
    
    // Test 2: Check media with globalBids array
    console.log('\n📋 Test 2: Checking media with globalBids array');
    const mediaWithGlobalBids = await Media.find({ globalBids: { $exists: true, $ne: [] } });
    console.log(`📊 Found ${mediaWithGlobalBids.length} media items with globalBids array`);
    
    // Test 3: Sample bid data
    if (allGlobalPartyBids.length > 0) {
      console.log('\n📋 Test 3: Sample bid data');
      const sampleBids = allGlobalPartyBids.slice(0, 3);
      sampleBids.forEach((bid, index) => {
        console.log(`   ${index + 1}. "${bid.mediaTitle}"`);
        console.log(`      Amount: £${bid.amount}`);
        console.log(`      Scope: ${bid.bidScope}`);
        console.log(`      Party: ${bid.partyName}`);
        console.log(`      User: ${bid.username}`);
      });
    }
    
    // Test 4: Check for consistency
    console.log('\n📋 Test 4: Consistency check');
    const inconsistentBids = allGlobalPartyBids.filter(bid => bid.bidScope !== 'global');
    
    if (inconsistentBids.length === 0) {
      console.log('✅ All Global Party bids have consistent bidScope: global');
    } else {
      console.log(`❌ Found ${inconsistentBids.length} inconsistent bids:`);
      inconsistentBids.forEach(bid => {
        console.log(`   - "${bid.mediaTitle}" - £${bid.amount} - ${bid.bidScope} (should be global)`);
      });
    }
    
    console.log('\n🎉 Bid scope consistency test completed!');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run test
mongoose.connect(atlasUri)
  .then(async () => {
    console.log('Connected to MongoDB');
    await testBidScopeConsistency();
    process.exit(0);
  })
  .catch(error => {
    console.error('Failed to connect to MongoDB:', error);
    process.exit(1);
  });
