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
  timePeriod?: string;
  stats?: { mediaCount?: number; globalPlaceAggregate?: number };
  relatedPlaces?: LocationPlaceChip[];
  relatedTags?: LocationRelatedTag[];
  media?: ChartMediaItem[];
  pagination?: { page: number; limit: number; total: number; pages: number };
};

export type PlaceChartItem = {
  placeId: string;
  name: string;
  featureType?: string | null;
  country?: string | null;
  countryCode?: string | null;
  supportPence: number;
  mediaCount?: number;
  bidCount?: number;
};

export type PlaceChartResponse = {
  places: PlaceChartItem[];
  count: number;
  parentPlaceId: string | null;
  scope: string;
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

  getChart: async (params?: {
    parentPlaceId?: string;
    scope?: string;
    limit?: number;
  }): Promise<PlaceChartResponse> => {
    const response = await api.get<PlaceChartResponse>('/locations/chart', {
      params,
    });
    return response.data;
  },

  getProfile: async (
    placeId: string,
    params?: { page?: number; limit?: number; timePeriod?: string; sortBy?: string }
  ): Promise<LocationProfileResponse> => {
    const response = await api.get<LocationProfileResponse>(
      `/locations/${encodeURIComponent(placeId)}/profile`,
      { params }
    );
    return response.data;
  },
};
