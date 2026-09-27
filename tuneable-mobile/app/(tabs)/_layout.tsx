import { useEffect, useRef } from 'react';
import { Redirect, Tabs, router } from 'expo-router';
import { View } from 'react-native';
import { useAuth } from '@/src/auth/AuthContext';
import { needsOnboarding } from '@/src/lib/onboarding';
import { colors } from '@/src/theme/colors';

export default function TabLayout() {
  const { isAuthenticated, isLoading, user } = useAuth();
  const sentHome = useRef(false);

  useEffect(() => {
    if (isLoading || isAuthenticated) {
      sentHome.current = false;
      return;
    }
    if (sentHome.current) return;
    sentHome.current = true;
    // Keep <Tabs> mounted and replace from an effect. Returning <Redirect>
    // here unmounts the native tab navigator while it is still on screen,
    // which freezes iOS after the settings sheet has already closed.
    router.replace('/');
  }, [isLoading, isAuthenticated]);

  if (!isLoading && isAuthenticated && needsOnboarding(user)) {
    return <Redirect href="/onboarding" />;
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Tabs
        tabBar={() => null}
        screenOptions={{
          headerStyle: { backgroundColor: colors.gradientStart },
          headerTintColor: colors.text,
          headerShadowVisible: false,
        }}>
        <Tabs.Screen name="index" options={{ title: 'Home', headerShown: false }} />
        <Tabs.Screen name="charts" options={{ title: 'Charts', headerShown: false }} />
        <Tabs.Screen name="places" options={{ title: 'Places', headerShown: false }} />
        <Tabs.Screen name="music" options={{ href: null, headerShown: false }} />
        <Tabs.Screen
          name="podcasts"
          options={{ href: null, headerShown: false }}
        />
        <Tabs.Screen name="profile" options={{ title: 'Profile', headerShown: false }} />
      </Tabs>
    </View>
  );
}
