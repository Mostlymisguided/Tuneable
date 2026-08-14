import { api } from './client';
import type { LoginResponse, User } from '@/src/types/user';

export type RegisterBody = {
  username: string;
  email: string;
  password: string;
  parentInviteCode?: string;
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

  appleSignIn: async (body: {
    identityToken: string;
    invite?: string;
    email?: string;
    fullName?: { givenName?: string; familyName?: string };
  }): Promise<LoginResponse> => {
    const response = await api.post<LoginResponse>('/auth/apple', body);
    return response.data;
  },

  updateProfile: async (
    userData: Partial<User> & {
      onboarding?: User['onboarding'];
      preferences?: User['preferences'];
      homeLocation?: User['homeLocation'];
    }
  ): Promise<{ user: User; message?: string }> => {
    const response = await api.put<{ user: User; message?: string }>(
      '/users/profile',
      userData
    );
    return response.data;
  },

  resendVerification: async (): Promise<{ message?: string }> => {
    const response = await api.post<{ message?: string }>('/email/verify/send');
    return response.data;
  },
};
