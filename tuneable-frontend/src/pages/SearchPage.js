import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useSearchParams } from 'react-router-dom';
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

    // Fetch token from localStorage
    const token = localStorage.getItem('token');

    useEffect(() => {
        console.log("Party ID:", partyId);
        if (!partyId) {
            alert('Party ID is missing. Please return to the previous page.');
        }
    }, [partyId]);

    const fetchResults = useCallback(
        async (pageToken = null) => {
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
                    url: video.url || `https://www.youtube.com/watch?v=${video.id}`,
                    platform: 'youtube',
                    title: video.title,
                    thumbnail: video.thumbnail,
                    channelTitle: video.channelTitle,
                }));

                setResults(pageToken ? [...results, ...mappedResults] : mappedResults);
                setNextPageToken(response.data.nextPageToken || null);
            } catch (err) {
                console.error('Error fetching results:', err);
                setError(err.response?.data?.error || 'Failed to fetch results. Please try again.');
            } finally {
                setLoading(false);
            }
        },
        [query, source, results, token]
    );

    // Debounce the fetchResults function
    useEffect(() => {
        const debouncedFetchResults = debounce(() => {
            fetchResults();
        }, 300);

        if (query) {
            debouncedFetchResults();
        }

        return () => {
            debouncedFetchResults.cancel();
        };
    }, [query, fetchResults]);

    const handleBid = async (song) => {
        try {
            const payload = {
                title: song.title,
                artist: song.channelTitle,
                platform: song.platform,
                url: song.url,
                partyId: partyId,
                bidAmount: bidAmount,
                timeExecuted: new Date().toISOString(),
            };

            console.log('Sending payload:', payload);

            const response = await axios.post(
                `${process.env.REACT_APP_BACKEND_URL}/api/parties/${partyId}/songs`,
                payload,
                {
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                }
            );

            console.log('Song added successfully:', response.data);
        } catch (error) {
            console.error('Error adding song to queue:', error.response?.data || error.message);
            setError('Failed to add song to the queue. Please try again.');
        }
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
                                <img src={item.thumbnail} alt={item.title} />
                                <div>
                                    <h4>{item.title}</h4>
                                    <p>{item.channelTitle}</p>
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
