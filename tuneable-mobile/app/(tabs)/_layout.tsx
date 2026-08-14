import { Redirect, Tabs } from 'expo-router';
import { View } from 'react-native';
import { useAuth } from '@/src/auth/AuthContext';
import { needsOnboarding } from '@/src/lib/onboarding';
import { colors } from '@/src/theme/colors';

export default function TabLayout() {
  const { isAuthenticated, isLoading, user } = useAuth();

  if (!isLoading && !isAuthenticated) {
    return <Redirect href="/login" />;
  }

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
        <Tabs.Screen name="music" options={{ title: 'Music', headerShown: false }} />
        <Tabs.Screen
          name="podcasts"
          options={{ title: 'Podcasts', headerShown: false }}
        />
        <Tabs.Screen name="profile" options={{ title: 'Profile', headerShown: false }} />
      </Tabs>
    </View>
  );
}
