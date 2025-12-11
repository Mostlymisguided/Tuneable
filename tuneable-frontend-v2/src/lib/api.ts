import axios from 'axios';

// Define types directly to avoid import issues
interface User {
  id: string;
  uuid?: string; // UUIDv7 for external API
  username: string;
  email: string;
  profilePic?: string;
  personalInviteCode: string; // Legacy - kept for backward compatibility
  personalInviteCodes?: Array<{
    _id: string;
    code: string;
    label?: string;
    isActive: boolean;
    createdAt: string;
    usageCount: number;
  }>;
  primaryInviteCode?: string;
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
  emailVerified?: boolean;
  oauthVerified?: {
    facebook?: boolean;
    soundcloud?: boolean;
    google?: boolean;
    instagram?: boolean;
  };
  creatorProfile?: {
    artistName?: string;
    verificationStatus?: 'pending' | 'verified' | 'rejected';
    bio?: string;
    genres?: string[];
    roles?: string[];
    website?: string;
    socialMedia?: Record<string, string>;
    label?: string;
    management?: string;
    distributor?: string;
    reviewNotes?: string;
    verifiedBy?: string;
    verifiedAt?: Date;
    submittedAt?: Date;
  };
}

interface Party {
  _id?: string; // MongoDB ObjectId (from backend)
  id?: string; // Transformed ID (may be _id or uuid)
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
  type: 'remote' | 'live' | 'global' | 'tag' | 'location';
  status: 'scheduled' | 'active' | 'ended';
  watershed: boolean;
  minimumBid?: number;
  mediaSource?: 'youtube' | 'direct_upload';
  locationFilter?: {
    city?: string;
    region?: string;
    country?: string;
    countryCode?: string;
  };
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
    // Only redirect on 401 if it's not a login/register attempt
    // Login/register endpoints handle their own 401 errors
    if (error.response?.status === 401) {
      const isAuthEndpoint = error.config?.url?.includes('/users/login') || 
                             error.config?.url?.includes('/users/register');
      
      // Only redirect if user had a token (meaning they were authenticated but token expired/invalid)
      // If no token exists, the route might be public and we shouldn't redirect
      const hadToken = localStorage.getItem('token');
      
      if (!isAuthEndpoint && hadToken) {
        // Clear auth data and redirect to login for other endpoints
        // Only do this if user was previously authenticated (had a token)
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        // Add a small delay to allow any error messages to be displayed first
        setTimeout(() => {
          window.location.href = '/login?expired=true';
        }, 100);
      }
      // If no token existed, don't redirect - let the component handle the error
      // This allows public routes (party details, tune profiles) to work without auth
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
  
  getReferrals: async (code?: string) => {
    const params = code ? { code } : {};
    const response = await api.get('/users/referrals', { params });
    return response.data;
  },

  // Invite code management
  createInviteCode: async (label?: string) => {
    const response = await api.post('/users/invite-codes', { label });
    return response.data;
  },

  updateInviteCode: async (codeId: string, updates: { isActive?: boolean; label?: string }) => {
    const response = await api.patch(`/users/invite-codes/${codeId}`, updates);
    return response.data;
  },

  deleteInviteCode: async (codeId: string) => {
    const response = await api.delete(`/users/invite-codes/${codeId}`);
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
  createCheckoutSession: async (amount: number, currency: string = 'gbp', totalCharge?: number) => {
    const response = await api.post('/payments/create-checkout-session', {
      amount, // Amount to add to wallet
      totalCharge, // Total amount to charge (including fees) - if not provided, uses amount
      currency,
    });
    return response.data;
  },
  
  // Create checkout session for share purchases (uses live Stripe mode)
  createShareCheckoutSession: async (amount: number, currency: string = 'gbp', packageId?: string, shares?: number) => {
    const response = await api.post('/payments/create-share-checkout-session', {
      amount,
      currency,
      packageId,
      shares,
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
  
  searchByCode: async (code: string): Promise<{ party: any }> => {
    const response = await api.get(`/parties/search-by-code/${code}`);
    return response.data;
  },
  
  findLocationParty: async (countryCode: string, city?: string): Promise<{ party: Party | null }> => {
    const url = city 
      ? `/parties/location/${countryCode}/${encodeURIComponent(city)}`
      : `/parties/location/${countryCode}`;
    try {
      const response = await api.get(url);
      return response.data;
    } catch (error: any) {
      if (error.response?.status === 404) {
        return { party: null };
      }
      throw error;
    }
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
  
  followParty: async (partyId: string) => {
    const response = await api.post(`/parties/${partyId}/follow`);
    return response.data;
  },
  
  unfollowParty: async (partyId: string) => {
    const response = await api.delete(`/parties/${partyId}/follow`);
    return response.data;
  },
  
  addMediaToParty: async (partyId: string, mediaData: any) => {
    const response = await api.post(`/parties/${partyId}/media/add`, mediaData);
    return response.data;
  },
  
  placeBid: async (partyId: string, mediaId: string, bidAmount: number, tags?: string[]) => {
    const response = await api.post(`/parties/${partyId}/media/${mediaId}/bid`, {
      bidAmount,
      ...(tags && tags.length > 0 ? { tags } : {})
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
  
  vetoMedia: async (partyId: string, mediaId: string, reason?: string) => {
    const response = await api.post(`/parties/${partyId}/media/veto`, {
      mediaId,
      reason,
    });
    return response.data;
  },
  
  unvetoMedia: async (partyId: string, mediaId: string) => {
    const response = await api.post(`/parties/${partyId}/media/${mediaId}/unveto`);
    return response.data;
  },
  
  removeTip: async (partyId: string, bidId: string) => {
    const response = await api.post(`/parties/${partyId}/bids/${bidId}/remove`);
    return response.data;
  },
  
  requestRefund: async (partyId: string, bidId: string, reason: string) => {
    const response = await api.post(`/parties/${partyId}/bids/${bidId}/request-refund`, {
      reason
    });
    return response.data;
  },
  
  kickUser: async (partyId: string, userId: string, reason?: string) => {
    const response = await api.post(`/parties/${partyId}/kick/${userId}`, { reason });
    return response.data;
  },
  
  unkickUser: async (partyId: string, userId: string) => {
    const response = await api.post(`/parties/${partyId}/unkick/${userId}`);
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

  // Admin: Get all media with filtering
  getAllMedia: async (params?: {
    page?: number;
    limit?: number;
    sortBy?: 'uploadedAt' | 'title' | 'globalMediaAggregate' | 'globalMediaBidTop' | 'playCount' | 'popularity' | 'createdAt' | 'duration' | 'fileSize' | 'artist';
    sortOrder?: 'asc' | 'desc';
    contentType?: string | string[];
    contentForm?: string | string[];
    search?: string;
    addedBy?: string;
    labelId?: string;
    rightsCleared?: boolean;
    dateFrom?: string;
    dateTo?: string;
  }) => {
    const response = await api.get('/media/admin/all', { params });
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

  // Upload cover art for existing media
  uploadCoverArt: async (mediaId: string, file: File) => {
    const formData = new FormData();
    formData.append('coverArtFile', file);
    const response = await api.put(`/media/${mediaId}/cover-art`, formData);
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
    // Use regular endpoint which supports all field updates (tags, genres, elements, etc.)
    // This endpoint checks permissions: admin OR media owner OR verified creator
    const response = await api.put(`/media/${mediaId}`, updates);
    return response.data;
  },

  getOwnership: async (mediaId: string) => {
    const response = await api.get(`/media/${mediaId}/ownership`);
    return response.data;
  },

  updateOwnership: async (
    mediaId: string,
    payload: {
      owners: Array<{
        userId: string;
        ownershipPercentage: number;
        role?: string;
        verifiedAt?: string | null;
        verifiedBy?: string | null;
        verificationMethod?: string | null;
        verificationNotes?: string | null;
        verificationSource?: string | null;
        addedAt?: string | null;
        addedBy?: string | null;
      }>;
      note?: string;
    }
  ) => {
    const response = await api.put(`/media/${mediaId}/ownership`, payload);
    return response.data;
  },

  // Global veto (admin only)
  vetoMedia: async (mediaId: string, reason?: string) => {
    const response = await api.post(`/media/${mediaId}/veto`, { reason });
    return response.data;
  },

  unvetoMedia: async (mediaId: string) => {
    const response = await api.post(`/media/${mediaId}/unveto`);
    return response.data;
  },

  getVetoedMedia: async (params?: {
    page?: number;
    limit?: number;
    sortBy?: 'vetoedAt' | 'title';
    sortOrder?: 'asc' | 'desc';
  }) => {
    const response = await api.get('/media/vetoed', { params });
    return response.data;
  },

  // Place global bid (chart support)
  placeGlobalBid: async (mediaId: string, amount: number, externalMedia?: {
    title: string;
    artist: string;
    coverArt?: string | null;
    duration?: number;
    category?: string;
    tags?: string[];
    sources: Record<string, string>;
  }) => {
    const payload = externalMedia ? { amount, externalMedia } : { amount };
    const response = await api.post(`/media/${mediaId}/global-bid`, payload);
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

  // Report a media item (legacy - use reportAPI.reportMedia instead)
  reportMedia: async (mediaId: string, reportData: { category: string; description: string; contactEmail?: string }) => {
    const response = await api.post(`/reports/media/${mediaId}/report`, reportData);
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

  // Get quota status
  getQuotaStatus: async () => {
    const response = await api.get('/search/quota-status');
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
  
  // Get user's warnings
  getWarnings: async (userId?: string) => {
    const params = userId ? { userId } : {};
    const response = await api.get('/users/warnings', { params });
    return response.data;
  },

  // Acknowledge a warning
  acknowledgeWarning: async (warningIndex: number) => {
    const response = await api.post(`/users/warnings/${warningIndex}/acknowledge`);
    return response.data;
  },

  // Admin: Issue warning to user
  issueWarning: async (userId: string, type: string, message: string, reason?: string, expiresInDays?: number) => {
    const response = await api.post('/users/admin/warnings', {
      userId,
      type,
      message,
      reason,
      expiresInDays
    });
    return response.data;
  },

  // Admin: Get all warnings for a user
  getUserWarnings: async (userId: string) => {
    const response = await api.get(`/users/admin/users/${userId}/warnings`);
    return response.data;
  },

  // Admin: Unlock user account
  unlockUserAccount: async (userId: string) => {
    const response = await api.post(`/users/admin/users/${userId}/unlock`);
    return response.data;
  },

  // Admin: Revoke/Delete warning
  revokeWarning: async (userId: string, warningIndex: number) => {
    const response = await api.delete(`/users/admin/users/${userId}/warnings/${warningIndex}`);
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

  // Update migration preference (beta mode)
  updateMigrationPreference: async (preference: 'transfer' | 'fresh') => {
    const response = await api.put('/users/migration-preference', { migrationPreference: preference });
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

  // Get user's tune library (all media they've bid on)
  getTuneLibrary: async () => {
    const response = await api.get('/users/me/tune-library');
    return response.data;
  },

  // Get user's tip history (all individual bids/tips)
  getTipHistory: async (params?: {
    partyId?: string;
    mediaId?: string;
    status?: 'active' | 'vetoed' | 'refunded';
    startDate?: string;
    endDate?: string;
    bidScope?: 'party' | 'global';
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }) => {
    const response = await api.get('/users/me/tip-history', { params });
    return response.data;
  },

  // Get user's wallet transaction history
  getWalletHistory: async (params?: {
    type?: 'topup' | 'refund' | 'adjustment' | 'beta_credit' | 'gift';
    status?: 'pending' | 'completed' | 'failed' | 'refunded';
    paymentMethod?: 'stripe' | 'manual' | 'beta' | 'gift';
    startDate?: string;
    endDate?: string;
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }) => {
    const response = await api.get('/users/me/wallet-history', { params });
    return response.data;
  },

  // Get creator stats (for creators/admins)
  getCreatorStats: async () => {
    const response = await api.get('/users/me/creator-stats');
    return response.data;
  },

  // Get user's owned media (media where user is mediaOwner)
  getMyMedia: async (params?: {
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }) => {
    const response = await api.get('/users/me/my-media', { params });
    return response.data;
  },

  getCollectiveMemberships: async () => {
    const response = await api.get('/users/me/collective-memberships');
    return response.data;
  },

  getLabelAffiliations: async () => {
    const response = await api.get('/users/me/labels');
    return response.data;
  },

  // Admin: Get vetoed bids
  getVetoedBids: async (params?: {
    page?: number;
    limit?: number;
    sortBy?: 'vetoedAt' | 'createdAt' | 'amount';
    sortOrder?: 'asc' | 'desc';
  }) => {
    const response = await api.get('/users/admin/bids/vetoed', { params });
    return response.data;
  },

  // Admin: Get all vetoes (global, party, and bid vetoes)
  getAllVetoes: async (params?: {
    page?: number;
    limit?: number;
    type?: 'all' | 'global' | 'party' | 'bid';
    sortBy?: 'vetoedAt';
    sortOrder?: 'asc' | 'desc';
  }) => {
    const response = await api.get('/users/admin/vetoes', { params });
    return response.data;
  },

  // Admin: Get all bids with filtering
  getAllBids: async (params?: {
    page?: number;
    limit?: number;
    sortBy?: 'createdAt' | 'amount' | 'vetoedAt' | 'username' | 'mediaTitle' | 'partyName';
    sortOrder?: 'asc' | 'desc';
    status?: 'active' | 'vetoed' | 'refunded';
    userId?: string;
    partyId?: string;
    mediaId?: string;
    search?: string;
    bidScope?: 'party' | 'global';
    dateFrom?: string;
    dateTo?: string;
  }) => {
    const response = await api.get('/users/admin/bids', { params });
    return response.data;
  },

  // Admin: Veto a single bid
  vetoBid: async (bidId: string, reason?: string) => {
    const response = await api.post(`/users/admin/bids/${bidId}/veto`, { reason });
    return response.data;
  },

  // Search users by username or email
  searchUsers: async (params?: {
    search?: string;
    limit?: number;
  }) => {
    const response = await api.get('/users/search', { params });
    return response.data;
  },
};

export const labelAPI = {
  // Get all labels (public)
  getLabels: async (params?: {
    page?: number;
    limit?: number;
    genre?: string;
    sortBy?: 'globalLabelAggregate' | 'totalBidAmount' | 'artistCount' | 'name';
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
    sortBy?: 'releaseDate' | 'globalMediaAggregate' | 'totalBidAmount';
    sortOrder?: 'asc' | 'desc';
  }) => {
    const response = await api.get(`/labels/${slug}/media`, { params });
    return response.data;
  },

  // Get label team roster (owners/admins/members)
  getTeam: async (slug: string) => {
    const response = await api.get(`/labels/${slug}/team`);
    return response.data;
  },

  // Invite admin to label (owners only)
  inviteAdmin: async (slug: string, data: { userId?: string; email?: string }) => {
    const response = await api.post(`/labels/${slug}/invite-admin`, data);
    return response.data;
  },

  // Invite artist to label (owners and admins)
  inviteArtist: async (slug: string, data: { userId?: string; email?: string; role?: 'artist' | 'producer' | 'manager' | 'staff' }) => {
    const response = await api.post(`/labels/${slug}/invite-artist`, data);
    return response.data;
  },

  // Accept label invitation (admin or artist)
  acceptInvite: async (slug: string, inviteType: 'admin' | 'artist') => {
    const response = await api.post(`/labels/${slug}/accept-invite`, { inviteType });
    return response.data;
  },

  // Decline label invitation (admin or artist)
  declineInvite: async (slug: string, inviteType: 'admin' | 'artist') => {
    const response = await api.post(`/labels/${slug}/decline-invite`, { inviteType });
    return response.data;
  },

  // Create label (authenticated)
  createLabel: async (labelData: FormData | {
    name: string;
    description?: string;
    email: string;
    website?: string;
    genres?: string[];
    foundedYear?: number;
  }) => {
    // Handle both FormData (with file upload) and plain object
    const response = labelData instanceof FormData
      ? await api.post('/labels', labelData, {
          headers: {
            'Content-Type': 'multipart/form-data'
          }
        })
      : await api.post('/labels', labelData);
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
    profilePicture?: string;
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
      tiktok?: string;
    };
  }) => {
    const response = await api.put(`/labels/${labelId}`, updates);
    return response.data;
  },

  // Add admin to label (authenticated, owner only)
  addAdmin: async (labelId: string, userId: string, role: 'admin') => {
    const response = await api.post(`/labels/${labelId}/admins`, { userId, role });
    return response.data;
  },

  // Remove admin from label (authenticated, owner only, or self-removal)
  removeAdmin: async (slug: string, userId: string) => {
    const response = await api.delete(`/labels/${slug}/admins/${userId}`);
    return response.data;
  },

  // Remove artist from label (authenticated, admin/owner only, or self-removal)
  removeArtist: async (slug: string, userId: string) => {
    const response = await api.delete(`/labels/${slug}/artists/${userId}`);
    return response.data;
  },

  // Change admin role (authenticated, owner only)
  changeAdminRole: async (slug: string, userId: string, role: 'owner' | 'admin') => {
    const response = await api.patch(`/labels/${slug}/admins/${userId}/role`, { role });
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
    genre?: string;
    search?: string;
    sortBy?: 'name' | 'verificationStatus' | 'globalLabelAggregate' | 'totalBidAmount' | 'artistCount' | 'releaseCount' | 'createdAt' | 'lastBidAt';
    sortOrder?: 'asc' | 'desc';
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

  // Upload label profile picture (authenticated, label admin/owner only)
  uploadProfilePicture: async (labelId: string, file: File) => {
    const formData = new FormData();
    formData.append('profilePicture', file);
    const response = await api.put(`/labels/${labelId}/profile-picture`, formData);
    return response.data;
  },
};

export const collectiveAPI = {
  // Get all collectives (public)
  getCollectives: async (params?: {
    page?: number;
    limit?: number;
    genre?: string;
    type?: 'band' | 'collective' | 'production_company' | 'other';
    sortBy?: 'globalCollectiveAggregate' | 'totalBidAmount' | 'memberCount' | 'name';
    sortOrder?: 'asc' | 'desc';
    search?: string;
  }) => {
    const response = await api.get('/collectives', { params });
    return response.data;
  },

  // Get collective by slug (public)
  getCollectiveBySlug: async (slug: string, refresh?: boolean) => {
    const params = refresh ? { refresh: true } : {};
    const response = await api.get(`/collectives/${slug}`, { params });
    return response.data;
  },

  // Get collective's members (public)
  getCollectiveMembers: async (slug: string) => {
    const response = await api.get(`/collectives/${slug}/members`);
    return response.data;
  },

  // Get collective team roster (founders/admins/members)
  getTeam: async (slug: string) => {
    const response = await api.get(`/collectives/${slug}/team`);
    return response.data;
  },

  // Invite admin to collective (founders only)
  inviteAdmin: async (slug: string, data: { userId?: string; email?: string }) => {
    const response = await api.post(`/collectives/${slug}/invite-admin`, data);
    return response.data;
  },

  // Invite member to collective (founders and admins)
  inviteMember: async (slug: string, data: { userId?: string; email?: string; role?: 'member' | 'admin'; instrument?: string }) => {
    const response = await api.post(`/collectives/${slug}/invite-member`, data);
    return response.data;
  },

  // Remove member from collective (authenticated, founder/admin only, or self-removal)
  removeMember: async (slug: string, userId: string) => {
    const response = await api.delete(`/collectives/${slug}/members/${userId}`);
    return response.data;
  },

  // Change member role (authenticated, founder only)
  changeMemberRole: async (slug: string, userId: string, role: 'founder' | 'admin' | 'member') => {
    const response = await api.patch(`/collectives/${slug}/members/${userId}/role`, { role });
    return response.data;
  },

  // Get collective's media (public)
  getCollectiveMedia: async (slug: string, params?: {
    page?: number;
    limit?: number;
    sortBy?: 'releaseDate' | 'globalMediaAggregate' | 'totalBidAmount';
    sortOrder?: 'asc' | 'desc';
  }) => {
    const response = await api.get(`/collectives/${slug}/media`, { params });
    return response.data;
  },

  // Create collective (authenticated)
  createCollective: async (collectiveData: FormData | {
    name: string;
    description?: string;
    email: string;
    website?: string;
    genres?: string[];
    foundedYear?: number;
    type?: 'band' | 'collective' | 'production_company' | 'other';
  }) => {
    // Handle both FormData (with file upload) and plain object
    const response = collectiveData instanceof FormData
      ? await api.post('/collectives', collectiveData, {
          headers: {
            'Content-Type': 'multipart/form-data'
          }
        })
      : await api.post('/collectives', collectiveData);
    return response.data;
  },

  // Update collective (authenticated, admin/founder only)
  updateCollective: async (collectiveId: string, updates: {
    name?: string;
    description?: string;
    email?: string;
    website?: string;
    genres?: string[];
    foundedYear?: number;
    type?: 'band' | 'collective' | 'production_company' | 'other';
    profilePicture?: string;
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
      tiktok?: string;
    };
  }) => {
    const response = await api.put(`/collectives/${collectiveId}`, updates);
    return response.data;
  },


  // Upload collective profile picture (authenticated, collective admin/founder only)
  uploadProfilePicture: async (collectiveId: string, file: File) => {
    const formData = new FormData();
    formData.append('profilePicture', file);
    const response = await api.put(`/collectives/${collectiveId}/profile-picture`, formData);
    return response.data;
  },

  // Get all collectives (admin only)
  getAllCollectives: async (params?: {
    verificationStatus?: string;
    genre?: string;
    type?: 'band' | 'collective' | 'production_company' | 'other';
    search?: string;
    sortBy?: 'name' | 'verificationStatus' | 'globalCollectiveAggregate' | 'totalBidAmount' | 'memberCount' | 'releaseCount' | 'createdAt' | 'lastBidAt';
    sortOrder?: 'asc' | 'desc';
    page?: number;
    limit?: number;
  }) => {
    const response = await api.get('/collectives/admin/all', { params });
    return response.data;
  },

  // Verify collective (admin only)
  verifyCollective: async (collectiveId: string) => {
    const response = await api.post(`/collectives/${collectiveId}/verify`);
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
  getClaimsForMedia: async (mediaId: string) => {
    const response = await api.get(`/claims/media/${mediaId}`);
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

// Report API
export const reportAPI = {
  // Report a media item
  reportMedia: async (mediaId: string, reportData: { category: string; description: string; contactEmail?: string }) => {
    const response = await api.post(`/reports/media/${mediaId}/report`, reportData);
    return response.data;
  },

  // Report a user
  reportUser: async (userId: string, reportData: { category: string; description: string; contactEmail?: string }) => {
    const response = await api.post(`/reports/users/${userId}/report`, reportData);
    return response.data;
  },

  // Report a label
  reportLabel: async (labelId: string, reportData: { category: string; description: string; contactEmail?: string }) => {
    const response = await api.post(`/reports/labels/${labelId}/report`, reportData);
    return response.data;
  },

  // Report a collective
  reportCollective: async (collectiveId: string, reportData: { category: string; description: string; contactEmail?: string }) => {
    const response = await api.post(`/reports/collectives/${collectiveId}/report`, reportData);
    return response.data;
  },

  // Get all reports (admin only)
  getReports: async (status?: string, category?: string, reportType?: string, limit?: number, skip?: number) => {
    const params: any = {};
    if (status) params.status = status;
    if (category) params.category = category;
    if (reportType) params.reportType = reportType;
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

export const emailAPI = {
  confirmVerification: async (token: string) => {
    const response = await api.post('/email/verify/confirm', { token });
    return response.data;
  },

  resendVerification: async () => {
    const response = await api.post('/email/verify/send');
    return response.data;
  },

  sendInvite: async (emails: string[]) => {
    const response = await api.post('/email/invite', { emails });
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

export const artistEscrowAPI = {
  // Get artist escrow balance and history
  getInfo: async () => {
    const response = await api.get('/artist-escrow/info');
    return response.data;
  },

  // Match unknown artist allocations to current user
  match: async (artistName: string, youtubeChannelId?: string, externalIds?: Record<string, string>) => {
    const response = await api.post('/artist-escrow/match', {
      artistName,
      youtubeChannelId,
      externalIds
    });
    return response.data;
  },

  // Request payout (manual processing for MVP)
  requestPayout: async (amount?: number, payoutMethod?: string, payoutDetails?: Record<string, any>) => {
    const response = await api.post('/artist-escrow/request-payout', {
      amount,
      payoutMethod,
      payoutDetails
    });
    return response.data;
  },

  // Get escrow statistics
  getStats: async () => {
    const response = await api.get('/artist-escrow/stats');
    return response.data;
  },

  // Admin: Get all payout requests (with optional status filter)
  getPayouts: async (status?: 'pending' | 'processing' | 'completed' | 'rejected' | 'all') => {
    const params = status ? { status } : {};
    const response = await api.get('/artist-escrow/admin/payouts', { params });
    return response.data;
  },

  // Admin: Process a payout (complete or reject)
  processPayout: async (requestId: string, status: 'completed' | 'rejected', payoutMethod?: string, payoutDetails?: Record<string, any>, notes?: string) => {
    const response = await api.post('/artist-escrow/admin/process-payout', {
      requestId,
      status,
      payoutMethod,
      payoutDetails,
      notes
    });
    return response.data;
  },
};

export const ledgerAPI = {
  // Get ledger statistics for dashboard
  getStats: async () => {
    const response = await api.get('/ledger/stats');
    return response.data;
  },

  // Get ledger entries with filtering and pagination
  getEntries: async (params?: {
    transactionType?: 'TIP' | 'REFUND' | 'TOP_UP' | 'PAY_OUT';
    userId?: string;
    mediaId?: string;
    startDate?: string;
    endDate?: string;
    minAmount?: number;
    maxAmount?: number;
    sortBy?: string;
    sortDirection?: 'asc' | 'desc';
    page?: number;
    limit?: number;
    search?: string;
  }) => {
    const response = await api.get('/ledger/entries', { params });
    return response.data;
  },

  // Get single ledger entry details
  getEntry: async (entryId: string) => {
    const response = await api.get(`/ledger/entry/${entryId}`);
    return response.data;
  },

  // Get user's ledger history
  getUserLedger: async (userId: string, limit = 100) => {
    const response = await api.get(`/ledger/user/${userId}`, {
      params: { limit }
    });
    return response.data;
  },

  // Get media's ledger history
  getMediaLedger: async (mediaId: string, limit = 100) => {
    const response = await api.get(`/ledger/media/${mediaId}`, {
      params: { limit }
    });
    return response.data;
  },

  // Verify ledger integrity
  verifyIntegrity: async (limit = 1000) => {
    const response = await api.post('/ledger/verify', { limit });
    return response.data;
  },

  // Search ledger entries
  search: async (query: string, type: 'all' | 'uuid' | 'sequence' | 'hash' | 'user' | 'media' = 'all') => {
    const response = await api.get('/ledger/search', {
      params: { q: query, type }
    });
    return response.data;
  },

  // Reconcile user balance or media aggregate with ledger
  reconcile: async (params: { userId?: string; mediaId?: string }) => {
    const response = await api.get('/ledger/reconciliation', { params });
    return response.data;
  },

  // Admin: Get all payout requests (with optional status filter)
  getPayouts: async (status?: 'pending' | 'processing' | 'completed' | 'rejected' | 'all') => {
    const params = status ? { status } : {};
    const response = await api.get('/artist-escrow/admin/payouts', { params });
    return response.data;
  },

  // Admin: Process a payout (complete or reject)
  processPayout: async (requestId: string, status: 'completed' | 'rejected', payoutMethod?: string, payoutDetails?: Record<string, any>, notes?: string) => {
    const response = await api.post('/artist-escrow/admin/process-payout', {
      requestId,
      status,
      payoutMethod,
      payoutDetails,
      notes
    });
    return response.data;
  },

  // Admin: Get unclaimed allocations
  getUnclaimed: async () => {
    const response = await api.get('/artist-escrow/admin/unclaimed');
    return response.data;
  },
};

export default api;
