import { api } from './client';
import type { SortedMediaResponse } from '@/src/types/media';

export type AddMediaBody = {
  url: string;
  title: string;
  artist: string;
  bidAmount: number; // pounds
  platform: string;
  duration?: number;
  coverArt?: string | null;
  category?: string;
  tags?: string[];
};

export type AddMediaResponse = {
  message?: string;
  updatedBalance?: number;
  isNewMedia?: boolean;
};

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

  addMediaToParty: async (
    partyId: string,
    body: AddMediaBody
  ): Promise<AddMediaResponse> => {
    const response = await api.post<AddMediaResponse>(
      `/parties/${partyId}/media/add`,
      body
    );
    return response.data;
  },
};
