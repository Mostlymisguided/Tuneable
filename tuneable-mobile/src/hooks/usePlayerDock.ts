import { useSegments } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/src/auth/AuthContext';
import { useCurrentTrack } from '@/src/stores/musicPlayerStore';
import { useCurrentEpisode } from '@/src/stores/podcastPlayerStore';

export const PLAYER_DOCK_PLAYING_HEIGHT = 64;
export const PLAYER_DOCK_IDLE_HEIGHT = 44;
export const TAB_BAR_BASE_HEIGHT = 49;

export type PlayerDockMode = 'hidden' | 'playing' | 'idle';

export function usePlayerDockState() {
  const { isAuthenticated, isLoading } = useAuth();
  const track = useCurrentTrack();
  const episode = useCurrentEpisode();
  const segments = useSegments();
  const insets = useSafeAreaInsets();

  const segmentList = segments as string[];
  const onTabs = segmentList[0] === '(tabs)';
  const onNowPlaying = segmentList.includes('now-playing');
  const onAuthScreen =
    segmentList[0] === 'login' ||
    segmentList[0] === 'index' ||
    segmentList[0] === 'auth';

  const hasAudio = Boolean(track || episode);

  let mode: PlayerDockMode = 'hidden';
  if (!isLoading && isAuthenticated && !onAuthScreen && !onNowPlaying) {
    if (hasAudio) mode = 'playing';
    else if (onTabs) mode = 'idle';
  }

  const height =
    mode === 'playing'
      ? PLAYER_DOCK_PLAYING_HEIGHT
      : mode === 'idle'
        ? PLAYER_DOCK_IDLE_HEIGHT
        : 0;

  const tabBarHeight = TAB_BAR_BASE_HEIGHT + Math.max(insets.bottom, 0);
  const bottomOffset = onTabs
    ? tabBarHeight
    : Math.max(insets.bottom, 8);

  /** Extra content padding so scrollables clear the dock. */
  const contentPaddingBottom = mode === 'hidden' ? 0 : height + 16;

  return {
    mode,
    visible: mode !== 'hidden',
    height,
    bottomOffset,
    onTabs,
    contentPaddingBottom,
  };
}
