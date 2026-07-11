import { api } from './client';

export type PlaceGlobalBidResponse = {
  message?: string;
  updatedBalance?: number; // pence
  bid?: { amount?: number };
  media?: { globalMediaAggregate?: number };
};

export const mediaAPI = {
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
