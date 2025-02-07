import React from 'react';
import WebPlayer from './WebPlayer';

const Footer = ({ currentSong }) => {
  console.log("🎵 Footer received currentSong:", currentSong);

  // ✅ Extract the correct URL from `sources`
  const songUrl = currentSong?.sources?.length > 0 ? currentSong.sources[0].url : null;
  
  console.log("🎵 Extracted Song URL:", songUrl); // Debugging

  return (
    <footer>
      <div className="current-song">
        <span>{currentSong?.title || "No song playing"} - {currentSong?.artist || ""}</span>
        <span>£{currentSong?.bid || 0}</span>
      </div>

      {/* ✅ Ensure WebPlayer only renders if a valid `url` exists */}
      {songUrl ? (
        <div className="web-player-container">
          <WebPlayer url={songUrl} playing={true} />
        </div>
      ) : (
        <p style={{ textAlign: "center", color: "gray" }}>No song currently playing.</p>
      )}
    </footer>
  );
};

export default Footer;
