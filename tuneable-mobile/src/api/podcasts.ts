import { api } from './client';
import type {
  CreateOrFindSeriesResponse,
  ImportSingleEpisodeResponse,
  PodcastCatalogSource,
  PodcastChartResponse,
  PodcastEpisodeSearchResponse,
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
    locationScope?: string;
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
        locationScope: params?.locationScope,
      },
    });
    return response.data;
  },

  /** Series + episodes. Prefer autoImport=false for profile rails. */
  getSeries: async (
    seriesId: string,
    params?: {
      autoImport?: boolean;
      limit?: number;
      offset?: number;
      sortBy?: string;
      q?: string;
    }
  ): Promise<PodcastSeriesResponse> => {
    const autoImport = params?.autoImport === true;
    const q = params?.q?.trim();
    const response = await api.get<PodcastSeriesResponse>(
      `/podcasts/series/${seriesId}`,
      {
        params: {
          autoImport: autoImport ? 'true' : 'false',
          limit: params?.limit ?? 12,
          offset: params?.offset ?? 0,
          sortBy: params?.sortBy ?? 'mostTipped',
          ...(q ? { q } : {}),
        },
        timeout: autoImport ? 90000 : undefined,
      }
    );
    return response.data;
  },

  getSeriesInfo: async (seriesId: string): Promise<PodcastSeriesResponse> => {
    const response = await api.get<PodcastSeriesResponse>(
      `/podcasts/series/${seriesId}/info`
    );
    return response.data;
  },

  createOrFindSeries: async (
    seriesData: Record<string, unknown>
  ): Promise<CreateOrFindSeriesResponse> => {
    const response = await api.post<CreateOrFindSeriesResponse>(
      '/podcasts/discovery/create-or-find-series',
      { seriesData },
      { timeout: 60000 }
    );
    return response.data;
  },

  searchEpisodes: async (
    query: string,
    params?: { limit?: number; offset?: number }
  ): Promise<PodcastEpisodeSearchResponse> => {
    const response = await api.get<PodcastEpisodeSearchResponse>(
      '/podcasts/search-episodes',
      {
        params: {
          q: query,
          limit: params?.limit ?? 50,
          offset: params?.offset ?? 0,
        },
      }
    );
    return response.data;
  },

  searchTaddyEpisodes: async (
    query: string,
    params?: { max?: number; page?: number }
  ): Promise<PodcastEpisodeSearchResponse> => {
    const response = await api.get<PodcastEpisodeSearchResponse>(
      '/podcasts/discovery/taddy/search-episodes',
      {
        params: {
          q: query,
          max: params?.max ?? 25,
          page: params?.page ?? 1,
        },
      }
    );
    return response.data;
  },

  searchAppleEpisodes: async (
    query: string,
    params?: { max?: number }
  ): Promise<PodcastEpisodeSearchResponse> => {
    const response = await api.get<PodcastEpisodeSearchResponse>(
      '/podcasts/discovery/apple/search-episodes',
      {
        params: {
          q: query,
          max: params?.max ?? 50,
        },
      }
    );
    return response.data;
  },

  importSingleEpisode: async (body: {
    source: Exclude<PodcastCatalogSource, 'local'>;
    episodeData: Record<string, unknown>;
    seriesData?: Record<string, unknown> | null;
  }): Promise<ImportSingleEpisodeResponse> => {
    const response = await api.post<ImportSingleEpisodeResponse>(
      '/podcasts/discovery/import-single-episode',
      body,
      { timeout: 60000 }
    );
    return response.data;
  },
};
