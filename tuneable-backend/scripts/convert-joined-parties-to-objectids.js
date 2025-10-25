const mongoose = require('mongoose');
const User = require('../models/User');
const Party = require('../models/Party');

async function convertJoinedPartiesToObjectIds() {
  try {
    console.log('🚀 Starting migration to convert joinedParties from UUIDs to ObjectIds...');
    
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB');

    const users = await User.find({ joinedParties: { $exists: true, $ne: [] } });
    console.log(`📊 Found ${users.length} users with joinedParties to process`);

    let usersUpdated = 0;
    let totalPartiesConverted = 0;

    for (const user of users) {
      console.log(`\n👤 Processing user: ${user.username} (${user._id})`);
      let userUpdated = false;

      for (let i = 0; i < user.joinedParties.length; i++) {
        const joinedParty = user.joinedParties[i];
        const partyId = joinedParty.partyId;
        
        // Check if this is a UUID (contains hyphens) that needs conversion
        if (partyId && typeof partyId === 'string' && partyId.includes('-')) {
          console.log(`   🔄 Converting UUID to ObjectId: ${partyId}`);
          
          // Find the party by UUID to get its ObjectId
          const party = await Party.findOne({ uuid: partyId }).select('_id name');
          if (party) {
            console.log(`   ✅ Found party: ${party.name} (${party._id})`);
            user.joinedParties[i].partyId = party._id;
            userUpdated = true;
            totalPartiesConverted++;
          } else {
            console.log(`   ⚠️  Party not found for UUID: ${partyId}`);
          }
        } else {
          console.log(`   ℹ️  Party ID already in ObjectId format: ${partyId}`);
        }
      }

      if (userUpdated) {
        await user.save();
        usersUpdated++;
        console.log(`   💾 Saved user with updated joinedParties`);
      } else {
        console.log('   ℹ️  No conversions needed for this user');
      }
    }

    console.log('\n🎉 Migration completed successfully!');
    console.log(`📈 Summary:`);
    console.log(`   - Users processed: ${users.length}`);
    console.log(`   - Users updated: ${usersUpdated}`);
    console.log(`   - Total party relationships converted: ${totalPartiesConverted}`);
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

// Load environment variables
require('dotenv').config();

// Run the migration
convertJoinedPartiesToObjectIds();
