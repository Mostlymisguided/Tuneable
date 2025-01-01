import React, { useState } from 'react';
import axios from 'axios';

const SearchPage = () => {
    const [results, setResults] = useState([]);
    const [query, setQuery] = useState('');
    const [nextPageToken, setNextPageToken] = useState(null);
    const [source, setSource] = useState('youtube'); // Default to YouTube
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [bidAmount, setBidAmount] = useState(0.77); // Default bid amount

    // Fetch search results from the backend
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

            const { results: newResults, nextPageToken: newToken } = response.data;
            setResults(pageToken ? [...results, ...newResults] : newResults); // Append for pagination
            setNextPageToken(newToken || null);
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to fetch results. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    // Handle search action
    const handleSearch = () => {
        setResults([]); // Clear results for new search
        setNextPageToken(null);
        fetchResults();
    };

    // Handle bidding on a song
    const handleBid = async (songId) => {
        try {
            await axios.post(
                `${process.env.REACT_APP_BACKEND_URL}/api/parties/add-to-queue`,
                { songId, bidAmount },
                {
                    headers: {
                        Authorization: `Bearer ${process.env.REACT_APP_DEV_TOKEN}`,
                    },
                }
            );
            alert('Song added to queue with your bid!');
        } catch (err) {
            console.error('Error adding song to queue:', err);
            alert('Failed to add song to queue. Please try again.');
        }
    };

    // Handle source change
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

            {error && <p className="error-message">{error}</p>}

            <div className="results">
                <h2>Results...</h2>
                <ul>
                    {results.map((item, index) => (
                        <li key={item.id} className={index === 2 ? 'highlighted' : ''}>
                            <div className="result-item">
                                <img
                                    src={item.thumbnail}
                                    alt={item.title}
                                    className="thumbnail"
                                />
                                <div className="song-details">
                                    <h4>{item.title}</h4>
                                    <p>{item.artist || item.channelTitle}</p>
                                </div>
                                <div className="bid-section">
                                    <input
                                        type="number"
                                        value={bidAmount}
                                        onChange={(e) => setBidAmount(Number(e.target.value))}
                                    />
                                    <button onClick={() => handleBid(item.id)}>+ Bid</button>
                                </div>
                            </div>
                        </li>
                    ))}
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
