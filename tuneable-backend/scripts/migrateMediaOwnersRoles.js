/**
 * Migration script to update mediaOwners role enum values
 * 
 * Changes:
 * - 'primary' → 'creator'
 * - 'secondary' → 'creator'
 * - 'label' → 'aux'
 * - 'distributor' → 'aux'
 * 
 * This migration updates the role field to match the new simplified enum:
 * ['creator', 'aux']
 */

const mongoose = require('mongoose');
const Media = require('../models/Media');

async function migrateMediaOwnersRoles() {
  try {
    console.log('🚀 Starting mediaOwners role migration...');
    
    // Connect to MongoDB
    const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/Tuneable';
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');
    
    // Find all media with mediaOwners
    const mediaWithOwners = await Media.find({
      'mediaOwners.0': { $exists: true }
    });
    
    console.log(`📊 Found ${mediaWithOwners.length} media items with owners`);
    
    let updatedCount = 0;
    let totalOwnersUpdated = 0;
    
    // Role mapping
    const roleMapping = {
      'primary': 'creator',
      'secondary': 'creator',
      'label': 'aux',
      'distributor': 'aux'
    };
    
    // Process each media item
    for (const media of mediaWithOwners) {
      let mediaUpdated = false;
      let ownersUpdated = 0;
      
      // Update each owner's role if it needs updating
      if (media.mediaOwners && Array.isArray(media.mediaOwners)) {
        media.mediaOwners.forEach(owner => {
          const oldRole = owner.role;
          if (oldRole && roleMapping[oldRole]) {
            const newRole = roleMapping[oldRole];
            if (oldRole !== newRole) {
              owner.role = newRole;
              ownersUpdated++;
              mediaUpdated = true;
              console.log(`  📝 Media "${media.title}": ${oldRole} → ${newRole}`);
            }
          }
        });
        
        if (mediaUpdated) {
          // Add edit history entry
          if (!media.editHistory) {
            media.editHistory = [];
          }
          
          media.editHistory.push({
            editedBy: media.addedBy || new mongoose.Types.ObjectId('000000000000000000000000'), // System migration
            editedAt: new Date(),
            changes: [{
              field: 'mediaOwners.role',
              oldValue: `Roles updated from old enum to new enum`,
              newValue: `${ownersUpdated} owner(s) role(s) migrated`
            }]
          });
          
          await media.save({ validateBeforeSave: false });
          updatedCount++;
          totalOwnersUpdated += ownersUpdated;
        }
      }
    }
    
    console.log(`\n✅ Migration complete!`);
    console.log(`📊 Summary:`);
    console.log(`   - Media items updated: ${updatedCount}`);
    console.log(`   - Total owners updated: ${totalOwnersUpdated}`);
    console.log(`   - Media items unchanged: ${mediaWithOwners.length - updatedCount}`);
    
    // Verify migration
    console.log(`\n🔍 Verifying migration...`);
    const mediaWithOldRoles = await Media.find({
      'mediaOwners.role': { $in: ['primary', 'secondary', 'label', 'distributor'] }
    });
    
    if (mediaWithOldRoles.length > 0) {
      console.log(`⚠️  Warning: Found ${mediaWithOldRoles.length} media items still with old role values:`);
      mediaWithOldRoles.forEach(media => {
        const oldRoles = media.mediaOwners
          .filter(o => ['primary', 'secondary', 'label', 'distributor'].includes(o.role))
          .map(o => o.role);
        console.log(`   - "${media.title}" (${media._id}): ${oldRoles.join(', ')}`);
      });
    } else {
      console.log(`✅ All roles successfully migrated!`);
    }
    
    // Check for new roles
    const mediaWithNewRoles = await Media.find({
      'mediaOwners.role': { $in: ['creator', 'aux'] }
    });
    console.log(`✅ Found ${mediaWithNewRoles.length} media items with new role values`);
    
  } catch (error) {
    console.error('❌ Migration error:', error);
    throw error;
  } finally {
    await mongoose.disconnect();
    console.log('👋 Disconnected from MongoDB');
  }
}

// Run migration if called directly
if (require.main === module) {
  migrateMediaOwnersRoles()
    .then(() => {
      console.log('✅ Migration script completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Migration script failed:', error);
      process.exit(1);
    });
}

module.exports = migrateMediaOwnersRoles;

