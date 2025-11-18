/**
 * Production Script: Reset All Bids to 1p and Add Global 1p Bids
 * 
 * This script:
 * 1. Updates all existing bid amounts to 1 (1 pence)
 * 2. Finds all media without any bids
 * 3. Adds a global 1p bid from the Tuneable user to each media without bids
 * 
 * WARNING: This script modifies production data. Use with caution!
 * Run on production cluster only.
 */

const mongoose = require('mongoose');
const Bid = require('../models/Bid');
const Media = require('../models/Media');
const User = require('../models/User');
const Party = require('../models/Party');

// Connect to database
async function connectDB() {
  try {
    const mongoURI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/tuneable';
    console.log('Connecting to MongoDB...');
    await mongoose.connect(mongoURI);
    console.log('✅ Connected to MongoDB');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
}

async function resetBidsTo1p() {
  try {
    console.log('\n🔄 Starting bid reset process...\n');

    // Step 1: Update all existing bids to 1 pence
    console.log('📊 Step 1: Updating all existing bids to 1 pence...');
    const updateResult = await Bid.updateMany(
      { status: 'active' }, // Only update active bids
      { $set: { amount: 1 } } // 1 pence
    );
    console.log(`✅ Updated ${updateResult.modifiedCount} bids to 1 pence`);

    // Step 2: Find Tuneable user
    console.log('\n👤 Step 2: Finding Tuneable user...');
    const tuneableUser = await User.findOne({ username: 'Tuneable' });
    if (!tuneableUser) {
      throw new Error('Tuneable user not found. Please create the Tuneable user first.');
    }
    console.log(`✅ Found Tuneable user: ${tuneableUser.username} (${tuneableUser._id})`);

    // Step 3: Get Global Party
    console.log('\n🌍 Step 3: Finding Global Party...');
    const globalParty = await Party.getGlobalParty();
    if (!globalParty) {
      throw new Error('Global Party not found. Please create the Global Party first.');
    }
    console.log(`✅ Found Global Party: ${globalParty.name} (${globalParty._id})`);

    // Step 4: Find all media without bids
    console.log('\n📀 Step 4: Finding media without bids...');
    const allMedia = await Media.find({});
    const mediaWithoutBids = [];
    
    for (const media of allMedia) {
      // Check if media has any active bids
      const hasBids = await Bid.exists({
        mediaId: media._id,
        status: 'active'
      });
      
      if (!hasBids) {
        mediaWithoutBids.push(media);
      }
    }
    
    console.log(`✅ Found ${mediaWithoutBids.length} media items without bids`);

    // Step 5: Create global 1p bids for media without bids
    let createdCount = 0;
    let errorCount = 0;
    
    if (mediaWithoutBids.length > 0) {
      console.log(`\n💰 Step 5: Creating global 1p bids for ${mediaWithoutBids.length} media items...`);
      
      for (const media of mediaWithoutBids) {
        try {
          // Get artist name for denormalized field
          const artistName = media.artist && media.artist.length > 0
            ? (typeof media.artist[0] === 'string' ? media.artist[0] : media.artist[0].name)
            : 'Unknown Artist';
          
          // Create global bid
          const bid = new Bid({
            userId: tuneableUser._id,
            partyId: globalParty._id,
            mediaId: media._id,
            amount: 1, // 1 pence
            status: 'active',
            bidScope: 'global',
            partyType: 'global',
            username: tuneableUser.username,
            partyName: globalParty.name,
            mediaTitle: media.title,
            mediaArtist: artistName,
            mediaCoverArt: media.coverArt || null,
            isInitialBid: false, // These are not initial bids
            platform: 'web' // System-generated
          });
          
          await bid.save();
          createdCount++;
          
          // Log progress every 50 items
          if (createdCount % 50 === 0) {
            console.log(`   Progress: ${createdCount}/${mediaWithoutBids.length} bids created...`);
          }
        } catch (error) {
          console.error(`   ❌ Error creating bid for media ${media._id} (${media.title}):`, error.message);
          errorCount++;
        }
      }
      
      console.log(`\n✅ Created ${createdCount} global 1p bids`);
      if (errorCount > 0) {
        console.log(`⚠️  ${errorCount} errors occurred during bid creation`);
      }
    } else {
      console.log('\n✅ All media already has bids - no new bids needed');
    }

    // Summary
    console.log('\n📊 Summary:');
    console.log(`   - Bids updated to 1p: ${updateResult.modifiedCount}`);
    console.log(`   - Media without bids found: ${mediaWithoutBids.length}`);
    console.log(`   - New global bids created: ${createdCount}`);
    console.log('\n✅ Bid reset process completed successfully!');

  } catch (error) {
    console.error('\n❌ Error during bid reset:', error);
    throw error;
  }
}

// Main execution
async function main() {
  try {
    await connectDB();
    await resetBidsTo1p();
  } catch (error) {
    console.error('❌ Script failed:', error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('\n👋 Database connection closed');
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { resetBidsTo1p };

