/**
 * Debug Script: Check Media and Bids Status
 * 
 * This script checks the current state of media and bids to debug the issues.
 */

const mongoose = require('mongoose');
const Media = require('../models/Media');
const Bid = require('../models/Bid');
const Party = require('../models/Party');

async function debugMediaAndBids() {
  try {
    console.log('🔍 Debugging Media and Bids Status...');
    
    // Check total counts
    const mediaCount = await Media.countDocuments();
    const bidCount = await Bid.countDocuments();
    const partyCount = await Party.countDocuments();
    
    console.log(`📊 Database counts:`);
    console.log(`   Media: ${mediaCount}`);
    console.log(`   Bids: ${bidCount}`);
    console.log(`   Parties: ${partyCount}`);
    
    // Check Global Party
    const globalParty = await Party.getGlobalParty();
    if (globalParty) {
      console.log(`✅ Global Party found: "${globalParty.name}" (${globalParty._id})`);
      console.log(`   Type: ${globalParty.type}`);
      console.log(`   Media entries: ${globalParty.media?.length || 0}`);
    } else {
      console.log('❌ Global Party not found');
    }
    
    // Check media with bids
    const mediaWithBids = await Media.find({ 
      bids: { $exists: true, $ne: [] } 
    }).select('title uuid _id bids.length globalMediaAggregate');
    
    console.log(`\n📋 Media with bids (${mediaWithBids.length}):`);
    mediaWithBids.forEach((media, index) => {
      console.log(`   ${index + 1}. "${media.title}"`);
      console.log(`      UUID: ${media.uuid}`);
      console.log(`      ID: ${media._id}`);
      console.log(`      Bids: ${media.bids?.length || 0}`);
      console.log(`      Aggregate: £${media.globalMediaAggregate || 0}`);
    });
    
    // Check recent bids
    const recentBids = await Bid.find({}).sort({ createdAt: -1 }).limit(10);
    console.log(`\n📋 Recent bids (${recentBids.length}):`);
    recentBids.forEach((bid, index) => {
      console.log(`   ${index + 1}. "${bid.mediaTitle}" - £${bid.amount}`);
      console.log(`      Scope: ${bid.bidScope}`);
      console.log(`      Party: ${bid.partyName}`);
      console.log(`      User: ${bid.username}`);
      console.log(`      Created: ${bid.createdAt}`);
    });
    
    // Check for the specific media UUID from the error
    const specificMediaUUID = '068e6711-54fc-7d14-8f99-789f7d3bb07a';
    const specificMedia = await Media.findOne({ uuid: specificMediaUUID });
    
    console.log(`\n🎯 Checking specific media UUID from error: ${specificMediaUUID}`);
    if (specificMedia) {
      console.log(`✅ Found media: "${specificMedia.title}"`);
      console.log(`   ID: ${specificMedia._id}`);
      console.log(`   Bids: ${specificMedia.bids?.length || 0}`);
      console.log(`   Aggregate: £${specificMedia.globalMediaAggregate || 0}`);
    } else {
      console.log('❌ Media not found with that UUID');
      
      // Check if it exists with a different UUID format
      const mediaWithSimilarUUID = await Media.findOne({ 
        uuid: { $regex: specificMediaUUID.substring(0, 8) } 
      });
      if (mediaWithSimilarUUID) {
        console.log(`⚠️  Found media with similar UUID: "${mediaWithSimilarUUID.title}"`);
        console.log(`   UUID: ${mediaWithSimilarUUID.uuid}`);
      }
    }
    
    // Check for any media without UUIDs
    const mediaWithoutUUID = await Media.find({ 
      $or: [
        { uuid: { $exists: false } },
        { uuid: null },
        { uuid: '' }
      ]
    });
    
    if (mediaWithoutUUID.length > 0) {
      console.log(`\n⚠️  Found ${mediaWithoutUUID.length} media without UUIDs:`);
      mediaWithoutUUID.forEach((media, index) => {
        console.log(`   ${index + 1}. "${media.title}" (ID: ${media._id})`);
      });
    }
    
    // Check bid scope distribution
    const globalBids = await Bid.countDocuments({ bidScope: 'global' });
    const partyBids = await Bid.countDocuments({ bidScope: 'party' });
    const bidsWithoutScope = await Bid.countDocuments({ bidScope: { $exists: false } });
    
    console.log(`\n📊 Bid scope distribution:`);
    console.log(`   Global bids: ${globalBids}`);
    console.log(`   Party bids: ${partyBids}`);
    console.log(`   Bids without scope: ${bidsWithoutScope}`);
    
  } catch (error) {
    console.error('❌ Debug failed:', error);
  }
}

// Run debug
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/Tuneable')
  .then(async () => {
    console.log('Connected to MongoDB');
    await debugMediaAndBids();
    process.exit(0);
  })
  .catch(error => {
    console.error('Failed to connect to MongoDB:', error);
    process.exit(1);
  });
