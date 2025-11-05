const mongoose = require('mongoose');
const Media = require('../models/Media');
const User = require('../models/User');

/**
 * Migration script to move verifiedCreators data to mediaOwners structure
 * 
 * This script:
 * 1. Finds all media with existing verifiedCreators
 * 2. Creates mediaOwners entries with 100% ownership for each verified creator
 * 3. Removes the old verifiedCreators field
 * 4. Adds edit history entry for the migration
 */

async function migrateVerifiedCreatorsToMediaOwners() {
  try {
    console.log('🚀 Starting verifiedCreators to mediaOwners migration...');
    
    // Find all media with existing verifiedCreators
    const mediaWithVerifiedCreators = await Media.find({ 
      verifiedCreators: { $exists: true, $ne: [] } 
    });
    
    console.log(`📊 Found ${mediaWithVerifiedCreators.length} media items with verifiedCreators`);
    
    let migratedCount = 0;
    let errorCount = 0;
    
    for (const media of mediaWithVerifiedCreators) {
      try {
        console.log(`\n🔄 Processing: ${media.title} (${media.uuid})`);
        console.log(`   Verified creators: ${media.verifiedCreators.length}`);
        
        // Get user details for logging
        const creatorUsers = await User.find({ 
          _id: { $in: media.verifiedCreators } 
        }).select('username email');
        
        console.log(`   Creator usernames: ${creatorUsers.map(u => u.username).join(', ')}`);
        
        // Add each verified creator as a media owner
        for (let i = 0; i < media.verifiedCreators.length; i++) {
          const creatorId = media.verifiedCreators[i];
          const creatorUser = creatorUsers.find(u => u._id.toString() === creatorId.toString());
          
          // Calculate ownership percentage (split equally among all verified creators)
          const ownershipPercentage = Math.floor(100 / media.verifiedCreators.length);
          const isLastCreator = i === media.verifiedCreators.length - 1;
          const finalPercentage = isLastCreator ? 100 - (ownershipPercentage * (media.verifiedCreators.length - 1)) : ownershipPercentage;
          
          try {
            media.addMediaOwner(creatorId, finalPercentage, 'creator', media.addedBy);
            console.log(`   ✅ Added ${creatorUser?.username || creatorId} as ${finalPercentage}% owner`);
          } catch (error) {
            if (error.message.includes('already a media owner')) {
              console.log(`   ⚠️  ${creatorUser?.username || creatorId} already an owner, skipping`);
            } else {
              throw error;
            }
          }
        }
        
        // Add to edit history
        media.editHistory.push({
          editedBy: media.addedBy,
          editedAt: new Date(),
          changes: [{
            field: 'verifiedCreators_to_mediaOwners',
            oldValue: `verifiedCreators: [${media.verifiedCreators.join(', ')}]`,
            newValue: `mediaOwners: [${creatorUsers.map(u => `${u.username} - ${Math.floor(100/media.verifiedCreators.length)}%`).join(', ')}]`
          }]
        });
        
        // Remove the old verifiedCreators field
        media.verifiedCreators = undefined;
        
        // Save the updated media
        await media.save();
        
        migratedCount++;
        console.log(`   ✅ Successfully migrated: ${media.title}`);
        
      } catch (error) {
        errorCount++;
        console.error(`   ❌ Error migrating media ${media.uuid}:`, error.message);
      }
    }
    
    console.log('\n📈 Migration Summary:');
    console.log(`✅ Successfully migrated: ${migratedCount} media items`);
    console.log(`❌ Errors: ${errorCount} media items`);
    console.log(`📊 Total processed: ${mediaWithVerifiedCreators.length} media items`);
    
    // Verify migration by checking for any remaining verifiedCreators fields
    const remainingVerifiedCreators = await Media.find({ 
      verifiedCreators: { $exists: true, $ne: [] } 
    });
    
    if (remainingVerifiedCreators.length > 0) {
      console.log(`⚠️  Warning: ${remainingVerifiedCreators.length} media items still have verifiedCreators field`);
    } else {
      console.log('✅ All verifiedCreators fields have been migrated successfully');
    }
    
    // Check mediaOwners population
    const mediaWithOwners = await Media.find({ 
      'mediaOwners.0': { $exists: true } 
    });
    console.log(`📊 Media items with mediaOwners: ${mediaWithOwners.length}`);
    
    // Show some examples of migrated data
    console.log('\n🔍 Sample migrated data:');
    const sampleMedia = await Media.find({ 
      'mediaOwners.0': { $exists: true } 
    }).limit(3).populate('mediaOwners.userId', 'username');
    
    for (const media of sampleMedia) {
      console.log(`\n📄 ${media.title}:`);
      media.mediaOwners.forEach(owner => {
        console.log(`   - ${owner.userId?.username || 'Unknown'}: ${owner.percentage}% (${owner.role})`);
      });
    }
    
  } catch (error) {
    console.error('💥 Migration failed:', error);
    throw error;
  }
}

// Run migration if called directly
if (require.main === module) {
  // Connect to MongoDB
  mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/tuneable', {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(async () => {
    console.log('🔗 Connected to MongoDB');
    await migrateVerifiedCreatorsToMediaOwners();
    console.log('🎉 Migration completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Database connection failed:', error);
    process.exit(1);
  });
}

module.exports = migrateVerifiedCreatorsToMediaOwners;
