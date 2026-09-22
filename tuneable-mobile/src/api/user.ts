import { api } from './client';
import type {
  ChampionTitlesResponse,
  TuneBytesTagRankingsResponse,
  User,
  UserLibraryResponse,
  UserProfileResponse,
} from '@/src/types/user';

export type BlockedUser = {
  id: string;
  uuid?: string;
  _id?: string;
  username?: string;
  profilePic?: string;
};

export type SpotifyImportAccess = {
  connected: boolean;
  oauthAvailable?: boolean;
  publicImport?: boolean;
  request?: {
    id?: string;
    status: 'pending' | 'allowlisted' | 'rejected';
    spotifyAccount?: string | null;
    createdAt?: string | null;
  } | null;
};

export const userAPI = {
  getProfileById: async (userId: string): Promise<UserProfileResponse> => {
    const response = await api.get<UserProfileResponse>(`/users/${userId}/profile`);
    return response.data;
  },

  getTuneLibrary: async (): Promise<UserLibraryResponse> => {
    const response = await api.get<UserLibraryResponse>('/users/me/tune-library');
    return response.data;
  },

  getTuneLibraryByUserId: async (userId: string): Promise<UserLibraryResponse> => {
    const response = await api.get<UserLibraryResponse>(`/users/${userId}/tune-library`);
    return response.data;
  },

  getTuneBytesTagRankings: async (
    userId: string,
    limit = 5
  ): Promise<TuneBytesTagRankingsResponse> => {
    const response = await api.get<TuneBytesTagRankingsResponse>(
      `/users/${userId}/tunebytes-tag-rankings`,
      { params: { limit } }
    );
    return response.data;
  },

  getChampionTitles: async (
    userId: string,
    params?: {
      mediaLimit?: number;
      checkMediaLimit?: number;
      tagLimit?: number;
      checkTagLimit?: number;
      locationPlaceId?: string;
      badgeLimit?: number;
    }
  ): Promise<ChampionTitlesResponse> => {
    const response = await api.get<ChampionTitlesResponse>(
      `/users/${userId}/champion-titles`,
      { params }
    );
    return response.data;
  },

  deleteAccount: async (): Promise<{ message?: string }> => {
    const response = await api.delete<{ message?: string }>('/users/me');
    return response.data;
  },

  getBlockedUsers: async (): Promise<{ blocked: BlockedUser[] }> => {
    const response = await api.get<{ blocked: BlockedUser[] }>('/users/me/blocked');
    return response.data;
  },

  blockUser: async (userId: string): Promise<{ blocked: boolean; userId?: string }> => {
    const response = await api.post<{ blocked: boolean; userId?: string }>(
      `/users/${userId}/block`
    );
    return response.data;
  },

  unblockUser: async (userId: string): Promise<{ blocked: boolean; userId?: string }> => {
    const response = await api.delete<{ blocked: boolean; userId?: string }>(
      `/users/${userId}/block`
    );
    return response.data;
  },

  claimWelcomeCredit: async (): Promise<{
    message?: string;
    alreadyClaimed?: boolean;
    amountPence?: number;
    user?: User;
  }> => {
    const response = await api.post<{
      message?: string;
      alreadyClaimed?: boolean;
      amountPence?: number;
      user?: User;
    }>('/users/me/welcome-credit/claim', { acceptedPromoTerms: true });
    return response.data;
  },

  detectLocation: async (): Promise<{
    success: boolean;
    location?: {
      country?: string;
      city?: string;
      region?: string;
      countryCode?: string;
    };
  }> => {
    const response = await api.get('/users/detect-location');
    return response.data;
  },

  getSpotifyStatus: async (): Promise<SpotifyImportAccess> => {
    const response = await api.get<SpotifyImportAccess>('/users/me/spotify-status');
    return response.data;
  },

  startSpotifyImportPreview: async (
    limit = 50
  ): Promise<{ jobId: string; status: string }> => {
    const response = await api.post<{ jobId: string; status: string }>(
      '/users/me/import/spotify/preview/start',
      { limit }
    );
    return response.data;
  },

  startSpotifyImportExecute: async (
    items: Array<Record<string, unknown>>,
    defaultTip?: number
  ): Promise<{ jobId: string; status: string }> => {
    const response = await api.post<{ jobId: string; status: string }>(
      '/users/me/import/spotify/execute/start',
      { items, defaultTip }
    );
    return response.data;
  },

  requestSpotifyImport: async (
    spotifyAccount: string,
    note?: string
  ): Promise<{ message: string; request: { status: string } }> => {
    const response = await api.post<{ message: string; request: { status: string } }>(
      '/users/me/import/spotify/request',
      { spotifyAccount, note }
    );
    return response.data;
  },

  registerPushDevice: async (body: {
    token: string;
    platform: 'ios' | 'android';
  }): Promise<{ success: boolean; hasPushDevice: boolean }> => {
    const response = await api.post<{ success: boolean; hasPushDevice: boolean }>(
      '/users/me/push-devices',
      body
    );
    return response.data;
  },

  unregisterPushDevice: async (
    token?: string
  ): Promise<{ success: boolean; hasPushDevice: boolean }> => {
    const response = await api.delete<{ success: boolean; hasPushDevice: boolean }>(
      '/users/me/push-devices',
      { data: token ? { token } : {} }
    );
    return response.data;
  },

  updateNotificationPreferences: async (preferences: {
    push?: boolean;
  }): Promise<{ success: boolean }> => {
    const response = await api.put<{ success: boolean }>(
      '/users/notification-preferences',
      preferences
    );
    return response.data;
  },

  trackListeningHistory: async (payload: {
    mediaId: string;
    sessionId: string;
    sourceType?: 'user_queue' | 'library' | 'party' | 'search' | 'profile' | 'direct' | 'unknown';
    startedAt?: string;
    currentTime?: number;
    duration?: number;
    completed?: boolean;
    mediaTitle?: string;
    mediaArtist?: string;
    mediaCoverArt?: string;
    client?: 'web' | 'mobile' | 'ios';
  }) => {
    const response = await api.post('/users/me/listening-history/track', {
      ...payload,
      client: payload.client || 'mobile',
    });
    return response.data;
  },
};
