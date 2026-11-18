import { useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useSegments, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/src/auth/AuthContext';
import {
  TAB_BAR_BASE_HEIGHT,
  usePlayerDockState,
} from '@/src/hooks/usePlayerDock';
import { colors } from '@/src/theme/colors';
import { hasCustomProfilePic } from '@/src/types/user';
import { UserAvatar } from '@/src/components/UserAvatar';

type TabItem = {
  href: Href;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  segment?: string;
};

const TABS: TabItem[] = [
  { href: '/(tabs)', label: 'Home', icon: 'home' },
  { href: '/(tabs)/charts', label: 'Charts', icon: 'stats-chart', segment: 'charts' },
  { href: '/(tabs)/places', label: 'Places', icon: 'earth', segment: 'places' },
  { href: '/(tabs)/profile', label: 'Profile', icon: 'person', segment: 'profile' },
];

function tabHrefFromSegments(segments: string[]): Href | null {
  if (segments[0] !== '(tabs)') return null;
  const child = segments[1];
  if (child === 'music' || child === 'podcasts') return '/(tabs)/charts';
  const match = TABS.find((tab) => tab.segment && tab.segment === child);
  return match?.href ?? '/(tabs)';
}

/**
 * Persistent bottom tabs overlay — same idea as PlayerDock.
 * Hidden on auth, onboarding, and Now Playing.
 */
export function AppTabBar() {
  const { user } = useAuth();
  const { showTabBar, tabBarHeight } = usePlayerDockState();
  const segments = useSegments() as string[];
  const lastTabRef = useRef<Href>('/(tabs)');
  const profilePic = user?.profilePic;
  const showProfileAvatar = Boolean(user?.username);

  const routeTab = tabHrefFromSegments(segments);
  if (routeTab) lastTabRef.current = routeTab;
  const activeHref = routeTab ?? lastTabRef.current;

  if (!showTabBar) return null;

  return (
    <View
      style={[
        styles.bar,
        {
          height: tabBarHeight,
          paddingBottom: tabBarHeight - TAB_BAR_BASE_HEIGHT,
        },
      ]}>
      {TABS.map((tab) => {
        const active = activeHref === tab.href;
        const color = active ? colors.accentLight : colors.textMuted;
        const useAvatar = tab.segment === 'profile' && showProfileAvatar;
        return (
          <Pressable
            key={tab.label}
            style={styles.item}
            onPress={() => router.navigate(tab.href)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={tab.label}>
            {useAvatar ? (
              <UserAvatar
                username={user?.username}
                profilePic={hasCustomProfilePic(profilePic) ? profilePic : null}
                style={[
                  styles.profilePic,
                  { borderColor: active ? colors.accentLight : 'rgba(168, 85, 247, 0.45)' },
                ]}
              />
            ) : (
              <>
                <Ionicons name={tab.icon} size={24} color={color} />
                <Text style={[styles.label, { color }]}>{tab.label}</Text>
              </>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 40,
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.tabBar,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.cardBorder,
  },
  item: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 6,
    gap: 2,
  },
  label: {
    fontSize: 10,
    fontWeight: '500',
  },
  profilePic: {
    width: 30,
    height: 30,
    marginTop: 4,
    borderRadius: 15,
    borderWidth: 2,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
});
