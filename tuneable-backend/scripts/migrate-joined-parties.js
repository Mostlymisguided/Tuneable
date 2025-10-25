const mongoose = require('mongoose');
const User = require('../models/User');
const Party = require('../models/Party');

async function migrateJoinedParties() {
  try {
    console.log('🚀 Starting migration to populate joinedParties from existing data...');
    
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB');

    // Get all users
    const users = await User.find({});
    console.log(`📊 Found ${users.length} users to process`);

    let totalUpdated = 0;
    let totalPartiesAdded = 0;

    for (const user of users) {
      console.log(`\n👤 Processing user: ${user.username} (${user._id})`);
      
      // Find all parties where this user is in the partiers array
      const joinedParties = await Party.find({ partiers: user._id });
      console.log(`   Found ${joinedParties.length} parties for this user`);

      if (joinedParties.length > 0) {
        // Clear existing joinedParties to avoid duplicates
        user.joinedParties = [];
        
        // Add each party to user's joinedParties array
        for (const party of joinedParties) {
          const isHost = party.host.toString() === user._id.toString();
          
          user.joinedParties.push({
            partyId: party._id,
            role: isHost ? 'host' : 'partier',
            joinedAt: new Date() // We don't have historical join dates
          });
          
          console.log(`   ✅ Added party: ${party.name} (${isHost ? 'host' : 'partier'})`);
          totalPartiesAdded++;
        }
        
        // Save the user with updated joinedParties
        await user.save();
        totalUpdated++;
        console.log(`   💾 Saved user with ${user.joinedParties.length} joined parties`);
      } else {
        console.log(`   ⚠️  No parties found for user ${user.username}`);
      }
    }

    console.log('\n🎉 Migration completed successfully!');
    console.log(`📈 Summary:`);
    console.log(`   - Users processed: ${users.length}`);
    console.log(`   - Users updated: ${totalUpdated}`);
    console.log(`   - Total party relationships added: ${totalPartiesAdded}`);

  } catch (error) {
    console.error('❌ Migration failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

// Run the migration
migrateJoinedParties();
