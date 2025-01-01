const express = require('express');
const axios = require('axios');
const NodeCache = require('node-cache');
const router = express.Router();
const youtubeService = require('../services/youtubeService'); // YouTube API logic
// const musicDatabaseService = require('../services/musicDatabaseService'); // Optional additional source

const cache = new NodeCache({ stdTTL: 600 }); // Cache results for 10 minutes

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
        return res.status(400).json({ error: 'Query is too long' });
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

        if (source === 'youtube') {
            console.log('Using YouTube service'); // Debug log for source
            result = await youtubeService.searchYouTube(query, pageToken);
        } else if (source === 'music') {
            console.log('Using Music Database service'); // Debug log for source
            result = await musicDatabaseService.searchMusic(query);
        } else {
            console.error('Invalid source parameter:', source); // Log invalid source
            return res.status(400).json({ error: 'Invalid source parameter' });
        }

        // Cache the result
        cache.set(cacheKey, result);
        console.log('Caching result for query:', cacheKey); // Debug log for caching
        res.json(result);
    } catch (error) {
        console.error('Search Error:', error); // Log any errors
        res.status(500).json({ error: 'Failed to perform search' });
    }
});

module.exports = router;
