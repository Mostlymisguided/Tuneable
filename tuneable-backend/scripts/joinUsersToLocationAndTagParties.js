/**
 * Script to join existing users to their relevant location and tag parties
 * 
 * This script backfills users who haven't been auto-joined yet:
 * - Joins users to location parties based on their homeLocation (city, region, country)
 * - Joins users to tag parties based on tags of media they've bid on
 * 
 * Usage:
 *   MONGODB_URI="mongodb+srv://..." node scripts/joinUsersToLocationAndTagParties.js
 * 
 * Or set in .env file and run: node scripts/joinUsersToLocationAndTagParties.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const Bid = require('../models/Bid');
const Media = require('../models/Media');
const { autoJoinLocationParties, autoJoinTagParties } = require('../services/partyAutoJoinService');
const { getCanonicalTag } = require('../utils/tagNormalizer');

async function main() {
  console.log('🚀 Starting user party auto-join backfill\n');
  
  const MONGODB_URI = process.env.MONGODB_URI;
  
  if (!MONGODB_URI) {
    console.error('❌ MONGODB_URI environment variable is required');
    console.error('   Set it in .env file or pass as environment variable');
    process.exit(1);
  }
  
  try {
    // Connect to MongoDB
    console.log('📡 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');
    
    // Get all users
    const users = await User.find({ isActive: true }).select('username homeLocation joinedParties');
    console.log(`📋 Found ${users.length} active users to process\n`);
    
    let locationJoinsCount = 0;
    let tagJoinsCount = 0;
    let locationPartiesCreated = 0;
    let tagPartiesCreated = 0;
    let usersProcessed = 0;
    let usersSkipped = 0;
    
    // Process each user
    for (const user of users) {
      try {
        let userUpdated = false;
        
        // 1. Auto-join location parties if user has homeLocation
        if (user.homeLocation && user.homeLocation.countryCode) {
          console.log(`📍 Processing location parties for ${user.username}...`);
          
          const joinedLocationParties = await autoJoinLocationParties(user);
          
          if (joinedLocationParties.length > 0) {
            locationJoinsCount += joinedLocationParties.length;
            userUpdated = true;
            
            // Count how many were newly created
            const newlyCreated = joinedLocationParties.filter(p => {
              // Check if party was just created (very recent)
              const createdAt = new Date(p.createdAt || p.startTime);
              const now = new Date();
              const diffMinutes = (now - createdAt) / (1000 * 60);
              return diffMinutes < 5; // Created within last 5 minutes
            });
            locationPartiesCreated += newlyCreated.length;
            
            console.log(`   ✅ Joined ${joinedLocationParties.length} location party/parties`);
          } else {
            console.log(`   ℹ️  Already joined to all relevant location parties`);
          }
        } else {
          console.log(`   ⚠️  User ${user.username} has no homeLocation, skipping location parties`);
        }
        
        // 2. Auto-join tag parties based on media they've bid on
        console.log(`🏷️  Processing tag parties for ${user.username}...`);
        
        // Find all unique tags from media this user has bid on
        const userBids = await Bid.find({
          userId: user._id,
          status: 'active'
        }).select('mediaId').lean();
        
        if (userBids.length > 0) {
          const mediaIds = userBids.map(bid => bid.mediaId).filter(Boolean);
          
          // Get all media with their tags
          const mediaWithTags = await Media.find({
            _id: { $in: mediaIds },
            tags: { $exists: true, $ne: [] }
          }).select('tags').lean();
          
          // Collect all unique tags (using canonical form to deduplicate variations)
          const allTags = new Set();
          const canonicalToOriginal = new Map(); // Map canonical -> first original tag seen
          
          mediaWithTags.forEach(media => {
            if (media.tags && Array.isArray(media.tags)) {
              media.tags.forEach(tag => {
                if (tag && typeof tag === 'string' && tag.trim()) {
                  const canonical = getCanonicalTag(tag);
                  if (!canonicalToOriginal.has(canonical)) {
                    canonicalToOriginal.set(canonical, tag.trim());
                    allTags.add(tag.trim());
                  }
                }
              });
            }
          });
          
          if (allTags.size > 0) {
            console.log(`   Found ${allTags.size} unique tag(s) from ${mediaWithTags.length} media item(s) (after canonical deduplication)`);
            
            // Process each unique tag
            const processedCanonicalTags = new Set();
            let tagPartiesJoinedThisUser = 0;
            
            for (const tag of allTags) {
              const canonicalTag = getCanonicalTag(tag);
              if (processedCanonicalTags.has(canonicalTag)) continue;
              processedCanonicalTags.add(canonicalTag);
              
              // Find a media item with this tag to use for auto-join (using canonical matching)
              const mediaWithTag = mediaWithTags.find(m => 
                m.tags && Array.isArray(m.tags) && 
                m.tags.some(t => getCanonicalTag(t) === canonicalTag)
              );
              
              if (!mediaWithTag) continue;
              
              // Reload user to get latest joinedParties
              const refreshedUser = await User.findById(user._id);
              if (!refreshedUser) continue;
              
              // Get full media document for auto-join
              const fullMedia = await Media.findById(mediaWithTag._id);
              if (!fullMedia) continue;
              
              const joinedTagParties = await autoJoinTagParties(refreshedUser, fullMedia);
              
              if (joinedTagParties.length > 0) {
                tagPartiesJoinedThisUser += joinedTagParties.length;
                tagJoinsCount += joinedTagParties.length;
                userUpdated = true;
                
                // Count how many were newly created
                const newlyCreated = joinedTagParties.filter(p => {
                  const createdAt = new Date(p.createdAt || p.startTime);
                  const now = new Date();
                  const diffMinutes = (now - createdAt) / (1000 * 60);
                  return diffMinutes < 5; // Created within last 5 minutes
                });
                tagPartiesCreated += newlyCreated.length;
              }
            }
            
            if (tagPartiesJoinedThisUser > 0) {
              console.log(`   ✅ Joined ${tagPartiesJoinedThisUser} tag party/parties`);
            } else {
              console.log(`   ℹ️  Already joined to all relevant tag parties`);
            }
          } else {
            console.log(`   ℹ️  No tagged media found for this user`);
          }
        } else {
          console.log(`   ℹ️  User has no active bids, skipping tag parties`);
        }
        
        if (userUpdated) {
          usersProcessed++;
        } else {
          usersSkipped++;
        }
        
        console.log(''); // Empty line for readability
        
      } catch (error) {
        console.error(`   ❌ Error processing user ${user.username}:`, error.message);
        usersSkipped++;
        // Continue with next user
      }
    }
    
    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total users processed: ${users.length}`);
    console.log(`Users updated: ${usersProcessed}`);
    console.log(`Users skipped (no changes needed): ${usersSkipped}`);
    console.log('');
    console.log('Location Parties:');
    console.log(`  - Total joins: ${locationJoinsCount}`);
    console.log(`  - New parties created: ${locationPartiesCreated}`);
    console.log('');
    console.log('Tag Parties:');
    console.log(`  - Total joins: ${tagJoinsCount}`);
    console.log(`  - New parties created: ${tagPartiesCreated}`);
    console.log('='.repeat(60));
    console.log('\n✅ Backfill completed successfully!');
    
  } catch (error) {
    console.error('\n❌ Error during backfill:', error);
    process.exit(1);
  } finally {
    // Close MongoDB connection
    await mongoose.connection.close();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error('💥 Fatal error:', error);
    process.exit(1);
  });
}

module.exports = main;

