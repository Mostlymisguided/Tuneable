import { ActivityIndicator, View } from 'react-native';
import { Redirect } from 'expo-router';
import { WelcomeLanding } from '@/src/components/WelcomeLanding';
import { useAuth } from '@/src/auth/AuthContext';
import { getPostAuthHref } from '@/src/lib/onboarding';
import { colors } from '@/src/theme/colors';

/** Auth gate: welcome landing, or onboarding/tabs when signed in. */
export default function Index() {
  const { isAuthenticated, isLoading, user } = useAuth();

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

  if (isAuthenticated) {
    return <Redirect href={getPostAuthHref(user)} />;
  }

  return <WelcomeLanding />;
}
