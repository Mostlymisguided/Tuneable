import { api } from './client';
import type { SearchResponse } from '@/src/types/search';

export const searchAPI = {
  search: async (
    query: string,
    options?: { source?: string; forceExternal?: boolean; pageToken?: string }
  ): Promise<SearchResponse> => {
    const response = await api.get<SearchResponse>('/search', {
      params: {
        query,
        source: options?.source ?? 'youtube',
        forceExternal: options?.forceExternal ? 'true' : undefined,
        pageToken: options?.pageToken,
      },
    });
    return response.data;
  },

  searchByYouTubeUrl: async (url: string): Promise<SearchResponse> => {
    const response = await api.get<SearchResponse>('/search/youtube-url', {
      params: { url },
    });
    return response.data;
  },
};
