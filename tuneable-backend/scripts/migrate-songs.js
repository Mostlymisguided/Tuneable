const mongoose = require('mongoose');
const axios = require('axios');
require('dotenv').config();

// Import models
const Song = require('../models/Song');
const User = require('../models/User');

// YouTube API configuration
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;

if (!YOUTUBE_API_KEY) {
  console.error('❌ YOUTUBE_API_KEY is required');
  process.exit(1);
}

// Connect to MongoDB
async function connectDB() {
  try {
    const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/tuneable';
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
}

// Get YouTube video details including tags and category
async function getVideoDetails(videoId) {
  try {
    console.log(`🔍 Fetching details for video: ${videoId}`);
    
    const response = await axios.get('https://www.googleapis.com/youtube/v3/videos', {
      params: {
        key: YOUTUBE_API_KEY,
        id: videoId,
        part: 'snippet,contentDetails'
      }
    });

    if (!response.data.items || response.data.items.length === 0) {
      console.log(`⚠️  No data found for video: ${videoId}`);
      return null;
    }

    const video = response.data.items[0];
    const snippet = video.snippet;
    const contentDetails = video.contentDetails;

    // Extract tags
    const tags = snippet.tags || [];

    // Get category name
    let category = 'Unknown';
    if (snippet.categoryId) {
      try {
        const categoryResponse = await axios.get('https://www.googleapis.com/youtube/v3/videoCategories', {
          params: {
            key: YOUTUBE_API_KEY,
            id: snippet.categoryId,
            part: 'snippet'
          }
        });

        if (categoryResponse.data.items && categoryResponse.data.items.length > 0) {
          category = categoryResponse.data.items[0].snippet.title;
        }
      } catch (categoryError) {
        console.log(`⚠️  Could not fetch category for video ${videoId}:`, categoryError.message);
      }
    }

    return {
      tags,
      category,
      title: snippet.title,
      channelTitle: snippet.channelTitle
    };
  } catch (error) {
    console.error(`❌ Error fetching video details for ${videoId}:`, error.message);
    return null;
  }
}

// Extract YouTube video ID from URL
function extractVideoId(url) {
  if (!url) return null;
  
  // Handle various YouTube URL formats
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
    /youtube\.com\/watch\?.*v=([^&\n?#]+)/
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) {
      return match[1];
    }
  }
  
  return null;
}

// Migrate songs
async function migrateSongs() {
  try {
    console.log('🚀 Starting song migration...');

    // Find songs that need migration (missing tags or category)
    const songsToMigrate = await Song.find({
      $or: [
        { tags: { $exists: false } },
        { tags: { $size: 0 } },
        { category: { $exists: false } },
        { category: null },
        { category: '' }
      ]
    });

    console.log(`📊 Found ${songsToMigrate.length} songs to migrate`);

    if (songsToMigrate.length === 0) {
      console.log('✅ No songs need migration');
      return;
    }

    let successCount = 0;
    let errorCount = 0;
    let skippedCount = 0;

    for (let i = 0; i < songsToMigrate.length; i++) {
      const song = songsToMigrate[i];
      console.log(`\n🎵 Processing song ${i + 1}/${songsToMigrate.length}: ${song.title}`);

      // Check if it's a YouTube song
      const youtubeUrl = song.sources?.youtube;
      if (!youtubeUrl) {
        console.log(`⏭️  Skipping non-YouTube song: ${song.title}`);
        skippedCount++;
        continue;
      }

      // Extract video ID
      const videoId = extractVideoId(youtubeUrl);
      if (!videoId) {
        console.log(`⏭️  Could not extract video ID from URL: ${youtubeUrl}`);
        skippedCount++;
        continue;
      }

      // Fetch video details
      const videoDetails = await getVideoDetails(videoId);
      if (!videoDetails) {
        console.log(`❌ Failed to fetch details for video: ${videoId}`);
        errorCount++;
        continue;
      }

      // Update song with new data
      try {
        await Song.findByIdAndUpdate(song._id, {
          tags: videoDetails.tags,
          category: videoDetails.category
        });

        console.log(`✅ Updated song: ${song.title}`);
        console.log(`   Tags: ${videoDetails.tags.length} tags`);
        console.log(`   Category: ${videoDetails.category}`);
        successCount++;

        // Add small delay to avoid hitting API rate limits
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (updateError) {
        console.error(`❌ Error updating song ${song._id}:`, updateError.message);
        errorCount++;
      }
    }

    console.log('\n📈 Migration Summary:');
    console.log(`✅ Successfully migrated: ${successCount} songs`);
    console.log(`❌ Errors: ${errorCount} songs`);
    console.log(`⏭️  Skipped: ${skippedCount} songs`);
    console.log(`📊 Total processed: ${successCount + errorCount + skippedCount} songs`);

  } catch (error) {
    console.error('❌ Migration error:', error);
  }
}

// Main execution
async function main() {
  try {
    await connectDB();
    await migrateSongs();
    console.log('\n🎉 Migration completed!');
  } catch (error) {
    console.error('❌ Fatal error:', error);
  } finally {
    await mongoose.connection.close();
    console.log('👋 Disconnected from MongoDB');
    process.exit(0);
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n⚠️  Received SIGINT, shutting down gracefully...');
  await mongoose.connection.close();
  process.exit(0);
});

// Run the migration
main();
