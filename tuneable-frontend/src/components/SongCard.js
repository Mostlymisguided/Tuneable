import React from 'react';

const SongCard = ({ song, rank }) => {
  const handleBid = () => {
    // Logic to place a bid (API call or state update)
    console.log(`Bid placed on song: ${song.title}`);
  };

  return (
    <div className="song-card">
      <span>{rank}</span>
      <img src={song.cover} alt={song.title} />
      <div className="song-info">
        <h3>{song.title}</h3>
        <p>{song.artist}</p>
      </div>
      <div className="bid-section">
        <span>£{song.bid}</span>
        <button onClick={handleBid}>+</button>
      </div>
    </div>
  );
};

export default SongCard;
