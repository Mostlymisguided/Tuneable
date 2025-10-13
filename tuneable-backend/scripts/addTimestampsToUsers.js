/**
 * Migration script to add timestamps to existing users
 * Run this once to add createdAt and updatedAt to users created before timestamps were enabled
 */

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

async function addTimestampsToUsers() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB');

    // Find all users without createdAt
    const usersWithoutTimestamps = await User.find({ createdAt: { $exists: false } });
    
    console.log(`📊 Found ${usersWithoutTimestamps.length} users without timestamps`);

    if (usersWithoutTimestamps.length === 0) {
      console.log('✅ All users already have timestamps!');
      process.exit(0);
    }

    let updated = 0;
    const now = new Date();

    for (const user of usersWithoutTimestamps) {
      // Extract timestamp from MongoDB ObjectId
      const creationDate = user._id.getTimestamp();
      
      // Use direct MongoDB collection update to bypass Mongoose middleware
      await mongoose.connection.collection('users').updateOne(
        { _id: user._id },
        { 
          $set: { 
            createdAt: creationDate,
            updatedAt: now
          } 
        }
      );
      
      updated++;
      console.log(`✅ Updated user: ${user.username} (createdAt: ${creationDate.toLocaleDateString()})`);
    }

    console.log(`\n🎉 Migration complete! Updated ${updated} users.`);
    
  } catch (error) {
    console.error('❌ Migration error:', error);
  } finally {
    await mongoose.connection.close();
    console.log('👋 Disconnected from MongoDB');
    process.exit(0);
  }
}

// Run the migration
addTimestampsToUsers();

