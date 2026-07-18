import { api } from './client';
import type { LoginResponse, User } from '@/src/types/user';

export type RegisterBody = {
  username: string;
  email: string;
  password: string;
  parentInviteCode: string;
};

export type ValidateInviteResponse = {
  valid: boolean;
  inviterUsername?: string;
};

export const authAPI = {
  login: async (identifier: string, password: string): Promise<LoginResponse> => {
    const response = await api.post<LoginResponse>('/users/login', {
      identifier,
      password,
    });
    return response.data;
  },

  register: async (body: RegisterBody): Promise<LoginResponse> => {
    const response = await api.post<LoginResponse>('/users/register', body);
    return response.data;
  },

  validateInvite: async (code: string): Promise<ValidateInviteResponse> => {
    const response = await api.get<ValidateInviteResponse>(
      `/users/validate-invite/${encodeURIComponent(code.trim())}`
    );
    return response.data;
  },

  getProfile: async (): Promise<{ user: User }> => {
    const response = await api.get<{ user: User }>('/users/profile');
    return response.data;
  },
};
