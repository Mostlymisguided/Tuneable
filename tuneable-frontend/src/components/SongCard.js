import React, { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import API from '../api'; // Import the centralized API instance

const SongCard = ({ song, rank, partyId, onBidPlaced }) => {
  const [bidAmount, setBidAmount] = useState(1); // Default bid amount to 1
  const [loading, setLoading] = useState(false); // Loading state for bid submission

  // Debugging: Log song and partyId
  useEffect(() => {
    console.log('SongCard received song:', song);
    console.log('SongCard partyId:', partyId);
  }, [song, partyId]);

  const handleBid = async () => {
    if (!partyId) {
      console.error('Party ID is missing!');
      toast.error('Party ID is missing!');
      return;
    }

    if (!song || !song._id) {
      console.error('Song ID is missing!');
      toast.error('Song information is missing or invalid!');
      return;
    }

    if (bidAmount <= 0) {
      console.error('Bid amount must be greater than 0!');
      toast.error('Bid amount must be greater than 0!');
      return;
    }

    setLoading(true); // Start loading
    try {
      const response = await API.post(`/api/parties/${partyId}/songs/${song._id}/bid`, {
        bidAmount,
        userId: localStorage.getItem('userId'),
        username: localStorage.getItem('username'), // Use localStorage to fetch current user's username
      });

      console.log(`Bid placed on song: ${song.title}`, response.data);
      toast.success(`Your bid of £${bidAmount} for "${song.title}" was successful!`);

      if (onBidPlaced) {
        onBidPlaced(song._id, bidAmount);
      }
    } catch (error) {
      console.error(`Error placing bid on song: ${song.title}`, error.response?.data || error.message);
      toast.error(`Oops! Couldn't place your bid. Try again later.`);
    } finally {
      setLoading(false); // End loading
    }
  };

  const currentUserId = localStorage.getItem('userId'); // Fetch current user ID

  // Ensure song and song.bids are always valid
  const bids = song?.bids || [];
  const title = song?.title || 'Unknown Title';
  const artist = song?.artist || 'Unknown Artist';
  const cover = song?.cover || '/default-cover.jpg';
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
      <div className="bid-info">
        <p>Current Party Total Bid Value: £{totalBidValue}</p>
        <p>Global Total Bid Value: £{globalBidValue}</p>
        {bids.length > 0 && (
          <div className="leaderboard" style={{ marginTop: '10px', border: '1px solid #ddd', borderRadius: '5px', padding: '10px' }}>
            <h4>Leaderboard</h4>
            <ul>
              {bids.map((bid, index) => (
                <li
                  key={bid._id || `${bid.userId}-${bid.amount}`} // Provide a fallback for unique key
                  style={{
                    fontWeight: bid.userId === currentUserId ? 'bold' : 'normal',
                    backgroundColor: bid.userId === currentUserId ? '#f0f8ff' : 'transparent',
                    padding: '5px',
                    cursor: 'pointer',
                    borderBottom: '1px solid #eee',
                  }}
                >
                  #{index + 1}: {bid.username || 'Anonymous'} - £{bid.amount}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      <div className="bid-section" style={{ marginTop: '10px' }}>
        <input
          type="number"
          min={1}
          value={bidAmount}
          onChange={(e) => setBidAmount(Number(e.target.value))}
          placeholder="Enter your bid"
          disabled={loading} // Disable input while loading
        />
        <button onClick={handleBid} disabled={loading} style={{ marginLeft: '5px' }}>
          {loading ? 'Placing Bid...' : 'Place Bid'}
        </button>
      </div>
    </div>
  );
};

export default SongCard;
