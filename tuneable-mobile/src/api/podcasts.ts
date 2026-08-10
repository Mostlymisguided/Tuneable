import { api } from './client';
import type {
  PodcastChartResponse,
  PodcastSeriesResponse,
} from '@/src/types/podcast';

export const podcastsAPI = {
  getChart: async (params?: {
    limit?: number;
    timeRange?: string;
    sortBy?: string;
    category?: string;
    genre?: string;
    tag?: string;
    locationPlaceId?: string;
  }): Promise<PodcastChartResponse> => {
    const response = await api.get<PodcastChartResponse>('/podcasts/chart', {
      params: {
        limit: params?.limit ?? 50,
        timeRange: params?.timeRange ?? 'all',
        sortBy: params?.sortBy ?? 'globalMediaAggregate',
        category: params?.category,
        genre: params?.genre,
        tag: params?.tag,
        locationPlaceId: params?.locationPlaceId,
      },
    });
    return response.data;
  },

  /** Series + episodes. Prefer autoImport=false for profile rails. */
  getSeries: async (
    seriesId: string,
    params?: { autoImport?: boolean; limit?: number }
  ): Promise<PodcastSeriesResponse> => {
    const response = await api.get<PodcastSeriesResponse>(
      `/podcasts/series/${seriesId}`,
      {
        params: {
          autoImport: params?.autoImport === true ? 'true' : 'false',
          limit: params?.limit ?? 12,
        },
      }
    );
    return response.data;
  },
};
