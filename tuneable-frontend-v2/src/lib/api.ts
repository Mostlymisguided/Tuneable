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
  inviteCredits?: number;
  tuneBytes?: number;
  homeLocation?: {
    city?: string;
    region?: string;
    country?: string;
    countryCode?: string;
    coordinates?: {
      lat: number;
      lng: number;
    };
    detectedFromIP?: boolean;
  };
  secondaryLocation?: {
    city?: string;
    region?: string;
    country?: string;
    countryCode?: string;
    coordinates?: {
      lat: number;
      lng: number;
    };
  } | null;
  role: string[];
  isActive: boolean;
  joinedParties?: {
    partyId: string;
    joinedAt: string;
    role: 'partier' | 'host' | 'moderator';
  }[];
  globalUserAggregateRank?: number;
  globalUserBidAvg?: number;
  globalUserBids?: number;
}

interface Party {
  id: string;
  name: string;
  location: string;
  host: string | { id: string; username: string; uuid?: string; userId?: string; _id?: string };
  partyCode: string;
  partiers: (string | { id: string; username: string; uuid?: string; userId?: string; _id?: string })[];
  media: any[];
  songs?: any[]; // Legacy support during migration
  startTime: string;
  endTime?: string;
  privacy: 'public' | 'private';
  type: 'remote' | 'live' | 'global';
  status: 'scheduled' | 'active' | 'ended';
  watershed: boolean;
  createdAt: string;
  updatedAt: string;
  host_uuid?: string; // UUID reference for host
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
  
  // Don't set Content-Type for FormData - let browser handle it automatically with boundary
  if (config.data instanceof FormData) {
    delete config.headers['Content-Type'];
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
    // Don't set Content-Type manually - let axios/browser handle it automatically
    // This ensures the boundary parameter is included correctly
    const response = await api.put('/users/profile-pic', formData);
    return response.data;
  },
  
  refreshToken: async () => {
    const response = await api.post('/auth/refresh');
    return response.data;
  },
  
  getReferrals: async () => {
    const response = await api.get('/users/referrals');
    return response.data;
  },

  // Password reset
  requestPasswordReset: async (email: string) => {
    const response = await api.post('/email/password-reset/request', { email });
    return response.data;
  },

  confirmPasswordReset: async (token: string, newPassword: string) => {
    const response = await api.post('/email/password-reset/confirm', { token, newPassword });
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
  
  // Admin: Get party statistics
  getStats: async () => {
    const response = await api.get('/parties/admin/stats');
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
  
  searchPartyQueue: async (partyId: string, query: string) => {
    const response = await api.get(`/parties/${partyId}/search`, {
      params: { q: query }
    });
    return response.data;
  },
  
  playSong: async (partyId: string, songId: string) => {
    const response = await api.post(`/parties/${partyId}/media/${songId}/play`);
    return response.data;
  },
  
  // Media playback control
  completeMedia: async (partyId: string, mediaId: string) => {
    const response = await api.post(`/parties/${partyId}/media/${mediaId}/complete`);
    return response.data;
  },
  
  removeMedia: async (partyId: string, mediaId: string) => {
    const response = await api.delete(`/parties/${partyId}/media/${mediaId}`);
    return response.data;
  },
  
  vetoMedia: async (partyId: string, mediaId: string) => {
    const response = await api.put(`/parties/${partyId}/media/${mediaId}/veto`);
    return response.data;
  },
  
  unvetoMedia: async (partyId: string, mediaId: string) => {
    const response = await api.put(`/parties/${partyId}/media/${mediaId}/unveto`);
    return response.data;
  },
  
  resetMedia: async (partyId: string) => {
    const response = await api.post(`/parties/${partyId}/media/reset`);
    return response.data;
  },
  
  // Legacy aliases for backwards compatibility
  completeSong: async (partyId: string, songId: string) => {
    return partyAPI.completeMedia(partyId, songId);
  },
  removeSong: async (partyId: string, songId: string) => {
    return partyAPI.removeMedia(partyId, songId);
  },
  vetoSong: async (partyId: string, songId: string) => {
    return partyAPI.vetoMedia(partyId, songId);
  },
  unvetoSong: async (partyId: string, songId: string) => {
    return partyAPI.unvetoMedia(partyId, songId);
  },
  resetSongs: async (partyId: string) => {
    return partyAPI.resetMedia(partyId);
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
  
  getMediaSortedByTime: async (partyId: string, timePeriod: string) => {
    const response = await api.get(`/parties/${partyId}/media/sorted/${timePeriod}`);
    return response.data;
  },
  
  // Legacy alias
  getSongsSortedByTime: async (partyId: string, timePeriod: string) => {
    return partyAPI.getMediaSortedByTime(partyId, timePeriod);
  },
};

// Media API
export const mediaAPI = {
  getMedia: async (params?: { sortBy?: string; filterBy?: string; limit?: number }) => {
    const response = await api.get('/media', { params });
    return response.data;
  },
  
  getPublicMedia: async (params?: { sortBy?: string; filterBy?: string; limit?: number }) => {
    const response = await api.get('/media/public', { params });
    return response.data;
  },

  // Admin: Get media statistics
  getStats: async () => {
    const response = await api.get('/media/admin/stats');
    return response.data;
  },
  
  uploadMedia: async (file: File, metadata: { title: string; artist: string }) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('title', metadata.title);
    formData.append('artist', metadata.artist);
    const response = await api.post('/media/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  getProfile: async (mediaId: string) => {
    const response = await api.get(`/media/${mediaId}/profile`);
    return response.data;
  },
  
  getComments: async (mediaId: string, page = 1, limit = 20) => {
    const response = await api.get(`/media/${mediaId}/comments?page=${page}&limit=${limit}`);
    return response.data;
  },
  
  createComment: async (mediaId: string, content: string) => {
    const response = await api.post(`/media/${mediaId}/comments`, { content });
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

  updateMedia: async (mediaId: string, updates: {
    title?: string;
    artist?: string;
    producer?: string;
    featuring?: string[];
    album?: string;
    genre?: string;
    releaseDate?: string;
    duration?: number;
    explicit?: boolean;
    isrc?: string;
    upc?: string;
    bpm?: number;
    pitch?: number;
    key?: string;
    elements?: string[];
    tags?: string[];
    category?: string;
    timeSignature?: string;
    lyrics?: string;
    rightsHolder?: string;
    rightsHolderEmail?: string;
    description?: string;
    sources?: { [key: string]: string };
  }) => {
    const response = await api.put(`/media/${mediaId}`, updates);
    return response.data;
  },

  // Place global bid (chart support)
  placeGlobalBid: async (mediaId: string, amount: number) => {
    const response = await api.post(`/media/${mediaId}/global-bid`, { amount });
    return response.data;
  },

  // Get top parties for media
  getTopPartiesForMedia: async (mediaId: string) => {
    const response = await api.get(`/media/${mediaId}/top-parties`);
    return response.data;
  },

  // Get tag rankings for media
  getTagRankings: async (mediaId: string) => {
    const response = await api.get(`/media/${mediaId}/tag-rankings`);
    return response.data;
  },

  // Report a media item
  reportMedia: async (mediaId: string, reportData: { category: string; description: string; contactEmail?: string }) => {
    const response = await api.post(`/reports/${mediaId}/report`, reportData);
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
  
  searchByYouTubeUrl: async (url: string) => {
    const response = await api.get('/search/youtube-url', {
      params: { url }
    });
    return response.data;
  },
};

// Top Tunes API
export const topTunesAPI = {
  getTopTunes: async (sortBy: string = 'globalMediaAggregate', limit: number = 10, timePeriod: string = 'all-time', search?: string, tags?: string[]) => {
    const params: any = { sortBy, limit, timePeriod };
    if (search) params.search = search;
    if (tags && tags.length > 0) params.tags = tags;
    
    const response = await api.get('/media/top-tunes', { params });
    return response.data;
  },
};

export const userAPI = {
  getProfile: async (userId: string) => {
    const response = await api.get(`/users/${userId}/profile`);
    return response.data;
  },

  // Detect user location from IP address
  detectLocation: async () => {
    const response = await api.get('/users/detect-location');
    return response.data;
  },

  // Update social media URL
  updateSocialMedia: async (platform: string, url: string) => {
    const response = await api.put('/users/profile/social-media', { platform, url });
    return response.data;
  },
  
  // Admin: Get all users (admin only)
  getAllUsers: async (limit?: number, skip?: number, search?: string) => {
    const params: any = {};
    if (limit) params.limit = limit;
    if (skip) params.skip = skip;
    if (search) params.search = search;
    const response = await api.get('/users/admin/all', { params });
    return response.data;
  },

  // Admin: Get invite requests
  getInviteRequests: async (status?: string) => {
    const params = status ? { status } : {};
    const response = await api.get('/users/admin/invite-requests', { params });
    return response.data;
  },
  
  // Admin: Approve invite request
  approveInviteRequest: async (requestId: string) => {
    const response = await api.patch(`/users/admin/invite-requests/${requestId}/approve`);
    return response.data;
  },
  
  // Admin: Reject invite request
  rejectInviteRequest: async (requestId: string, reason?: string) => {
    const response = await api.patch(`/users/admin/invite-requests/${requestId}/reject`, { reason });
    return response.data;
  },
  
  // Get user's tag rankings
  getTagRankings: async (userId: string, limit?: number) => {
    const params = limit ? { limit } : {};
    const response = await api.get(`/users/${userId}/tag-rankings`, { params });
    return response.data;
  },

  // Update notification preferences
  updateNotificationPreferences: async (preferences: {
    bid_received?: boolean;
    bid_outbid?: boolean;
    comment_reply?: boolean;
    tune_bytes_earned?: boolean;
    email?: boolean;
    anonymousMode?: boolean;
  }) => {
    const response = await api.put('/users/notification-preferences', preferences);
    return response.data;
  },

  // Get list of users invited by current user
  getInvitedUsers: async () => {
    const response = await api.get('/users/invited');
    return response.data;
  },

  // Admin: Replenish invite credits for a user
  replenishInviteCredits: async (userId: string, credits: number) => {
    const response = await api.post('/users/admin/replenish-invite-credits', { userId, credits });
    return response.data;
  },
};

export const labelAPI = {
  // Get all labels (public)
  getLabels: async (params?: {
    page?: number;
    limit?: number;
    genre?: string;
    sortBy?: 'totalBidAmount' | 'artistCount' | 'name';
    sortOrder?: 'asc' | 'desc';
    search?: string;
  }) => {
    const response = await api.get('/labels', { params });
    return response.data;
  },

  // Get label by slug (public)
  getLabelBySlug: async (slug: string, refresh?: boolean) => {
    const params = refresh ? { refresh: true } : {};
    const response = await api.get(`/labels/${slug}`, { params });
    return response.data;
  },

  // Get label's artists (public)
  getLabelArtists: async (slug: string) => {
    const response = await api.get(`/labels/${slug}/artists`);
    return response.data;
  },

  // Get label's media (public)
  getLabelMedia: async (slug: string, params?: {
    page?: number;
    limit?: number;
    sortBy?: 'releaseDate' | 'totalBidAmount';
    sortOrder?: 'asc' | 'desc';
  }) => {
    const response = await api.get(`/labels/${slug}/media`, { params });
    return response.data;
  },

  // Create label (authenticated)
  createLabel: async (labelData: {
    name: string;
    description?: string;
    email: string;
    website?: string;
    genres?: string[];
    foundedYear?: number;
  }) => {
    const response = await api.post('/labels', labelData);
    return response.data;
  },

  // Update label (authenticated, admin only)
  updateLabel: async (labelId: string, updates: {
    name?: string;
    description?: string;
    email?: string;
    website?: string;
    genres?: string[];
    foundedYear?: number;
    logo?: string;
    coverImage?: string;
    location?: {
      city?: string;
      country?: string;
      coordinates?: {
        lat: number;
        lng: number;
      };
    };
    socialMedia?: {
      instagram?: string;
      facebook?: string;
      soundcloud?: string;
      spotify?: string;
      youtube?: string;
      twitter?: string;
      tiktok?: string;
    };
  }) => {
    const response = await api.put(`/labels/${labelId}`, updates);
    return response.data;
  },

  // Add admin to label (authenticated, owner only)
  addAdmin: async (labelId: string, userId: string, role: 'admin' | 'moderator') => {
    const response = await api.post(`/labels/${labelId}/admins`, { userId, role });
    return response.data;
  },

  // Remove admin from label (authenticated, owner only)
  removeAdmin: async (labelId: string, userId: string) => {
    const response = await api.delete(`/labels/${labelId}/admins/${userId}`);
    return response.data;
  },

  // Admin: Verify label
  verifyLabel: async (labelId: string) => {
    const response = await api.post(`/labels/${labelId}/verify`);
    return response.data;
  },

  // Admin: Get all labels
  getAllLabels: async (params?: {
    verificationStatus?: string;
    page?: number;
    limit?: number;
  }) => {
    const response = await api.get('/labels/admin/all', { params });
    return response.data;
  },

  // Admin: Recalculate label stats
  recalculateStats: async (labelId?: string) => {
    const response = await api.post('/labels/admin/recalculate-stats', { labelId });
    return response.data;
  },

  // Upload label logo (authenticated, label admin/owner only)
  uploadLogo: async (labelId: string, file: File) => {
    const formData = new FormData();
    formData.append('logo', file);
    const response = await api.put(`/labels/${labelId}/logo`, formData);
    return response.data;
  },
};

export const claimAPI = {
  submitClaim: async (formData: FormData) => {
    const response = await api.post('/claims/submit', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },
  
  getMyClaims: async () => {
    const response = await api.get('/claims/my-claims');
    return response.data;
  },
  
  // Admin only
  getAllClaims: async (status?: string) => {
    const params = status ? { status } : {};
    const response = await api.get('/claims/all', { params });
    return response.data;
  },
  
  // Admin only
  reviewClaim: async (claimId: string, status: 'approved' | 'rejected', reviewNotes?: string) => {
    const response = await api.patch(`/claims/${claimId}/review`, { status, reviewNotes });
    return response.data;
  },
};

export const creatorAPI = {
  // Submit creator application
  apply: async (formData: FormData) => {
    const response = await api.post('/creator/apply', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },
  
  // Get creator status
  getStatus: async () => {
    const response = await api.get('/creator/status');
    return response.data;
  },
  
  // Update creator profile
  updateProfile: async (profileData: any) => {
    const response = await api.patch('/creator/profile', profileData);
    return response.data;
  },
  
  // Admin only: Get all applications
  getAllApplications: async (status?: string) => {
    const params = status ? { status } : {};
    const response = await api.get('/creator/applications', { params });
    return response.data;
  },
  
  // Admin only: Review application
  reviewApplication: async (userId: string, status: 'verified' | 'rejected', reviewNotes?: string) => {
    const response = await api.patch(`/creator/applications/${userId}/review`, { status, reviewNotes });
    return response.data;
  },
};

// Report API (Admin)
export const reportAPI = {
  // Get all reports (admin only)
  getReports: async (status?: string, category?: string, limit?: number, skip?: number) => {
    const params: any = {};
    if (status) params.status = status;
    if (category) params.category = category;
    if (limit) params.limit = limit;
    if (skip) params.skip = skip;
    const response = await api.get('/reports/admin/reports', { params });
    return response.data;
  },

  // Update report status (admin only)
  updateReport: async (reportId: string, updateData: { status?: string; adminNotes?: string }) => {
    const response = await api.patch(`/reports/admin/reports/${reportId}`, updateData);
    return response.data;
  },
};

// TuneBytes API functions
// Notification API
export const notificationAPI = {
  // Get user's notifications
  getNotifications: async (page: number = 1, limit: number = 20, unreadOnly: boolean = false) => {
    const response = await api.get('/notifications', {
      params: { page, limit, unreadOnly }
    });
    return response.data;
  },

  // Get unread count
  getUnreadCount: async () => {
    const response = await api.get('/notifications/unread-count');
    return response.data;
  },

  // Mark notification as read
  markAsRead: async (notificationId: string) => {
    const response = await api.put(`/notifications/${notificationId}/read`);
    return response.data;
  },

  // Mark all notifications as read
  markAllAsRead: async () => {
    const response = await api.put('/notifications/read-all');
    return response.data;
  },

  // Delete notification
  deleteNotification: async (notificationId: string) => {
    const response = await api.delete(`/notifications/${notificationId}`);
    return response.data;
  },

  // Admin: Send notification to user(s)
  sendNotification: async (userIds: string[], title: string, message: string, link?: string, linkText?: string, type: string = 'admin_announcement') => {
    const response = await api.post('/notifications/admin/send', {
      userIds,
      title,
      message,
      link,
      linkText,
      type
    });
    return response.data;
  },

  // Admin: Broadcast notification to all users
  broadcastNotification: async (title: string, message: string, link?: string, linkText?: string, type: string = 'admin_announcement') => {
    const response = await api.post('/notifications/admin/broadcast', {
      title,
      message,
      link,
      linkText,
      type
    });
    return response.data;
  },
};

export const tuneBytesAPI = {
  // Get user's TuneBytes statistics
  getStats: async (userId: string) => {
    const response = await api.get(`/users/${userId}/tunebytes`);
    return response.data;
  },

  // Get user's TuneBytes transaction history
  getHistory: async (userId: string, limit = 50, offset = 0) => {
    const response = await api.get(`/users/${userId}/tunebytes/history`, {
      params: { limit, offset }
    });
    return response.data;
  },

  // Recalculate TuneBytes for a media item (admin only)
  recalculate: async (userId: string, mediaId: string) => {
    const response = await api.post(`/users/${userId}/tunebytes/recalculate`, {
      mediaId
    });
    return response.data;
  },
};

export default api;
