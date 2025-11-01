require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

async function migrateSocialMedia() {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/tuneable';
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');

    // Find all users with creatorProfile.socialMedia (using $ne: null to find non-null values)
    // Use lean() to get plain JavaScript objects instead of Mongoose documents
    const users = await User.find({
      'creatorProfile.socialMedia': { $exists: true, $ne: null }
    }).lean();

    console.log(`📊 Found ${users.length} users with creatorProfile.socialMedia`);

    let migrated = 0;
    let skipped = 0;

    for (const user of users) {
      try {
        const oldSocialMedia = user.creatorProfile?.socialMedia;
        
        // Since we used lean(), it's already a plain object
        const socialMediaObj = oldSocialMedia || {};
        console.log(`   Checking user ${user.username || user._id}:`, JSON.stringify(socialMediaObj, null, 2));
        
        // Check if there's any actual social media data (handle both string and truthy values)
        const socialMediaValues = Object.values(socialMediaObj);
        const hasSocialMediaData = socialMediaValues.length > 0 && socialMediaValues.some(v => {
          if (typeof v === 'string') {
            return v.trim() !== '';
          }
          return !!v;
        });
        
        if (!hasSocialMediaData) {
          console.log(`   ⚠️  No valid social media data for user ${user.username || user._id}, removing empty object`);
          // Use MongoDB $unset to completely remove the field
          await User.updateOne(
            { _id: user._id },
            { $unset: { 'creatorProfile.socialMedia': '' } }
          );
          console.log(`   ✅ Removed empty socialMedia from creatorProfile for user ${user.username || user._id}`);
          skipped++;
          continue;
        }

        // Check if top-level socialMedia already has data - merge if needed
        const existingSocialMedia = user.socialMedia || {};
        const existingValues = Object.values(existingSocialMedia);
        const hasExistingData = existingValues.length > 0 && existingValues.some(v => {
          if (typeof v === 'string') {
            return v.trim() !== '';
          }
          return !!v;
        });
        
        // Use the converted plain object
        const oldSocialMediaObj = socialMediaObj;
        
        if (hasExistingData) {
          // Merge: top-level takes priority, but fill gaps from creatorProfile
          user.socialMedia = {
            ...existingSocialMedia,
            facebook: (existingSocialMedia.facebook && existingSocialMedia.facebook.trim()) || oldSocialMediaObj.facebook || null,
            instagram: (existingSocialMedia.instagram && existingSocialMedia.instagram.trim()) || oldSocialMediaObj.instagram || null,
            soundcloud: (existingSocialMedia.soundcloud && existingSocialMedia.soundcloud.trim()) || oldSocialMediaObj.soundcloud || null,
            youtube: (existingSocialMedia.youtube && existingSocialMedia.youtube.trim()) || oldSocialMediaObj.youtube || null,
            spotify: (existingSocialMedia.spotify && existingSocialMedia.spotify.trim()) || oldSocialMediaObj.spotify || null,
            twitter: (existingSocialMedia.twitter && existingSocialMedia.twitter.trim()) || oldSocialMediaObj.twitter || null,
          };
        } else {
          // No existing top-level data - copy from creatorProfile
          user.socialMedia = {
            facebook: oldSocialMediaObj.facebook || null,
            instagram: oldSocialMediaObj.instagram || null,
            soundcloud: oldSocialMediaObj.soundcloud || null,
            youtube: oldSocialMediaObj.youtube || null,
            spotify: oldSocialMediaObj.spotify || null,
            twitter: oldSocialMediaObj.twitter || null,
          };
        }

        // Use MongoDB updateOne to ensure clean update
        const updateData = {
          $set: {
            socialMedia: user.socialMedia
          },
          $unset: {
            'creatorProfile.socialMedia': ''
          }
        };
        
        await User.updateOne({ _id: user._id }, updateData);
        migrated++;
        
        console.log(`   ✅ Migrated user ${user.username || user._id} - moved ${Object.keys(socialMediaObj).filter(k => socialMediaObj[k]).length} social media links`);
        if (migrated % 10 === 0) {
          console.log(`   Progress: ${migrated}/${users.length} users migrated...`);
        }
      } catch (error) {
        console.error(`❌ Error migrating user ${user._id}:`, error.message);
      }
    }

    console.log(`\n✅ Migration complete!`);
    console.log(`   Migrated: ${migrated} users`);
    console.log(`   Skipped: ${skipped} users`);
    
    // Verify migration - check for actual data (not just existence)
    // We'll check by querying users and filtering for ones with actual values
    const allUsersWithOldSocialMedia = await User.find({
      'creatorProfile.socialMedia': { $exists: true }
    }).select('creatorProfile.socialMedia');
    
    const allUsersWithNewSocialMedia = await User.find({
      'socialMedia': { $exists: true }
    }).select('socialMedia');
    
    // Filter for users with actual non-empty values
    const usersWithOldSocialMediaData = allUsersWithOldSocialMedia.filter(user => {
      const sm = user.creatorProfile?.socialMedia;
      if (!sm || typeof sm !== 'object') return false;
      return Object.values(sm).some(v => {
        if (typeof v === 'string') return v.trim() !== '';
        return !!v;
      });
    }).length;
    
    const usersWithNewSocialMediaData = allUsersWithNewSocialMedia.filter(user => {
      const sm = user.socialMedia;
      if (!sm || typeof sm !== 'object') return false;
      return Object.values(sm).some(v => {
        if (typeof v === 'string') return v.trim() !== '';
        return !!v;
      });
    }).length;
    
    console.log(`\n📊 Verification:`);
    console.log(`   Users with data in creatorProfile.socialMedia: ${usersWithOldSocialMediaData}`);
    console.log(`   Users with data in top-level socialMedia: ${usersWithNewSocialMediaData}`);
    console.log(`   Users with empty creatorProfile.socialMedia field: ${allUsersWithOldSocialMedia.length - usersWithOldSocialMediaData}`);

  } catch (error) {
    console.error('❌ Migration error:', error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('✅ Database connection closed');
    process.exit(0);
  }
}

// Run migration
migrateSocialMedia();

