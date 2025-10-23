/**
 * Combined Migration Script: Global Party System Migration
 * 
 * This script runs the complete migration to the new Global Party system:
 * 1. Migrates existing Global Party to type: 'global'
 * 2. Adds bidScope: 'global' to existing global bids
 * 3. Populates globalBids array in Media model
 */

const mongoose = require('mongoose');
const { migrateGlobalParty } = require('./migrateGlobalParty');
const { migrateGlobalBids } = require('./migrateGlobalBids');

async function runGlobalPartyMigration() {
  try {
    console.log('🚀 Starting Global Party System Migration...');
    console.log('==========================================');
    
    // Step 1: Migrate Global Party to type: 'global'
    console.log('\n📋 Step 1: Migrating Global Party to type: global');
    await migrateGlobalParty();
    
    // Step 2: Migrate global bids to have bidScope: 'global'
    console.log('\n📋 Step 2: Migrating global bids to bidScope: global');
    await migrateGlobalBids();
    
    console.log('\n🎉 Global Party System Migration completed successfully!');
    console.log('==========================================');
    console.log('✅ Global Party now uses type: global for detection');
    console.log('✅ Global bids now have bidScope: global');
    console.log('✅ Media model now has globalBids array populated');
    console.log('\nNext steps:');
    console.log('1. Update global bid creation logic to use bidScope');
    console.log('2. Update Global Party display logic to show all media');
    console.log('3. Test the new system thoroughly');
    
  } catch (error) {
    console.error('❌ Global Party System Migration failed:', error);
    throw error;
  }
}

// Run migration if called directly
if (require.main === module) {
  mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/Tuneable')
    .then(async () => {
      console.log('Connected to MongoDB');
      await runGlobalPartyMigration();
      process.exit(0);
    })
    .catch(error => {
      console.error('Failed to connect to MongoDB:', error);
      process.exit(1);
    });
}

module.exports = { runGlobalPartyMigration };
