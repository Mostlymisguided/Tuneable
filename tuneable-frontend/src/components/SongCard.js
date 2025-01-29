import React, { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import API from '../api';

const SongCard = ({ song, rank, partyId, onBidPlaced }) => {
  const [bidAmount, setBidAmount] = useState(1);
  const [loading, setLoading] = useState(false);

  // Debugging: Log song and partyId
  useEffect(() => {
    console.log('SongCard received song:', song);
    console.log('SongCard partyId:', partyId);
  }, [song, partyId]);

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
      // Create the payload dynamically
      const payload = {
        bidAmount,
        ...(song._id
          ? { songId: song._id } // Include `songId` if the song already exists
          : {
              url: song.url,
              title: song.title,
              artist: song.artist,
              platform: song.sources?.[0]?.platform, // Use first available platform
            }),
      };

      console.log('Sending payload:', payload);

      const response = await API.post(`/api/parties/${partyId}/songs/bid`, payload);

      console.log(`Bid placed on song: ${song.title || song.url}`, response.data);

      toast.success(
        `Your bid of £${bidAmount} for "${song.title || song.url}" was successful!`
      );

      // ✅ Ensure `onBidPlaced` receives the full updated song object
      if (onBidPlaced) {
        onBidPlaced(response.data.song);
      }
    } catch (error) {
      console.error(`Error placing bid on song: ${song.title || song.url}`, error.response?.data || error.message);
      toast.error(`Oops! Couldn't place your bid. Please try again later.`);
    } finally {
      setLoading(false);
    }
  };

  const currentUserId = localStorage.getItem('userId');

  const bids = song?.bids || [];
  const title = song?.title || 'Unknown Title';
  const artist = song?.artist || 'Unknown Artist';
  const cover = song?.coverArt || '/default-cover.jpg'; // ✅ Fixed cover source
  const totalBidValue = song?.totalBidValue || 0;
  const globalBidValue = song?.globalBidValue || 0;

  return (
    <div className="song-card">
      <span>{rank || '?'}</span>
      <img src={cover} alt={title} />
      <div className="song-info">
        <h3>{title}</h3>
        <p>{artist}</p>
      </div>

      {/* ✅ **Display available streaming sources** */}
      {song.sources && song.sources.length > 0 && (
        <div className="streaming-links">
          <h4>Listen on:</h4>
          <ul>
            {song.sources.map((platformData) => (
              <li key={platformData.platform}>
                <a href={platformData.url} target="_blank" rel="noopener noreferrer">
                  {platformData.platform.charAt(0).toUpperCase() + platformData.platform.slice(1)}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="bid-info">
        <p>Current Party Total Bid Value: £{totalBidValue}</p>
        <p>Global Total Bid Value: £{globalBidValue}</p>
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
