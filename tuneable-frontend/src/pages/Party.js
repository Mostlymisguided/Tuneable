import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useParams, useNavigate } from 'react-router-dom';
import SongCard from '../components/SongCard';
import NewRequest from '../components/NewRequest';
import Footer from '../components/Footer';

const Party = () => {
    const [partyName, setPartyName] = useState('Party'); // State for the party name
    const [songs, setSongs] = useState([]); // Updated to songs
    const [currentSong, setCurrentSong] = useState({});
    const [errorMessage, setErrorMessage] = useState(null);
    const [loading, setLoading] = useState(false);
    const { partyId } = useParams(); // Retrieve partyId from the URL
    const navigate = useNavigate(); // Initialize navigate

    // Function to fetch the party details, wrapped with useCallback
    const fetchPartyDetails = useCallback(async () => {
        setLoading(true);
        try {
            console.log('Fetching party details for party ID:', partyId);
            const response = await axios.get(
                `${process.env.REACT_APP_BACKEND_URL}/api/parties/${partyId}/details`, // Correct route
                {
                    headers: {
                        Authorization: `Bearer ${process.env.REACT_APP_DEV_TOKEN}`,
                    },
                }
            );
            console.log('Fetched party details:', response.data);
            const party = response.data.party;
            setPartyName(party.name || 'Party'); // Set party name dynamically
            setSongs(party.songs || []); // Updated to use songs
            setCurrentSong(party.songs[0] || {}); // Updated to use songs
            setErrorMessage(null); // Clear previous errors
        } catch (error) {
            console.error('Error fetching party details:', error);
            setErrorMessage('Failed to load party details. Please try again later.');
        } finally {
            setLoading(false);
        }
    }, [partyId]); // Add partyId as a dependency

    // Fetch the party details on component mount or when the partyId changes
    useEffect(() => {
        if (partyId) {
            fetchPartyDetails();
        }
    }, [partyId, fetchPartyDetails]); // Add fetchPartyDetails to dependencies

    // Navigate to the search page
    const navigateToSearch = () => {
        localStorage.setItem('partyId', partyId); // Save partyId in localStorage
        navigate(`/search?partyId=${partyId}`); // Navigate to search page with query param
    };

    return (
        <div className="party-container">
            <h1>{partyName}</h1> {/* Use the partyName state here */}
            {errorMessage && <p className="error-message" style={{ color: 'red' }}>{errorMessage}</p>}
            {loading ? (
                <p>Loading party details...</p>
            ) : (
                <div className="playlist">
                    {songs.length > 0 ? (
                        songs.map((song, index) => (
                            <SongCard key={song._id} song={song} rank={index + 1} /> // Updated key to song._id
                        ))
                    ) : (
                        <p>No songs in the playlist yet. Be the first to add one!</p>
                    )}
                </div>
            )}
            <div className="actions">
                <button onClick={navigateToSearch}>Search for Songs</button> {/* Button to navigate to search */}
            </div>
            <NewRequest refreshPlaylist={fetchPartyDetails} /> {/* Pass refreshPlaylist to NewRequest */}
            <Footer currentSong={currentSong} />
        </div>
    );
};

export default Party;
