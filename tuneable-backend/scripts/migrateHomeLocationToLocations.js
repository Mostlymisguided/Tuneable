/**
 * Migration script to migrate homeLocation to locations.primary
 * 
 * This script:
 * 1. Finds all users with homeLocation but no locations.primary
 * 2. Migrates homeLocation data to locations.primary
 * 3. Preserves existing locations.primary if it exists
 * 4. Keeps homeLocation field for backward compatibility (can be removed later)
 * 
 * Usage: node scripts/migrateHomeLocationToLocations.js
 */

const mongoose = require('mongoose');
const User = require('../models/User');
require('dotenv').config();

// Country code mapping for migration
const countryCodeMap = {
  'United States': 'US',
  'United Kingdom': 'GB',
  'Canada': 'CA',
  'Australia': 'AU',
  'Germany': 'DE',
  'France': 'FR',
  'Spain': 'ES',
  'Italy': 'IT',
  'Netherlands': 'NL',
  'Belgium': 'BE',
  'Sweden': 'SE',
  'Norway': 'NO',
  'Denmark': 'DK',
  'Finland': 'FI',
  'Ireland': 'IE',
  // Add more countries as needed
};

async function migrateLocations() {
  try {
    console.log('🔄 Starting location migration...');
    
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      throw new Error('MONGODB_URI environment variable is required');
    }
    
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');

    // Find all users that need migration
    // Users with homeLocation OR users without locations.primary
    const usersToMigrate = await User.find({
      $or: [
        { homeLocation: { $exists: true, $ne: null } },
        { 'locations.primary': { $exists: false } },
        { 'locations.primary': null }
      ]
    });

    console.log(`📊 Found ${usersToMigrate.length} users to check for migration`);

    let migrated = 0;
    let skipped = 0;
    let errors = 0;

    for (const user of usersToMigrate) {
      try {
        // Skip if no homeLocation to migrate
        if (!user.homeLocation || (!user.homeLocation.city && !user.homeLocation.country)) {
          skipped++;
          continue;
        }

        // Initialize locations object if it doesn't exist
        if (!user.locations) {
          user.locations = {};
        }

        // Migrate homeLocation to locations.primary if:
        // 1. User has homeLocation, AND
        // 2. locations.primary doesn't exist OR is empty/incomplete
        const needsMigration = !user.locations.primary || 
          (!user.locations.primary.city && !user.locations.primary.country);

        if (user.homeLocation && needsMigration) {
          user.locations.primary = {
            city: user.homeLocation.city || user.locations.primary?.city || null,
            region: user.locations.primary?.region || null, // homeLocation didn't have region
            country: user.homeLocation.country || user.locations.primary?.country || null,
            countryCode: user.locations.primary?.countryCode || 
              (user.homeLocation.country && countryCodeMap[user.homeLocation.country]) ||
              null,
            coordinates: user.homeLocation.coordinates || user.locations.primary?.coordinates || null,
            type: user.locations.primary?.type || 'home',
            detectedFromIP: user.locations.primary?.detectedFromIP || false
          };
          
          await user.save();
          migrated++;
          console.log(`  ✅ Migrated user ${user.username || user.email} (${user._id}): homeLocation -> locations.primary`);
        } else if (user.homeLocation && !needsMigration) {
          skipped++;
          console.log(`  ⏭️  Skipped user ${user.username || user.email} (${user._id}): already has locations.primary`);
        } else {
          skipped++;
        }
      } catch (error) {
        errors++;
        console.error(`  ❌ Error migrating user ${user.username || user._id}:`, error.message);
      }
    }

    console.log('\n📈 Migration Summary:');
    console.log(`  ✅ Migrated: ${migrated} users`);
    console.log(`  ⏭️  Skipped: ${skipped} users (already migrated or no data to migrate)`);
    console.log(`  ❌ Errors: ${errors} users`);
    console.log('\n✅ Migration complete!');
    
    // Optionally, you can remove homeLocation field after confirming migration:
    // await User.updateMany({}, { $unset: { homeLocation: "" } });
    // console.log('🗑️  Removed homeLocation field from all users');
    
    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration error:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

// Run migration
if (require.main === module) {
  migrateLocations();
}

module.exports = { migrateLocations };

