import React from 'react';

const Footer = ({ currentSong }) => {
  return (
    <footer>
      <div className="current-song">
        <span>{currentSong.title} - {currentSong.artist}</span>
        <span>£{currentSong.bid}</span>
      </div>
    </footer>
  );
};

export default Footer;
