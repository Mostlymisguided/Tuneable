import { api } from './client';
import type { ChartMediaItem } from '@/src/types/media';

export type TagPlaceChip = {
  placeId: string;
  name: string;
  featureType?: string | null;
};

export type TagProfileScope = 'music' | 'podcast';

export type TagProfileResponse = {
  tag: {
    name: string;
    slug: string;
    canonicalTag?: string;
    kind?: 'tag' | 'year' | 'bpm';
  };
  timePeriod?: string;
  contentScope?: TagProfileScope;
  stats?: { mediaCount?: number; globalTagAggregate?: number };
  relatedTags?: Array<{ name: string; slug: string }>;
  topOriginPlaces?: TagPlaceChip[];
  topSupportPlaces?: TagPlaceChip[];
  media?: ChartMediaItem[];
  pagination?: { page: number; limit: number; total: number; pages: number };
  relatedParty?: unknown;
};

export const tagAPI = {
  getProfile: async (
    slug: string,
    params?: { page?: number; limit?: number; timePeriod?: string; type?: TagProfileScope }
  ): Promise<TagProfileResponse> => {
    const response = await api.get<TagProfileResponse>(
      `/tags/${encodeURIComponent(slug)}/profile`,
      { params }
    );
    return response.data;
  },
};
