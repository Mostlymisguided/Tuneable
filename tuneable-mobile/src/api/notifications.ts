import { api } from './client';
import type { NotificationListResponse } from '@/src/types/notification';

const PAGE_SIZE = 20;

export const notificationAPI = {
  getNotifications: async (page = 1): Promise<NotificationListResponse> => {
    const response = await api.get<NotificationListResponse>('/notifications', {
      params: { page, limit: PAGE_SIZE, unreadOnly: false },
    });
    return response.data;
  },

  getUnreadCount: async (): Promise<number> => {
    const response = await api.get<{ count: number }>('/notifications/unread-count');
    const count = response.data?.count;
    return Number.isFinite(count) ? count : 0;
  },

  markRead: async (notificationId: string): Promise<void> => {
    await api.put(`/notifications/${notificationId}/read`);
  },

  markAllRead: async (): Promise<void> => {
    await api.put('/notifications/read-all');
  },
};
