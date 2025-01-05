import React from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import '../App.css'; // Import a CSS file for styling

const NavBar = () => {
  const navigate = useNavigate();
  const location = useLocation();

  // Check if the user is authenticated
  const isAuthenticated = !!localStorage.getItem('authToken');

  // Handle logout
  const handleLogout = () => {
    localStorage.removeItem('authToken'); // Clear token from localStorage
    navigate('/login'); // Redirect to login page
  };

  return (
    <nav className="navbar">
      <ul className="nav-links">
        <li className={location.pathname === '/' ? 'active' : ''}>
          <Link to="/">Home</Link>
        </li>
        {isAuthenticated ? (
          <>
            <li className={location.pathname === '/parties' ? 'active' : ''}>
              <Link to="/parties">Parties</Link>
            </li>
            <li className={location.pathname === '/search' ? 'active' : ''}>
              <Link to="/search">Search</Link>
            </li>
            <li className={location.pathname === '/create-party' ? 'active' : ''}>
              <Link to="/create-party">Create Party</Link>
            </li>
            <li>
              <button className="logout-button" onClick={handleLogout}>
                Logout
              </button>
            </li>
          </>
        ) : (
          <>
            <li className={location.pathname === '/register' ? 'active' : ''}>
              <Link to="/register">Register</Link>
            </li>
            <li className={location.pathname === '/login' ? 'active' : ''}>
              <Link to="/login">Login</Link>
            </li>
          </>
        )}
      </ul>
    </nav>
  );
};

export default NavBar;
