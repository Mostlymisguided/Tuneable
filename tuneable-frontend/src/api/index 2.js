import axios from 'axios';

// Load environment variables
const backendUrl = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8000';
const DEV_TOKEN = process.env.REACT_APP_DEV_TOKEN;

// Create an Axios instance with the base URL and Authorization header
const API = axios.create({
  baseURL: backendUrl,
  headers: {
    Authorization: `Bearer ${DEV_TOKEN}`, // Attach token globally
  },
});

// Example: Fetch parties
export const fetchParties = async () => {
  const response = await API.get('/parties');
  return response.data;
};

// Example: Fetch playlists
export const fetchPlaylists = async () => {
  const response = await API.get('/playlists');
  return response.data;
};

// Example: YouTube Search
export const searchYouTube = (query) => {
  return API.get(`/youtube/search`, {
    params: { query }, // Use params for cleaner query string handling
  });
};

// Export the API instance for use in other components
export default API;
