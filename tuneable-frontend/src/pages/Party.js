import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useParams } from 'react-router-dom';
import SongCard from '../components/SongCard';
import NewRequest from '../components/NewRequest';
import Footer from '../components/Footer';

const Party = () => {
    const [playlist, setPlaylist] = useState([]);
    const [currentSong, setCurrentSong] = useState({});
    const [errorMessage, setErrorMessage] = useState(null);
    const [loading, setLoading] = useState(false);
    const { partyId } = useParams(); // Retrieve partyId from the URL

    // Function to fetch the playlist
    const fetchPlaylist = async () => {
        setLoading(true);
        try {
            console.log('Fetching playlist for party ID:', partyId);
            const response = await axios.get(
                `${process.env.REACT_APP_BACKEND_URL}/api/parties/${partyId}/details`, // Corrected route
                {
                    headers: {
                        Authorization: `Bearer ${process.env.REACT_APP_DEV_TOKEN}`,
                    },
                }
            );
            console.log('Fetched playlist:', response.data);
            setPlaylist(response.data.party.playlist.tracks || []);
            setCurrentSong(response.data.party.playlist.tracks[0] || {});
            setErrorMessage(null); // Clear previous errors
        } catch (error) {
            console.error('Error fetching playlist:', error);
            setErrorMessage('Failed to load playlist. Please try again later.');
        } finally {
            setLoading(false);
        }
    };

    // Fetch the playlist on component mount or when the partyId changes
    useEffect(() => {
        if (partyId) {
            fetchPlaylist();
        }
    }, [partyId]);

    return (
        <div className="party-container">
            <h1>Leon’s Party</h1>
            {errorMessage && <p className="error-message">{errorMessage}</p>}
            {loading ? (
                <p>Loading playlist...</p>
            ) : (
                <div className="playlist">
                    {playlist.length > 0 ? (
                        playlist.map((song, index) => (
                            <SongCard key={song.id} song={song} rank={index + 1} />
                        ))
                    ) : (
                        <p>No songs in the playlist yet. Be the first to add one!</p>
                    )}
                </div>
            )}
            <NewRequest refreshPlaylist={fetchPlaylist} /> {/* Pass refreshPlaylist to NewRequest */}
            <Footer currentSong={currentSong} />
        </div>
    );
};

export default Party;
