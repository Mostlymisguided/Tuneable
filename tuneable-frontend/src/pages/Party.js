import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useParams, useNavigate } from 'react-router-dom';
import SongCard from '../components/SongCard';
import NewRequest from '../components/NewRequest';
import Footer from '../components/Footer';
import WebPlayer from '../components/WebPlayer';

const Party = () => {
    const [partyName, setPartyName] = useState('Party');
    const [songs, setSongs] = useState([]);
    const [currentSong, setCurrentSong] = useState({});
    const [attendees, setAttendees] = useState([]);
    const [errorMessage, setErrorMessage] = useState(null);
    const [loading, setLoading] = useState(false);
    const [isJoined, setIsJoined] = useState(false);
    const { partyId } = useParams();
    const navigate = useNavigate();

    const fetchPartyDetails = useCallback(async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem('token'); // Get the token from localStorage

            if (!token) {
                throw new Error('Unauthorized: No token provided.');
            }

            const response = await axios.get(
                `${process.env.REACT_APP_BACKEND_URL}/api/parties/${partyId}/details`,
                {
                    headers: { Authorization: `Bearer ${token}` }, // Use the token from localStorage
                }
            );

            const party = response.data.party;
            console.log('Fetched Party Details:', party);
            setPartyName(party.name || 'Party');
            setSongs(party.songs || []);
            setAttendees(party.attendees || []);
            setCurrentSong(party.songs[0] || {});
            setIsJoined(party.attendees?.some((attendee) => attendee?._id === response.data.userId));
            setErrorMessage(null);
        } catch (error) {
            console.error('Error fetching party details:', error);
            setErrorMessage(error.response?.data?.error || 'Failed to load party details. Please try again later.');
        } finally {
            setLoading(false);
        }
    }, [partyId]);

    const handleJoinParty = async () => {
        try {
            const token = localStorage.getItem('token'); // Use the token from localStorage

            if (!token) {
                throw new Error('Unauthorized: No token provided.');
            }

            const response = await axios.post(
                `${process.env.REACT_APP_BACKEND_URL}/api/parties/${partyId}/join`,
                {},
                {
                    headers: {
                        Authorization: `Bearer ${token}`, // Use the token from localStorage
                    },
                }
            );

            alert(response.data.message);
            setIsJoined(true);
            fetchPartyDetails();
        } catch (error) {
            console.error('Error joining party:', error);
            setErrorMessage(error.response?.data?.error || 'Failed to join the party. Please try again later.');
        }
    };

    useEffect(() => {
        if (partyId) {
            fetchPartyDetails();
        }
    }, [partyId, fetchPartyDetails]);

    const navigateToSearch = () => {
        localStorage.setItem('partyId', partyId);
        navigate(`/search?partyId=${partyId}`);
    };

    return (
        <div className="party-container">
            <h1>{partyName}</h1>
            {errorMessage && <p className="error-message" style={{ color: 'red' }}>{errorMessage}</p>}
            {loading ? (
                <p>Loading party details...</p>
            ) : (
                <>
                    {!isJoined && (
                        <button onClick={handleJoinParty} className="join-party-button">
                            Join Party
                        </button>
                    )}
                    <h2>Attendees</h2>
                    {attendees.length > 0 ? (
                        <ul>
                            {attendees.map((attendee) => (
                                <li key={attendee._id}>{attendee.username || attendee._id}</li>
                            ))}
                        </ul>
                    ) : (
                        <p>No attendees yet.</p>
                    )}
                    <div className="playlist">
                        {songs.length > 0 ? (
                            songs.map((song, index) => (
                                <SongCard
                                    key={song._id}
                                    song={song}
                                    rank={index + 1}
                                    partyId={partyId}
                                    onBidPlaced={(songId, bidAmount) => {
                                        setSongs((prevSongs) =>
                                            prevSongs.map((s) =>
                                                s._id === songId ? { ...s, bid: bidAmount } : s
                                            )
                                        );
                                    }}
                                />
                            ))
                        ) : (
                            <p>No songs in the playlist yet. Be the first to add one!</p>
                        )}
                    </div>
                </>
            )}
            <div className="actions">
                <button onClick={navigateToSearch}>Search for Songs</button>
            </div>
            <NewRequest refreshPlaylist={fetchPartyDetails} />
            <Footer currentSong={currentSong} />
            {currentSong?.url && (
                <div className="player-container">
                    <h3>Now Playing</h3>
                    <WebPlayer url={currentSong.url} />
                </div>
            )}
        </div>
    );
};

export default Party;
