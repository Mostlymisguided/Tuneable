import { useState, useCallback } from 'react';
import { useWebPlayerStore } from '../stores/webPlayerStore';

interface UsePlayerWarningReturn {
  showWarning: (action: string, onConfirm: () => void) => void;
  isWarningOpen: boolean;
  warningAction: string;
  onConfirm: () => void;
  onCancel: () => void;
  currentSongTitle?: string;
  currentSongArtist?: string;
}

export const usePlayerWarning = (): UsePlayerWarningReturn => {
  const [isWarningOpen, setIsWarningOpen] = useState(false);
  const [warningAction, setWarningAction] = useState('');
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
  
  const { currentSong, isPlaying } = useWebPlayerStore();

  const showWarning = useCallback((action: string, onConfirm: () => void) => {
    // Only show warning if music is currently playing
    if (isPlaying && currentSong) {
      setWarningAction(action);
      setPendingAction(() => onConfirm);
      setIsWarningOpen(true);
    } else {
      // No music playing, proceed directly
      onConfirm();
    }
  }, [isPlaying, currentSong]);

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
    currentSongTitle: currentSong?.title,
    currentSongArtist: currentSong?.artist,
  };
};
