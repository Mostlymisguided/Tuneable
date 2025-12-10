/**
 * Migration script to convert personalInviteCode to personalInviteCodes array
 * 
 * This script:
 * 1. Finds all users with personalInviteCode but no personalInviteCodes array
 * 2. Migrates the single code to the new array format
 * 3. Keeps the old field for backward compatibility during transition
 * 
 * Run with: node scripts/migrate-invite-codes.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

async function migrateInviteCodes() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/Tuneable');
    console.log('✅ Connected to MongoDB');

    // Find all users that need migration
    const usersToMigrate = await User.find({
      $or: [
        { personalInviteCodes: { $exists: false } },
        { personalInviteCodes: { $size: 0 } }
      ],
      personalInviteCode: { $exists: true, $ne: null }
    });

    console.log(`Found ${usersToMigrate.length} users to migrate`);

    let migrated = 0;
    let errors = 0;

    for (const user of usersToMigrate) {
      try {
        // Check if user already has codes array
        if (!user.personalInviteCodes || user.personalInviteCodes.length === 0) {
          // Migrate the single code to array
          user.personalInviteCodes = [{
            code: user.personalInviteCode,
            isActive: true,
            label: 'Primary',
            createdAt: user.createdAt || new Date(),
            usageCount: 0
          }];
          
          await user.save();
          migrated++;
          
          if (migrated % 100 === 0) {
            console.log(`Migrated ${migrated} users...`);
          }
        }
      } catch (error) {
        console.error(`Error migrating user ${user._id} (${user.username}):`, error.message);
        errors++;
      }
    }

    console.log('\n✅ Migration complete!');
    console.log(`   Migrated: ${migrated} users`);
    console.log(`   Errors: ${errors} users`);

    // Verify migration
    const usersWithNewFormat = await User.countDocuments({
      personalInviteCodes: { $exists: true, $ne: [] }
    });
    console.log(`\n   Users with new format: ${usersWithNewFormat}`);

  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('Database connection closed');
    process.exit(0);
  }
}

// Run migration
migrateInviteCodes();

