// Footer.js
import React from 'react';
import WebPlayer from './WebPlayer';

const Footer = ({ currentSong, partyId, isHost, userId }) => {
  console.log("Footer received userId:", userId);
  console.log("Footer received currentSong:", currentSong);
  
  return (
    <footer>
      <div className="current-song">
        <span>{currentSong?.title || "No song playing"} - {currentSong?.artist || "artist placeholder"}</span>
        <br />
        <span>£{currentSong?.globalBidValue || 'bid placeholder'}</span>
      </div>
      <WebPlayer currentSong={currentSong} partyId={partyId} isHost={isHost} userId={userId} />
    </footer>
  );
};

export default Footer;
