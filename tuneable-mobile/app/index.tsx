import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { useAuth } from '@/src/auth/AuthContext';
import { getPostAuthHref } from '@/src/lib/onboarding';
import { colors } from '@/src/theme/colors';

/** Auth gate: send users to onboarding/tabs or login. */
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

  return <Redirect href="/login" />;
}
