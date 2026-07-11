import { api } from './client';
import type { PodcastChartResponse } from '@/src/types/podcast';

export const podcastsAPI = {
  getChart: async (params?: {
    limit?: number;
    timeRange?: string;
    sortBy?: string;
    category?: string;
    genre?: string;
    tag?: string;
  }): Promise<PodcastChartResponse> => {
    const response = await api.get<PodcastChartResponse>('/podcasts/chart', {
      params: {
        limit: params?.limit ?? 50,
        timeRange: params?.timeRange ?? 'all',
        sortBy: params?.sortBy ?? 'globalMediaAggregate',
        category: params?.category,
        genre: params?.genre,
        tag: params?.tag,
      },
    });
    return response.data;
  },
};
