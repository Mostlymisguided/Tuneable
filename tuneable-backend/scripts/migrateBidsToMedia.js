const mongoose = require('mongoose');
require('dotenv').config(); // Load from tuneable-backend/.env

// Import all necessary models to register them
const User = require('../models/User');
const Party = require('../models/Party');
const Bid = require('../models/Bid');
const Song = require('../models/Song');
const PodcastEpisode = require('../models/PodcastEpisode');
const Media = require('../models/Media');

async function migrateBidsToMedia() {
  try {
    console.log('🚀 Starting migration of Bids to use Media references...');
    
    // Connect to database
    const mongoURI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/tuneable';
    await mongoose.connect(mongoURI);
    console.log('✅ Connected to MongoDB');
    
    // Track migration statistics
    let bidsUpdated = 0;
    let bidsSkipped = 0;
    
    // Get all bids
    const bids = await Bid.find({});
    console.log(`\n📊 Found ${bids.length} bids to process`);
    
    for (const bid of bids) {
      try {
        let mediaId = null;
        let mediaUuid = null;
        
        // Try to find corresponding Media item
        if (bid.songId) {
          // Find the Song to get its title and artist
          const song = await Song.findById(bid.songId);
          if (song) {
            // Find corresponding Media item by title and artist name
            const media = await Media.findOne({ 
              title: song.title,
              "artist.name": song.artist,
              contentType: { $in: ['music'] }
            });
            
            if (media) {
              mediaId = media._id;
              mediaUuid = media.uuid;
            }
          }
        } else if (bid.episodeId) {
          // Find the Episode to get its title
          const episode = await PodcastEpisode.findById(bid.episodeId);
          if (episode) {
            // Find corresponding Media item
            const media = await Media.findOne({ 
              title: episode.title,
              contentType: { $in: ['spoken'] }
            });
            
            if (media) {
              mediaId = media._id;
              mediaUuid = media.uuid;
            }
          }
        }
        
        if (mediaId) {
          // Update the bid to use mediaId
          await Bid.updateOne(
            { _id: bid._id },
            { 
              $set: { 
                mediaId: mediaId,
                media_uuid: mediaUuid
              }
            }
          );
          bidsUpdated++;
          
          if (bidsUpdated % 10 === 0) {
            console.log(`✅ Updated ${bidsUpdated} bids...`);
          }
        } else {
          bidsSkipped++;
          console.log(`⚠️  Could not find Media for bid ${bid._id}`);
        }
        
      } catch (error) {
        console.error(`❌ Failed to migrate bid ${bid._id}:`, error.message);
        bidsSkipped++;
      }
    }
    
    // Update Media items to reference their bids
    console.log('\n🔄 Updating Media items with bid references...');
    let mediaUpdated = 0;
    
    const allMedia = await Media.find({});
    for (const media of allMedia) {
      // Find all bids that reference this media
      const mediaBids = await Bid.find({ mediaId: media._id });
      
      if (mediaBids.length > 0) {
        await Media.updateOne(
          { _id: media._id },
          { 
            $set: { 
              bids: mediaBids.map(b => b._id),
              globalBids: mediaBids.map(b => b._id),
              globalBidValue: mediaBids.reduce((sum, b) => sum + b.amount, 0)
            }
          }
        );
        mediaUpdated++;
        
        if (mediaUpdated % 10 === 0) {
          console.log(`✅ Updated ${mediaUpdated} media items...`);
        }
      }
    }
    
    // Migration summary
    console.log('\n🎊 Bid migration completed successfully!');
    console.log('📊 Migration Summary:');
    console.log(`   • Bids updated: ${bidsUpdated}`);
    console.log(`   • Bids skipped: ${bidsSkipped}`);
    console.log(`   • Media items updated: ${mediaUpdated}`);
    
    console.log('\n⚠️  Next steps:');
    console.log('   1. Test the new Media-based bid queries');
    console.log('   2. Verify bid totals are correct');
    console.log('   3. Update frontend to use new data structure');
    
  } catch (error) {
    console.error('💥 Bid migration failed:', error);
    throw error;
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

// Run migration if called directly
if (require.main === module) {
  migrateBidsToMedia()
    .then(() => {
      console.log('✅ Bid migration script completed successfully');
      process.exit(0);
    })
    .catch(err => {
      console.error('❌ Bid migration script failed:', err);
      process.exit(1);
    });
}

module.exports = migrateBidsToMedia;

