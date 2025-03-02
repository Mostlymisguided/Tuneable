import React from 'react';
import WebPlayer from './WebPlayer';

const Footer = ({ currentSong, partyId }) => {
  console.log("🎵 Footer received currentSong:", currentSong); // Debugging

  return (
    <footer>
      <div className="current-song">
        <span>{currentSong?.title || "No song playing"} - {currentSong?.artist || "artist placeholder"}</span><br />
        <span>£{currentSong?.globalBidValue || 'bid placeholder'}</span>
      </div>

      <WebPlayer currentSong={currentSong} partyId={partyId} />
    </footer>
  );
};

export default Footer;
