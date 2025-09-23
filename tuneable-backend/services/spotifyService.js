const axios = require('axios');

class SpotifyService {
  constructor() {
    this.clientId = process.env.SPOTIFY_CLIENT_ID;
    this.clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
    this.baseURL = 'https://api.spotify.com/v1';
  }

  // Exchange authorization code for access token
  async getAccessToken(code, redirectUri) {
    try {
      const response = await axios.post('https://accounts.spotify.com/api/token', 
        new URLSearchParams({
          grant_type: 'authorization_code',
          code: code,
          redirect_uri: redirectUri,
          client_id: this.clientId,
          client_secret: this.clientSecret
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );

      return response.data;
    } catch (error) {
      console.error('Error getting Spotify access token:', error.response?.data || error.message);
      throw new Error('Failed to get Spotify access token');
    }
  }

  // Search for tracks
  async searchTracks(query, limit = 20, offset = 0, accessToken) {
    try {
      const response = await axios.get(`${this.baseURL}/search`, {
        params: {
          q: query,
          type: 'track',
          limit: limit,
          offset: offset
        },
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      return response.data;
    } catch (error) {
      console.error('Error searching Spotify tracks:', error.response?.data || error.message);
      throw new Error('Failed to search Spotify tracks');
    }
  }

  // Get track details
  async getTrack(trackId, accessToken) {
    try {
      const response = await axios.get(`${this.baseURL}/tracks/${trackId}`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      return response.data;
    } catch (error) {
      console.error('Error getting track details:', error.response?.data || error.message);
      throw new Error('Failed to get track details');
    }
  }

  // Get user's playlists
  async getUserPlaylists(accessToken) {
    try {
      const response = await axios.get(`${this.baseURL}/me/playlists`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      return response.data;
    } catch (error) {
      console.error('Error getting user playlists:', error.response?.data || error.message);
      throw new Error('Failed to get user playlists');
    }
  }

  // Get user's currently playing track
  async getCurrentlyPlaying(accessToken) {
    try {
      const response = await axios.get(`${this.baseURL}/me/player/currently-playing`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      return response.data;
    } catch (error) {
      console.error('Error getting currently playing:', error.response?.data || error.message);
      throw new Error('Failed to get currently playing track');
    }
  }

  // Convert Spotify track to our Song format
  convertToSong(spotifyTrack, addedBy) {
    return {
      title: spotifyTrack.name,
      artist: spotifyTrack.artists.map(a => a.name).join(', '),
      album: spotifyTrack.album.name,
      duration: Math.floor(spotifyTrack.duration_ms / 1000),
      coverArt: spotifyTrack.album.images[0]?.url || '',
      sources: {
        spotify: spotifyTrack.uri,
        spotifyId: spotifyTrack.id,
        spotifyUrl: spotifyTrack.external_urls.spotify
      },
      addedBy,
      uploadedAt: new Date().toISOString(),
      // Spotify-specific fields
      spotifyId: spotifyTrack.id,
      spotifyUri: spotifyTrack.uri,
      previewUrl: spotifyTrack.preview_url
    };
  }
}

module.exports = new SpotifyService();

