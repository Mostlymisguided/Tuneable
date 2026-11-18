import { api } from './client';
import type {
  ChampionTitlesResponse,
  TuneBytesTagRankingsResponse,
  User,
  UserLibraryResponse,
  UserProfileResponse,
} from '@/src/types/user';
import type { HomeListenQueueResponse } from '@/src/types/homeQueue';

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

export type ActivityMediaRef = {
  _id?: string;
  uuid?: string | null;
  title?: string;
  artist?: unknown;
  coverArt?: string | null;
  contentForm?: string[];
};

export type TipHistoryResponse = {
  tips?: Array<{
    _id: string;
    amount?: number;
    status?: string;
    createdAt?: string;
    mediaTitle?: string;
    mediaArtist?: string;
    mediaCoverArt?: string | null;
    media?: ActivityMediaRef | null;
  }>;
};

export type ListeningHistoryResponse = {
  history?: Array<{
    _id: string;
    lastPlayedAt?: string;
    qualifiedAt?: string | null;
    countedAsPlay?: boolean;
    media?: ActivityMediaRef | null;
  }>;
};

export type ChampionPodiumEventsResponse = {
  events?: Array<{
    _id: string;
    kind: 'earned' | 'lost';
    rank: number;
    previousRank?: number | null;
    nextRank?: number | null;
    occurredAt?: string;
    regainPence?: number | null;
    media?: ActivityMediaRef | null;
  }>;
};

export type TuneBytesHistoryResponse = {
  transactions?: Array<{
    _id: string;
    tuneBytesEarned?: number;
    createdAt?: string;
    updatedAt?: string;
    mediaTitle?: string;
    mediaArtist?: string;
    mediaCoverArt?: string | null;
    media_uuid?: string | null;
    mediaId?: ActivityMediaRef | string | null;
  }>;
};

export type AmbassadorSummary = {
  status: 'none' | 'active' | 'paused' | 'revoked';
  note?: string | null;
  signupCount: number;
  verifiedCreatorCount: number;
  activeWindowCount: number;
  commissionPence: number;
  assignments?: Array<{
    id: string;
    label: string;
    status: 'active' | 'paused' | 'revoked';
    signupCount: number;
    verifiedCreatorCount: number;
    activeWindowCount: number;
    sceneCount: number;
  }>;
};

export const userAPI = {
  getAmbassadorSummary: async (): Promise<{ status: string; ambassador: AmbassadorSummary | null }> => {
    const response = await api.get<{ status: string; ambassador: AmbassadorSummary | null }>('/users/me/ambassador');
    return response.data;
  },

  getProfileById: async (userId: string): Promise<UserProfileResponse> => {
    const response = await api.get<UserProfileResponse>(`/users/${userId}/profile`);
    return response.data;
  },

  getTuneLibrary: async (): Promise<UserLibraryResponse> => {
    const response = await api.get<UserLibraryResponse>('/users/me/tune-library');
    return response.data;
  },

  getHomeListenQueue: async (): Promise<HomeListenQueueResponse> => {
    const response = await api.get<HomeListenQueueResponse>('/users/me/home-queue');
    return response.data;
  },

  getTipHistory: async (limit = 20): Promise<TipHistoryResponse> => {
    const response = await api.get<TipHistoryResponse>('/users/me/tip-history', {
      params: { limit, sortBy: 'createdAt', sortOrder: 'desc' },
    });
    return response.data;
  },

  getListeningHistory: async (limit = 40): Promise<ListeningHistoryResponse> => {
    const response = await api.get<ListeningHistoryResponse>('/users/me/listening-history', {
      params: { limit },
    });
    return response.data;
  },

  getTuneBytesHistory: async (
    userId: string,
    limit = 20
  ): Promise<TuneBytesHistoryResponse> => {
    const response = await api.get<TuneBytesHistoryResponse>(
      `/users/${encodeURIComponent(userId)}/tunebytes/history`,
      { params: { limit, offset: 0 } }
    );
    return response.data;
  },

  getChampionPodiumEvents: async (limit = 20): Promise<ChampionPodiumEventsResponse> => {
    const response = await api.get<ChampionPodiumEventsResponse>('/users/me/champion-podium', {
      params: { limit },
    });
    return response.data;
  },

  getPlaybackQueue: async () => {
    const response = await api.get<{
      queue: Array<{ mediaId: string; mediaUuid?: string }>;
    }>('/users/me/queue');
    return response.data;
  },

  addToPlaybackQueue: async (payload: {
    mediaId: string;
    sourceType?: 'library' | 'search' | 'profile' | 'party' | 'direct' | 'unknown';
    position?: 'start' | 'end';
  }) => {
    const response = await api.post('/users/me/queue', payload);
    return response.data;
  },

  removeFromPlaybackQueue: async (mediaId: string) => {
    const response = await api.delete(`/users/me/queue/${encodeURIComponent(mediaId)}`);
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
