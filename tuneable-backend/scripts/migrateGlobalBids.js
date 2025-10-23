/**
 * Migration Script: Add bidScope: 'global' to Existing Global Bids
 * 
 * This script adds bidScope: 'global' to all bids that are associated with
 * the Global Party, and populates the globalBids array in Media model.
 */

const mongoose = require('mongoose');
const Bid = require('../models/Bid');
const Media = require('../models/Media');
const Party = require('../models/Party');

// Hardcoded Global Party ID (existing)
const GLOBAL_PARTY_ID = '67c6a02895baad05d3a97cf4';

async function migrateGlobalBids() {
  try {
    console.log('🔄 Starting Global Bids migration...');
    
    // Verify Global Party exists
    const globalParty = await Party.findById(GLOBAL_PARTY_ID);
    if (!globalParty) {
      console.log('❌ Global Party not found. Run migrateGlobalParty.js first.');
      return;
    }
    
    console.log(`✅ Found Global Party: "${globalParty.name}"`);
    
    // Find all bids associated with Global Party
    const globalBids = await Bid.find({ partyId: GLOBAL_PARTY_ID });
    console.log(`📊 Found ${globalBids.length} bids associated with Global Party`);
    
    if (globalBids.length === 0) {
      console.log('✅ No global bids to migrate');
      return;
    }
    
    // Update bids to have bidScope: 'global'
    console.log('🔄 Adding bidScope: global to existing global bids...');
    const updateResult = await Bid.updateMany(
      { partyId: GLOBAL_PARTY_ID },
      { bidScope: 'global' }
    );
    
    console.log(`✅ Updated ${updateResult.modifiedCount} bids with bidScope: global`);
    
    // Populate globalBids array in Media model
    console.log('🔄 Populating globalBids array in Media model...');
    
    // Get unique media IDs from global bids (filter out null/undefined)
    const mediaIds = [...new Set(globalBids
      .filter(bid => bid.mediaId)
      .map(bid => bid.mediaId.toString())
    )];
    console.log(`📊 Found ${mediaIds.length} unique media items with global bids`);
    
    let updatedMediaCount = 0;
    
    for (const mediaId of mediaIds) {
      // Find all global bids for this media
      const mediaGlobalBids = globalBids.filter(bid => bid.mediaId && bid.mediaId.toString() === mediaId);
      const bidIds = mediaGlobalBids.map(bid => bid._id);
      
      // Update media document
      await Media.findByIdAndUpdate(
        mediaId,
        { 
          $addToSet: { 
            globalBids: { $each: bidIds }
          }
        }
      );
      
      updatedMediaCount++;
    }
    
    console.log(`✅ Updated ${updatedMediaCount} media documents with globalBids array`);
    
    // Verify migration
    console.log('🔍 Verifying migration...');
    
    // Check that global bids have bidScope: 'global'
    const verifyBids = await Bid.find({ partyId: GLOBAL_PARTY_ID, bidScope: 'global' });
    console.log(`✅ Verified ${verifyBids.length} global bids have bidScope: global`);
    
    // Check that media documents have globalBids populated
    const verifyMedia = await Media.find({ globalBids: { $exists: true, $ne: [] } });
    console.log(`✅ Verified ${verifyMedia.length} media documents have globalBids populated`);
    
    console.log('🎉 Global Bids migration completed successfully!');
    
  } catch (error) {
    console.error('❌ Error migrating global bids:', error);
    throw error;
  }
}

// Run migration if called directly
if (require.main === module) {
  mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/Tuneable')
    .then(async () => {
      console.log('Connected to MongoDB');
      await migrateGlobalBids();
      process.exit(0);
    })
    .catch(error => {
      console.error('Failed to connect to MongoDB:', error);
      process.exit(1);
    });
}

module.exports = { migrateGlobalBids };
