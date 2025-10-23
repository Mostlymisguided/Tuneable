/**
 * Test Script: Test Global Bid Endpoint
 * 
 * This script tests the global bid endpoint to see if it works with existing media.
 */

const mongoose = require('mongoose');
const Media = require('../models/Media');
const Party = require('../models/Party');

async function testGlobalBidEndpoint() {
  try {
    console.log('🧪 Testing Global Bid Endpoint...');
    
    // Find any media with a UUID
    const mediaWithUUID = await Media.findOne({ 
      uuid: { $exists: true, $ne: null, $ne: '' } 
    });
    
    if (!mediaWithUUID) {
      console.log('❌ No media found with UUID');
      return;
    }
    
    console.log(`✅ Found test media: "${mediaWithUUID.title}"`);
    console.log(`   UUID: ${mediaWithUUID.uuid}`);
    console.log(`   ID: ${mediaWithUUID._id}`);
    
    // Test the resolveId function
    const { resolveId } = require('../utils/idResolver');
    const resolvedId = await resolveId(mediaWithUUID.uuid, Media, 'uuid');
    
    console.log(`\n🔍 Testing resolveId function:`);
    console.log(`   Input UUID: ${mediaWithUUID.uuid}`);
    console.log(`   Resolved ID: ${resolvedId}`);
    console.log(`   Expected ID: ${mediaWithUUID._id}`);
    console.log(`   Match: ${resolvedId === mediaWithUUID._id.toString()}`);
    
    if (resolvedId !== mediaWithUUID._id.toString()) {
      console.log('❌ resolveId function is not working correctly');
      return;
    }
    
    // Test Global Party detection
    const globalParty = await Party.getGlobalParty();
    if (!globalParty) {
      console.log('❌ Global Party not found');
      return;
    }
    
    console.log(`\n✅ Global Party found: "${globalParty.name}"`);
    console.log(`   Type: ${globalParty.type}`);
    console.log(`   ID: ${globalParty._id}`);
    
    console.log('\n🎉 Global bid endpoint should work with this media!');
    console.log(`   Test URL: POST /api/media/${mediaWithUUID.uuid}/global-bid`);
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run test
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/Tuneable')
  .then(async () => {
    console.log('Connected to MongoDB');
    await testGlobalBidEndpoint();
    process.exit(0);
  })
  .catch(error => {
    console.error('Failed to connect to MongoDB:', error);
    process.exit(1);
  });
