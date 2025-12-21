/**
 * Migration Script: PodcastEpisode → Media Model
 * 
 * HISTORICAL SCRIPT - PodcastEpisode model has been removed
 * This script was used to migrate PodcastEpisode documents to Media model format.
 * All episodes are now stored in the Media model with contentForm: ['podcastepisode']
 * 
 * Preserves all data and relationships (bids, parties, etc.)
 * 
 * NOTE: The PodcastEpisode model no longer exists. This script is kept for reference only.
 */

require('dotenv').config();
const mongoose = require('mongoose');
const PodcastEpisode = require('../models/PodcastEpisode');
const Media = require('../models/Media');
const Bid = require('../models/Bid');
const Party = require('../models/Party');

const MONGODB_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/tuneable';

async function migratePodcastEpisodes() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    const dryRun = process.argv.includes('--dry-run');
    if (dryRun) {
      console.log('🔍 DRY RUN MODE - No changes will be saved');
    }

    // Get all podcast episodes
    const episodes = await PodcastEpisode.find({}).lean();
    console.log(`📦 Found ${episodes.length} podcast episodes to migrate`);

    let migrated = 0;
    let skipped = 0;
    let errors = 0;

    for (const episode of episodes) {
      try {
        // Check if already migrated (by checking for existing Media with same external ID)
        const existingMedia = await Media.findOne({
          $or: [
            { 'externalIds.rssGuid': episode.guid },
            { 'externalIds.appleId': episode.appleId },
            { 'externalIds.taddyUuid': episode.taddyUuid }
          ].filter(condition => {
            // Only include conditions where the value exists
            const key = Object.keys(condition)[0];
            const value = condition[key];
            return value !== null && value !== undefined;
          })
        });

        if (existingMedia) {
          console.log(`⏭️  Skipping ${episode.title} - already exists as Media ${existingMedia._id}`);
          skipped++;
          continue;
        }

        // Map PodcastEpisode fields to Media model
        const mediaData = {
          title: episode.title,
          description: episode.description || episode.summary || '',
          
          // Classification
          contentType: ['spoken'],
          contentForm: ['episode'],
          mediaType: ['mp3'], // Default, can be updated if we have more info
          
          // Creators - map podcastAuthor to host
          host: episode.podcastAuthor ? [{ 
            name: episode.podcastAuthor, 
            userId: null, 
            verified: false 
          }] : [],
          
          // Episode metadata
          episodeNumber: episode.episodeNumber || null,
          seasonNumber: episode.seasonNumber || null,
          duration: episode.duration || 0,
          explicit: episode.explicit || false,
          
          // Visual
          coverArt: episode.podcastImage || null,
          
          // Categorization
          genres: episode.podcastCategory ? [episode.podcastCategory] : [],
          tags: episode.tags || [],
          category: episode.podcastCategory || null,
          language: episode.language || 'en',
          
          // Sources - map audioUrl to sources map
          sources: new Map(),
          
          // External IDs
          externalIds: new Map(),
          
          // Release info
          releaseDate: episode.publishedAt || new Date(),
          
          // File info
          fileSize: episode.audioSize || null,
          
          // Bidding metrics (migrate globalBidValue to globalMediaAggregate)
          globalMediaAggregate: episode.globalBidValue || 0,
          
          // User who added
          addedBy: episode.addedBy,
          
          // Timestamps
          createdAt: episode.uploadedAt || episode.createdAt || new Date(),
          updatedAt: episode.updatedAt || new Date()
        };

        // Add audio source
        if (episode.audioUrl) {
          mediaData.sources.set('audio_direct', episode.audioUrl);
        }
        if (episode.rssUrl) {
          mediaData.sources.set('rss', episode.rssUrl);
        }

        // Add external IDs
        if (episode.guid) {
          mediaData.externalIds.set('rssGuid', episode.guid);
        }
        if (episode.appleId) {
          mediaData.externalIds.set('appleId', episode.appleId);
        }
        if (episode.googleId) {
          mediaData.externalIds.set('googleId', episode.googleId);
        }
        if (episode.taddyUuid) {
          mediaData.externalIds.set('taddyUuid', episode.taddyUuid);
        }
        if (episode.podcastSeriesUuid) {
          // Store podcast series UUID for reference
          mediaData.externalIds.set('podcastSeriesUuid', episode.podcastSeriesUuid);
        }

        if (dryRun) {
          console.log(`📝 Would create Media: ${mediaData.title}`);
          console.log(`   - From PodcastEpisode: ${episode._id}`);
          console.log(`   - Global bid value: ${episode.globalBidValue} → ${mediaData.globalMediaAggregate}`);
          migrated++;
        } else {
          // Create Media document
          const media = new Media(mediaData);
          await media.save();

          // Update all bids that reference this episode
          const bidsToUpdate = await Bid.find({ 
            episodeId: episode._id 
          });

          if (bidsToUpdate.length > 0) {
            console.log(`   Updating ${bidsToUpdate.length} bids to reference Media ${media._id}`);
            await Bid.updateMany(
              { episodeId: episode._id },
              { 
                $set: { mediaId: media._id },
                $unset: { episodeId: '' }
              }
            );
          }

          // Update party media entries that reference this episode
          const parties = await Party.find({
            'media.mediaId': episode._id
          });

          for (const party of parties) {
            const mediaEntry = party.media.find(entry => 
              entry.mediaId && entry.mediaId.toString() === episode._id.toString()
            );
            if (mediaEntry) {
              mediaEntry.mediaId = media._id;
              await party.save();
              console.log(`   Updated party ${party.name} to reference Media ${media._id}`);
            }
          }

          console.log(`✅ Migrated: ${episode.title} → Media ${media._id}`);
          migrated++;
        }

      } catch (error) {
        console.error(`❌ Error migrating episode ${episode._id}:`, error.message);
        errors++;
      }
    }

    console.log('\n📊 Migration Summary:');
    console.log(`   ✅ Migrated: ${migrated}`);
    console.log(`   ⏭️  Skipped: ${skipped}`);
    console.log(`   ❌ Errors: ${errors}`);

    if (dryRun) {
      console.log('\n💡 Run without --dry-run to perform actual migration');
    }

  } catch (error) {
    console.error('💥 Migration failed:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

// Run migration
migratePodcastEpisodes();

