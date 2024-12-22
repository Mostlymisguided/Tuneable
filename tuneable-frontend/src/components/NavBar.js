import React from 'react';
import { Link, useNavigate } from 'react-router-dom';

const NavBar = () => {
  const navigate = useNavigate();

  // Check if the user is authenticated
  const isAuthenticated = !!localStorage.getItem('authToken');

  // Handle logout
  const handleLogout = () => {
    localStorage.removeItem('authToken'); // Clear token from localStorage
    navigate('/login'); // Redirect to login page
  };

  return (
    <nav>
      <ul>
        <li><Link to="/">Home</Link></li>
        {isAuthenticated ? (
          <>
            <li><Link to="/parties">Parties</Link></li>
            <li><Link to="/playlists">Playlists</Link></li>
            <li><Link to="/youtube-search">YouTube Search</Link></li>
            <li>
              <button
                onClick={handleLogout}
                style={{ cursor: 'pointer', background: 'none', border: 'none', color: 'blue' }}
              >
                Logout
              </button>
            </li>
          </>
        ) : (
          <>
            <li><Link to="/register">Register</Link></li>
            <li><Link to="/login">Login</Link></li>
          </>
        )}
      </ul>
    </nav>
  );
};

export default NavBar;
