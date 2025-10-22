const mongoose = require('mongoose');
const Media = require('../models/Media');
const User = require('../models/User');

/**
 * Migration script to move existing rightsHolder data to new mediaOwners structure
 * 
 * This script:
 * 1. Finds all media with existing rightsHolder
 * 2. Creates mediaOwners array with 100% ownership for the rightsHolder
 * 3. Removes the old rightsHolder field
 * 4. Adds edit history entry for the migration
 */

async function migrateRightsHolderToMediaOwners() {
  try {
    console.log('🚀 Starting rightsHolder to mediaOwners migration...');
    
    // Find all media with existing rightsHolder
    const mediaWithRightsHolder = await Media.find({ 
      rightsHolder: { $exists: true, $ne: null } 
    });
    
    console.log(`📊 Found ${mediaWithRightsHolder.length} media items with rightsHolder`);
    
    let migratedCount = 0;
    let errorCount = 0;
    
    for (const media of mediaWithRightsHolder) {
      try {
        // Get the rightsHolder user
        const rightsHolderUser = await User.findById(media.rightsHolder);
        
        if (!rightsHolderUser) {
          console.log(`⚠️  Rights holder user not found for media ${media.uuid} (${media.title})`);
          continue;
        }
        
        // Create mediaOwners entry
        const mediaOwner = {
          userId: media.rightsHolder,
          percentage: 100, // Full ownership
          role: 'primary',
          verified: true, // Assume existing rightsHolder was verified
          addedBy: media.addedBy, // Use the original addedBy as the person who added this ownership
          addedAt: media.createdAt || new Date()
        };
        
        // Add to mediaOwners array
        media.mediaOwners = [mediaOwner];
        
        // Add edit history entry for the migration
        media.editHistory.push({
          editedBy: media.addedBy, // Use addedBy as the person who made this change
          editedAt: new Date(),
          changes: [{
            field: 'rightsHolder_to_mediaOwners',
            oldValue: `rightsHolder: ${rightsHolderUser.username} (${media.rightsHolder})`,
            newValue: `mediaOwners: [${rightsHolderUser.username} - 100% primary]`
          }]
        });
        
        // Remove the old rightsHolder field
        media.rightsHolder = undefined;
        
        // Save the updated media
        await media.save();
        
        migratedCount++;
        console.log(`✅ Migrated: ${media.title} - Rights holder: ${rightsHolderUser.username}`);
        
      } catch (error) {
        errorCount++;
        console.error(`❌ Error migrating media ${media.uuid}:`, error.message);
      }
    }
    
    console.log('\n📈 Migration Summary:');
    console.log(`✅ Successfully migrated: ${migratedCount} media items`);
    console.log(`❌ Errors: ${errorCount} media items`);
    console.log(`📊 Total processed: ${mediaWithRightsHolder.length} media items`);
    
    // Verify migration by checking for any remaining rightsHolder fields
    const remainingRightsHolder = await Media.find({ 
      rightsHolder: { $exists: true, $ne: null } 
    });
    
    if (remainingRightsHolder.length > 0) {
      console.log(`⚠️  Warning: ${remainingRightsHolder.length} media items still have rightsHolder field`);
    } else {
      console.log('✅ All rightsHolder fields have been migrated successfully');
    }
    
    // Check mediaOwners population
    const mediaWithOwners = await Media.find({ 
      'mediaOwners.0': { $exists: true } 
    });
    console.log(`📊 Media items with mediaOwners: ${mediaWithOwners.length}`);
    
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
    await migrateRightsHolderToMediaOwners();
    console.log('🎉 Migration completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Database connection failed:', error);
    process.exit(1);
  });
}

module.exports = migrateRightsHolderToMediaOwners;
