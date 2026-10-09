#!/usr/bin/env node
/**
 * Migration Script: Convert Collective Types from String to Array
 * 
 * This script converts the `type` field in the Collective model from a single
 * string value to an array, allowing collectives to have multiple types.
 * 
 * Examples:
 *   'venue' → ['venue']
 *   'band' → ['band']
 *   'collective' → ['collective']
 * 
 * Usage:
 *   DRY_RUN=true node scripts/migrateCollectiveTypesToArray.js  # Preview changes
 *   node scripts/migrateCollectiveTypesToArray.js                # Apply changes
 */

require('dotenv').config();
const mongoose = require('mongoose');

const DRY_RUN = process.env.DRY_RUN === 'true';

async function migrateCollectiveTypes() {
  try {
    console.log('🚀 Starting Collective type migration...');
    console.log(`Mode: ${DRY_RUN ? '🔍 DRY RUN (no changes will be made)' : '✍️  LIVE RUN (changes will be applied)'}`);
    console.log('');

    // Connect to MongoDB
    if (!process.env.MONGO_URI) {
      throw new Error('MONGO_URI environment variable is not set');
    }

    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB');
    console.log('');

    const db = mongoose.connection.db;
    const collectivesCollection = db.collection('collectives');

    // Find all collectives where type is a string (not already an array)
    const stringTypeCollectives = await collectivesCollection.find({
      type: { $type: 'string' }
    }).toArray();

    console.log(`📊 Found ${stringTypeCollectives.length} collectives with string type field`);
    console.log('');

    if (stringTypeCollectives.length === 0) {
      console.log('✅ No collectives need migration. All types are already arrays!');
      await mongoose.connection.close();
      return;
    }

    // Group by type for reporting
    const byType = {};
    for (const collective of stringTypeCollectives) {
      const type = collective.type || 'undefined';
      byType[type] = (byType[type] || 0) + 1;
    }

    console.log('📈 Breakdown by type:');
    Object.entries(byType).forEach(([type, count]) => {
      console.log(`   ${type}: ${count}`);
    });
    console.log('');

    if (DRY_RUN) {
      console.log('🔍 DRY RUN - Showing sample conversions:');
      console.log('');
      const samples = stringTypeCollectives.slice(0, 10);
      for (const collective of samples) {
        console.log(`   "${collective.name}"`);
        console.log(`      type: "${collective.type}" → ["${collective.type}"]`);
        console.log('');
      }

      if (stringTypeCollectives.length > 10) {
        console.log(`   ... and ${stringTypeCollectives.length - 10} more`);
        console.log('');
      }

      console.log('💡 To apply changes, run without DRY_RUN:');
      console.log('   node scripts/migrateCollectiveTypesToArray.js');
    } else {
      console.log('✍️  Applying migration...');
      console.log('');

      // Use MongoDB aggregation pipeline to convert string to array
      const result = await collectivesCollection.updateMany(
        { type: { $type: 'string' } },
        [{ $set: { type: ['$type'] } }]
      );

      console.log(`✅ Migration complete!`);
      console.log(`   Matched: ${result.matchedCount}`);
      console.log(`   Modified: ${result.modifiedCount}`);
      console.log('');

      // Verify the migration
      const remainingStringTypes = await collectivesCollection.countDocuments({
        type: { $type: 'string' }
      });

      if (remainingStringTypes === 0) {
        console.log('✅ Verification passed: All collectives now have array types');
      } else {
        console.log(`⚠️  Warning: ${remainingStringTypes} collectives still have string types`);
      }
    }

    await mongoose.connection.close();
    console.log('');
    console.log('🎉 Done!');
    process.exit(0);

  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

// Run the migration
migrateCollectiveTypes();
