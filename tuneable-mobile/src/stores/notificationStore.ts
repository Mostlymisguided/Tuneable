import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { create } from 'zustand';
import { notificationAPI } from '@/src/api/notifications';

let refreshSeq = 0;

async function applyBadge(count: number) {
  if (Platform.OS === 'web') return;
  try {
    await Notifications.setBadgeCountAsync(Math.max(0, count));
  } catch {
    // Badge permission can be missing; the in-app count still updates.
  }
}

type NotificationState = {
  unreadCount: number;
  refreshUnreadCount: () => Promise<void>;
  setUnreadCount: (count: number) => void;
  clear: () => void;
};

export const useNotificationStore = create<NotificationState>((set) => ({
  unreadCount: 0,
  refreshUnreadCount: async () => {
    const seq = ++refreshSeq;
    try {
      const count = await notificationAPI.getUnreadCount();
      if (seq !== refreshSeq) return;
      set({ unreadCount: count });
      await applyBadge(count);
    } catch {
      // Keep the last count if the request fails.
    }
  },
  setUnreadCount: (count) => {
    refreshSeq += 1;
    const next = Math.max(0, count);
    set({ unreadCount: next });
    void applyBadge(next);
  },
  clear: () => {
    refreshSeq += 1;
    set({ unreadCount: 0 });
    void applyBadge(0);
  },
}));
