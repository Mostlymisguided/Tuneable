const express = require('express');
const axios = require('axios');
const NodeCache = require('node-cache');
const router = express.Router();

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY; // Load API key from environment variables
const cache = new NodeCache({ stdTTL: 600 }); // Cache results for 10 minutes

router.get('/search', async (req, res) => {
    const { query, pageToken } = req.query;

    // Validate query
    if (!query) {
        return res.status(400).json({ error: 'Query parameter is required' });
    }
    if (query.length > 100) {
        return res.status(400).json({ error: 'Query is too long' });
    }

    const cacheKey = `${query}-${pageToken || ''}`;
    const cachedResult = cache.get(cacheKey);

    if (cachedResult) {
        console.log('Returning cached result');
        return res.json(cachedResult);
    }

    try {
        const response = await axios.get('https://www.googleapis.com/youtube/v3/search', {
            params: {
                part: 'snippet',
                q: query,
                type: 'video',
                key: YOUTUBE_API_KEY,
                maxResults: 10,
                pageToken, // Include the page token if provided
            },
        });

        const result = {
            nextPageToken: response.data.nextPageToken, // Pagination token for frontend
            videos: response.data.items.map(video => ({
                id: video.id.videoId,
                title: video.snippet.title,
                description: video.snippet.description,
                thumbnail: video.snippet.thumbnails.high.url,
                channelTitle: video.snippet.channelTitle,
                publishedAt: video.snippet.publishedAt,
            })),
        };

        // Cache the result
        cache.set(cacheKey, result);
        res.json(result);
    } catch (error) {
        console.error('YouTube API error:');
        if (error.response) {
            // API responded but with an error
            const statusCode = error.response.status;
            const message = error.response.data.error?.message || 'YouTube API error';
            console.error('Status:', statusCode, 'Message:', message);
            return res.status(statusCode).json({ error: message });
        } else if (error.request) {
            // No response received
            console.error('No response received:', error.request);
            return res.status(500).json({ error: 'No response received from YouTube API' });
        } else {
            // General error
            console.error('Error message:', error.message);
            return res.status(500).json({ error: 'Internal server error' });
        }
    }
});

module.exports = router;
