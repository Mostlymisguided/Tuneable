import { api } from './client';
import type { ResolvedLocation } from '@/src/types/user';

export const locationAPI = {
  reverse: async (
    longitude: number,
    latitude: number
  ): Promise<{ location: ResolvedLocation }> => {
    const response = await api.post<{ location: ResolvedLocation }>(
      '/locations/reverse',
      { longitude, latitude }
    );
    return response.data;
  },
};
