import { useEffect, useRef } from 'react';
import { CommonActions, useNavigation } from '@react-navigation/native';
import { Redirect, Tabs } from 'expo-router';
import { View } from 'react-native';
import { useAuth } from '@/src/auth/AuthContext';
import { needsOnboarding } from '@/src/lib/onboarding';
import { colors } from '@/src/theme/colors';

function resetRootToWelcome(navigation: ReturnType<typeof useNavigation>) {
  const reset = (nav: ReturnType<typeof useNavigation>) => {
    nav.dispatch(
      CommonActions.reset({
        index: 0,
        routes: [{ name: 'index' }],
      })
    );
  };

  // `router.replace('/')` is handled by the tabs navigator and opens the home
  // tab. Reset the root stack, which is the navigator that owns both `index`
  // (sign in / sign up) and `(tabs)`.
  let current = navigation;
  let parent = current.getParent();
  while (parent) {
    const names = parent.getState()?.routeNames;
    if (names?.includes('index') && names.includes('(tabs)')) {
      reset(parent);
      return;
    }
    current = parent;
    parent = current.getParent();
  }

  const names = current.getState()?.routeNames;
  if (names?.includes('index') && names.includes('(tabs)')) {
    reset(current);
  }
}

export default function TabLayout() {
  const { isAuthenticated, isLoading, user } = useAuth();
  const navigation = useNavigation();
  const sentHome = useRef(false);

  useEffect(() => {
    if (isLoading || isAuthenticated) {
      sentHome.current = false;
      return;
    }
    if (sentHome.current) return;
    sentHome.current = true;
    // Keep <Tabs> mounted and leave via a navigation action. Returning
    // <Redirect> unmounts the native tab navigator while it is on screen
    // and freezes iOS.
    resetRootToWelcome(navigation);
  }, [isLoading, isAuthenticated, navigation]);

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
