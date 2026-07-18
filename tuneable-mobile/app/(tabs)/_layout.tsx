import { Redirect, Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { View } from 'react-native';
import { useAuth } from '@/src/auth/AuthContext';
import { colors } from '@/src/theme/colors';

export default function TabLayout() {
  const { isAuthenticated, isLoading } = useAuth();

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
            headerShown: false,
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="person" size={size} color={color} />
            ),
          }}
        />
      </Tabs>
    </View>
  );
}
