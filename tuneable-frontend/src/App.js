import React from 'react';
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import NavBar from './components/NavBar';
import Home from './pages/Home';
import Parties from './pages/Parties';
import Playlists from './pages/Playlists';
import YouTubeSearch from './pages/YouTubeSearch';
import Register from './pages/Register'; // Add Register Component
import Login from './pages/Login'; // Add Login Component

// Function to check if the user is authenticated
const isAuthenticated = () => {
  return !!localStorage.getItem('authToken'); // Returns true if token exists
};

// Component to protect routes
const ProtectedRoute = ({ element }) => {
  return isAuthenticated() ? element : <Navigate to="/login" />;
};

function App() {
  return (
    <Router>
      <NavBar />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/register" element={<Register />} />
        <Route path="/login" element={<Login />} />
        <Route path="/parties" element={<ProtectedRoute element={<Parties />} />} />
        <Route path="/playlists" element={<ProtectedRoute element={<Playlists />} />} />
        <Route path="/youtube-search" element={<ProtectedRoute element={<YouTubeSearch />} />} />
      </Routes>
    </Router>
  );
}

export default App;
