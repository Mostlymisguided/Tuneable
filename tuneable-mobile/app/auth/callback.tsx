import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { Screen } from '@/src/components/Screen';
import { useAuth } from '@/src/auth/AuthContext';
import { getPostAuthHref } from '@/src/lib/onboarding';
import { clarifyOAuthErrorMessage } from '@/src/lib/oauthErrorMessage';
import { colors } from '@/src/theme/colors';

export default function AuthCallbackScreen() {
  const { handleOAuthCallback, isAuthenticated, user } = useAuth();
  const params = useLocalSearchParams<{
    token?: string;
    oauth_success?: string;
    error?: string;
    message?: string;
  }>();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const run = async () => {
      if (params.error) {
        const isSpotify = params.error === 'spotify_auth_failed';
        setError(
          clarifyOAuthErrorMessage(
            typeof params.message === 'string' ? params.message : null,
            isSpotify
              ? 'Spotify connection failed. Please try again.'
              : String(params.error)
          )
        );
        setDone(true);
        return;
      }

      const token = typeof params.token === 'string' ? params.token : null;
      if (!token) {
        setError('Missing auth token from Google.');
        setDone(true);
        return;
      }

      try {
        const nextUser = await handleOAuthCallback(token);
        router.replace(getPostAuthHref(nextUser));
      } catch {
        setError('Signed in with Google, but failed to load your profile.');
        setDone(true);
      }
    };
    void run();
  }, [params.token, params.error, params.message, handleOAuthCallback]);

  if (isAuthenticated && !error) {
    return <Redirect href={getPostAuthHref(user)} />;
  }

  return (
    <Screen style={styles.center}>
      {!done && !error ? (
        <>
          <ActivityIndicator color={colors.accentLight} size="large" />
          <Text style={styles.text}>Finishing sign-in…</Text>
        </>
      ) : (
        <>
          <Text style={styles.error}>{error || 'Something went wrong.'}</Text>
          <Text
            style={styles.link}
            onPress={() => router.replace('/login')}>
            Back to login
          </Text>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  text: {
    marginTop: 16,
    color: colors.textSecondary,
    fontSize: 15,
  },
  error: {
    color: '#fca5a5',
    fontSize: 15,
    textAlign: 'center',
  },
  link: {
    marginTop: 16,
    color: colors.accentLight,
    fontSize: 15,
    fontWeight: '600',
  },
});
