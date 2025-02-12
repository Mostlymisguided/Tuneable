const axios = require('axios');

const searchYouTube = async (query, pageToken = null) => {
    const apiKey = process.env.YOUTUBE_API_KEY;
    
    // Step 1: Fetch video search results (Basic Details)
    const searchResponse = await axios.get('https://www.googleapis.com/youtube/v3/search', {
        params: {
            part: 'snippet',
            q: query,
            type: 'video',
            key: apiKey,
            maxResults: 10,
            pageToken,
        },
    });

    const videos = searchResponse.data.items.map((item) => ({
        id: item.id.videoId,
        title: item.snippet.title,
        description: item.snippet.description,
        thumbnail: item.snippet.thumbnails.high.url,
        channelTitle: item.snippet.channelTitle,
        publishedAt: item.snippet.publishedAt,
    }));

    // Step 2: Fetch video durations using Video IDs
    const videoIds = videos.map(video => video.id).join(',');
    const detailsResponse = await axios.get('https://www.googleapis.com/youtube/v3/videos', {
        params: {
            part: 'contentDetails',
            id: videoIds,
            key: apiKey,
        },
    });

    // ✅ Helper Function: Convert YouTube Duration (ISO 8601) to Seconds
const parseDuration = (duration) => {
    console.log("🔍 Parsing YouTube duration:", duration); // ✅ Log raw input

    const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return 0;

    const hours = parseInt(match[1] || "0", 10);
    const minutes = parseInt(match[2] || "0", 10);
    const seconds = parseInt(match[3] || "0", 10);
    const totalSeconds = hours * 3600 + minutes * 60 + seconds;

    console.log(`✅ Converted YouTube duration: ${totalSeconds}s`); // ✅ Log output
    return totalSeconds;
};


    // Step 3: Merge duration details into the video list
    const videoDetails = detailsResponse.data.items.reduce((acc, video) => {
        acc[video.id] = parseDuration(video.contentDetails.duration); // Convert YouTube duration format to seconds
        return acc;
    }, {});



    const videosWithDetails = videos.map((video) => ({
        ...video,
        coverArt: video.thumbnail?.includes("http")
            ? video.thumbnail  // ✅ Use the correct YouTube thumbnail
            : `https://img.youtube.com/vi/${video.id}/hqdefault.jpg`, // ✅ Fallback to YouTube thumbnail
        duration: videoDetails[video.id] || 0,
    }));
    
    console.log("🎵 Processed YouTube Results:", JSON.stringify(videosWithDetails, null, 2));
    
    
    console.log("🎵 Raw YouTube duration data:", JSON.stringify(detailsResponse.data.items, null, 2));
    

    return {
        nextPageToken: searchResponse.data.nextPageToken || null,
        videos: videosWithDetails,
    };
};

module.exports = { searchYouTube };
