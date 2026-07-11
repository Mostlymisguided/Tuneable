import { Redirect, Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/src/auth/AuthContext';
import { PlayerMiniBar } from '@/src/components/PlayerMiniBar';
import { colors } from '@/src/theme/colors';
import { useCurrentTrack } from '@/src/stores/musicPlayerStore';
import { useCurrentEpisode } from '@/src/stores/podcastPlayerStore';

export default function TabLayout() {
  const { isAuthenticated, isLoading } = useAuth();
  const currentTrack = useCurrentTrack();
  const currentEpisode = useCurrentEpisode();
  const insets = useSafeAreaInsets();
  const tabBarHeight = 49 + Math.max(insets.bottom, 0);
  const showMini = Boolean(currentTrack || currentEpisode);

  if (!isLoading && !isAuthenticated) {
    return <Redirect href="/login" />;
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Tabs
        screenOptions={{
          headerStyle: { backgroundColor: colors.gradientStart },
          headerTintColor: colors.text,
          headerShadowVisible: false,
          tabBarStyle: {
            backgroundColor: colors.tabBar,
            borderTopColor: colors.cardBorder,
          },
          tabBarActiveTintColor: colors.accentLight,
          tabBarInactiveTintColor: colors.textMuted,
        }}>
        <Tabs.Screen
          name="index"
          options={{
            title: 'Home',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="home" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="music"
          options={{
            title: 'Music',
            headerShown: false,
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="musical-notes" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="podcasts"
          options={{
            title: 'Podcasts',
            headerShown: false,
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="mic" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: 'Profile',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="person" size={size} color={color} />
            ),
          }}
        />
      </Tabs>
      {showMini ? (
        <View
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: tabBarHeight,
          }}>
          <PlayerMiniBar />
        </View>
      ) : null}
    </View>
  );
}
