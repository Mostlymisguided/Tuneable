const express = require('express');
const NodeCache = require('node-cache');
const youtubeService = require('../services/youtubeService'); // YouTube API logic
const Media = require('../models/Media'); // Unified media model
const { transformResponse } = require('../utils/uuidTransform');
const { getQuotaStatus, getQuotaHistory, resetQuota } = require('../services/quotaTracker');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();
const cache = new NodeCache({ stdTTL: 600, checkperiod: 120 }); // Cache results for 10 minutes, clean every 2 mins

// Search local database first (using Media model)
const searchLocalDatabase = async (query, source = 'youtube', limit = 20) => {
    try {
        console.log(`Searching local database for: "${query}" (source: ${source})`);
        
        // Count media items (filter by music for now)
        const totalMedia = await Media.countDocuments({ contentType: { $in: ['music'] } });
        console.log(`Total media items in database: ${totalMedia}`);
        
        // Create search criteria for Media model
        const searchCriteria = {
            $and: [
                {
                    $or: [
                        { title: { $regex: query, $options: 'i' } },
                        { 'artist.name': { $regex: query, $options: 'i' } }, // Search in artist subdocuments
                        { creatorNames: { $regex: query, $options: 'i' } }, // Search all creator names
                        { album: { $regex: query, $options: 'i' } }
                    ]
                },
                { contentType: { $in: ['music'] } } // Filter to music content
            ]
        };

        // If source is specified, filter by platform (always include uploads)
        if (source === 'youtube') {
            searchCriteria.$and.push({ 
                $or: [
                    { 'sources.youtube': { $exists: true, $ne: null } },
                    { 'sources.upload': { $exists: true, $ne: null } }  // Include uploaded media
                ]
            });
        }

        console.log('Search criteria:', JSON.stringify(searchCriteria, null, 2));

        const media = await Media.find(searchCriteria)
            .sort({ globalMediaAggregate: -1, popularity: -1 }) // Sort by bid value and popularity
            .limit(limit)
            .populate('addedBy', 'username')
            .lean();

        console.log(`Found ${media.length} media items in local database`);
        
        // Debug: Log first few media to see their structure
        if (media.length > 0) {
            console.log('Sample media structure:', JSON.stringify(media[0], null, 2));
        }

        // Format results to match external API format
        const formattedResults = media.map(mediaItem => {
            // Handle sources - it could be a Map, plain object, or undefined
            let sources = {};
            if (mediaItem.sources) {
                try {
                    // Try to convert to object if it's iterable
                    if (typeof mediaItem.sources[Symbol.iterator] === 'function') {
                        sources = Object.fromEntries(mediaItem.sources);
                    } else if (typeof mediaItem.sources === 'object') {
                        sources = mediaItem.sources;
                    }
                } catch (error) {
                    console.log('Error processing sources for media:', mediaItem._id, error);
                    // Fallback: try to access as plain object
                    sources = mediaItem.sources || {};
                }
            }

            // Get primary artist name
            const artistName = Array.isArray(mediaItem.artist) && mediaItem.artist.length > 0
                ? mediaItem.artist[0].name
                : 'Unknown Artist';

            return {
                id: mediaItem._id.toString(),
                uuid: mediaItem.uuid, // Include UUID for frontend
                title: mediaItem.title,
                artist: artistName,
                coverArt: mediaItem.coverArt || (source === 'youtube' && sources.youtube ? `https://img.youtube.com/vi/${sources.youtube.split('v=')[1]?.split('&')[0]}/hqdefault.jpg` : ''),
                duration: mediaItem.duration || 0,
                sources: sources,
                globalMediaAggregate: mediaItem.globalMediaAggregate || 0,
                addedBy: mediaItem.addedBy?.username || 'Unknown',
                isLocal: true // Flag to indicate this is from our database
            };
        });

        return formattedResults;
    } catch (error) {
        console.error('Error searching local database:', error);
        return [];
    }
};

// General search route
router.get('/', async (req, res) => {
    console.log('Search route hit');

    const { query, source = 'youtube', pageToken, forceExternal } = req.query;

    if (!query) {
        console.error('Query parameter is missing');
        return res.status(400).json({ error: 'Query parameter is required' });
    }

    console.log('Query:', query, 'Source:', source, 'PageToken:', pageToken);

    // Add timestamp to cache key for testing (remove this later)
    const cacheKey = `${source}-${query}-${pageToken || ''}-${Date.now()}`;
    const cachedResult = null; // Disable cache for testing

    if (cachedResult) {
        console.log('Returning cached result');
        return res.json(cachedResult);
    }

    try {
        let formattedResults;
        
        // Check if we should force external search
        if (forceExternal === 'true') {
            console.log('Force external search requested, skipping local database');
        } else {
            // Step 1: Search local database first
            console.log('Step 1: Searching local database...');
            const localResults = await searchLocalDatabase(query, source, 20);
            
            if (localResults.length > 0) {
                console.log(`Found ${localResults.length} local results, returning local database results`);
                formattedResults = {
                    nextPageToken: null, // Local results don't have pagination
                    videos: localResults,
                    source: 'local', // Indicate these are from our database
                    hasMoreExternal: true // Flag to show "Show More" button
                };
            } else {
                console.log('No local results found, searching external APIs...');
            }
        }
        
        // If no local results or forceExternal is true, search external APIs
        if (!formattedResults || forceExternal === 'true') {
            if (!forceExternal) {
                console.log('No local results found, searching external APIs...');
            } else {
                console.log('Searching external APIs...');
            }
            
            // Check quota before making external API calls
            if (source === 'youtube') {
                const quotaStatus = await getQuotaStatus();
                
                if (quotaStatus.searchDisabled) {
                    console.log(`🚫 YouTube search disabled: quota at ${quotaStatus.percentage.toFixed(1)}% (threshold: ${quotaStatus.threshold}%)`);
                    return res.status(429).json({ 
                        error: 'YouTube search is temporarily disabled',
                        message: `YouTube search has been disabled because API quota usage is nearing its limits`,
                        quotaStatus: {
                            usage: quotaStatus.usage,
                            limit: quotaStatus.limit,
                            percentage: quotaStatus.percentage,
                            resetTime: quotaStatus.resetTime
                        },
                        suggestion: '✨Please try pasting a YouTube URL directly instead✨'
                    });
                }
            }
            
            // Step 2: Fall back to external APIs
            let result;

            if (source === 'youtube') {
                console.log('Using YouTube service');
                result = await youtubeService.searchYouTube(query, pageToken);
            } else {
                console.error('Invalid source parameter:', source);
                return res.status(400).json({ error: `Unsupported source parameter: ${source}` });
            }

            if (source === 'youtube') {
                console.log(`YouTube service returned ${result?.videos?.length || 0} items for query: "${query}"`);
                formattedResults = {
                    nextPageToken: result.nextPageToken || null,
                    videos: result.videos.map(video => ({
                        id: video.id,
                        title: video.title,
                        artist: video.channelTitle || "Unknown Artist",
                        coverArt: video.coverArt?.includes("http") 
                            ? video.coverArt 
                            : `https://img.youtube.com/vi/${video.id}/hqdefault.jpg`,
                        duration: video.duration || 111,
                        sources: { youtube: `https://www.youtube.com/watch?v=${video.id}` },
                        tags: [],
                        category: video.category || 'Unknown',
                        isLocal: false // Flag to indicate this is from external API
                    })),
                    source: 'external'
                };
            }
        }

        // ✅ Cache the result
        cache.set(cacheKey, formattedResults);
        console.log('Caching result for query:', cacheKey);

        res.json(transformResponse(formattedResults));
    } catch (error) {
        console.error('Search Error:', error.message);
        res.status(500).json({ error: 'Failed to perform search', details: error.message });
    }
});

// Debug endpoint to see what's in the database
router.get('/debug', async (req, res) => {
    try {
        const totalMedia = await Media.countDocuments({ contentType: { $in: ['music'] } });
        const sampleMedia = await Media.find({ contentType: { $in: ['music'] } }).limit(5).lean();
        
        res.json(transformResponse({
            totalMedia,
            sampleMedia: sampleMedia.map(media => ({
                id: media._id,
                uuid: media.uuid,
                title: media.title,
                artist: Array.isArray(media.artist) && media.artist.length > 0 ? media.artist[0].name : 'Unknown',
                sources: media.sources,
                globalMediaAggregate: media.globalMediaAggregate,
                contentType: media.contentType,
                contentForm: media.contentForm
            }))
        }));
    } catch (error) {
        console.error('Debug error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Clear cache endpoint for testing
router.post('/clear-cache', (req, res) => {
    try {
        cache.flushAll();
        res.json({ message: 'Cache cleared successfully' });
    } catch (error) {
        console.error('Cache clear error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Helper function to extract YouTube video ID from URL
const extractVideoId = (url) => {
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
};

// Helper function to transform Media document to search result format
const transformMediaToSearchResult = (media) => {
    const sources = {};
    if (media.sources) {
        if (media.sources instanceof Map) {
            media.sources.forEach((value, key) => {
                sources[key] = value;
            });
        } else {
            Object.assign(sources, media.sources);
        }
    }

    const artistName = Array.isArray(media.artist) && media.artist.length > 0 
        ? media.artist[0].name 
        : 'Unknown Artist';

    return {
        id: media._id || media.uuid, // Include both _id and uuid for frontend
        uuid: media.uuid, // Include UUID for frontend
        title: media.title,
        artist: artistName,
        coverArt: media.coverArt || (sources.youtube ? `https://img.youtube.com/vi/${extractVideoId(sources.youtube)}/hqdefault.jpg` : ''),
        duration: media.duration || 0,
        sources: sources,
        globalMediaAggregate: media.globalMediaAggregate || 0,
        tags: media.tags || [],
        category: media.category || 'Unknown',
        isLocal: true // Flag to indicate this is from our database
    };
};

// YouTube URL processing endpoint
router.get('/youtube-url', async (req, res) => {
    const { url } = req.query;
    
    if (!url) {
        return res.status(400).json({ error: 'YouTube URL is required' });
    }
    
    try {
        console.log(`Processing YouTube URL: ${url}`);
        
        // Extract video ID from URL
        const videoId = extractVideoId(url);
        if (!videoId) {
            return res.status(400).json({ error: 'Invalid YouTube URL format' });
        }
        
        console.log(`Extracted video ID: ${videoId}`);
        
        // Check if video already exists in database
        const existingMedia = await Media.findOne({
            $or: [
                { 'sources.youtube': videoId },
                { 'externalIds.youtube': videoId },
                { 'sources.youtube': url },
                { 'sources.youtube': `https://www.youtube.com/watch?v=${videoId}` }
            ]
        });
        
        if (existingMedia) {
            console.log(`Found existing media in database: ${existingMedia.title}`);
            return res.json({
                source: 'local',
                videos: [transformMediaToSearchResult(existingMedia)]
            });
        }
        
        // Fetch video details from YouTube API
        console.log(`Fetching video details from YouTube API for: ${videoId}`);
        const { getVideoDetails } = youtubeService;
        const videoDetails = await getVideoDetails(videoId);
        
        if (!videoDetails) {
            return res.status(404).json({ error: 'Video not found or not accessible' });
        }
        
        // Return single video result in the same format as regular search
        const videoResult = {
            id: videoId,
            title: videoDetails.title || 'Unknown Title',
            artist: videoDetails.channelTitle || 'Unknown Artist',
            coverArt: videoDetails.thumbnail || `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
            duration: videoDetails.duration || 0,
            sources: { youtube: url },
            tags: [],
            category: videoDetails.category || 'Unknown',
            isLocal: false // Flag to indicate this is from external API
        };
        
        console.log(`Successfully processed YouTube URL: ${videoResult.title}`);
        
        res.json({
            source: 'external',
            videos: [videoResult]
        });
        
    } catch (error) {
        console.error('Error processing YouTube URL:', error);
        res.status(500).json({ error: 'Failed to process YouTube URL: ' + error.message });
    }
});

// Get quota status (public endpoint - can be called by any authenticated user)
router.get('/quota-status', authMiddleware, async (req, res) => {
    try {
        const status = await getQuotaStatus();
        res.json(status);
    } catch (error) {
        console.error('Error fetching quota status:', error);
        res.status(500).json({ error: 'Failed to fetch quota status' });
    }
});

// Get quota history (admin only)
router.get('/admin/quota-history', authMiddleware, async (req, res) => {
    try {
        // Check if user is admin
        const User = require('../models/User');
        const user = await User.findById(req.user._id);
        if (!user || !user.role || !user.role.includes('admin')) {
            return res.status(403).json({ error: 'Admin access required' });
        }

        const limit = parseInt(req.query.limit) || 50;
        const history = await getQuotaHistory(limit);
        res.json({ history });
    } catch (error) {
        console.error('Error fetching quota history:', error);
        res.status(500).json({ error: 'Failed to fetch quota history' });
    }
});

// Reset quota manually (admin only)
router.post('/admin/quota-reset', authMiddleware, async (req, res) => {
    try {
        // Check if user is admin
        const User = require('../models/User');
        const user = await User.findById(req.user._id);
        if (!user || !user.role || !user.role.includes('admin')) {
            return res.status(403).json({ error: 'Admin access required' });
        }

        const status = await resetQuota();
        res.json({ 
            message: 'Quota reset successfully',
            status 
        });
    } catch (error) {
        console.error('Error resetting quota:', error);
        res.status(500).json({ error: 'Failed to reset quota' });
    }
});

// Get admin settings (admin only)
router.get('/admin/settings', authMiddleware, async (req, res) => {
    try {
        // Check if user is admin
        const User = require('../models/User');
        const user = await User.findById(req.user._id);
        if (!user || !user.role || !user.role.includes('admin')) {
            return res.status(403).json({ error: 'Admin access required' });
        }

        const AdminSettings = require('../models/AdminSettings');
        const settings = await AdminSettings.getSettings();
        res.json(settings);
    } catch (error) {
        console.error('Error fetching admin settings:', error);
        res.status(500).json({ error: 'Failed to fetch admin settings' });
    }
});

// Update admin settings (admin only)
router.put('/admin/settings', authMiddleware, async (req, res) => {
    try {
        // Check if user is admin
        const User = require('../models/User');
        const user = await User.findById(req.user._id);
        if (!user || !user.role || !user.role.includes('admin')) {
            return res.status(403).json({ error: 'Admin access required' });
        }

        const AdminSettings = require('../models/AdminSettings');
        const settings = await AdminSettings.getSettings();
        
        // Update YouTube quota settings
        if (req.body.youtubeQuota) {
            if (req.body.youtubeQuota.disableSearchThreshold !== undefined) {
                const threshold = Number(req.body.youtubeQuota.disableSearchThreshold);
                if (threshold < 0 || threshold > 100) {
                    return res.status(400).json({ error: 'Threshold must be between 0 and 100' });
                }
                settings.youtubeQuota.disableSearchThreshold = threshold;
            }
            if (req.body.youtubeQuota.enabled !== undefined) {
                settings.youtubeQuota.enabled = Boolean(req.body.youtubeQuota.enabled);
            }
        }
        
        settings.updatedBy = req.user._id;
        await settings.save();
        
        console.log(`⚙️ Admin settings updated by ${user.username}: threshold=${settings.youtubeQuota.disableSearchThreshold}%, enabled=${settings.youtubeQuota.enabled}`);
        
        res.json({ 
            message: 'Settings updated successfully',
            settings 
        });
    } catch (error) {
        console.error('Error updating admin settings:', error);
        res.status(500).json({ error: 'Failed to update admin settings' });
    }
});

module.exports = router;
