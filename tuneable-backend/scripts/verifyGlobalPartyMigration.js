/**
 * Verification Script: Check Global Party Migration Results
 */

const mongoose = require('mongoose');
const Party = require('../models/Party');
const Bid = require('../models/Bid');
const Media = require('../models/Media');

// Use environment variable for MongoDB connection

async function verifyMigration() {
  try {
    console.log('🔍 Verifying Global Party Migration...');
    
    // Check Global Party
    const globalParty = await Party.getGlobalParty();
    if (globalParty) {
      console.log('✅ Global Party found by type: global');
      console.log(`   Name: ${globalParty.name}`);
      console.log(`   Type: ${globalParty.type}`);
      console.log(`   ID: ${globalParty._id}`);
    } else {
      console.log('❌ Global Party not found by type: global');
    }
    
    // Check global bids
    const globalBids = await Bid.find({ bidScope: 'global' });
    console.log(`✅ Found ${globalBids.length} bids with bidScope: global`);
    
    // Check media with globalBids array
    const mediaWithGlobalBids = await Media.find({ globalBids: { $exists: true, $ne: [] } });
    console.log(`✅ Found ${mediaWithGlobalBids.length} media items with globalBids array`);
    
    // Sample check
    if (globalBids.length > 0) {
      const sampleBid = globalBids[0];
      console.log(`📋 Sample global bid:`);
      console.log(`   Media: ${sampleBid.mediaTitle}`);
      console.log(`   Amount: £${sampleBid.amount}`);
      console.log(`   Scope: ${sampleBid.bidScope}`);
    }
    
    console.log('🎉 Migration verification completed!');
    
  } catch (error) {
    console.error('❌ Verification failed:', error);
  }
}

// Run verification
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/Tuneable')
  .then(async () => {
    console.log('Connected to MongoDB');
    await verifyMigration();
    process.exit(0);
  })
  .catch(error => {
    console.error('Failed to connect to MongoDB:', error);
    process.exit(1);
  });
