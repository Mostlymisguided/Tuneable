import { Stack, useSegments } from 'expo-router';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { useCallback, useEffect } from 'react';
import { ActivityIndicator, AppState, StyleSheet, View } from 'react-native';
import 'react-native-reanimated';
import { StatusBar } from 'expo-status-bar';

import { AuthProvider, useAuth } from '@/src/auth/AuthContext';
import { WelcomeLanding } from '@/src/components/WelcomeLanding';
import { AppTabBar } from '@/src/components/AppTabBar';
import { AppToast } from '@/src/components/AppToast';
import { PlayerDock } from '@/src/components/PlayerDock';
import {
  openInitialNotificationResponse,
  setNotificationRoutingReady,
  subscribeForegroundNotifications,
  subscribeNotificationResponses,
} from '@/src/lib/pushNotifications';
import { useNotificationStore } from '@/src/stores/notificationStore';
import { recheckLocationPermission } from '@/src/lib/currentLocation';
import { colors } from '@/src/theme/colors';

export { ErrorBoundary } from 'expo-router';

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

SplashScreen.preventAutoHideAsync();

const styles = StyleSheet.create({
  signedOutCover: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 55,
    backgroundColor: colors.background,
  },
});

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });

  const hideSplash = useCallback(() => {
    void SplashScreen.hideAsync();
  }, []);

  useEffect(() => {
    if (loaded || error) hideSplash();
  }, [loaded, error, hideSplash]);

  useEffect(() => {
    const t = setTimeout(hideSplash, 2500);
    return () => clearTimeout(t);
  }, [hideSplash]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }} onLayout={hideSplash}>
      <AuthProvider>
        <StatusBar style="light" />
        <RootNavigator />
      </AuthProvider>
    </View>
  );
}

function RootNavigator() {
  const { isLoading, isAuthenticated } = useAuth();

  useEffect(() => {
    return subscribeNotificationResponses();
  }, []);

  useEffect(() => {
    const ready = !isLoading && isAuthenticated;
    setNotificationRoutingReady(ready);
    if (!ready) return;

    openInitialNotificationResponse();
    void useNotificationStore.getState().refreshUnreadCount();

    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void useNotificationStore.getState().refreshUnreadCount();
      }
    });
    const unsubscribeForeground = subscribeForegroundNotifications(() => {
      void useNotificationStore.getState().refreshUnreadCount();
    });
    return () => {
      appState.remove();
      unsubscribeForeground();
    };
  }, [isLoading, isAuthenticated]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void recheckLocationPermission();
    });
    return () => sub.remove();
  }, []);

  if (isLoading) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.background,
        }}>
        <ActivityIndicator color={colors.accentLight} size="large" />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
        }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="login" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen
          name="register"
          options={{ animation: 'slide_from_right' }}
        />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="set-home-location" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="edit-profile" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="wallet" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="notifications" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="music-search" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="podcast-search" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="books" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="book-search" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="book/[id]" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="upload" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="tune/[id]" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="podcast/[id]" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="show/[id]" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="user/[id]" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="tag/[slug]" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="place/[placeId]" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen
          name="now-playing"
          options={{ animation: 'slide_from_bottom', presentation: 'modal' }}
        />
        <Stack.Screen name="auth/callback" />
      </Stack>
      <AppTabBar />
      <PlayerDock />
      <SignedOutCover />
      <AppToast />
    </View>
  );
}

/** Welcome screen drawn over the signed-in stack. Leaving that stack with a
 * redirect or reset unmounts the native tabs while they are on screen and
 * freezes iOS. */
function SignedOutCover() {
  const { isAuthenticated, isLoading } = useAuth();
  const root = (useSegments() as string[])[0];
  const onAuthRoute =
    root === 'index' ||
    root === 'login' ||
    root === 'register' ||
    root === 'auth';

  if (isLoading || isAuthenticated || onAuthRoute) return null;

  return (
    <View style={styles.signedOutCover}>
      <WelcomeLanding />
    </View>
  );
}
