/**
 * Migration Script: Add all existing users to Global Party
 * 
 * This script adds all existing users to the Global Party to implement
 * the auto-join behavior for the Global Party feature.
 * 
 * Usage: node scripts/migrate-users-to-global-party.js
 */

const mongoose = require('mongoose');
require('dotenv').config();

// Import models
const User = require('../models/User');
const Party = require('../models/Party');

async function migrateUsersToGlobalParty() {
  try {
    console.log('🚀 Starting migration: Add all users to Global Party...');
    
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/tuneable', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ Connected to MongoDB');

    // Get the Global Party
    const globalParty = await Party.getGlobalParty();
    if (!globalParty) {
      console.error('❌ Global Party not found! Please create a Global Party first.');
      process.exit(1);
    }
    
    console.log(`🌍 Found Global Party: ${globalParty.name} (${globalParty._id})`);
    console.log(`📊 Current partiers count: ${globalParty.partiers.length}`);

    // Get all users
    const allUsers = await User.find({}).select('_id username');
    console.log(`👥 Found ${allUsers.length} users in the system`);

    // Get current partiers to avoid duplicates
    const currentPartiers = globalParty.partiers.map(id => id.toString());
    console.log(`👥 Current partiers: ${currentPartiers.length}`);

    // Find users not already in Global Party
    const usersToAdd = allUsers.filter(user => 
      !currentPartiers.includes(user._id.toString())
    );
    
    console.log(`➕ Users to add to Global Party: ${usersToAdd.length}`);

    if (usersToAdd.length === 0) {
      console.log('✅ All users are already in the Global Party!');
      return;
    }

    // Add users to Global Party
    const userIdsToAdd = usersToAdd.map(user => user._id);
    globalParty.partiers.push(...userIdsToAdd);
    
    await globalParty.save();
    
    console.log(`✅ Successfully added ${userIdsToAdd.length} users to Global Party`);
    console.log(`📊 New partiers count: ${globalParty.partiers.length}`);

    // Show some sample users that were added
    if (usersToAdd.length > 0) {
      console.log('\n📋 Sample users added:');
      usersToAdd.slice(0, 5).forEach(user => {
        console.log(`   - ${user.username} (${user._id})`);
      });
      if (usersToAdd.length > 5) {
        console.log(`   ... and ${usersToAdd.length - 5} more`);
      }
    }

    console.log('\n🎉 Migration completed successfully!');
    console.log('🌍 All users are now automatically part of the Global Party');

  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('👋 Disconnected from MongoDB');
  }
}

// Run the migration
if (require.main === module) {
  migrateUsersToGlobalParty()
    .then(() => {
      console.log('✅ Migration script completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Migration script failed:', error);
      process.exit(1);
    });
}

module.exports = migrateUsersToGlobalParty;

