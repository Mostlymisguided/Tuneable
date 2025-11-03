/**
 * Migration script to set inviteCredits to 10 for all existing users
 * Run this once to initialize inviteCredits for users created before this field was added
 */

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

async function setInviteCreditsToUsers() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB');

    // Find all users without inviteCredits set (or with null/undefined)
    const usersWithoutCredits = await User.find({
      $or: [
        { inviteCredits: { $exists: false } },
        { inviteCredits: null },
        { inviteCredits: undefined }
      ]
    });
    
    console.log(`📊 Found ${usersWithoutCredits.length} users without inviteCredits set`);

    if (usersWithoutCredits.length === 0) {
      console.log('✅ All users already have inviteCredits set!');
      process.exit(0);
    }

    let updated = 0;

    for (const user of usersWithoutCredits) {
      // Set inviteCredits to 10 for all existing users
      await mongoose.connection.collection('users').updateOne(
        { _id: user._id },
        { 
          $set: { 
            inviteCredits: 10
          } 
        }
      );
      
      updated++;
      if (updated % 10 === 0) {
        console.log(`⏳ Updated ${updated} users...`);
      }
    }

    console.log(`\n🎉 Migration complete! Updated ${updated} users with inviteCredits: 10.`);
    
  } catch (error) {
    console.error('❌ Migration error:', error);
  } finally {
    await mongoose.connection.close();
    console.log('👋 Disconnected from MongoDB');
    process.exit(0);
  }
}

// Run the migration
setInviteCreditsToUsers();

