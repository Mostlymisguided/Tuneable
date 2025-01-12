import React from 'react';
import { Link } from 'react-router-dom';

const NavBar = () => {
  return (
    <nav>
      <ul>
        <li><Link to="/">Home</Link></li>
        <li><Link to="/parties">Parties</Link></li>
        <li><Link to="/playlists">Playlists</Link></li>
        <li><Link to="/youtube-search">YouTube Search</Link></li> {/* New link */}
      </ul>
    </nav>
  );
};

export default NavBar;
