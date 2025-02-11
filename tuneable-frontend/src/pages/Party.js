import React, { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { useParams, useNavigate } from "react-router-dom";
import SongCard from "../components/SongCard";
import Footer from "../components/Footer";
import WebPlayer from "../components/WebPlayer";

const Party = () => {
    const [partyName, setPartyName] = useState("Party");
    const [partyVenue, setVenue] = useState("Venue");
    const [partyLocation, setLocation] = useState("Location");
    const [partyStart, setStartTime] = useState("Start");
    const [partyEnd, setEndTime] = useState("Finish");
    const [partyType, setType] = useState("Public");
    const [partyStatus, setStatus] = useState('Scheduled')
    const [partyWatershed, setWatershed] = useState('Explicit')
    const [songs, setSongs] = useState([]);
    const [currentSong, setCurrentSong] = useState({});
    const [attendees, setAttendees] = useState([]);
    const [hostId, setHostId] = useState(null);
    const [userId] = useState(localStorage.getItem("userId")); // not needed?
    const [errorMessage, setErrorMessage] = useState(null);
    const [loading, setLoading] = useState(false);
    const [isJoined, setIsJoined] = useState(false);
    const [socket, setSocket] = useState(null);
    const { partyId } = useParams();
    const navigate = useNavigate();

    // 🎵 Fetch Party Details (Initial Load)
    const fetchPartyDetails = useCallback(async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem("token");
            if (!token) {
                throw new Error("Unauthorized: No token provided.");
            }

            const response = await axios.get(
                `${process.env.REACT_APP_BACKEND_URL}/api/parties/${partyId}/details`,
                {
                    headers: { Authorization: `Bearer ${token}` },
                }
            );

            const party = response.data.party;
            console.log("Fetched Party Details:", party);

            setPartyName(party.name || "Party");
            setVenue(party.venue || "Venue");
            setLocation(party.location || "Location");
            
            setStartTime(new Date(party.startTime).toLocaleString("en-GB", { 
                weekday: "long", 
                year: "numeric", 
                month: "long", 
                day: "numeric", 
                hour: "2-digit", 
                minute: "2-digit" 
            }));
            setEndTime(new Date(party.endTime).toLocaleString("en-GB", { 
                weekday: "long", 
                year: "numeric", 
                month: "long", 
                day: "numeric", 
                hour: "2-digit", 
                minute: "2-digit" 
            }));

            const watershedMaker = ["adult", "explicit"].includes(party.watershed?.toLowerCase())
            ? "Adult Lyrics Allowed"
            : "Clean Bars Only";

            setType(party.availability || 'Public');
            setStatus(party.status || 'Scheduled')
            // ✅ FIXED: Ensure "explicit" is always correctly identified
            setWatershed(watershedMaker);
            setSongs(party.songs || []);
            setAttendees(party.attendees || []);
            setCurrentSong(party.songs.length > 0 ? party.songs[0] : {});
            setIsJoined(party.attendees?.some((attendee) => attendee?._id === userId));
            setHostId(party.hostId);
            setErrorMessage(null);
        } catch (error) {
            console.error("Error fetching party details:", error);
            setErrorMessage(error.response?.data?.error || "Failed to load party details.");
        } finally {
            setLoading(false);
        }
    }, [partyId, userId]);

    // 🎧 WebSocket Connection for Real-Time Queue & Playback Sync
    useEffect(() => {
        const ws = new WebSocket("ws://localhost:8000"); // Update with production WebSocket URL
        setSocket(ws);

        ws.onopen = () => {
            ws.send(JSON.stringify({ type: "SET_HOST", partyId, userId }));
        };

        ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            if (data.type === "UPDATE_QUEUE" && data.partyId === partyId) {
                console.log("📡 Queue Updated via WebSocket:", data.queue);
                setSongs(data.queue);
                if (data.queue.length > 0) {
                    setCurrentSong(data.queue[0]);
                }
            }
            if (data.type === "PLAYBACK_ACTION" && data.partyId === partyId) {
                if (data.action === "PLAY") setCurrentSong(prev => ({ ...prev, playing: true }));
                if (data.action === "PAUSE") setCurrentSong(prev => ({ ...prev, playing: false }));
                if (data.action === "SKIP") {
                    setSongs(prev => prev.slice(1)); // Remove first song from queue
                    setCurrentSong(songs[1] || {}); // Move to the next song
                }
            }
        };

        return () => ws.close();
    }, [partyId, userId, songs]);

    // 🎵 Handle Queue Update When Bids Change
    const handleBidPlaced = (updatedSong) => {
        setSongs((prevSongs) => {
            const newQueue = prevSongs.map((s) =>
                s._id === updatedSong._id ? updatedSong : s
            );
            return newQueue.sort((a, b) => b.globalBidValue - a.globalBidValue);
        });

        if (socket) {
            socket.send(JSON.stringify({ type: "UPDATE_QUEUE", partyId, queue: songs }));
        }
    };

    // 🎤 Host Actions (Play, Pause, Skip, Veto)
    const sendHostAction = (action, songId = null) => {
        if (!socket || hostId !== userId) return;
        socket.send(JSON.stringify({ type: "PLAYBACK_ACTION", partyId, action, songId, userId }));
    };

    const handleJoinParty = async () => {
        try {
            const token = localStorage.getItem("token");
            if (!token) {
                throw new Error("Unauthorized: No token provided.");
            }

            const response = await axios.post(
                `${process.env.REACT_APP_BACKEND_URL}/api/parties/${partyId}/join`,
                {},
                {
                    headers: { Authorization: `Bearer ${token}` },
                }
            );

            alert(response.data.message);
            setIsJoined(true);
            fetchPartyDetails();
        } catch (error) {
            console.error("Error joining party:", error);
            setErrorMessage(error.response?.data?.error || "Failed to join the party.");
        }
    };

    useEffect(() => {
        if (partyId) {
            fetchPartyDetails();
        }
    }, [partyId, fetchPartyDetails]);

    const navigateToSearch = () => {
        localStorage.setItem("partyId", partyId);
        navigate(`/search?partyId=${partyId}`);
    };

    return (
        <div className="party-container">
            <h1>{partyName}</h1>
            <h2>{partyVenue}</h2>
            <h2>{partyLocation}</h2>
            <h3>{partyStart}</h3>
            <h3>{partyEnd}</h3>
            <h3>{partyType}</h3>
            <h3>{partyStatus}</h3>
            <h3>{partyWatershed}</h3>

            {errorMessage && <p className="error-message" style={{ color: "red" }}>{errorMessage}</p>}
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
                    <h2>Next Up</h2>
                    <div className="actions">
                <button onClick={navigateToSearch}>Add Song</button>
            </div>
                    <div className="playlist">
                        {songs.map((song, index) => (
                            <SongCard
                                key={song._id}
                                song={song}
                                rank={index + 1}
                                partyId={partyId}
                                onBidPlaced={handleBidPlaced}
                                onVeto={() => sendHostAction("VETO", song._id)} // ✅ Veto button
                            />
                        ))}
                    </div>
                </>
            )}
            {isJoined && userId === hostId && (
                <div className="host-controls">
                    <button onClick={() => sendHostAction("PLAY")}>▶ Play</button>
                    <button onClick={() => sendHostAction("PAUSE")}>⏸ Pause</button>
                    <button onClick={() => sendHostAction("SKIP")}>⏭ Skip</button>
                </div>
            )}
            <Footer currentSong={currentSong} />
            {currentSong?.url && <WebPlayer url={currentSong.url} playing={currentSong.playing} />}
        </div>
    );
};

export default Party;
