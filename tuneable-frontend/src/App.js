import React from 'react';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import NavBar from './components/NavBar';
import Home from './pages/Home';
import Parties from './pages/Parties';
import Playlists from './pages/Playlists';
import YouTubeSearch from './pages/YouTubeSearch';

function App() {
  return (
    <Router>
      <NavBar />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/parties" element={<Parties />} />
        <Route path="/playlists" element={<Playlists />} />
        <Route path="/youtube-search" element={<YouTubeSearch />} />
      </Routes>
    </Router>
  );
}

export default App;
