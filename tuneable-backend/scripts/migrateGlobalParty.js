/**
 * Migration Script: Convert Existing Global Party to type: 'global'
 * 
 * This script migrates the existing hardcoded Global Party to use the new
 * type: 'global' system for dynamic detection.
 */

const mongoose = require('mongoose');
const Party = require('../models/Party');

// Hardcoded Global Party ID (existing)
const GLOBAL_PARTY_ID = '67c6a02895baad05d3a97cf4';

async function migrateGlobalParty() {
  try {
    console.log('🔄 Starting Global Party migration...');
    
    // Find existing Global Party
    const globalParty = await Party.findById(GLOBAL_PARTY_ID);
    
    if (!globalParty) {
      console.log('❌ Global Party not found with ID:', GLOBAL_PARTY_ID);
      console.log('Please verify the Global Party ID is correct.');
      return;
    }
    
    console.log(`✅ Found existing Global Party: "${globalParty.name}"`);
    console.log(`   Current type: ${globalParty.type}`);
    console.log(`   Current location: ${globalParty.location}`);
    
    // Check if already migrated
    if (globalParty.type === 'global') {
      console.log('✅ Global Party already migrated to type: global');
      return;
    }
    
    // Migrate to type: 'global'
    globalParty.type = 'global';
    await globalParty.save();
    
    console.log('✅ Successfully migrated Global Party to type: global');
    console.log(`   New type: ${globalParty.type}`);
    
    // Verify migration
    const verifyParty = await Party.getGlobalParty();
    if (verifyParty && verifyParty._id.toString() === GLOBAL_PARTY_ID) {
      console.log('✅ Verification successful: Global Party detected by type');
    } else {
      console.log('❌ Verification failed: Global Party not detected by type');
    }
    
  } catch (error) {
    console.error('❌ Error migrating Global Party:', error);
    throw error;
  }
}

// Run migration if called directly
if (require.main === module) {
  mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/Tuneable')
    .then(async () => {
      console.log('Connected to MongoDB');
      await migrateGlobalParty();
      process.exit(0);
    })
    .catch(error => {
      console.error('Failed to connect to MongoDB:', error);
      process.exit(1);
    });
}

module.exports = { migrateGlobalParty };
