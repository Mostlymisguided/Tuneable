/**
 * Check user timestamps in the database
 */

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

async function checkTimestamps() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    // Get a few sample users
    const users = await User.find().limit(5).lean();
    
    console.log('Sample users:');
    users.forEach(user => {
      console.log(`\nUser: ${user.username}`);
      console.log(`  _id: ${user._id}`);
      console.log(`  createdAt: ${user.createdAt}`);
      console.log(`  updatedAt: ${user.updatedAt}`);
    });

    // Count users with/without timestamps
    const totalUsers = await User.countDocuments();
    const withCreatedAt = await User.countDocuments({ createdAt: { $exists: true } });
    const withUpdatedAt = await User.countDocuments({ updatedAt: { $exists: true } });
    
    console.log(`\n📊 Statistics:`);
    console.log(`Total users: ${totalUsers}`);
    console.log(`Users with createdAt: ${withCreatedAt}`);
    console.log(`Users with updatedAt: ${withUpdatedAt}`);
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\n👋 Disconnected from MongoDB');
    process.exit(0);
  }
}

checkTimestamps();

