/**
 * Migration Script: Convert Genre Party Bids to Global Bids
 * 
 * This script:
 * 1. Finds genre-based parties (hosted by Tuneable/Misguided, ending in "Tunes")
 * 2. Converts all party bids to global bids
 * 3. Updates Media documents to reference global bids
 * 4. Cleans up user references
 * 5. Deletes the parties
 * 
 * Usage:
 *   node scripts/migrateGenrePartiesToGlobal.js [--dry-run]
 * 
 * Safety:
 *   - Only migrates active bids
 *   - Preserves all media (separate collection)
 *   - Provides verification at the end
 *   - Use --dry-run flag to simulate without making changes
 */

const mongoose = require('mongoose');
const Bid = require('../models/Bid');
const Media = require('../models/Media');
const Party = require('../models/Party');
const User = require('../models/User');

// Check for dry-run flag
const DRY_RUN = process.argv.includes('--dry-run') || process.argv.includes('-d');

// Party names to delete (from your list)
const GENRE_PARTY_NAMES = [
  'Reggae Tunes',
  'Rap Tunes',
  'Folk Tunes',
  'World Tunes',
  'Hip Hop Tunes',
  'Dancehall Tunes',
  'House Tunes',
  'Soul Tunes',
  'Punk Tunes',
  'Electronic Tunes',
  'Jungle Tunes',
  'Indie Tunes',
  'Pop Tunes',
  'R&B Tunes',
  'Funk Tunes',
  'D&B Tunes',
  'Minimal Tunes'
];

async function migrateGenrePartiesToGlobal() {
  try {
    if (DRY_RUN) {
      console.log('🔍 DRY RUN MODE - No changes will be made\n');
      console.log('='.repeat(60));
    }
    console.log('🔄 Starting Genre Party to Global Bid migration...\n');
    
    // Step 1: Get Global Party
    let globalParty = await Party.getGlobalParty();
    
    // Fallback: Try to find by name if not found by type
    if (!globalParty) {
      console.log('⚠️  Global Party not found by type. Searching by name...');
      globalParty = await Party.findOne({ 
        $or: [
          { name: /global/i },
          { name: 'Earth' } // Common name for Global Party
        ]
      });
    }
    
    if (!globalParty) {
      console.log('❌ Global Party not found. Cannot proceed.');
      console.log('   Please ensure a Global Party exists with type: "global" or name containing "global"');
      return;
    }
    
    // Ensure Global Party has correct type
    if (globalParty.type !== 'global') {
      if (DRY_RUN) {
        console.log(`⚠️  [DRY RUN] Global Party "${globalParty.name}" has type "${globalParty.type}"`);
        console.log(`   Would update to type: "global"`);
      } else {
        console.log(`⚠️  Global Party "${globalParty.name}" has type "${globalParty.type}", updating to "global"...`);
        globalParty.type = 'global';
        await globalParty.save();
      }
    }
    
    console.log(`✅ Found Global Party: "${globalParty.name}" (${globalParty._id}, type: ${globalParty.type})\n`);
    
    // Step 2: Find genre parties to delete
    // Option A: By name
    const partiesByName = await Party.find({ 
      name: { $in: GENRE_PARTY_NAMES }
    });
    
    // Option B: By host (Tuneable or Misguided) and name pattern
    const tuneableUser = await User.findOne({ username: 'Tuneable' });
    const misguidedUser = await User.findOne({ username: 'Misguided' });
    
    const hostIds = [];
    if (tuneableUser) {
      hostIds.push(tuneableUser._id);
      console.log(`✅ Found Tuneable user: ${tuneableUser._id}`);
    }
    if (misguidedUser) {
      hostIds.push(misguidedUser._id);
      console.log(`✅ Found Misguided user: ${misguidedUser._id}`);
    }
    console.log('');
    
    const partiesByHost = await Party.find({
      host: { $in: hostIds },
      type: { $in: ['remote', 'live'] }, // Exclude global and tag parties
      name: { $regex: /Tunes$/i } // Names ending in "Tunes"
    });
    
    // Combine and deduplicate
    const allParties = [...new Map(
      [...partiesByName, ...partiesByHost].map(p => [p._id.toString(), p])
    ).values()];
    
    console.log(`📊 Found ${allParties.length} genre parties to migrate:\n`);
    allParties.forEach(p => {
      const mediaCount = p.media?.length || 0;
      const hostName = p.host?.username || p.host?.toString() || 'Unknown';
      console.log(`   - ${p.name} (${p._id})`);
      console.log(`     Media: ${mediaCount}, Host: ${hostName}, Type: ${p.type}`);
    });
    console.log('');
    
    if (allParties.length === 0) {
      console.log('✅ No genre parties found to migrate');
      return;
    }
    
    // Step 3: Collect all bids from these parties
    const partyIds = allParties.map(p => p._id);
    const allBids = await Bid.find({ 
      partyId: { $in: partyIds },
      status: 'active' // Only migrate active bids
    });
    
    console.log(`📊 Found ${allBids.length} active bids to migrate\n`);
    
    // Initialize mediaBidMap outside the if block so it's available for summary
    const mediaBidMap = new Map(); // Track which bids belong to which media
    let migratedCount = 0;
    
    if (allBids.length === 0) {
      console.log('⚠️  No active bids found. Proceeding to delete parties...\n');
    } else {
      // Step 4: Migrate bids to Global Party
      console.log('🔄 Migrating bids to Global Party...');
      
      for (const bid of allBids) {
        if (DRY_RUN) {
          // In dry-run, just track what would be changed
          console.log(`   [DRY RUN] Would migrate bid ${bid._id}:`);
          console.log(`     - Current party: ${bid.partyId} (${bid.partyName})`);
          console.log(`     - Would change to: ${globalParty._id} (${globalParty.name})`);
          console.log(`     - Would set bidScope: 'global', partyType: 'global'`);
        } else {
          // Update bid to point to Global Party
          bid.partyId = globalParty._id;
          bid.party_uuid = globalParty.uuid;
          bid.partyName = globalParty.name;
          bid.partyType = 'global';
          bid.bidScope = 'global';
          
          await bid.save();
        }
        migratedCount++;
        
        // Track media-bid relationship
        const mediaId = bid.mediaId.toString();
        if (!mediaBidMap.has(mediaId)) {
          mediaBidMap.set(mediaId, []);
        }
        mediaBidMap.get(mediaId).push(bid._id);
      }
      
      console.log(`✅ Migrated ${migratedCount} bids to Global Party\n`);
      
      // Step 5: Update Media documents
      console.log('🔄 Updating Media documents...');
      
      let mediaUpdatedCount = 0;
      for (const [mediaId, bidIds] of mediaBidMap.entries()) {
        const media = await Media.findById(mediaId);
        if (!media) {
          console.log(`⚠️  Media ${mediaId} not found, skipping...`);
          continue;
        }
        
        if (DRY_RUN) {
          const currentBidsCount = media.bids?.length || 0;
          const currentGlobalBidsCount = media.globalBids?.length || 0;
          const wouldRemove = bidIds.filter(bidId => 
            media.bids?.some(existing => existing.toString() === bidId.toString())
          ).length;
          const wouldAdd = bidIds.length;
          
          console.log(`   [DRY RUN] Would update media "${media.title}" (${mediaId}):`);
          console.log(`     - Current party bids: ${currentBidsCount}`);
          console.log(`     - Current global bids: ${currentGlobalBidsCount}`);
          console.log(`     - Would remove ${wouldRemove} from party bids`);
          console.log(`     - Would add ${wouldAdd} to global bids`);
          mediaUpdatedCount++;
        } else {
          // Remove bids from party bids array (if they exist)
          if (media.bids && media.bids.length > 0) {
            const beforeCount = media.bids.length;
            media.bids = media.bids.filter(
              bidId => !bidIds.some(migratedBidId => bidId.toString() === migratedBidId.toString())
            );
            if (media.bids.length !== beforeCount) {
              console.log(`   Media ${media.title}: Removed ${beforeCount - media.bids.length} bids from party bids array`);
            }
          }
          
          // Add to globalBids array (using $addToSet to avoid duplicates)
          if (!media.globalBids) {
            media.globalBids = [];
          }
          
          // Add new global bids
          let addedCount = 0;
          for (const bidId of bidIds) {
            if (!media.globalBids.some(existing => existing.toString() === bidId.toString())) {
              media.globalBids.push(bidId);
              addedCount++;
            }
          }
          
          if (addedCount > 0) {
            await media.save();
            mediaUpdatedCount++;
          }
        }
      }
      
      console.log(`✅ Updated ${mediaUpdatedCount} Media documents\n`);
    }
    
    // Step 6: Delete the parties
    if (DRY_RUN) {
      console.log('🔄 [DRY RUN] Would delete the following parties:');
      allParties.forEach(p => {
        console.log(`   - ${p.name} (${p._id})`);
      });
      console.log(`   Total: ${allParties.length} parties would be deleted\n`);
    } else {
      console.log('🔄 Deleting genre parties...');
      
      const deleteResult = await Party.deleteMany({
        _id: { $in: partyIds }
      });
      
      console.log(`✅ Deleted ${deleteResult.deletedCount} parties\n`);
    }
    
    // Step 7: Clean up User.joinedParties references
    if (DRY_RUN) {
      console.log('🔄 [DRY RUN] Would clean up User.joinedParties references...');
      const users = await User.find({
        'joinedParties.partyId': { $in: partyIds }
      });
      
      if (users.length > 0) {
        console.log(`   Found ${users.length} users with references to these parties:`);
        users.forEach(user => {
          const affectedParties = user.joinedParties.filter(
            jp => partyIds.some(pid => jp.partyId.toString() === pid.toString())
          );
          if (affectedParties.length > 0) {
            console.log(`   - ${user.username}: Would remove ${affectedParties.length} party reference(s)`);
          }
        });
      } else {
        console.log(`   No users found with references to these parties`);
      }
      console.log('');
    } else {
      console.log('🔄 Cleaning up User.joinedParties references...');
      
      let usersUpdated = 0;
      const users = await User.find({
        'joinedParties.partyId': { $in: partyIds }
      });
      
      for (const user of users) {
        const beforeCount = user.joinedParties.length;
        user.joinedParties = user.joinedParties.filter(
          jp => !partyIds.some(pid => jp.partyId.toString() === pid.toString())
        );
        
        if (user.joinedParties.length !== beforeCount) {
          await user.save();
          usersUpdated++;
        }
      }
      
      console.log(`✅ Updated ${usersUpdated} users' joinedParties\n`);
    }
    
    // Step 8: Verification
    console.log('🔍 Verifying migration...\n');
    
    const remainingBids = await Bid.countDocuments({
      partyId: { $in: partyIds }
    });
    
    const remainingParties = await Party.countDocuments({
      _id: { $in: partyIds }
    });
    
    const globalBidsCount = await Bid.countDocuments({
      partyId: globalParty._id,
      bidScope: 'global'
    });
    
    // Count media with global bids
    const mediaWithGlobalBids = await Media.countDocuments({
      globalBids: { $exists: true, $ne: [] }
    });
    
    console.log('📊 Verification Results:');
    console.log(`   - Remaining bids in deleted parties: ${remainingBids}`);
    console.log(`   - Remaining parties: ${remainingParties}`);
    console.log(`   - Total global bids: ${globalBidsCount}`);
    console.log(`   - Media with global bids: ${mediaWithGlobalBids}`);
    
    // Note: BidMetricsEngine will automatically recalculate metrics via post-save hooks
    // that fire when we save each bid during migration
    
    if (DRY_RUN) {
      console.log('='.repeat(60));
      console.log('\n🔍 DRY RUN SUMMARY:');
      console.log(`   - Would migrate ${allBids.length} bids`);
      console.log(`   - Would update ${mediaBidMap.size} media documents`);
      console.log(`   - Would delete ${allParties.length} parties`);
      console.log('\n✅ Dry run completed. No changes were made.');
      console.log('   Run without --dry-run flag to execute the migration.\n');
    } else {
      if (remainingBids === 0 && remainingParties === 0) {
        console.log('\n🎉 Migration completed successfully!');
        console.log('\n📝 Note: Bid metrics have been automatically updated via BidMetricsEngine post-save hooks.');
      } else {
        console.log('\n⚠️  Some data may not have been fully migrated. Please review.');
      }
    }
    
  } catch (error) {
    console.error('❌ Error during migration:', error);
    throw error;
  }
}

// Run migration if called directly
if (require.main === module) {
  mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/Tuneable')
    .then(async () => {
      console.log('✅ Connected to MongoDB\n');
      await migrateGenrePartiesToGlobal();
      await mongoose.connection.close();
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Failed to connect to MongoDB:', error);
      process.exit(1);
    });
}

module.exports = { migrateGenrePartiesToGlobal };

