import { api } from './client';

export type ReportType = 'media' | 'user';

export type ReportPayload = {
  category: string;
  description: string;
  contactEmail?: string;
};

export const reportAPI = {
  reportMedia: async (mediaId: string, data: ReportPayload) => {
    const response = await api.post(`/reports/media/${mediaId}/report`, data);
    return response.data;
  },

  reportUser: async (userId: string, data: ReportPayload) => {
    const response = await api.post(`/reports/users/${userId}/report`, data);
    return response.data;
  },
};
