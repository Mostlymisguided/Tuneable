import { api } from './client';
import type { ChartMediaItem, TimePeriodKey } from '@/src/types/media';

export type BookChartResponse = {
  books: ChartMediaItem[];
  count: number;
  timePeriod?: string;
  locationPlaceId?: string | null;
};

export type BookProfileResponse = {
  book: ChartMediaItem;
};

export const booksAPI = {
  getChart: async (params?: {
    limit?: number;
    timePeriod?: TimePeriodKey | string;
    locationPlaceId?: string;
    tag?: string;
  }): Promise<BookChartResponse> => {
    const response = await api.get<BookChartResponse>('/books/chart', { params });
    return response.data;
  },

  getBook: async (bookId: string): Promise<BookProfileResponse> => {
    const response = await api.get<BookProfileResponse>(`/books/${bookId}`);
    return response.data;
  },

  boost: async (
    bookId: string,
    amount: number,
    currentLocation?: unknown
  ): Promise<{ book: ChartMediaItem; updatedBalance: number; message?: string }> => {
    const response = await api.post(`/books/${bookId}/boost`, {
      amount,
      currentLocation,
    });
    return response.data;
  },
};
