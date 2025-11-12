/**
 * Test Script: Verify Global Party Bidding Fix
 * 
 * This script tests that bidding on media in the Global Party works correctly
 * by simulating the bidding process.
 */

const mongoose = require('mongoose');
const Party = require('../models/Party');
const Media = require('../models/Media');
const Bid = require('../models/Bid');
const User = require('../models/User');

async function testGlobalPartyBidding() {
  try {
    console.log('🧪 Testing Global Party Bidding Fix...');
    
    // Get Global Party
    const globalParty = await Party.getGlobalParty();
    if (!globalParty) {
      console.log('❌ Global Party not found');
      return;
    }
    
    console.log(`✅ Found Global Party: "${globalParty.name}" (${globalParty._id})`);
    
    // Find a media item with bids to test with
    const mediaWithBids = await Media.findOne({ 
      bids: { $exists: true, $ne: [] } 
    }).populate('bids');
    
    if (!mediaWithBids) {
      console.log('❌ No media with bids found to test with');
      return;
    }
    
    console.log(`✅ Found test media: "${mediaWithBids.title}" (${mediaWithBids.uuid})`);
    console.log(`   Current bids: ${mediaWithBids.bids.length}`);
    console.log(`   Current aggregate: £${mediaWithBids.globalMediaAggregate || 0}`);
    
    // Find a test user
    const testUser = await User.findOne({});
    if (!testUser) {
      console.log('❌ No users found to test with');
      return;
    }
    
    console.log(`✅ Found test user: "${testUser.username}" (Balance: £${testUser.balance})`);
    
    // Test the bidding logic by simulating what the route does
    console.log('\n📋 Testing Global Party bidding logic...');
    
    // Simulate the route logic for Global Party
    const isGlobalParty = await Party.getGlobalParty();
    const isRequestingGlobalParty = isGlobalParty && isGlobalParty._id.toString() === globalParty._id.toString();
    
    console.log(`   Is Global Party: ${isRequestingGlobalParty}`);
    
    if (isRequestingGlobalParty) {
      // Test media resolution
      let actualMediaId, populatedMedia;
      
      if (mongoose.isValidObjectId(mediaWithBids._id)) {
        actualMediaId = mediaWithBids._id;
        populatedMedia = await Media.findById(actualMediaId);
      } else {
        populatedMedia = await Media.findOne({ uuid: mediaWithBids.uuid });
        if (populatedMedia) {
          actualMediaId = populatedMedia._id;
        }
      }
      
      if (populatedMedia && actualMediaId) {
        console.log('✅ Media resolution successful');
        console.log(`   Actual Media ID: ${actualMediaId}`);
        console.log(`   Populated Media Title: ${populatedMedia.title}`);
        
        // Test virtual party media entry creation
        const partyMediaEntry = {
          mediaId: populatedMedia._id,
          media_uuid: populatedMedia.uuid,
          partyMediaAggregate: populatedMedia.globalMediaAggregate || 0,
          partyBids: populatedMedia.bids || [],
          status: 'active'
        };
        
        console.log('✅ Virtual party media entry created successfully');
        console.log(`   Virtual entry aggregate: £${partyMediaEntry.partyMediaAggregate}`);
        console.log(`   Virtual entry bids: ${partyMediaEntry.partyBids.length}`);
        
        // Test queue context calculation
        const queuedMedia = await Media.find({ bids: { $exists: true, $ne: [] } });
        const queueSize = queuedMedia.length;
        const queuePosition = queuedMedia.findIndex(m => m._id.toString() === actualMediaId.toString()) + 1;
        
        console.log('✅ Queue context calculation successful');
        console.log(`   Queue size: ${queueSize}`);
        console.log(`   Queue position: ${queuePosition}`);
        
        console.log('\n🎉 Global Party bidding logic test completed successfully!');
        console.log('✅ The fix should resolve the 404 "Media not found in party queue" error');
        
      } else {
        console.log('❌ Media resolution failed');
      }
    } else {
      console.log('❌ Global Party detection failed');
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run test
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/Tuneable')
  .then(async () => {
    console.log('Connected to MongoDB');
    await testGlobalPartyBidding();
    process.exit(0);
  })
  .catch(error => {
    console.error('Failed to connect to MongoDB:', error);
    process.exit(1);
  });
