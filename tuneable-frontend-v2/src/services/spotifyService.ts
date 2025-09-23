// Spotify API service for searching tracks and getting metadata
export interface SpotifyTrack {
  id: string;
  name: string;
  artists: Array<{
    id: string;
    name: string;
  }>;
  album: {
    id: string;
    name: string;
    images: Array<{
      url: string;
      height: number;
      width: number;
    }>;
  };
  duration_ms: number;
  preview_url: string | null;
  external_urls: {
    spotify: string;
  };
  uri: string;
}

export interface SpotifySearchResponse {
  tracks: {
    items: SpotifyTrack[];
    total: number;
    limit: number;
    offset: number;
    next: string | null;
    previous: string | null;
  };
}

class SpotifyService {
  private clientId: string;
  private redirectUri: string;

  constructor() {
    this.clientId = import.meta.env.VITE_SPOTIFY_CLIENT_ID || '';
    // Use 127.0.0.1 as required by Spotify
    this.redirectUri = 'http://127.0.0.1:5173/spotify-callback';
    
    // Debug logging
    console.log('Spotify Client ID:', this.clientId);
    console.log('Spotify Redirect URI:', this.redirectUri);
    console.log('Environment check:', {
      hostname: window.location.hostname,
      origin: window.location.origin,
      port: window.location.port
    });
  }

  // Get Spotify authorization URL
  getAuthUrl(): string {
    const scopes = [
      'user-read-private',
      'user-read-email',
      'user-read-playback-state',
      'user-modify-playback-state',
      'user-read-currently-playing',
      'streaming',
      'user-read-recently-played',
      'user-top-read'
    ].join(' ');

    // Debug logging
    console.log('Current hostname:', window.location.hostname);
    console.log('Current origin:', window.location.origin);
    console.log('Using redirect URI:', this.redirectUri);

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.clientId,
      scope: scopes,
      redirect_uri: this.redirectUri,
      show_dialog: 'true'
    });

    const authUrl = `https://accounts.spotify.com/authorize?${params.toString()}`;
    console.log('Generated auth URL:', authUrl);
    return authUrl;
  }

  // Exchange authorization code for access token
  async getAccessToken(code: string): Promise<any> {
    try {
      const response = await fetch('/api/spotify/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ code, redirectUri: this.redirectUri })
      });

      if (!response.ok) {
        throw new Error('Failed to get access token');
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error getting Spotify access token:', error);
      throw error;
    }
  }

  // Refresh access token
  async refreshAccessToken(): Promise<string> {
    const refreshToken = localStorage.getItem('spotify_refresh_token');
    if (!refreshToken) {
      throw new Error('No refresh token available');
    }

    try {
      const response = await fetch('/api/spotify/refresh', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refreshToken })
      });

      if (!response.ok) {
        // If refresh fails, clear all tokens and throw a specific error
        localStorage.removeItem('spotify_access_token');
        localStorage.removeItem('spotify_refresh_token');
        localStorage.removeItem('spotify_token_expires');
        throw new Error('REFRESH_TOKEN_EXPIRED');
      }

      const data = await response.json();
      localStorage.setItem('spotify_access_token', data.access_token);
      localStorage.setItem('spotify_token_expires', 
        (Date.now() + (data.expires_in * 1000)).toString()
      );
      
      return data.access_token;
    } catch (error) {
      console.error('Error refreshing access token:', error);
      throw error;
    }
  }

  // Check if token is expired
  isTokenExpired(): boolean {
    const expiresAt = localStorage.getItem('spotify_token_expires');
    if (!expiresAt) return true;
    return Date.now() >= parseInt(expiresAt);
  }

  // Get valid access token (refresh if needed)
  async getValidAccessToken(): Promise<string> {
    let accessToken = localStorage.getItem('spotify_access_token');
    
    if (!accessToken || this.isTokenExpired()) {
      console.log('Access token expired or missing, refreshing...');
      accessToken = await this.refreshAccessToken();
    }
    
    return accessToken;
  }

  // Search for tracks
  async searchTracks(query: string, limit: number = 20, offset: number = 0, accessToken?: string): Promise<SpotifySearchResponse> {
    try {
      // Use provided token or get a valid one
      const token = accessToken || await this.getValidAccessToken();
      
      const params = new URLSearchParams({
        q: query,
        type: 'track',
        limit: limit.toString(),
        offset: offset.toString()
      });

      const response = await fetch(`https://api.spotify.com/v1/search?${params.toString()}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        if (response.status === 401) {
          // Token expired, try to refresh
          console.log('Token expired, refreshing...');
          const newToken = await this.refreshAccessToken();
          return this.searchTracks(query, limit, offset, newToken);
        }
        throw new Error('Failed to search Spotify tracks');
      }

      return await response.json();
    } catch (error) {
      console.error('Error searching Spotify tracks:', error);
      throw error;
    }
  }

  // Get track details
  async getTrack(trackId: string, accessToken: string): Promise<SpotifyTrack> {
    try {
      const response = await fetch(`https://api.spotify.com/v1/tracks/${trackId}`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error('Failed to get track details');
      }

      return await response.json();
    } catch (error) {
      console.error('Error getting track details:', error);
      throw error;
    }
  }

  // Convert Spotify track to our Song format
  convertToSong(spotifyTrack: SpotifyTrack, addedBy: string) {
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

export const spotifyService = new SpotifyService();
