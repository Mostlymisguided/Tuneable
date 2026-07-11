import { api } from './client';
import type { SortedMediaResponse } from '@/src/types/media';

export const partyAPI = {
  getMediaSortedByTime: async (
    partyId: string,
    timePeriod: string
  ): Promise<SortedMediaResponse> => {
    const response = await api.get<SortedMediaResponse>(
      `/parties/${partyId}/media/sorted/${timePeriod}`
    );
    return response.data;
  },
};
