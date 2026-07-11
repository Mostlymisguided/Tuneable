import { api } from './client';
import type { LoginResponse, User } from '@/src/types/user';

export const authAPI = {
  login: async (identifier: string, password: string): Promise<LoginResponse> => {
    const response = await api.post<LoginResponse>('/users/login', {
      identifier,
      password,
    });
    return response.data;
  },

  getProfile: async (): Promise<{ user: User }> => {
    const response = await api.get<{ user: User }>('/users/profile');
    return response.data;
  },
};
