import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';
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
  const [androidKeyboard, setAndroidKeyboard] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const show = Keyboard.addListener('keyboardDidShow', () =>
      setAndroidKeyboard(true)
    );
    const hide = Keyboard.addListener('keyboardDidHide', () =>
      setAndroidKeyboard(false)
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const segmentList = segments as string[];
  const root = segmentList[0];
  const onTabs = root === '(tabs)';
  const onNowPlaying = segmentList.includes('now-playing');
  const onAuthScreen =
    root === 'login' ||
    root === 'register' ||
    root === 'index' ||
    root === 'auth';
  const onOnboarding = root === 'onboarding' || root === 'set-home-location';

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

  const showTabBar =
    !isLoading &&
    isAuthenticated &&
    !onAuthScreen &&
    !onOnboarding &&
    !onNowPlaying &&
    !androidKeyboard;

  const tabBarHeight = TAB_BAR_BASE_HEIGHT + Math.max(insets.bottom, 0);
  const bottomOffset = showTabBar
    ? tabBarHeight
    : Math.max(insets.bottom, 8);

  const dockPad = mode === 'hidden' ? 0 : height + 16;
  const tabPad = showTabBar ? tabBarHeight : 0;
  /** Extra content padding so scrollables clear the dock and tab bar. */
  const contentPaddingBottom = dockPad + tabPad;

  return {
    mode,
    visible: mode !== 'hidden',
    height,
    bottomOffset,
    onTabs,
    showTabBar,
    tabBarHeight,
    contentPaddingBottom,
  };
}
