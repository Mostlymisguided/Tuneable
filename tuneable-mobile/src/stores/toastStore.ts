import { create } from 'zustand';

export type ToastTone = 'info' | 'error';

type ToastState = {
  message: string | null;
  tone: ToastTone;
  show: (message: string, tone?: ToastTone) => void;
  clear: () => void;
};

let hideTimer: ReturnType<typeof setTimeout> | null = null;

export const useToastStore = create<ToastState>((set) => ({
  message: null,
  tone: 'info',
  show: (message, tone = 'info') => {
    if (hideTimer) {
      clearTimeout(hideTimer);
      hideTimer = null;
    }
    set({ message, tone });
    hideTimer = setTimeout(() => {
      set({ message: null });
      hideTimer = null;
    }, 4200);
  },
  clear: () => {
    if (hideTimer) {
      clearTimeout(hideTimer);
      hideTimer = null;
    }
    set({ message: null });
  },
}));

export function showToast(message: string, tone: ToastTone = 'info') {
  useToastStore.getState().show(message, tone);
}
