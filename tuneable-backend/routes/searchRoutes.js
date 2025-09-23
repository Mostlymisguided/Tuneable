const express = require('express');
const NodeCache = require('node-cache');
const youtubeService = require('../services/youtubeService'); // YouTube API logic
const spotifyService = require('../services/spotifyService'); // Spotify API logic

const router = express.Router();
const cache = new NodeCache({ stdTTL: 600, checkperiod: 120 }); // Cache results for 10 minutes, clean every 2 mins

// General search route
router.get('/', async (req, res) => {
    console.log('Search route hit');

    const { query, source = 'youtube', pageToken } = req.query;

    if (!query) {
        console.error('Query parameter is missing');
        return res.status(400).json({ error: 'Query parameter is required' });
    }

    console.log('Query:', query, 'Source:', source, 'PageToken:', pageToken);

    const cacheKey = `${source}-${query}-${pageToken || ''}`;
    const cachedResult = cache.get(cacheKey);

    if (cachedResult) {
        console.log('Returning cached result');
        return res.json(cachedResult);
    }

    try {
        let result;

        if (source === 'youtube') {
            console.log('Using YouTube service');
            result = await youtubeService.searchYouTube(query, pageToken);
        } else if (source === 'spotify') {
            console.log('Using Spotify service');
            const { accessToken } = req.query;
            if (!accessToken) {
                return res.status(400).json({ error: 'Access token required for Spotify search' });
            }
            result = await spotifyService.searchTracks(query, 20, 0, accessToken);
        } else {
            console.error('Invalid source parameter:', source);
            return res.status(400).json({ error: `Unsupported source parameter: ${source}` });
        }

        let formattedResults;

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
                    sources: { youtube: `https://www.youtube.com/watch?v=${video.id}` }
                }))
            };
        } else if (source === 'spotify') {
            console.log(`Spotify service returned ${result?.tracks?.items?.length || 0} items for query: "${query}"`);
            formattedResults = {
                nextPageToken: result.tracks.next ? 'spotify-next' : null,
                videos: result.tracks.items.map(track => ({
                    id: track.id,
                    title: track.name,
                    artist: track.artists.map(a => a.name).join(', '),
                    coverArt: track.album.images[0]?.url || '',
                    duration: Math.floor(track.duration_ms / 1000),
                    sources: { 
                        spotify: track.uri,
                        spotifyId: track.id,
                        spotifyUrl: track.external_urls.spotify
                    }
                }))
            };
        }        

        // ✅ Cache the result
        cache.set(cacheKey, formattedResults);
        console.log('Caching result for query:', cacheKey);

        res.json(formattedResults);
    } catch (error) {
        console.error('Search Error:', error.message);
        res.status(500).json({ error: 'Failed to perform search', details: error.message });
    }
});

module.exports = router;
