import React, { useState } from 'react';
import API from '../api'; // Import the centralized API instance

const SongCard = ({ song, rank, partyId, onBidPlaced }) => {
  const [bidAmount, setBidAmount] = useState(1); // Default bid amount to 1

  const handleBid = async () => {
    if (!partyId) {
      console.error('Party ID is missing!');
      return;
    }

    if (bidAmount <= 0) {
      console.error('Bid amount must be greater than 0!');
      return;
    }

    try {
      const response = await API.post(`/api/parties/${partyId}/songs/${song._id}/bid`, {
        bidAmount,
        userId: localStorage.getItem('userId'),
        username: localStorage.getItem('username'), // Use localStorage to fetch current user's username
      });

      console.log(`Bid placed on song: ${song.title}`, response.data);

      if (onBidPlaced) {
        onBidPlaced(song._id, bidAmount);
      }
    } catch (error) {
      console.error(`Error placing bid on song: ${song.title}`, error.response?.data || error.message);
    }
  };

  const totalBids = song.bids?.reduce((total, bid) => total + bid.amount, 0) || 0;
  const currentUserId = localStorage.getItem('userId'); // Fetch current user ID

  console.log('Bids received from API:', song.bids);

  return (
    <div className="song-card">
      <span>{rank}</span>
      <img src={song.cover || '/default-cover.jpg'} alt={song.title} />
      <div className="song-info">
        <h3>{song.title}</h3>
        <p>{song.artist}</p>
      </div>
      <div className="bid-info">
        <p>Current Bid: £{totalBids}</p>
        {song.bids?.length > 0 && (
          <ul>
            {song.bids.map((bid) => (
              <li
                key={bid._id || `${bid.userId}-${bid.amount}`} // Provide a fallback for unique key
                style={{
                  fontWeight: bid.userId === currentUserId ? 'bold' : 'normal',
                }}
              >
                User: {bid.username || 'Unknown'} - £{bid.amount}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="bid-section">
        <input
          type="number"
          min={1}
          value={bidAmount}
          onChange={(e) => setBidAmount(Number(e.target.value))}
          placeholder="Enter your bid"
        />
        <button onClick={handleBid}>Place Bid</button>
      </div>
    </div>
  );
};

export default SongCard;
