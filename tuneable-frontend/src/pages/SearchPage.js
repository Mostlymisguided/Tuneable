import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useSearchParams } from 'react-router-dom';
import { useNavigate } from "react-router-dom";
import debounce from 'lodash.debounce';

const SearchPage = () => {
    const [searchParams] = useSearchParams();
    const partyId = searchParams.get('partyId');
    const [results, setResults] = useState([]);
    const [query, setQuery] = useState('');
    const [nextPageToken, setNextPageToken] = useState(null);
    const [source, setSource] = useState('youtube');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [bidAmount, setBidAmount] = useState(0.77);

    const navigate = useNavigate();
    const token = localStorage.getItem('token');

    useEffect(() => {
        if (!partyId) {
            alert('Party ID is missing. Please return to the previous page.');
        }
    }, [partyId]);

    // ✅ Ensure fetchResults is memoized before debouncing
const fetchResults = useCallback(async (pageToken = null) => {
    if (!query) return;
    setLoading(true);
    setError(null);

    try {
        const response = await axios.get(`${process.env.REACT_APP_BACKEND_URL}/api/search`, {
            params: { query, source, pageToken },
            headers: {
                Authorization: `Bearer ${token}`,
            },
        });

        const { videos = [] } = response.data;
        const mappedResults = videos.map((video) => ({
            id: video.id,
            title: video.title,
            artist: video.channelTitle, // Assuming channel name as rights holder
            coverArt: video.thumbnail,
            sources: { youtube: `https://www.youtube.com/watch?v=${video.id}` }, // ✅ Dynamic mapping
        }));

        setResults(pageToken ? [...results, ...mappedResults] : mappedResults);
        setNextPageToken(response.data.nextPageToken || null);
    } catch (err) {
        console.error('Error fetching results:', err);
        setError(err.response?.data?.error || 'Failed to fetch results. Please try again.');
    } finally {
        setLoading(false);
    }
}, [query, source, token]); // ✅ Add dependencies to ensure correct memoization

// ✅ Memoized debounce function (this now works without ESLint warnings)
const debouncedFetchResults = useCallback(debounce(fetchResults, 300), [fetchResults]);

useEffect(() => {
    if (query) {
        debouncedFetchResults();
    }

    return () => {
        // ✅ Fix: Ensure the function exists before calling `.cancel()`
        if (typeof debouncedFetchResults?.cancel === "function") {
            debouncedFetchResults.cancel();
        }
    };
}, [query, debouncedFetchResults]);


    const handleBid = async (song) => {
        console.log("🎯 handleBid called for:", song);
    
        try {
            const payload = {
                bidAmount,
                title: song.title,
                artist: song.artist || "Unknown Artist", // Ensure artist exists
                rightsHolder: song.artist || "Unknown Rights Holder",
                duration: song.duration || null,
                coverArt: song.coverArt || null,
                sources: { [source]: song.sources?.[source] || song.url }, // Ensure source has a URL
                url: song.sources?.[source] || song.url, // ✅ Add explicit URL
                platform: source, // ✅ Explicitly add platform
                addedBy: localStorage.getItem('userId'),
            };
    
            console.log("📦 Sending payload:", payload);
    
            const response = await axios.post(
                `${process.env.REACT_APP_BACKEND_URL}/api/parties/${partyId}/songs/bid`,
                payload,
                {
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                }
            );
    
            console.log("✅ Song added/bid placed successfully:", response.data);
            setError(null);
        } catch (error) {
            console.error("❌ Error adding song or placing bid:", error.response?.data || error.message);
            setError("Failed to add song or place bid. Please try again.");
        }
    
        navigate(`/party/${partyId}`);
    };     

    return (
        <div className="search-page">
            <header className="search-header">
                <h1>New Request</h1>
                <div className="search-options">
                    <button
                        className={source === 'youtube' ? 'active' : ''}
                        onClick={() => setSource('youtube')}
                    >
                        YouTube
                    </button>
                    <button
                        className={source === 'music' ? 'active' : ''}
                        onClick={() => setSource('music')}
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
                    <button onClick={() => fetchResults()} disabled={loading || !query}>
                        {loading ? 'Loading...' : 'Go'}
                    </button>
                </div>
            </header>

            {error && <p className="error-message">Error: {error}</p>}

            <div className="results">
                <ul>
                    {results.map((item) => (
                        <li key={item.id}>
                            <div className="result-item">
                                <img src={item.coverArt} alt={item.title} />
                                <div>
                                    <h4>{item.title}</h4>
                                    <p>{item.artist}</p>
                                </div>
                                <input
                                    type="number"
                                    value={bidAmount}
                                    onChange={(e) => setBidAmount(Number(e.target.value))}
                                />
                                <button onClick={() => handleBid(item)}>+ Bid</button>
                            </div>
                        </li>
                    ))}
                </ul>
            </div>

            {nextPageToken && (
                <button onClick={() => fetchResults(nextPageToken)} disabled={loading}>
                    Load More
                </button>
            )}
        </div>
    );
};

export default SearchPage;
