import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { Screen } from '@/src/components/Screen';
import { BrandMark, authStyles } from '@/src/components/AuthChrome';
import { LegalLinks } from '@/src/components/LegalLinks';
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

  return (
    <Screen padForPlayer={false}>
      <View style={styles.root}>
        <View pointerEvents="none" style={styles.orbTop} />
        <View pointerEvents="none" style={styles.orbBottom} />

        <View style={styles.center}>
          <View style={styles.hero}>
            <BrandMark size={128} />
            <Text style={styles.wordmark}>Tuneable</Text>
            <Text style={styles.tagline}>Tip What You Love</Text>
            <View style={styles.tagRule} />
          </View>

          <View style={styles.actions}>
            <Pressable
              style={[authStyles.primaryBtn, styles.cta]}
              onPress={() => router.push('/register')}
              accessibilityRole="button"
              accessibilityLabel="Create Account">
              <Text style={authStyles.primaryBtnText}>Create Account</Text>
            </Pressable>
            <Pressable
              style={authStyles.ghostBtn}
              onPress={() => router.push('/login')}
              accessibilityRole="button"
              accessibilityLabel="Log in">
              <Text style={authStyles.ghostBtnText}>Log in</Text>
            </Pressable>
          </View>
        </View>

        <LegalLinks />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    paddingHorizontal: 28,
    paddingBottom: 12,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
  },
  orbTop: {
    position: 'absolute',
    top: -90,
    right: -70,
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: 'rgba(147, 51, 234, 0.32)',
  },
  orbBottom: {
    position: 'absolute',
    bottom: 24,
    left: -100,
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: 'rgba(168, 85, 247, 0.16)',
  },
  hero: {
    alignItems: 'center',
    marginBottom: 48,
  },
  wordmark: {
    marginTop: 18,
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: 1.6,
    color: colors.text,
  },
  tagline: {
    marginTop: 10,
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '600',
    letterSpacing: 0.4,
    color: '#e9d5ff',
    textAlign: 'center',
  },
  tagRule: {
    marginTop: 18,
    width: 40,
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.accentLight,
  },
  actions: {
    width: '100%',
  },
  cta: {
    marginTop: 0,
  },
});
