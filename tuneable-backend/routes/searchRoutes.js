const express = require('express');
const NodeCache = require('node-cache');
const youtubeService = require('../services/youtubeService'); // YouTube API logic
const spotifyService = require('../services/spotifyService'); // Spotify API logic
const Song = require('../models/Song'); // Local database model

const router = express.Router();
const cache = new NodeCache({ stdTTL: 600, checkperiod: 120 }); // Cache results for 10 minutes, clean every 2 mins

// Search local database first
const searchLocalDatabase = async (query, source = 'youtube', limit = 20) => {
    try {
        console.log(`Searching local database for: "${query}" (source: ${source})`);
        
        // First, let's see what songs exist in the database
        const totalSongs = await Song.countDocuments();
        console.log(`Total songs in database: ${totalSongs}`);
        
        // Create search criteria
        const searchCriteria = {
            $or: [
                { title: { $regex: query, $options: 'i' } },
                { artist: { $regex: query, $options: 'i' } },
                { album: { $regex: query, $options: 'i' } }
            ]
        };

        // If source is specified, filter by platform
        if (source === 'youtube') {
            searchCriteria['sources.youtube'] = { $exists: true, $ne: null };
        } else if (source === 'spotify') {
            searchCriteria['sources.spotify'] = { $exists: true, $ne: null };
        }

        console.log('Search criteria:', JSON.stringify(searchCriteria, null, 2));

        const songs = await Song.find(searchCriteria)
            .sort({ globalBidValue: -1, popularity: -1 }) // Sort by bid value and popularity
            .limit(limit)
            .populate('addedBy', 'username')
            .lean();

        console.log(`Found ${songs.length} songs in local database`);
        
        // Debug: Log first few songs to see their structure
        if (songs.length > 0) {
            console.log('Sample song structure:', JSON.stringify(songs[0], null, 2));
        }

        // Format results to match external API format
        const formattedResults = songs.map(song => {
            // Handle sources - it could be a Map, plain object, or undefined
            let sources = {};
            if (song.sources) {
                try {
                    // Try to convert to object if it's iterable
                    if (typeof song.sources[Symbol.iterator] === 'function') {
                        sources = Object.fromEntries(song.sources);
                    } else if (typeof song.sources === 'object') {
                        sources = song.sources;
                    }
                } catch (error) {
                    console.log('Error processing sources for song:', song._id, error);
                    // Fallback: try to access as plain object
                    sources = song.sources || {};
                }
            }

            return {
                id: song._id.toString(),
                title: song.title,
                artist: song.artist,
                coverArt: song.coverArt || (source === 'youtube' && sources.youtube ? `https://img.youtube.com/vi/${sources.youtube.split('v=')[1]?.split('&')[0]}/hqdefault.jpg` : ''),
                duration: song.duration || 0,
                sources: sources,
                globalBidValue: song.globalBidValue || 0,
                addedBy: song.addedBy?.username || 'Unknown',
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
                        isLocal: false // Flag to indicate this is from external API
                    })),
                    source: 'external'
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
                        },
                        isLocal: false // Flag to indicate this is from external API
                    })),
                    source: 'external'
                };
            }
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

// Debug endpoint to see what's in the database
router.get('/debug', async (req, res) => {
    try {
        const totalSongs = await Song.countDocuments();
        const sampleSongs = await Song.find().limit(5).lean();
        
        res.json({
            totalSongs,
            sampleSongs: sampleSongs.map(song => ({
                id: song._id,
                title: song.title,
                artist: song.artist,
                sources: song.sources,
                globalBidValue: song.globalBidValue
            }))
        });
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
