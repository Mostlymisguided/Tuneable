const express = require('express');
const NodeCache = require('node-cache');
const youtubeService = require('../services/youtubeService'); // YouTube API logic
const Media = require('../models/Media'); // Unified media model
const { transformResponse } = require('../utils/uuidTransform');

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
                        tags: video.tags || [],
                        category: video.category || 'Unknown',
                        isLocal: false // Flag to indicate this is from external API
                    })),
                    source: 'external'
                };
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

module.exports = router;
