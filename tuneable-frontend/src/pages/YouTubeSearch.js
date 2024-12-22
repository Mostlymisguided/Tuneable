import React, { useState } from 'react';
import axios from 'axios';

const YouTubeSearch = () => {
    const [videos, setVideos] = useState([]);
    const [query, setQuery] = useState('');
    const [nextPageToken, setNextPageToken] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    // Fetch videos from the backend
    const fetchVideos = async (pageToken = null) => {
        if (!query) return;
        setLoading(true);
        setError(null);

        try {
            const response = await axios.get('http://localhost:8000/api/youtube/search', {
                params: {
                    query,
                    pageToken,
                },
            });

            const { videos: newVideos, nextPageToken: newToken } = response.data;
            setVideos(pageToken ? [...videos, ...newVideos] : newVideos); // Append for pagination
            setNextPageToken(newToken || null); // Update nextPageToken
        } catch (err) {
            setError('Failed to fetch videos. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    // Handle search action
    const handleSearch = () => {
        setVideos([]);
        setNextPageToken(null);
        fetchVideos();
    };

    return (
        <div style={{ padding: '16px' }}>
            <h1>YouTube Search</h1>
            <div style={{ marginBottom: '16px' }}>
                <input
                    type="text"
                    placeholder="Search for videos"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    style={{ padding: '8px', marginRight: '8px', width: '300px' }}
                />
                <button onClick={handleSearch} disabled={loading || !query}>
                    {loading ? 'Loading...' : 'Search'}
                </button>
            </div>

            {error && <p style={{ color: 'red' }}>{error}</p>}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
                {videos.map((video) => (
                    <div key={video.id} style={{ border: '1px solid #ddd', padding: '8px' }}>
                        <img
                            src={video.thumbnail}
                            alt={video.title}
                            style={{ width: '100%', height: 'auto' }}
                        />
                        <h4>{video.title}</h4>
                        <p>{video.channelTitle}</p>
                        <small>{new Date(video.publishedAt).toLocaleDateString()}</small>
                    </div>
                ))}
            </div>

            {nextPageToken && (
                <button onClick={() => fetchVideos(nextPageToken)} disabled={loading}>
                    {loading ? 'Loading...' : 'Load More'}
                </button>
            )}
        </div>
    );
};

export default YouTubeSearch;