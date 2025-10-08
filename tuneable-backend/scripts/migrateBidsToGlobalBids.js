/**
 * Migration Script: Copy bids to globalBids
 * 
 * This script migrates the legacy 'bids' field to 'globalBids' for all
 * Song, Media, and PodcastEpisode documents.
 * 
 * This is a safety migration to ensure no data is lost when removing
 * the redundant 'bids' field.
 */

const mongoose = require('mongoose');
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const Song = require('../models/Song');
const Media = require('../models/Media');
const PodcastEpisode = require('../models/PodcastEpisode');

async function migrateBidsToGlobalBids() {
  try {
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      throw new Error('MONGODB_URI not found in environment variables');
    }

    console.log('🔗 Connecting to MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');

    // Migrate Song documents
    console.log('\n📀 Migrating Song documents...');
    const songs = await Song.find({ bids: { $exists: true, $ne: [] } });
    console.log(`Found ${songs.length} songs with bids field`);
    
    let songsMigrated = 0;
    for (const song of songs) {
      if (song.bids && song.bids.length > 0) {
        // Merge bids into globalBids (avoiding duplicates)
        const existingGlobalBids = song.globalBids || [];
        const existingGlobalBidIds = new Set(existingGlobalBids.map(id => id.toString()));
        
        for (const bidId of song.bids) {
          if (!existingGlobalBidIds.has(bidId.toString())) {
            existingGlobalBids.push(bidId);
          }
        }
        
        song.globalBids = existingGlobalBids;
        await song.save();
        songsMigrated++;
      }
    }
    console.log(`✅ Migrated ${songsMigrated} songs`);

    // Migrate Media documents
    console.log('\n🎬 Migrating Media documents...');
    const media = await Media.find({ bids: { $exists: true, $ne: [] } });
    console.log(`Found ${media.length} media items with bids field`);
    
    let mediaMigrated = 0;
    for (const mediaItem of media) {
      if (mediaItem.bids && mediaItem.bids.length > 0) {
        // Merge bids into globalBids (avoiding duplicates)
        const existingGlobalBids = mediaItem.globalBids || [];
        const existingGlobalBidIds = new Set(existingGlobalBids.map(id => id.toString()));
        
        for (const bidId of mediaItem.bids) {
          if (!existingGlobalBidIds.has(bidId.toString())) {
            existingGlobalBids.push(bidId);
          }
        }
        
        mediaItem.globalBids = existingGlobalBids;
        await mediaItem.save();
        mediaMigrated++;
      }
    }
    console.log(`✅ Migrated ${mediaMigrated} media items`);

    // Migrate PodcastEpisode documents
    console.log('\n🎙️  Migrating PodcastEpisode documents...');
    const episodes = await PodcastEpisode.find({ bids: { $exists: true, $ne: [] } });
    console.log(`Found ${episodes.length} episodes with bids field`);
    
    let episodesMigrated = 0;
    for (const episode of episodes) {
      if (episode.bids && episode.bids.length > 0) {
        // Merge bids into globalBids (avoiding duplicates)
        const existingGlobalBids = episode.globalBids || [];
        const existingGlobalBidIds = new Set(existingGlobalBids.map(id => id.toString()));
        
        for (const bidId of episode.bids) {
          if (!existingGlobalBidIds.has(bidId.toString())) {
            existingGlobalBids.push(bidId);
          }
        }
        
        episode.globalBids = existingGlobalBids;
        await episode.save();
        episodesMigrated++;
      }
    }
    console.log(`✅ Migrated ${episodesMigrated} episodes`);

    console.log('\n🎉 Migration complete!');
    console.log(`Total migrated: ${songsMigrated + mediaMigrated + episodesMigrated} documents`);
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

// Run the migration
migrateBidsToGlobalBids();

