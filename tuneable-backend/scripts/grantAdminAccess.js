const mongoose = require('mongoose');
const User = require('../models/User');

async function grantAdminAccess() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/tuneable');
    console.log('Connected to MongoDB');

    // Get the username from command line argument or prompt for it
    const username = process.argv[2];
    if (!username) {
      console.log('Usage: node grantAdminAccess.js <username>');
      console.log('Example: node grantAdminAccess.js yourusername');
      process.exit(1);
    }

    // Find the user
    const user = await User.findOne({ username });
    if (!user) {
      console.log(`❌ User "${username}" not found`);
      process.exit(1);
    }

    console.log(`👤 Found user: ${user.username} (${user.email || 'no email'})`);
    console.log(`📋 Current roles: [${user.role.join(', ')}]`);

    // Add admin role if not already present
    if (!user.role.includes('admin')) {
      user.role.push('admin');
      await user.save();
      console.log(`✅ Added admin role to ${username}`);
      console.log(`📋 New roles: [${user.role.join(', ')}]`);
    } else {
      console.log(`ℹ️  User ${username} already has admin role`);
    }

    console.log('🎉 Admin access granted successfully!');
    console.log('💡 You can now access the admin panel and YouTube import feature');

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.connection.close();
    console.log('🔌 Database connection closed');
  }
}

grantAdminAccess();
