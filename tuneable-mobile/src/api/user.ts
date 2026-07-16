import { api } from './client';
import type {
  TuneBytesTagRankingsResponse,
  UserLibraryResponse,
  UserProfileResponse,
} from '@/src/types/user';

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
};
