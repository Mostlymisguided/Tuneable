import { api } from './client';

export type BookRecord = {
  _id: string;
  title: string;
  coverArt?: string | null;
  authors?: string[];
  creatorDisplay?: string | null;
  author?: Array<{ name?: string }>;
  isbn?: string | null;
  publisher?: string | null;
  pages?: number | null;
  description?: string | null;
  tags?: string[];
  sources?: Record<string, string>;
  globalMediaAggregate?: number;
  contentForm?: string[];
  contentType?: string[];
};

export type DiscoveryBook = {
  source?: string;
  openLibraryKey?: string | null;
  googleBooksId?: string | null;
  isbn?: string | null;
  title: string;
  authors?: string[];
  coverArt?: string | null;
  pageCount?: number | null;
  publisher?: string | null;
  publishedYear?: number | null;
  description?: string | null;
  infoUrl?: string | null;
};

export const booksAPI = {
  getChart: async (params?: { limit?: number; timePeriod?: string }) => {
    const response = await api.get<{ books: BookRecord[] }>('/books/chart', { params });
    return response.data;
  },
  searchCatalog: async (q: string) => {
    const response = await api.get<{ books: BookRecord[] }>('/books/search', { params: { q } });
    return response.data;
  },
  searchOpenLibrary: async (q: string) => {
    const response = await api.get<{ books: DiscoveryBook[] }>(
      '/books/discovery/open-library/search',
      { params: { q } }
    );
    return response.data;
  },
  searchGoogleBooks: async (q: string) => {
    const response = await api.get<{ books: DiscoveryBook[]; disabled?: boolean }>(
      '/books/discovery/google-books/search',
      { params: { q } }
    );
    return response.data;
  },
  importBook: async (payload: DiscoveryBook) => {
    const response = await api.post<{ created: boolean; book: BookRecord }>('/books/import', payload);
    return response.data;
  },
  getBook: async (bookId: string) => {
    const response = await api.get<{ book: BookRecord }>(`/books/${bookId}`);
    return response.data;
  },
  boost: async (bookId: string, amount: number, currentLocation?: unknown) => {
    const response = await api.post<{ book: BookRecord; updatedBalance: number }>(
      `/books/${bookId}/boost`,
      { amount, currentLocation }
    );
    return response.data;
  },
};
