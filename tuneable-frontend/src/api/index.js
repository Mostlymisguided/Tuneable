import axios from 'axios';

// Load environment variables
const backendUrl = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8000';
const DEV_TOKEN = process.env.REACT_APP_DEV_TOKEN;

// Create an Axios instance with the base URL
const API = axios.create({
  baseURL: backendUrl,
});

// Dynamically attach the token to the headers
API.interceptors.request.use((config) => {
  const token = localStorage.getItem('token') || DEV_TOKEN;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Log errors for debugging
API.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error('API Error:', error.response?.data || error.message);
    return Promise.reject(error);
  }
);

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

// Export the API instance as the default export
export default API;
