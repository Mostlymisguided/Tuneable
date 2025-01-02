import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useParams } from 'react-router-dom';
import SongCard from '../components/SongCard';
import NewRequest from '../components/NewRequest';
import Footer from '../components/Footer';

const Party = () => {
    const [partyName, setPartyName] = useState("Party"); // State for the party name
    const [playlist, setPlaylist] = useState([]);
    const [currentSong, setCurrentSong] = useState({});
    const [errorMessage, setErrorMessage] = useState(null);
    const [loading, setLoading] = useState(false);
    const { partyId } = useParams(); // Retrieve partyId from the URL

    // Function to fetch the playlist, wrapped with useCallback
    const fetchPlaylist = useCallback(async () => {
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
            const party = response.data.party;
            setPartyName(party.name || "Party"); // Set party name dynamically
            setPlaylist(party.playlist.tracks || []);
            setCurrentSong(party.playlist.tracks[0] || {});
            setErrorMessage(null); // Clear previous errors
        } catch (error) {
            console.error('Error fetching playlist:', error);
            setErrorMessage('Failed to load playlist. Please try again later.');
        } finally {
            setLoading(false);
        }
    }, [partyId]); // Add partyId as a dependency

    // Fetch the playlist on component mount or when the partyId changes
    useEffect(() => {
        if (partyId) {
            fetchPlaylist();
        }
    }, [partyId, fetchPlaylist]); // Add fetchPlaylist to dependencies

    return (
        <div className="party-container">
            <h1>{partyName}</h1> {/* Use the partyName state here */}
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
