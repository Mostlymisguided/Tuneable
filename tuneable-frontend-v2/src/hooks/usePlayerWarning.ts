import { useState, useCallback } from 'react';
import { useWebPlayerStore } from '../stores/webPlayerStore';

interface UsePlayerWarningReturn {
  showWarning: (action: string, onConfirm: () => void) => void;
  isWarningOpen: boolean;
  warningAction: string;
  onConfirm: () => void;
  onCancel: () => void;
  currentMediaTitle?: string;
  currentMediaArtist?: string;
}

export const usePlayerWarning = (): UsePlayerWarningReturn => {
  const [isWarningOpen, setIsWarningOpen] = useState(false);
  const [warningAction, setWarningAction] = useState('');
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
  
  const { currentMedia, isPlaying } = useWebPlayerStore();

  const showWarning = useCallback((action: string, onConfirm: () => void) => {
    // Only show warning if music is currently playing
    if (isPlaying && currentMedia) {
      setWarningAction(action);
      setPendingAction(() => onConfirm);
      setIsWarningOpen(true);
      
      // Play notification sound
      try {
        const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBSuBzvLZiTYIG2m98OScTgwOUarm7blmGgU7k9n1unEiBS13yO/eizEIHWq+8+OWT');
        audio.volume = 0.3;
        audio.play().catch(() => {
          // Ignore errors if audio can't play (user hasn't interacted with page)
        });
      } catch (error) {
        // Ignore audio errors
      }

      // Auto-scroll to show the warning popup
      setTimeout(() => {
        // Try to find the warning popup element and scroll to it
        const warningElement = document.querySelector('[data-warning-popup]');
        if (warningElement) {
          warningElement.scrollIntoView({
            behavior: 'smooth',
            block: 'start',
            inline: 'nearest'
          });
        } else {
          // Fallback: scroll to top of page
          window.scrollTo({
            top: 0,
            behavior: 'smooth'
          });
        }
      }, 150); // Small delay to ensure the popup is rendered
    } else {
      // No music playing, proceed directly
      onConfirm();
    }
  }, [isPlaying, currentMedia]);

  const handleConfirm = useCallback(() => {
    if (pendingAction) {
      pendingAction();
    }
    setIsWarningOpen(false);
    setPendingAction(null);
    setWarningAction('');
  }, [pendingAction]);

  const handleCancel = useCallback(() => {
    setIsWarningOpen(false);
    setPendingAction(null);
    setWarningAction('');
  }, []);

  return {
    showWarning,
    isWarningOpen,
    warningAction,
    onConfirm: handleConfirm,
    onCancel: handleCancel,
    currentMediaTitle: currentMedia?.title,
    currentMediaArtist: currentMedia?.artist,
  };
};
