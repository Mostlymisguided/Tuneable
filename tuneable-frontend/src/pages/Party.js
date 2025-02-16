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
    const [partyStatus, setStatus] = useState("Scheduled");
    const [partyWatershed, setWatershed] = useState(true);
    const [partyCode,setPartyCode] = useState('Lost Code')
    const [songs, setSongs] = useState([]);
    const [currentSong, setCurrentSong] = useState({});
    const [attendees, setAttendees] = useState([]);
    const [hostId, setHostId] = useState(null);
    const [userId] = useState(localStorage.getItem("userId"));
    const [errorMessage, setErrorMessage] = useState(null);
    const [loading, setLoading] = useState(false);
    const [isJoined, setIsJoined] = useState(false);
    const [socket, setSocket] = useState(null);
    const { partyId } = useParams();
    console.log("🛠 Extracted partyId from URL:", partyId);
    
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
            setHostId(party.host.username);
            setPartyCode(party.partyCode || 'Lost Code 2');

            setStartTime(new Date(party.startTime).toLocaleString("en-GB", { 
                weekday: "short", 
                year: "numeric", 
                month: "short", 
                day: "numeric", 
                hour: "2-digit", 
                minute: "2-digit" 
            }));
            setEndTime(new Date(party.endTime).toLocaleString("en-GB", { 
                weekday: "short", 
                year: "numeric", 
                month: "short", 
                day: "numeric", 
                hour: "2-digit", 
                minute: "2-digit" 
            }));

            setType(party.type || "Public");

            // ✅ Auto-update status based on `startTime` and `endTime`
            const now = new Date();
            if (now < new Date(party.startTime)) {
                setStatus("🎉 Scheduled - Starting Soon!");
            } else if (now >= new Date(party.startTime) && now < new Date(party.endTime)) {
                setStatus("🔥 Party is Live!");
            } else if (now >= new Date(party.endTime)) {
                setStatus("🎵 Party Ended - See You Next Time!");
            }

            // ✅ Ensure correct display for watershed (boolean)
            setWatershed(party.watershed ? "Adult Lyrics Allowed" : "Clean Bars Only");

            setSongs(party.songs || []);
            setAttendees(party.attendees || []);
            setCurrentSong(party.songs.length > 0 ? party.songs[0] : {});
            setIsJoined(party.attendees?.some((attendee) => attendee?._id === userId));
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
        let ws;
    
        const connectWebSocket = () => {
            ws = new WebSocket("ws://localhost:8000"); 
    
            ws.onopen = () => {
                console.log("✅ WebSocket Connected");
                ws.send(JSON.stringify({ type: "SET_HOST", partyId, userId }));
            };
    
            ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    if (!data) return;
    
                    if (data.type === "UPDATE_QUEUE" && data.partyId === partyId) {
                        console.log("📡 Queue Updated via WebSocket:", data.queue);
                        setSongs(data.queue || []);
                        if (data.queue.length > 0) {
                            setCurrentSong(data.queue[0]);
                        }
                    }
                    if (data.type === "PLAYBACK_ACTION" && data.partyId === partyId) {
                        console.log(`🎵 Received playback action: ${data.action}`);
    
                        if (data.action === "PLAY") {
                            setCurrentSong(prev => ({ ...prev, playing: true }));
                        } else if (data.action === "PAUSE") {
                            setCurrentSong(prev => ({ ...prev, playing: false }));
                        } else if (data.action === "SKIP") {
                            setSongs(prevQueue => {
                                const newQueue = prevQueue.slice(1);
                                setCurrentSong(newQueue[0] || {});
                                return newQueue;
                            });
                        }
                    }
                } catch (error) {
                    console.error("🔴 Error processing WebSocket message:", error);
                }
            };
    
            ws.onerror = (error) => {
                console.error("🔴 WebSocket Error:", error);
            };
    
            ws.onclose = (event) => {
                console.warn("⚠️ WebSocket Closed", event.code, event.reason);
                setTimeout(() => {
                    console.log("♻️ Reconnecting WebSocket...");
                    connectWebSocket(); // ✅ Automatically reconnect if closed
                }, 3000);
            };
    
            setSocket(ws);
        };
    
        connectWebSocket(); // ✅ Establish connection
    
        return () => {
            if (ws) ws.close();
        };
    }, [partyId, userId]);
    
    useEffect(() => {
        if (partyId) {
            fetchPartyDetails();
        }
    }, [partyId, fetchPartyDetails]);

    const navigateToSearch = () => {
        localStorage.setItem("partyId", partyId);
        navigate(`/search?partyId=${partyId}`);
    };

    console.log("🛠 Party.js passing partyId to WebPlayer:", partyId);

    
    return (
        <div className="party-container">
            {console.log("Rendering Party Page with:", partyName, partyVenue, partyLocation, hostId, partyStatus, songs)}
            <h1>{partyName}</h1>
            <h2>Venue: {partyVenue}</h2>
            <h2>Location: {partyLocation}</h2>
            <h2>Host: {hostId}</h2>
            <h3>Start: {partyStart}</h3>
            <h3>Finish: {partyEnd}</h3>
            <h3>Accessibility: {partyType}</h3>
            <h3>Status: {partyStatus}</h3>
            <h3>Watershed: {partyWatershed}</h3>

            <h3>Party Invite Code: {partyCode}</h3>
    
            {errorMessage && <p className="error-message" style={{ color: "red" }}>{errorMessage}</p>}
            {loading ? (
                <p>Loading party details...</p>
            ) : (
                <>
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
                        <button onClick={navigateToSearch}>Add Song</button>
    
                    <h2>Next Up</h2>
                    <div className="playlist">
                        {songs.map((song, index) => (
                            <SongCard
                                key={song._id}
                                song={song}
                                rank={index + 1}
                                partyId={partyId}
                            />
                        ))}
                    </div>
                </>
            )}
            <Footer currentSong={currentSong} />

            {currentSong?.url && partyId ? (
  <WebPlayer 
    partyId={partyId} 
    url={currentSong.url} 
    playing={currentSong.playing} 
  />
) : (
  <p>Loading WebPlayer...</p> // Debugging message
)}


        </div>
    );
    
};

export default Party;