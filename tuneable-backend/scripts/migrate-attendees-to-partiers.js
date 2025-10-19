/**
 * Migration Script: Rename "attendees" to "partiers"
 * 
 * This script updates the database to rename:
 * - Party.attendees → Party.partiers
 * - Party.attendee_uuids → Party.partier_uuids
 * - User role 'attendee' → 'partier' (if any exist)
 * 
 * Run this BEFORE deploying code changes
 */

const mongoose = require('mongoose');
require('dotenv').config();

async function migrateAttendeesToPartiers() {
  try {
    console.log('🚀 Starting attendees → partiers migration...');
    
    // Connect to MongoDB
    const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/tuneable';
    await mongoose.connect(MONGODB_URI);
    console.log('📦 Connected to MongoDB');
    
    const db = mongoose.connection.db;
    const Party = db.collection('parties');
    const User = db.collection('users');
    
    // 1. Count documents that will be affected
    const partyCount = await Party.countDocuments({
      $or: [
        { attendees: { $exists: true } },
        { attendee_uuids: { $exists: true } }
      ]
    });
    
    const userCount = await User.countDocuments({ role: 'attendee' });
    
    console.log(`\n📊 Migration Preview:`);
    console.log(`   - Parties to update: ${partyCount}`);
    console.log(`   - Users with 'attendee' role: ${userCount}`);
    console.log('');
    
    // 2. Rename fields in Party collection
    console.log('🔄 Updating Party collection...');
    const partyResult = await Party.updateMany(
      {
        $or: [
          { attendees: { $exists: true } },
          { attendee_uuids: { $exists: true } }
        ]
      },
      {
        $rename: {
          'attendees': 'partiers',
          'attendee_uuids': 'partier_uuids'
        }
      }
    );
    
    console.log(`   ✅ Modified ${partyResult.modifiedCount} parties`);
    console.log(`   📝 Matched ${partyResult.matchedCount} parties`);
    
    // 3. Update User role enum (if any users have 'attendee' role)
    if (userCount > 0) {
      console.log('\n🔄 Updating User roles...');
      const userResult = await User.updateMany(
        { role: 'attendee' },
        { $set: { role: 'partier' } }
      );
      
      console.log(`   ✅ Modified ${userResult.modifiedCount} users`);
      console.log(`   📝 Matched ${userResult.matchedCount} users`);
    } else {
      console.log('\n⏭️  No users with "attendee" role found - skipping user updates');
    }
    
    // 4. Verify migration
    console.log('\n🔍 Verifying migration...');
    const remainingAttendees = await Party.countDocuments({
      $or: [
        { attendees: { $exists: true } },
        { attendee_uuids: { $exists: true } }
      ]
    });
    
    const remainingAttendeeUsers = await User.countDocuments({ role: 'attendee' });
    
    if (remainingAttendees === 0 && remainingAttendeeUsers === 0) {
      console.log('   ✅ Migration verified - no "attendees" references remain');
    } else {
      console.warn('   ⚠️  Warning: Some documents may not have been updated');
      console.warn(`      - Parties with attendees: ${remainingAttendees}`);
      console.warn(`      - Users with attendee role: ${remainingAttendeeUsers}`);
    }
    
    // 5. Sample check - show one updated party
    const sampleParty = await Party.findOne({ partiers: { $exists: true } });
    if (sampleParty) {
      console.log('\n📋 Sample Party after migration:');
      console.log(`   - Name: ${sampleParty.name}`);
      console.log(`   - Partiers count: ${sampleParty.partiers?.length || 0}`);
      console.log(`   - Partier UUIDs count: ${sampleParty.partier_uuids?.length || 0}`);
    }
    
    console.log('\n🎉 Migration complete!');
    console.log('✅ You can now deploy the updated code\n');
    
    await mongoose.disconnect();
    process.exit(0);
    
  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    console.error('Stack trace:', error.stack);
    await mongoose.disconnect();
    process.exit(1);
  }
}

// Run migration
migrateAttendeesToPartiers();

