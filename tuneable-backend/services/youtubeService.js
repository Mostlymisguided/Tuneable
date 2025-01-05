const axios = require('axios');

const searchYouTube = async (query, pageToken = null) => {
    const apiKey = process.env.YOUTUBE_API_KEY; // Ensure the API key is in your .env file
    const response = await axios.get('https://www.googleapis.com/youtube/v3/search', {
        params: {
            part: 'snippet',
            q: query,
            type: 'video',
            key: apiKey,
            maxResults: 10,
            pageToken, // Include the page token if provided
        },
    });

    // Format the response to return relevant fields
    return {
        nextPageToken: response.data.nextPageToken || null,
        videos: response.data.items.map((item) => ({
            id: item.id.videoId,
            title: item.snippet.title,
            description: item.snippet.description,
            thumbnail: item.snippet.thumbnails.high.url,
            channelTitle: item.snippet.channelTitle,
            publishedAt: item.snippet.publishedAt,
        })),
    };
};

module.exports = { searchYouTube };