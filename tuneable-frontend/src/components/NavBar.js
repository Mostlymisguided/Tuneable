import React from 'react';
import { Link } from 'react-router-dom';

function NavBar() {
  return (
    <nav>
      <ul>
        <li>
          <Link to="/">Home</Link>
        </li>
        <li>
          <Link to="/parties">Parties</Link>
        </li>
        <li>
          <Link to="/playlists">Playlists</Link>
        </li>
      </ul>
    </nav>
  );
}

export default NavBar;
