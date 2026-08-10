import { api } from './client';
import type { ResolvedLocation } from '@/src/types/user';

export type LocationSuggestion = {
  mapboxId: string;
  label: string;
  placeFormatted: string | null;
  featureType: string | null;
};

export const locationAPI = {
  suggest: async (
    q: string,
    options?: { country?: string; worldview?: string; limit?: number }
  ): Promise<{ suggestions: LocationSuggestion[] }> => {
    const response = await api.get<{ suggestions: LocationSuggestion[] }>(
      '/locations/suggest',
      { params: { q, ...options } }
    );
    return response.data;
  },

  resolve: async (
    mapboxId: string
  ): Promise<{ location: ResolvedLocation }> => {
    const response = await api.post<{ location: ResolvedLocation }>(
      '/locations/resolve',
      { mapboxId }
    );
    return response.data;
  },

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
