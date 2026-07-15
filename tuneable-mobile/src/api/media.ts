import { api } from './client';
import type { MediaProfileResponse } from '@/src/types/media';

export type PlaceGlobalBidResponse = {
  message?: string;
  updatedBalance?: number; // pence
  bid?: { amount?: number };
  media?: { globalMediaAggregate?: number };
};

export const mediaAPI = {
  getProfile: async (mediaId: string): Promise<MediaProfileResponse> => {
    const response = await api.get<MediaProfileResponse>(
      `/media/${mediaId}/profile`
    );
    return response.data;
  },

  /** Tip a chart item. `amount` is in pounds (e.g. 0.50). */
  placeGlobalBid: async (
    mediaId: string,
    amount: number
  ): Promise<PlaceGlobalBidResponse> => {
    const response = await api.post<PlaceGlobalBidResponse>(
      `/media/${mediaId}/global-bid`,
      { amount }
    );
    return response.data;
  },
};
