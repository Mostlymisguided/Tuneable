import axios from 'axios';

// Define types directly to avoid import issues
interface User {
  id: string;
  uuid?: string; // UUIDv7 for external API
  username: string;
  email: string;
  profilePic?: string;
  personalInviteCode: string;
  balance: number;
  homeLocation: {
    city: string;
    country: string;
    coordinates?: {
      lat: number;
      lng: number;
    };
  };
  role: string[];
  isActive: boolean;
}

interface Party {
  id: string;
  name: string;
  location: string;
  host: string | { id: string; username: string; uuid?: string; userId?: string; _id?: string };
  partyCode: string;
  attendees: (string | { id: string; username: string; uuid?: string; userId?: string; _id?: string })[];
  songs: PartySong[];
  startTime: string;
  endTime?: string;
  privacy: 'public' | 'private';
  type: 'remote' | 'live';
  status: 'scheduled' | 'active' | 'ended';
  watershed: boolean;
  createdAt: string;
  updatedAt: string;
}

interface PartySong {
  songId: string;
  addedBy: string;
}

// Unused interfaces removed to fix linting warnings

const API_BASE_URL = import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:8000';

// Create axios instance with base configuration
const api = axios.create({
  baseURL: `${API_BASE_URL}/api`,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor to handle auth errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Auth API
export const authAPI = {
  login: async (email: string, password: string) => {
    const response = await api.post('/users/login', { email, password });
    return response.data;
  },
  
  register: async (userData: any) => {
    const response = await api.post('/users/register', userData);
    return response.data;
  },
  
  getProfile: async (): Promise<{ user: User }> => {
    const response = await api.get('/users/profile');
    return response.data;
  },
  
  updateProfile: async (userData: Partial<User>) => {
    const response = await api.put('/users/profile', userData);
    return response.data;
  },
  
  uploadProfilePic: async (file: File) => {
    const formData = new FormData();
    formData.append('profilePic', file);
    const response = await api.put('/users/profile-pic', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },
  
  refreshToken: async () => {
    const response = await api.post('/auth/refresh');
    return response.data;
  },
};

// Payment API
export const paymentAPI = {
  createCheckoutSession: async (amount: number, currency: string = 'gbp') => {
    const response = await api.post('/payments/create-checkout-session', {
      amount,
      currency,
    });
    return response.data;
  },
  
  createPaymentIntent: async (amount: number, currency: string = 'gbp') => {
    const response = await api.post('/payments/create-payment-intent', {
      amount,
      currency,
    });
    return response.data;
  },
  
  confirmPayment: async (amount: number) => {
    const response = await api.post('/payments/confirm-payment', {
      amount,
    });
    return response.data;
  },
  
  updateBalance: async (amount: number) => {
    const response = await api.post('/payments/update-balance', {
      amount,
    });
    return response.data;
  },
};

// Party API
export const partyAPI = {
  createParty: async (partyData: any) => {
    const response = await api.post('/parties', partyData);
    return response.data;
  },
  
  getParties: async (): Promise<{ parties: Party[] }> => {
    const response = await api.get('/parties');
    return response.data;
  },
  
  getPartyDetails: async (partyId: string): Promise<{ party: Party }> => {
    const response = await api.get(`/parties/${partyId}/details`);
    return response.data;
  },
  
  joinParty: async (partyId: string, inviteCode?: string, location?: any) => {
    const response = await api.post(`/parties/join/${partyId}`, { inviteCode, location });
    return response.data;
  },
  
  addMediaToParty: async (partyId: string, mediaData: any) => {
    const response = await api.post(`/parties/${partyId}/media/add`, mediaData);
    return response.data;
  },
  
  placeBid: async (partyId: string, mediaId: string, bidAmount: number) => {
    const response = await api.post(`/parties/${partyId}/media/${mediaId}/bid`, {
      bidAmount
    });
    return response.data;
  },
  
  playSong: async (partyId: string, songId: string) => {
    const response = await api.post(`/parties/${partyId}/songs/${songId}/play`);
    return response.data;
  },
  
  completeSong: async (partyId: string, songId: string) => {
    const response = await api.post(`/parties/${partyId}/songs/${songId}/complete`);
    return response.data;
  },
  
  removeSong: async (partyId: string, songId: string) => {
    const response = await api.delete(`/parties/${partyId}/songs/${songId}`);
    return response.data;
  },
  
  vetoSong: async (partyId: string, songId: string) => {
    const response = await api.put(`/parties/${partyId}/songs/${songId}/veto`);
    return response.data;
  },
  
  unvetoSong: async (partyId: string, songId: string) => {
    const response = await api.put(`/parties/${partyId}/songs/${songId}/unveto`);
    return response.data;
  },
  
  resetSongs: async (partyId: string) => {
    const response = await api.post(`/parties/${partyId}/songs/reset`);
    return response.data;
  },
  updateStatuses: async () => {
    const response = await api.post('/parties/update-statuses');
    return response.data;
  },
  
  endParty: async (partyId: string) => {
    const response = await api.post(`/parties/${partyId}/end`);
    return response.data;
  },
  
  skipNext: async (partyId: string) => {
    const response = await api.post(`/parties/${partyId}/skip-next`);
    return response.data;
  },
  
  skipPrevious: async (partyId: string) => {
    const response = await api.post(`/parties/${partyId}/skip-previous`);
    return response.data;
  },
  
  getSongsSortedByTime: async (partyId: string, timePeriod: string) => {
    const response = await api.get(`/parties/${partyId}/songs/sorted/${timePeriod}`);
    return response.data;
  },
};

// Song API
export const songAPI = {
  getSongs: async (params?: { sortBy?: string; filterBy?: string; limit?: number }) => {
    const response = await api.get('/songs', { params });
    return response.data;
  },
  
  getPublicSongs: async (params?: { sortBy?: string; filterBy?: string; limit?: number }) => {
    const response = await api.get('/songs/public', { params });
    return response.data;
  },
  
  uploadSong: async (file: File, metadata: { title: string; artist: string }) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('title', metadata.title);
    formData.append('artist', metadata.artist);
    const response = await api.post('/songs/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  getProfile: async (songId: string) => {
    const response = await api.get(`/songs/${songId}/profile`);
    return response.data;
  },
  
  getComments: async (songId: string, page = 1, limit = 20) => {
    const response = await api.get(`/songs/${songId}/comments?page=${page}&limit=${limit}`);
    return response.data;
  },
  
  createComment: async (songId: string, content: string) => {
    const response = await api.post(`/songs/${songId}/comments`, { content });
    return response.data;
  },
  
  likeComment: async (commentId: string) => {
    const response = await api.post(`/comments/${commentId}/like`);
    return response.data;
  },
  
  deleteComment: async (commentId: string) => {
    const response = await api.delete(`/comments/${commentId}`);
    return response.data;
  },
};

// Search API
export const searchAPI = {
  search: async (query: string, source: string = 'youtube', pageToken?: string, accessToken?: string, forceExternal?: boolean) => {
    const params: any = { query, source, pageToken };
    if (accessToken) {
      params.accessToken = accessToken;
    }
    if (forceExternal) {
      params.forceExternal = 'true';
    }
    const response = await api.get('/search', { params });
    return response.data;
  },
};

// Top Tunes API
export const topTunesAPI = {
  getTopTunes: async (sortBy: string = 'globalBidValue', limit: number = 10) => {
    const response = await api.get('/songs/top-tunes', {
      params: { sortBy, limit },
    });
    return response.data;
  },
};

export const userAPI = {
  getProfile: async (userId: string) => {
    const response = await api.get(`/users/${userId}/profile`);
    return response.data;
  },
};


export default api;
