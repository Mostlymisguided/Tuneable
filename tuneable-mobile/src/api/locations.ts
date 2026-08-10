import { api } from './client';
import type { ChartMediaItem } from '@/src/types/media';
import type { ResolvedLocation } from '@/src/types/user';

export type LocationSuggestion = {
  mapboxId: string;
  label: string;
  placeFormatted: string | null;
  featureType: string | null;
};

export type LocationPlaceChip = {
  placeId: string;
  name: string;
  featureType?: string | null;
};

export type LocationRelatedTag = {
  name: string;
  slug: string;
};

export type LocationProfileResponse = {
  place: {
    placeId: string;
    name: string;
    display?: string;
    featureType?: string | null;
    country?: string | null;
    countryCode?: string | null;
    city?: string | null;
    region?: string | null;
  };
  stats?: { mediaCount?: number; globalPlaceAggregate?: number };
  relatedPlaces?: LocationPlaceChip[];
  relatedTags?: LocationRelatedTag[];
  media?: ChartMediaItem[];
  pagination?: { page: number; limit: number; total: number; pages: number };
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

  getProfile: async (
    placeId: string,
    params?: { page?: number; limit?: number }
  ): Promise<LocationProfileResponse> => {
    const response = await api.get<LocationProfileResponse>(
      `/locations/${encodeURIComponent(placeId)}/profile`,
      { params }
    );
    return response.data;
  },
};
