const express = require('express');
const NodeCache = require('node-cache');
const youtubeService = require('../services/youtubeService'); // YouTube API logic
// const musicDatabaseService = require('../services/musicDatabaseService'); // Optional additional source

const router = express.Router();
const cache = new NodeCache({ stdTTL: 600, checkperiod: 120 }); // Cache results for 10 minutes, clean every 2 mins

// General search route
router.get('/', async (req, res) => {
    console.log('Search route hit'); // Debug log to confirm route is hit

    const { query, source = 'youtube', pageToken } = req.query;

    // Validate query
    if (!query) {
        console.error('Query parameter is missing');
        return res.status(400).json({ error: 'Query parameter is required' });
    }
    if (query.length > 100) {
        console.error('Query is too long:', query);
        return res.status(400).json({ error: 'Query parameter exceeds maximum length of 100 characters' });
    }

    console.log('Query:', query, 'Source:', source, 'PageToken:', pageToken); // Debug log query details

    const cacheKey = `${source}-${query}-${pageToken || ''}`;
    const cachedResult = cache.get(cacheKey);

    if (cachedResult) {
        console.log('Returning cached result'); // Debug log for cache hit
        return res.json(cachedResult);
    }

    try {
        let result;

        switch (source) {
            case 'youtube':
                console.log('Using YouTube service'); // Debug log for source
                result = await youtubeService.searchYouTube(query, pageToken);
                break;

            case 'music':
                console.log('Using Music Database service'); // Debug log for source
                result = await musicDatabaseService.searchMusic(query);
                break;

            default:
                console.error('Invalid source parameter:', source); // Log invalid source
                return res.status(400).json({ error: `Unsupported source parameter: ${source}` });
        }

        // Log service response size (optional)
        console.log(`Service returned ${result?.videos?.length || 0} items for query: "${query}"`);

        // Cache the result
        cache.set(cacheKey, result);
        console.log('Caching result for query:', cacheKey); // Debug log for caching

        res.json(result);
    } catch (error) {
        console.error('Search Error:', error.message); // Log any errors
        res.status(500).json({ error: 'Failed to perform search', details: error.message });
    }
});

module.exports = router;
