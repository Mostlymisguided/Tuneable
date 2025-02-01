import React from 'react';
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import { ToastContainer } from 'react-toastify';
import { Elements } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';
import 'react-toastify/dist/ReactToastify.css';
import NavBar from './components/NavBar';
import Home from './pages/Home';
import TuneFeed from './pages/TuneFeed';
import Parties from './pages/Parties';
import SearchPage from './pages/SearchPage';
import Register from './pages/Register';
import Login from './pages/Login';
import Party from './pages/Party';
import UserProfile from './pages/UserProfile';
import CreateParty from './pages/CreateParty';
import Payment from './pages/Payment';
import axios from 'axios';

// Load Stripe using the publishable key from .env
const stripePromise = loadStripe(process.env.REACT_APP_STRIPE_PUBLISHABLE_KEY);

// Authentication function
const isAuthenticated = () => {
    const token = localStorage.getItem('token');
    if (!token) return false;

    try {
        const { exp } = JSON.parse(atob(token.split('.')[1])); // Decode JWT payload
        return exp * 1000 > Date.now(); // Check expiration
    } catch (err) {
        console.error('Invalid token:', err);
        return false;
    }
};

// Protected route component
const ProtectedRoute = ({ element }) => {
    return isAuthenticated() ? element : <Navigate to="/login" />;
};

// Set global axios authorization header
const token = localStorage.getItem('token');
if (token) {
    axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
}

function App() {
    return (
        <Elements stripe={stripePromise}>
            <Router>
                <NavBar />
                <ToastContainer />
                <Routes>
                    {/* Public Routes */}
                    <Route path="/" element={<Home />} />
                    <Route path="/register" element={<Register />} />
                    <Route path="/login" element={<Login />} />

                    {/* Protected Routes */}
                    <Route path="/tunefeed" element={<ProtectedRoute element={<TuneFeed />} />} />
                    <Route path="/parties" element={<ProtectedRoute element={<Parties />} />} />
                    <Route path="/party/:partyId" element={<ProtectedRoute element={<Party />} />} />
                    <Route path="/search" element={<ProtectedRoute element={<SearchPage />} />} />
                    <Route path="/create-party" element={<ProtectedRoute element={<CreateParty />} />} />
                    <Route path="/profile" element={<ProtectedRoute element={<UserProfile />} />} />
                    <Route path="/payment" element={<ProtectedRoute element={<Payment />} />} />
                </Routes>
            </Router>
        </Elements>
    );
}

export default App;
