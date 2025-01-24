import React from 'react';
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import { ToastContainer } from 'react-toastify'; // Import ToastContainer
import 'react-toastify/dist/ReactToastify.css'; // Import Toastify styles
import NavBar from './components/NavBar';
import Home from './pages/Home';
import Parties from './pages/Parties';
import SearchPage from './pages/SearchPage';
import Register from './pages/Register';
import Login from './pages/Login';
import Party from './pages/Party';
import UserProfile from './pages/UserProfile';
import CreateParty from './pages/CreateParty';
import axios from 'axios';

// Check if the user is authenticated
const isAuthenticated = () => {
    const token = localStorage.getItem('token');
    if (!token) return false;

    try {
        const { exp } = JSON.parse(atob(token.split('.')[1])); // Decode the JWT payload
        return exp * 1000 > Date.now(); // Check if token is expired
    } catch (err) {
        console.error('Invalid token:', err);
        return false;
    }
};

// Component to protect routes
const ProtectedRoute = ({ element }) => {
    if (isAuthenticated()) {
        return element;
    } else {
        // Store the intended path before redirecting
        localStorage.setItem('redirectPath', window.location.pathname);
        return <Navigate to="/login" />;
    }
};

// Set global axios authorization header
const token = localStorage.getItem('token');
if (token) {
    axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
}

function App() {
    // Define protected routes dynamically
    const protectedRoutes = [
        { path: '/parties', element: <Parties /> },
        { path: '/party/:partyId', element: <Party /> },
        { path: '/search', element: <SearchPage /> },
        { path: '/create-party', element: <CreateParty /> },
        { path: '/profile', element: <UserProfile /> },
    ];

    return (
        <Router>
            <NavBar />
            <ToastContainer /> {/* Add ToastContainer here */}
            <Routes>
                {/* Public Routes */}
                <Route path="/" element={<Home />} />
                <Route path="/register" element={<Register />} />
                <Route path="/login" element={<Login />} />

                {/* Protected Routes */}
                {protectedRoutes.map(({ path, element }) => (
                    <Route key={path} path={path} element={<ProtectedRoute element={element} />} />
                ))}
            </Routes>
        </Router>
    );
}

export default App;
