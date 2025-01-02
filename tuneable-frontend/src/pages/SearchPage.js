import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useSearchParams } from 'react-router-dom';

const SearchPage = () => {
    const [searchParams] = useSearchParams();
    const partyId = searchParams.get('partyId'); // Extract partyId from query params
    const [results, setResults] = useState([]); // Ensure it's initialized as an array
    const [query, setQuery] = useState('');
    const [nextPageToken, setNextPageToken] = useState(null);
    const [source, setSource] = useState('youtube'); // Default to YouTube
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [bidAmount, setBidAmount] = useState(0.77); // Default bid amount

    useEffect(() => {
        console.log("Party ID:", partyId);
        if (!partyId) {
            alert('Party ID is missing. Please return to the previous page.');
            // Optionally, navigate back to the party selection page
        }
    }, [partyId]);

    const fetchResults = async (pageToken = null) => {
        if (!query) return;
        setLoading(true);
        setError(null);

        try {
            const response = await axios.get(`${process.env.REACT_APP_BACKEND_URL}/api/search`, {
                params: { query, source, pageToken },
                headers: {
                    Authorization: `Bearer ${process.env.REACT_APP_DEV_TOKEN}`,
                },
            });

            const { videos = [] } = response.data; // Ensure 'videos' is valid
            const mappedResults = videos.map((video) => ({
                id: video.id,
                url: video.url || `https://www.youtube.com/watch?v=${video.id}`,
                platform: 'youtube', // Assuming YouTube for this example
                title: video.title,
                thumbnail: video.thumbnail,
                channelTitle: video.channelTitle,
            }));

            setResults(pageToken ? [...results, ...mappedResults] : mappedResults); // Append or set new results
            setNextPageToken(response.data.nextPageToken || null); // Handle pagination
        } catch (err) {
            console.error('Error fetching results:', err);
            setError(err.response?.data?.error || 'Failed to fetch results. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const handleSearch = () => {
        setResults([]); // Clear previous results
        setNextPageToken(null);
        fetchResults();
    };

    const handleBid = async (song) => {
        try {
            const partyId = localStorage.getItem('partyId'); // Retrieve partyId from localStorage
            const payload = {
                partyId,
                songId: song.id,
                bidAmount: 1.5, // Example bid amount
                url: song.url,
                platform: song.platform === 'youtube' ? 'YouTube' : song.platform,
                title: song.title,
            };
    
            // Validate payload
            if (!partyId || !payload.songId || !payload.url || !payload.platform || !payload.title) {
                console.error('Invalid payload:', payload);
                alert('Missing required fields. Please try again.');
                return;
            }
    
            console.log('Sending payload:', payload); // Debugging log
            const response = await axios.post(
                `${process.env.REACT_APP_BACKEND_URL}/api/parties/add-to-queue`,
                payload,
                {
                    headers: {
                        Authorization: `Bearer ${process.env.REACT_APP_DEV_TOKEN}`,
                    },
                }
            );
            console.log('Song added:', response.data);
            alert('Song added to queue with your bid!');
        } catch (error) {
            console.error('Error adding song to queue:', error);
            alert('Failed to add song to queue. Please try again.');
        }
    };    

    const handleSourceChange = (newSource) => {
        setSource(newSource);
        setResults([]); // Clear results
        setQuery(''); // Clear query
        setNextPageToken(null); // Reset pagination
        setError(null); // Clear errors
    };

    return (
        <div className="search-page">
            <header className="search-header">
                <h1>New Request</h1>
                <div className="search-options">
                    <button
                        className={source === 'youtube' ? 'active' : ''}
                        onClick={() => handleSourceChange('youtube')}
                    >
                        YouTube
                    </button>
                    <button
                        className={source === 'music' ? 'active' : ''}
                        onClick={() => handleSourceChange('music')}
                    >
                        Music Database
                    </button>
                </div>
                <div className="search-bar">
                    <input
                        type="text"
                        placeholder={`Search for ${source === 'youtube' ? 'videos' : 'songs'}`}
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                    />
                    <button onClick={handleSearch} disabled={loading || !query}>
                        {loading ? 'Loading...' : 'Go'}
                    </button>
                </div>
            </header>

            {error && <p className="error-message">Error: {error}</p>}

            {loading && <p>Loading...</p>}

            <div className="results">
                <h2>Results...</h2>
                <ul>
                    {results && results.length > 0 ? (
                        results.map((item) => (
                            <li key={item.id}>
                                <div className="result-item">
                                    <img src={item.thumbnail} alt={item.title} className="thumbnail" />
                                    <div className="song-details">
                                        <h4>{item.title}</h4>
                                        <p>{item.channelTitle}</p>
                                    </div>
                                    <div className="bid-section">
                                        <input
                                            type="number"
                                            value={bidAmount}
                                            onChange={(e) => setBidAmount(Number(e.target.value))}
                                        />
                                        <button onClick={() => handleBid(item)}>+ Bid</button>
                                    </div>
                                </div>
                            </li>
                        ))
                    ) : (
                        <p>No results found</p>
                    )}
                </ul>
            </div>

            {nextPageToken && (
                <button className="load-more" onClick={() => fetchResults(nextPageToken)} disabled={loading}>
                    {loading ? 'Loading...' : 'Load More'}
                </button>
            )}
        </div>
    );
};

export default SearchPage;
