const axios = require('axios');
const Media = require('../models/Media');
const { recordQuotaUsage, QUOTA_COSTS } = require('./quotaTracker');

/**
 * Check if a YouTube video is still available
 * @param {string} videoId - YouTube video ID
 * @returns {Promise<{available: boolean, reason?: string, data?: object}>}
 */
async function checkVideoAvailability(videoId) {
  const apiKey = process.env.YOUTUBE_API_KEY;
  
  if (!apiKey) {
    console.error('YouTube API key not found in environment variables');
    return { available: false, reason: 'api_key_missing' };
  }

  try {
    // Use videos.list with minimal parts (just id and status) to check availability
    // This is the most quota-efficient way to check if a video exists
    const response = await axios.get('https://www.googleapis.com/youtube/v3/videos', {
      params: {
        part: 'id,status',
        id: videoId,
        key: apiKey,
      },
    });

    // Track quota usage (videos.list with id,status = 1 unit per 50 videos, minimum 1)
    const quotaCost = Math.ceil(1 / 50) * QUOTA_COSTS.VIDEOS_LIST_CONTENT_DETAILS; // Same cost as contentDetails
    await recordQuotaUsage(quotaCost, 'checkVideoAvailability', { videoId });

    if (!response.data.items || response.data.items.length === 0) {
      // Video not found - likely deleted
      return { available: false, reason: 'deleted' };
    }

    const video = response.data.items[0];
    const status = video.status;

    // Check privacy status
    if (status.privacyStatus === 'private') {
      return { available: false, reason: 'privated' };
    }

    if (status.privacyStatus === 'unlisted') {
      // Unlisted videos are still available, just not in search results
      return { available: true, data: { privacyStatus: 'unlisted' } };
    }

    // Video is public and available
    return { available: true, data: { privacyStatus: 'public' } };
  } catch (error) {
    if (error.response?.status === 404) {
      return { available: false, reason: 'deleted' };
    }
    
    if (error.response?.status === 403) {
      console.error('YouTube API quota exceeded or access denied');
      return { available: null, reason: 'api_error' }; // null means we couldn't check
    }

    console.error('Error checking video availability:', error.message);
    return { available: null, reason: 'api_error' };
  }
}

/**
 * Refresh YouTube metadata for a single media item
 * Only checks availability, does NOT overwrite manually edited fields
 * @param {Object} media - Media document
 * @returns {Promise<{updated: boolean, status: string}>}
 */
async function refreshMediaYouTubeData(media) {
  const youtubeVideoId = media.externalIds?.get('youtube') || 
                         media.sources?.get('youtube')?.match(/[?&]v=([^&]+)/)?.[1] ||
                         media.sources?.get('youtube')?.split('/').pop();

  if (!youtubeVideoId) {
    return { updated: false, status: 'no_youtube_id' };
  }

  // Check video availability
  const availability = await checkVideoAvailability(youtubeVideoId);

  if (availability.available === null) {
    // API error - don't update, just log
    console.log(`⚠️  Could not check availability for video ${youtubeVideoId} (${media.title}): ${availability.reason}`);
    return { updated: false, status: 'api_error' };
  }

  const updates = {
    'youtubeMetadata.lastRefreshedAt': new Date(),
    'youtubeMetadata.availabilityCheckedAt': new Date(),
    'youtubeMetadata.isAvailable': availability.available,
  };

  if (!availability.available) {
    updates['youtubeMetadata.unavailableReason'] = availability.reason;
    console.log(`❌ Video ${youtubeVideoId} (${media.title}) is ${availability.reason}`);
  } else {
    // Video is available - clear any previous unavailable reason
    updates['youtubeMetadata.unavailableReason'] = null;
  }

  // Update media document
  await Media.findByIdAndUpdate(media._id, { $set: updates });

  return {
    updated: true,
    status: availability.available ? 'available' : availability.reason,
    unavailableReason: availability.reason
  };
}

/**
 * Refresh YouTube data for all media items with YouTube sources
 * Processes in batches to avoid overwhelming the API
 * @param {Object} options - Refresh options
 * @param {number} options.batchSize - Number of videos to process per batch (default: 50)
 * @param {number} options.delayBetweenBatches - Delay in ms between batches (default: 1000)
 * @param {Date} options.onlyRefreshOlderThan - Only refresh items older than this date (default: 30 days ago)
 * @returns {Promise<{processed: number, available: number, unavailable: number, errors: number}>}
 */
async function refreshAllYouTubeData(options = {}) {
  const {
    batchSize = 50,
    delayBetweenBatches = 1000,
    onlyRefreshOlderThan = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // 30 days ago
  } = options;

  console.log('🔄 Starting YouTube data refresh...');
  console.log(`📅 Refreshing items last checked before: ${onlyRefreshOlderThan.toISOString()}`);

  // Find all media with YouTube sources that need refreshing
  const query = {
    $or: [
      { 'externalIds.youtube': { $exists: true, $ne: null } },
      { 'sources.youtube': { $exists: true, $ne: null } }
    ],
    $or: [
      { 'youtubeMetadata.lastRefreshedAt': { $exists: false } },
      { 'youtubeMetadata.lastRefreshedAt': { $lt: onlyRefreshOlderThan } }
    ]
  };

  const mediaItems = await Media.find(query).lean();
  const totalItems = mediaItems.length;

  console.log(`📊 Found ${totalItems} media items to refresh`);

  let processed = 0;
  let available = 0;
  let unavailable = 0;
  let errors = 0;

  // Process in batches
  for (let i = 0; i < mediaItems.length; i += batchSize) {
    const batch = mediaItems.slice(i, i + batchSize);
    console.log(`\n📦 Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(totalItems / batchSize)} (${batch.length} items)`);

    const batchPromises = batch.map(async (media) => {
      try {
        const result = await refreshMediaYouTubeData(media);
        processed++;
        
        if (result.updated) {
          if (result.status === 'available') {
            available++;
          } else {
            unavailable++;
          }
        } else if (result.status === 'api_error') {
          errors++;
        }
        
        return result;
      } catch (error) {
        console.error(`❌ Error refreshing media ${media._id}:`, error.message);
        errors++;
        return { updated: false, status: 'error', error: error.message };
      }
    });

    await Promise.all(batchPromises);

    // Delay between batches to avoid rate limiting
    if (i + batchSize < mediaItems.length) {
      console.log(`⏳ Waiting ${delayBetweenBatches}ms before next batch...`);
      await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
    }
  }

  const summary = {
    processed,
    available,
    unavailable,
    errors,
    total: totalItems
  };

  console.log('\n✅ YouTube refresh complete!');
  console.log('📊 Summary:', summary);

  return summary;
}

module.exports = {
  checkVideoAvailability,
  refreshMediaYouTubeData,
  refreshAllYouTubeData
};

