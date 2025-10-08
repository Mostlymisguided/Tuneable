const mongoose = require('mongoose');
require('dotenv').config(); // Load from tuneable-backend/.env

// Import models
const Song = require('../models/Song');
const PodcastEpisode = require('../models/PodcastEpisode');
const Media = require('../models/Media');
const Party = require('../models/Party');

async function migrateToMedia() {
  try {
    console.log('🚀 Starting migration to Media collection...');
    
    // Connect to database
    const mongoURI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/tuneable';
    await mongoose.connect(mongoURI);
    console.log('✅ Connected to MongoDB');
    
    // Track migration statistics
    let songsMigrated = 0;
    let episodesMigrated = 0;
    let partiesUpdated = 0;
    
    // Migrate Songs
    console.log('\n📀 Migrating Songs...');
    const songs = await Song.find({});
    console.log(`Found ${songs.length} songs to migrate`);
    
    for (const song of songs) {
      try {
        // Determine media type based on sources
        let mediaTypes = ['mp3']; // Default
        if (song.sources && song.sources.youtube) {
          mediaTypes = ['mp4']; // YouTube videos
        }
        
        const media = new Media({
          title: song.title,
          
          // Convert artist to subdocument array
          artist: song.artist ? [{ name: song.artist, userId: null, verified: false }] : [],
          
          contentType: ['music'],
          contentForm: ['song'],
          mediaType: mediaTypes,
          duration: song.duration,
          coverArt: song.coverArt,
          description: song.description || '',
          tags: song.tags || [],
          genres: song.genre ? [song.genre] : [], // Convert singular genre to array
          category: song.category || null,
          
          // Release information
          album: song.album || null,
          EP: song.EP || null,
          releaseDate: song.releaseDate || null,
          
          // Label (convert to subdocument if exists)
          label: song.rightsHolder ? [{ name: song.rightsHolder, userId: null, verified: false }] : [],
          
          sources: song.sources || new Map(),
          globalBidValue: song.globalBidValue || 0,
          bids: song.bids || [],
          addedBy: song.addedBy,
          addedBy_uuid: song.addedBy_uuid,
          uploadedAt: song.uploadedAt,
          playCount: song.playCount || 0,
          popularity: song.popularity || 0,
          
          // Music-specific role fields (convert to subdocument arrays)
          producer: (Array.isArray(song.producer) ? song.producer : (song.producer ? [song.producer] : []))
            .map(p => ({ name: p, userId: null, verified: false })),
          featuring: (song.featuring || []).map(f => ({ name: f, userId: null, verified: false })),
          
          rightsHolder: song.rightsHolder,
          explicit: song.explicit || false,
          isrc: song.isrc || null,
          upc: song.upc || null,
          lyrics: song.lyrics || null,
          bpm: song.bpm,
          key: song.key,
          pitch: song.pitch,
          timeSignature: song.timeSignature,
          bitrate: song.bitrate,
          sampleRate: song.sampleRate,
          elements: song.elements || []
          
          // creatorNames and verified flags will be auto-populated by pre-save hook
        });
        
        await media.save();
        songsMigrated++;
        
        // Update parties that reference this song
        await Party.updateMany(
          { 'songs.songId': song._id },
          { 
            $set: { 
              'songs.$[elem].song_uuid': media.uuid 
            } 
          },
          { 
            arrayFilters: [{ 'elem.songId': song._id }] 
          }
        );
        
        console.log(`✅ Migrated song: ${song.title} by ${song.artist}`);
      } catch (error) {
        console.error(`❌ Failed to migrate song ${song.title}:`, error.message);
      }
    }
    
    // Migrate Podcast Episodes
    console.log('\n🎙️ Migrating Podcast Episodes...');
    const episodes = await PodcastEpisode.find({});
    console.log(`Found ${episodes.length} podcast episodes to migrate`);
    
    for (const episode of episodes) {
      try {
        const media = new Media({
          title: episode.title,
          
          // Use podcast title as host for spoken content
          host: episode.podcastTitle ? [{ name: episode.podcastTitle, userId: null, verified: false }] : [],
          
          contentType: ['spoken'],
          contentForm: ['episode'],
          mediaType: ['mp3'], // Default for podcasts
          duration: episode.duration,
          coverArt: episode.podcastImage,
          description: episode.description || episode.summary || '',
          tags: episode.tags || [],
          explicit: episode.explicit || false,
          category: episode.category || null,
          
          // Episode/Season information
          episodeNumber: episode.episodeNumber || null,
          seasonNumber: episode.seasonNumber || null,
          
          // Release information
          releaseDate: episode.releaseDate || episode.publishedAt || null,
          
          sources: new Map([['rss', episode.rssUrl]]),
          globalBidValue: episode.globalBidValue || 0,
          bids: episode.bids || [],
          addedBy: episode.addedBy,
          uploadedAt: episode.uploadedAt,
          playCount: episode.playCount || 0,
          popularity: episode.popularity || 0,
          language: episode.language || 'en'
          
          // creatorNames will be auto-populated by pre-save hook
        });
        
        await media.save();
        episodesMigrated++;
        
        // Update parties that reference this episode
        await Party.updateMany(
          { 'songs.episodeId': episode._id },
          { 
            $set: { 
              'songs.$[elem].episode_uuid': media.uuid 
            } 
          },
          { 
            arrayFilters: [{ 'elem.episodeId': episode._id }] 
          }
        );
        
        console.log(`✅ Migrated episode: ${episode.title} from ${episode.podcastTitle}`);
      } catch (error) {
        console.error(`❌ Failed to migrate episode ${episode.title}:`, error.message);
      }
    }
    
    // Create mapping from old IDs to new Media UUIDs for party updates
    console.log('\n🔄 Creating media mappings...');
    const mediaMapping = new Map();
    
    // Get all media items and create mapping
    const allMedia = await Media.find({});
    for (const mediaItem of allMedia) {
      // Try to find corresponding song/episode to get original ID
      if (mediaItem.contentType.includes('music')) {
        const artistName = mediaItem.artist && mediaItem.artist.length > 0 ? mediaItem.artist[0].name : null;
        if (artistName) {
          const originalSong = await Song.findOne({ title: mediaItem.title, artist: artistName });
          if (originalSong) {
            mediaMapping.set(originalSong._id.toString(), mediaItem._id);
          }
        }
      } else if (mediaItem.contentType.includes('spoken')) {
        const originalEpisode = await PodcastEpisode.findOne({ title: mediaItem.title });
        if (originalEpisode) {
          mediaMapping.set(originalEpisode._id.toString(), mediaItem._id);
        }
      }
    }
    
    // Update parties to use new media collection
    console.log('\n🎉 Updating parties to use new media structure...');
    const parties = await Party.find({});
    
    for (const party of parties) {
      let needsUpdate = false;
      const newMedia = [];
      
      for (const songEntry of party.songs) {
        let mediaId = null;
        
        if (songEntry.songId && mediaMapping.has(songEntry.songId.toString())) {
          mediaId = mediaMapping.get(songEntry.songId.toString());
        } else if (songEntry.episodeId && mediaMapping.has(songEntry.episodeId.toString())) {
          mediaId = mediaMapping.get(songEntry.episodeId.toString());
        }
        
        if (mediaId) {
          newMedia.push({
            mediaId: mediaId,
            media_uuid: songEntry.song_uuid || songEntry.episode_uuid,
            addedBy: songEntry.addedBy,
            addedBy_uuid: songEntry.addedBy_uuid,
            partyBidValue: songEntry.partyBidValue || 0,
            partyBids: songEntry.partyBids || [],
            status: songEntry.status || 'queued',
            queuedAt: songEntry.queuedAt || new Date(),
            playedAt: songEntry.playedAt,
            completedAt: songEntry.completedAt,
            vetoedAt: songEntry.vetoedAt,
            vetoedBy: songEntry.vetoedBy,
            vetoedBy_uuid: songEntry.vetoedBy_uuid
          });
          needsUpdate = true;
        }
      }
      
      if (needsUpdate) {
        // Use updateOne to avoid validation issues with the entire document
        await Party.updateOne(
          { _id: party._id },
          { 
            $set: { 
              media: newMedia,
              // Ensure the party type field is valid
              type: party.type || 'remote'
            }
          }
        );
        partiesUpdated++;
        console.log(`✅ Updated party: ${party.name}`);
      }
    }
    
    // Migration summary
    console.log('\n🎊 Migration completed successfully!');
    console.log('📊 Migration Summary:');
    console.log(`   • Songs migrated: ${songsMigrated}`);
    console.log(`   • Episodes migrated: ${episodesMigrated}`);
    console.log(`   • Parties updated: ${partiesUpdated}`);
    console.log(`   • Total media items created: ${songsMigrated + episodesMigrated}`);
    
    console.log('\n⚠️  Next steps:');
    console.log('   1. Test the new Media collection');
    console.log('   2. Update API routes to use Media model');
    console.log('   3. Update frontend to use new data structure');
    console.log('   4. Remove old Song/PodcastEpisode collections (after testing)');
    
  } catch (error) {
    console.error('💥 Migration failed:', error);
    throw error;
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

// Run migration if called directly
if (require.main === module) {
  migrateToMedia()
    .then(() => {
      console.log('✅ Migration script completed successfully');
      process.exit(0);
    })
    .catch(err => {
      console.error('❌ Migration script failed:', err);
      process.exit(1);
    });
}

module.exports = migrateToMedia;
