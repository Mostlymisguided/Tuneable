import { api } from './client';
import type {
  ChampionTitlesResponse,
  TuneBytesTagRankingsResponse,
  UserLibraryResponse,
  UserProfileResponse,
} from '@/src/types/user';

export type ImportJobStatus = {
  id: string;
  status: 'queued' | 'running' | 'complete' | 'error' | string;
  message?: string | null;
  error?: string | null;
  errorCode?: string | null;
  details?: unknown;
  result?: unknown;
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

export type ImportPreviewItem = {
  key: string;
  title?: string;
  mediaId?: string;
  matchStatus?: string;
  useSuggestedMatch?: boolean;
  crossRefStatus?: string;
  identityConfidence?: string;
  selected?: boolean;
  externalMedia?: Record<string, unknown>;
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

  getSoundCloudStatus: async (): Promise<{ connected: boolean }> => {
    const response = await api.get<{ connected: boolean }>(
      '/users/me/soundcloud-status'
    );
    return response.data;
  },

  getYouTubeStatus: async (): Promise<{ connected: boolean }> => {
    const response = await api.get<{ connected: boolean }>(
      '/users/me/youtube-status'
    );
    return response.data;
  },

  getImportStats: async (): Promise<{
    spotify: {
      connected: boolean;
      imported: number;
      oauthAvailable?: boolean;
      publicImport?: boolean;
      request?: SpotifyImportAccess['request'];
    };
    soundcloud: { connected: boolean; imported: number };
    youtube?: {
      connected?: boolean;
      imported: number;
      playlistImport?: boolean;
      likesImport?: boolean;
    };
  }> => {
    const response = await api.get<{
      spotify: {
        connected: boolean;
        imported: number;
        oauthAvailable?: boolean;
        publicImport?: boolean;
        request?: SpotifyImportAccess['request'];
      };
      soundcloud: { connected: boolean; imported: number };
      youtube?: {
        connected?: boolean;
        imported: number;
        playlistImport?: boolean;
        likesImport?: boolean;
      };
    }>('/users/me/import-stats');
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

  startSoundCloudImportPreview: async (
    limit = 50,
    crossRefMode: 'spotify_only' | 'full' | 'none' = 'spotify_only'
  ): Promise<{ jobId: string; status: string }> => {
    const response = await api.post<{ jobId: string; status: string }>(
      '/users/me/import/soundcloud/preview/start',
      { limit, crossRefMode }
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

  startSoundCloudImportExecute: async (
    items: Array<Record<string, unknown>>,
    defaultTip?: number
  ): Promise<{ jobId: string; status: string }> => {
    const response = await api.post<{ jobId: string; status: string }>(
      '/users/me/import/soundcloud/execute/start',
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

  startYouTubeImportPreview: async (
    playlistUrl?: string,
    limit = 50,
    mode: 'playlist' | 'likes' = 'playlist'
  ): Promise<{ jobId: string; status: string }> => {
    const response = await api.post<{ jobId: string; status: string }>(
      '/users/me/import/youtube/preview/start',
      { playlistUrl, limit, mode }
    );
    return response.data;
  },

  startYouTubeImportExecute: async (
    items: Array<Record<string, unknown>>,
    defaultTip?: number
  ): Promise<{ jobId: string; status: string }> => {
    const response = await api.post<{ jobId: string; status: string }>(
      '/users/me/import/youtube/execute/start',
      { items, defaultTip }
    );
    return response.data;
  },

  getImportJob: async (jobId: string): Promise<ImportJobStatus> => {
    const response = await api.get<ImportJobStatus>(
      `/users/me/import/jobs/${jobId}`
    );
    return response.data;
  },

  waitForImportJob: async <T = unknown>(
    jobId: string,
    onProgress?: (job: ImportJobStatus) => void,
    options?: { intervalMs?: number; timeoutMs?: number }
  ): Promise<T> => {
    const intervalMs = options?.intervalMs ?? 500;
    const timeoutMs = options?.timeoutMs ?? 10 * 60 * 1000;
    const started = Date.now();

    while (Date.now() - started < timeoutMs) {
      const job = await userAPI.getImportJob(jobId);
      onProgress?.(job);
      if (job.status === 'complete') {
        return job.result as T;
      }
      if (job.status === 'error') {
        const err = new Error(job.error || 'Import job failed') as Error & {
          response?: { data: { error?: string } };
        };
        err.response = { data: { error: job.error || 'Import job failed' } };
        throw err;
      }
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }

    throw new Error('Import job timed out — please try again with fewer tracks');
  },
};
