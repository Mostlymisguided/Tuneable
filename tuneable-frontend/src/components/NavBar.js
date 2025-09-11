import React from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import '../App.css'; // Import a CSS file for styling
import axios from 'axios';

const NavBar = () => {
    const navigate = useNavigate();
    const location = useLocation();

    // Check if the user is authenticated
    const isAuthenticated = !!localStorage.getItem('token');

    // Handle logout
    const handleLogout = () => {
        console.log('Token before logout:', localStorage.getItem('token')); // Log current token
        localStorage.removeItem('token'); // Clear token from localStorage
        delete axios.defaults.headers.common['Authorization']; // Clear global axios Authorization header
        console.log('Token after logout:', localStorage.getItem('token')); // Should log null
        navigate('/login'); // Redirect to login page
    };

    // Determine if a link is active
    const isActive = (path) => (location.pathname === path ? 'active' : '');

    return (
        <nav className="navbar">
            <ul className="nav-links">
                <li className={isActive('/')}>
                    <Link to="/">Home</Link>
                </li>
                {isAuthenticated ? (
                    <>
                        <li className={isActive('/tunefeed')}>
                            <Link to="/tunefeed">Tunefeed</Link>
                        </li>
                        <li className={isActive('/parties')}>
                            <Link to="/parties">Parties</Link>
                        </li>
                        <li className={isActive('/profile')}>
                            <Link to="/profile">Profile</Link>
                        </li>
                        <li className={isActive('/create-party')}>
                            <Link to="/create-party">Create Party</Link>
                        </li>
                        <li className={isActive('/upload')}>
                            <Link to="/upload">Upload</Link>
                        </li>
                        <li>
                            <button
                                className="logout-button"
                                onClick={handleLogout}
                                aria-label="Logout"
                            >
                                Logout
                            </button>
                        </li>
                    </>
                ) : (
                    <>
                        <li className={isActive('/register')}>
                            <Link to="/register">Register</Link>
                        </li>
                        <li className={isActive('/login')}>
                            <Link to="/login">Login</Link>
                        </li>
                         <li className={isActive('/about')}>
                            <Link to="/about">About</Link>
                        </li>
                    </>
                )}
            </ul>
        </nav>
    );
};

export default NavBar;
