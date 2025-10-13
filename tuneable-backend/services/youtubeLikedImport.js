const axios = require('axios');
const Media = require('../models/Media');

/**
 * YouTube Liked Videos Bulk Import Service
 * Efficiently imports liked videos with minimal API quota usage
 */

// YouTube API quota costs:
// - playlistItems.list: 1 unit per call (50 videos per call)
// - videos.list (basic): 1 unit per call (50 videos per call)
// - videos.list (with snippet): 2 units per call (50 videos per call)
// - videoCategories.list: 1 unit per call (all categories at once)

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const LIKED_PLAYLIST_ID = 'LL'; // YouTube's special "Liked Videos" playlist ID

/**
 * Get user's liked videos playlist (uses minimal quota)
 * @param {string} accessToken - YouTube OAuth access token
 * @param {number} maxResults - Maximum videos to fetch (default 50)
 * @returns {Promise<Array>} Array of video IDs
 */
async function getLikedVideoIds(accessToken, maxResults = 50) {
    try {
        console.log(`🎵 Fetching liked videos (max: ${maxResults})`);
        
        const response = await axios.get('https://www.googleapis.com/youtube/v3/playlistItems', {
            params: {
                part: 'contentDetails',
                playlistId: LIKED_PLAYLIST_ID,
                maxResults: Math.min(maxResults, 50), // YouTube max is 50 per call
                access_token: accessToken
            }
        });

        const videoIds = response.data.items.map(item => item.contentDetails.videoId);
        console.log(`✅ Found ${videoIds.length} liked videos`);
        
        return {
            videoIds,
            nextPageToken: response.data.nextPageToken,
            totalResults: response.data.pageInfo?.totalResults || videoIds.length
        };
    } catch (error) {
        console.error('Error fetching liked videos:', error);
        throw new Error('Failed to fetch liked videos: ' + error.message);
    }
}

/**
 * Get basic video details in batches (quota efficient)
 * @param {Array} videoIds - Array of video IDs
 * @param {string} accessToken - YouTube OAuth access token
 * @returns {Promise<Array>} Array of video details
 */
async function getBatchVideoDetails(videoIds, accessToken) {
    try {
        // Process in batches of 50 (YouTube API limit)
        const batchSize = 50;
        const batches = [];
        
        for (let i = 0; i < videoIds.length; i += batchSize) {
            batches.push(videoIds.slice(i, i + batchSize));
        }

        const allVideos = [];
        
        for (const batch of batches) {
            console.log(`📺 Fetching details for batch of ${batch.length} videos`);
            
            const response = await axios.get('https://www.googleapis.com/youtube/v3/videos', {
                params: {
                    part: 'snippet,contentDetails', // Get both basic info and duration
                    id: batch.join(','),
                    access_token: accessToken
                }
            });

            const videos = response.data.items.map(video => ({
                id: video.id,
                title: video.snippet.title,
                description: video.snippet.description,
                channelTitle: video.snippet.channelTitle,
                publishedAt: video.snippet.publishedAt,
                thumbnail: video.snippet.thumbnails?.high?.url || `https://img.youtube.com/vi/${video.id}/hqdefault.jpg`,
                duration: parseYouTubeDuration(video.contentDetails.duration),
                categoryId: video.snippet.categoryId,
                tags: video.snippet.tags || []
            }));

            allVideos.push(...videos);
        }

        console.log(`✅ Fetched details for ${allVideos.length} videos`);
        return allVideos;
    } catch (error) {
        console.error('Error fetching video details:', error);
        throw new Error('Failed to fetch video details: ' + error.message);
    }
}

/**
 * Parse YouTube duration format (PT4M13S) to seconds
 */
function parseYouTubeDuration(duration) {
    const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return 0;
    
    const hours = parseInt(match[1] || "0", 10);
    const minutes = parseInt(match[2] || "0", 10);
    const seconds = parseInt(match[3] || "0", 10);
    
    return hours * 3600 + minutes * 60 + seconds;
}

/**
 * Get category names mapping (one-time call)
 */
async function getCategoryMapping() {
    try {
        console.log('🏷️  Fetching YouTube category mapping...');
        
        const response = await axios.get('https://www.googleapis.com/youtube/v3/videoCategories', {
            params: {
                part: 'snippet',
                regionCode: 'US',
                key: YOUTUBE_API_KEY
            }
        });

        const categories = {};
        response.data.items.forEach(category => {
            categories[category.id] = category.snippet.title;
        });

        console.log(`✅ Mapped ${Object.keys(categories).length} categories`);
        return categories;
    } catch (error) {
        console.error('Error fetching categories:', error);
        return {};
    }
}

/**
 * Filter videos by category (music only) and duration (under 15 minutes)
 * @param {Array} videos - Array of video objects
 * @param {Object} categoryMapping - Category ID to name mapping
 * @param {number} maxDurationMinutes - Maximum duration in minutes (default 15)
 * @returns {Array} Filtered videos (music category only, under duration limit)
 */
function filterMusicVideos(videos, categoryMapping, maxDurationMinutes = 15) {
    const musicCategoryIds = Object.keys(categoryMapping).filter(id => 
        categoryMapping[id].toLowerCase().includes('music')
    );

    const maxDurationSeconds = maxDurationMinutes * 60;

    const musicVideos = videos.filter(video => {
        // Check if it's music category
        const isMusic = musicCategoryIds.includes(video.categoryId);
        
        // Check if duration is under limit
        const isUnderDuration = video.duration <= maxDurationSeconds;
        
        // Log filtering decisions for debugging
        if (!isMusic) {
            console.log(`⏭️  Skipped (not music): ${video.title} - Category: ${categoryMapping[video.categoryId] || 'Unknown'}`);
        } else if (!isUnderDuration) {
            const durationMinutes = Math.round(video.duration / 60);
            console.log(`⏭️  Skipped (too long): ${video.title} - Duration: ${durationMinutes}m (${Math.round(video.duration / 60)}:${String(Math.round(video.duration % 60)).padStart(2, '0')})`);
        }
        
        return isMusic && isUnderDuration;
    });

    console.log(`🎵 Filtered to ${musicVideos.length} music videos (under ${maxDurationMinutes}m) out of ${videos.length} total`);
    return musicVideos;
}

/**
 * Bulk import liked music videos to Media collection
 * @param {string} accessToken - YouTube OAuth access token (optional if user has Google OAuth)
 * @param {string} userId - User ID who owns the liked videos
 * @param {number} maxVideos - Maximum videos to import (default 100)
 * @param {number} maxDurationMinutes - Maximum duration in minutes (default 15)
 * @returns {Promise<Object>} Import results
 */
async function bulkImportLikedVideos(accessToken, userId, maxVideos = 100, maxDurationMinutes = 15) {
    try {
        console.log(`🚀 Starting bulk import of up to ${maxVideos} liked music videos (under ${maxDurationMinutes} minutes)`);

        // Step 1: Get liked video IDs (1 quota unit)
        const { videoIds, totalResults } = await getLikedVideoIds(accessToken, maxVideos);
        
        if (videoIds.length === 0) {
            return { imported: 0, skipped: 0, errors: 0, message: 'No liked videos found' };
        }

        // Step 2: Get category mapping (1 quota unit)
        const categoryMapping = await getCategoryMapping();

        // Step 3: Get video details in batches (2 units per 50 videos)
        const videos = await getBatchVideoDetails(videoIds, accessToken);

        // Step 4: Filter for music videos only (under duration limit)
        const musicVideos = filterMusicVideos(videos, categoryMapping, maxDurationMinutes);

        // Step 5: Import to database
        const results = {
            imported: 0,
            skipped: 0,
            errors: 0,
            importedVideos: [],
            skippedVideos: [],
            errors: []
        };

        for (const video of musicVideos) {
            try {
                // Check if video already exists
                const existingMedia = await Media.findOne({
                    $or: [
                        { 'sources.youtube': { $regex: video.id, $options: 'i' } },
                        { 'externalIds.youtube': video.id }
                    ]
                });

                if (existingMedia) {
                    results.skipped++;
                    results.skippedVideos.push({
                        title: video.title,
                        reason: 'Already exists in database'
                    });
                    continue;
                }

                // Create new Media entry
                const media = new Media({
                    title: video.title,
                    artist: [{ name: video.channelTitle, userId: null, verified: false }],
                    coverArt: video.thumbnail,
                    duration: video.duration,
                    description: video.description,
                    sources: new Map([['youtube', `https://www.youtube.com/watch?v=${video.id}`]]),
                    externalIds: new Map([['youtube', video.id]]),
                    tags: video.tags,
                    category: categoryMapping[video.categoryId] || 'Music',
                    addedBy: userId,
                    contentType: ['music'],
                    contentForm: ['song'],
                    globalBidValue: 0,
                    bids: []
                });

                await media.save();
                
                results.imported++;
                results.importedVideos.push({
                    id: media._id,
                    title: media.title,
                    artist: video.channelTitle,
                    youtubeId: video.id
                });

                console.log(`✅ Imported: ${video.title} - ${video.channelTitle}`);

            } catch (videoError) {
                console.error(`❌ Error importing video ${video.title}:`, videoError);
                results.errors++;
                results.errors.push({
                    title: video.title,
                    error: videoError.message
                });
            }
        }

        const quotaUsed = 1 + 1 + Math.ceil(videos.length / 50) * 2; // Rough estimate
        console.log(`🎯 Import complete! Quota used: ~${quotaUsed} units`);
        console.log(`📊 Results: ${results.imported} imported, ${results.skipped} skipped, ${results.errors} errors`);

        return results;

    } catch (error) {
        console.error('Error in bulk import:', error);
        throw error;
    }
}

/**
 * Estimate quota usage for import
 * @param {number} videoCount - Number of videos to import
 * @returns {Object} Quota estimate
 */
function estimateQuotaUsage(videoCount) {
    const getLikedVideos = 1; // playlistItems.list
    const getCategories = 1; // videoCategories.list  
    const getVideoDetails = Math.ceil(videoCount / 50) * 2; // videos.list (snippet + contentDetails)
    
    const total = getLikedVideos + getCategories + getVideoDetails;
    
    return {
        getLikedVideos,
        getCategories,
        getVideoDetails,
        total,
        percentage: (total / 10000) * 100
    };
}

module.exports = {
    bulkImportLikedVideos,
    estimateQuotaUsage,
    getLikedVideoIds,
    getBatchVideoDetails
};
