import axios from 'axios';

// Load environment variables
const backendUrl = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8000';

// Create an Axios instance with the base URL
const API = axios.create({
  baseURL: backendUrl,
});

// Dynamically attach the token to the headers
API.interceptors.request.use(
  (config) => {
    // Attempt to retrieve a real user token from localStorage
    const token = localStorage.getItem('token');

    if (token) {
      // Use the real user token if it exists
      config.headers.Authorization = `Bearer ${token}`;
    } else if (process.env.NODE_ENV !== 'production') {
      // Log a warning in development mode if no token is found
      console.warn('No real user token found in localStorage.');
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

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
  try {
    const response = await API.get('/parties');
    return response.data;
  } catch (error) {
    console.error('Error fetching parties:', error.message);
    throw error;
  }
};

// Example: Fetch playlists
export const fetchPlaylists = async () => {
  try {
    const response = await API.get('/playlists');
    return response.data;
  } catch (error) {
    console.error('Error fetching playlists:', error.message);
    throw error;
  }
};

// Example: YouTube Search
export const searchYouTube = async (query) => {
  try {
    const response = await API.get(`/youtube/search`, {
      params: { query }, // Use params for cleaner query string handling
    });
    return response.data;
  } catch (error) {
    console.error('Error performing YouTube search:', error.message);
    throw error;
  }
};

// Export the API instance as the default export
export default API;
