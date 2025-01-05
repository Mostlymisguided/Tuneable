import React from 'react';
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import NavBar from './components/NavBar';
import Home from './pages/Home';
import Parties from './pages/Parties';
import SearchPage from './pages/SearchPage'; // Updated import for SearchPage
import Register from './pages/Register';
import Login from './pages/Login';
import Party from './pages/Party'; // Party component
import CreateParty from './pages/CreateParty'; // Import CreateParty component

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
        <Route path="/party/:partyId" element={<ProtectedRoute element={<Party />} />} /> {/* Party Details Route */}
        <Route path="/search" element={<ProtectedRoute element={<SearchPage />} />} /> {/* Search Route */}
        <Route path="/create-party" element={<ProtectedRoute element={<CreateParty />} />} /> {/* Create Party Route */}
      </Routes>
    </Router>
  );
}

export default App;
