const mongoose = require('mongoose');
const User = require('../models/User');
const Party = require('../models/Party');

async function fixJoinedPartiesIds() {
  try {
    console.log('🚀 Starting migration to fix joinedParties partyId format...');
    
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB');

    // Get all users with joinedParties
    const users = await User.find({ joinedParties: { $exists: true, $ne: [] } });
    console.log(`📊 Found ${users.length} users with joinedParties to fix`);

    let totalUpdated = 0;
    let totalPartiesFixed = 0;

    for (const user of users) {
      console.log(`\n👤 Processing user: ${user.username}`);
      console.log(`   Current joinedParties: ${user.joinedParties.length}`);
      
      let updated = false;
      
      for (let i = 0; i < user.joinedParties.length; i++) {
        const joinedParty = user.joinedParties[i];
        const partyId = joinedParty.partyId;
        
        // Check if this is a MongoDB ObjectId (24 character hex string)
        if (partyId && partyId.length === 24 && /^[0-9a-fA-F]{24}$/.test(partyId) && !partyId.includes('-')) {
          // Find the party by MongoDB _id to get its UUID
          const party = await Party.findById(partyId).select('uuid name');
          if (party && party.uuid) {
            console.log(`   ✅ Converting party ${party.name}: ${partyId} -> ${party.uuid}`);
            user.joinedParties[i].partyId = party.uuid;
            updated = true;
            totalPartiesFixed++;
          } else {
            console.log(`   ⚠️  Party not found for ObjectId: ${partyId}`);
          }
        } else {
          console.log(`   ℹ️  Party ID already in correct format: ${partyId}`);
        }
      }
      
      if (updated) {
        await user.save();
        totalUpdated++;
        console.log(`   💾 Saved user with updated joinedParties`);
      }
    }

    console.log('\n🎉 Migration completed successfully!');
    console.log(`📈 Summary:`);
    console.log(`   - Users processed: ${users.length}`);
    console.log(`   - Users updated: ${totalUpdated}`);
    console.log(`   - Party IDs converted: ${totalPartiesFixed}`);

  } catch (error) {
    console.error('❌ Migration failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

// Run the migration
fixJoinedPartiesIds();
