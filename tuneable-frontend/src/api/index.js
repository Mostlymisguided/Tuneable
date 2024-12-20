import axios from 'axios';

const API = axios.create({
  baseURL: 'http://localhost:3000/api', // Adjust the base URL if needed
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

// Export more API functions as needed
export default API;
