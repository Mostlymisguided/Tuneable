import React, { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import API from '../api';

// ✅ Function to extract YouTube thumbnail from URL
const getYouTubeThumbnail = (youtubeUrl) => {
  if (!youtubeUrl || typeof youtubeUrl !== "string") return "/default-cover.jpg";

  try {
    const urlObj = new URL(youtubeUrl);
    const videoId = urlObj.searchParams.get("v");
    return videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : "/default-cover.jpg";
  } catch {
    return "/default-cover.jpg";
  }
};


const getCoverArt = (song) => {
  console.log("🖼 Checking coverArt for song:", song);
  if (!song) return "/default-cover.jpg"; // ✅ Prevents crashes

  if (song.coverArt && song.coverArt !== "/default-cover.jpg") {
    console.log("✅ Using song coverArt:", song.coverArt);
    return song.coverArt; // ✅ Correctly use coverArt if available
  }

  if (song.sources?.youtube) {
    console.log("🔄 Falling back to YouTube thumbnail...");
    return getYouTubeThumbnail(song.sources.youtube); // ✅ Fallback
  }

  console.log("❌ No coverArt found, using default.");
  return "/default-cover.jpg"; // ✅ Final fallback
};

const SongCard = ({ song, rank, partyId, onBidPlaced }) => {
  const [bidAmount, setBidAmount] = useState(1);
  const [loading, setLoading] = useState(false);

  // ✅ Get coverArt using the `song` prop inside the component
  const cover = getCoverArt(song);

  useEffect(() => {
    console.log("🔍 SongCard received song:", JSON.stringify(song, null, 2));
    console.log("🔍 SongCard partyId:", partyId);
  
    if (!song || !song.sources) {
      console.error("Song or sources are undefined:", song);
      return null;
    }

    if (!Array.isArray(song.sources)) {
      console.error("song.sources is not an array:", song.sources);
      return null;
    }  

    if (song?.sources) {
      console.log("🎵 Sources array:", JSON.stringify(song.sources, null, 2));
      const youtubeSource = song.sources.find((s) => s.platform === "youtube");
      console.log("🎬 Extracted YouTube source:", youtubeSource);
    }
  }, [song, partyId]);

  console.log("Song object:", song);

  // ✅ Extract YouTube URL from `sources`
  const getYouTubeUrl = (sources) => {
    if (!sources) return null;
    if (typeof sources === "object" && sources.youtube) {
      return sources.youtube;
    }
    return null;
  };

  const youtubeUrl = getYouTubeUrl(song?.sources);

  const handleBid = async () => {
    if (!partyId) {
      toast.error('Party ID is missing!');
      return;
    }

    if (bidAmount <= 0) {
      toast.error('Bid amount must be greater than 0!');
      return;
    }

    setLoading(true);

    try {
      // ✅ Create the payload dynamically
      const payload = {
        bidAmount,
        ...(song._id
          ? { songId: song._id } // Include `songId` if the song already exists
          : {
              title: song.title,
              artist: song.artist,
              sources: song.sources, // Include sources
            }),
      };

      console.log('📤 Sending payload:', payload);

      const response = await API.post(`/api/parties/${partyId}/songs/bid`, payload);

      console.log(`✅ Bid placed on song: ${song.title}`, response.data);

      toast.success(`Your bid of £${bidAmount} for "${song.title}" was successful!`);

      // ✅ Ensure `onBidPlaced` receives the full updated song object
      if (onBidPlaced) {
        onBidPlaced(response.data.song);
      }
    } catch (error) {
      console.error(`❌ Error placing bid on song: ${song.title}`, error.response?.data || error.message);
      toast.error(`Oops! Couldn't place your bid. Please try again later.`);
    } finally {
      setLoading(false);
    }
  };

  const currentUserId = localStorage.getItem('userId');

  const bids = song?.bids || [];
  const title = song?.title || 'Unknown Title';
  const artist = song?.artist || 'Unknown Artist';
  const totalBidValue = song?.globalBidValue || 0;

  return (
    <div className="song-card">
      <span>{rank || '?'}</span>
      <img 
        src={cover} 
        alt={title} 
        onError={(e) => e.target.src = "/default-cover.jpg"} // Fallback for missing images
      />
      <div className="song-info">
        <h3>{title}</h3>
        <p>{artist}</p>
      </div>

      <div className="bid-info">
        <p>Current Total Bid : £{totalBidValue}</p>
        {bids.length > 0 && (
          <div className="leaderboard">
            <h4>Leaderboard</h4>
            <ul>
              {bids.map((bid, index) => (
                <li
                  key={bid._id || `${bid.userId}-${bid.amount}`}
                  style={{
                    fontWeight: bid.userId === currentUserId ? 'bold' : 'normal',
                    backgroundColor: bid.userId === currentUserId ? '#f0f8ff' : 'transparent',
                  }}
                >
                  #{index + 1}: {bid.userId?.username || 'Anonymous'} - £{bid.amount}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="bid-section">
        <input
          type="number"
          min={1}
          value={bidAmount}
          onChange={(e) => setBidAmount(Number(e.target.value))}
          disabled={loading}
        />
        <button onClick={handleBid} disabled={loading}>
          {loading ? 'Placing Bid...' : 'Place Bid'}
        </button>
      </div>
    </div>
  );
};

export default SongCard;
