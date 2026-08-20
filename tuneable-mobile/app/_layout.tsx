import { Stack } from 'expo-router';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import 'react-native-reanimated';
import { StatusBar } from 'expo-status-bar';

import { AuthProvider, useAuth } from '@/src/auth/AuthContext';
import { AppTabBar } from '@/src/components/AppTabBar';
import { AppToast } from '@/src/components/AppToast';
import { PlayerDock } from '@/src/components/PlayerDock';
import { colors } from '@/src/theme/colors';

export { ErrorBoundary } from 'expo-router';

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });

  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return (
    <AuthProvider>
      <StatusBar style="light" />
      <RootNavigator />
    </AuthProvider>
  );
}

function RootNavigator() {
  const { isLoading } = useAuth();

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
        <Stack.Screen name="login" />
        <Stack.Screen name="register" />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="set-home-location" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="wallet" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="music-search" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="podcast-search" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="import-library" options={{ animation: 'slide_from_right' }} />
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
      <AppToast />
    </View>
  );
}
