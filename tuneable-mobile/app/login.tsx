import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Redirect, router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import axios from 'axios';
import { Screen } from '@/src/components/Screen';
import { useAuth } from '@/src/auth/AuthContext';
import { colors } from '@/src/theme/colors';
import { API_ORIGIN } from '@/src/api/client';
import {
  buildOAuthStartUrl,
  extractOAuthError,
  extractTokenFromUrl,
  getOAuthCallbackRedirect,
} from '@/src/lib/oauth';

WebBrowser.maybeCompleteAuthSession();

export default function LoginScreen() {
  const { login, handleOAuthCallback, isAuthenticated, isLoading: authLoading } =
    useAuth();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<'google' | 'facebook' | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);

  if (!authLoading && isAuthenticated) {
    return <Redirect href="/(tabs)" />;
  }

  const onSubmit = async () => {
    setError(null);
    if (!identifier.trim() || !password) {
      setError('Enter your email/username and password.');
      return;
    }
    setSubmitting(true);
    try {
      await login(identifier, password);
      router.replace('/(tabs)');
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const message =
          (err.response?.data as { message?: string } | undefined)?.message ||
          err.message;
        if (!err.response) {
          setError(
            `Cannot reach API at ${API_ORIGIN}. Is the backend running? On a device, use your Mac's LAN IP.`
          );
        } else {
          setError(message || 'Login failed.');
        }
      } else {
        setError('Login failed.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const onOAuth = async (provider: 'google' | 'facebook') => {
    setError(null);
    setOauthLoading(provider);
    try {
      const redirectUrl = getOAuthCallbackRedirect();
      const startUrl = buildOAuthStartUrl(provider);
      const result = await WebBrowser.openAuthSessionAsync(startUrl, redirectUrl);

      if (result.type === 'success' && result.url) {
        const oauthError = extractOAuthError(result.url);
        if (oauthError) {
          setError(oauthError.replace(/_/g, ' '));
          return;
        }
        const token = extractTokenFromUrl(result.url);
        if (!token) {
          setError(`${provider} sign-in did not return a token.`);
          return;
        }
        await handleOAuthCallback(token);
        router.replace('/(tabs)');
      } else if (result.type === 'cancel') {
        setError(null);
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : `${provider} sign-in failed.`
      );
    } finally {
      setOauthLoading(null);
    }
  };

  const busy = submitting || oauthLoading !== null;

  return (
    <Screen>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.hero}>
          <Text style={styles.brand}>Tuneable</Text>
          <Text style={styles.subtitle}>Sign in to listen and tip</Text>
        </View>

        <View style={styles.form}>
          <Text style={styles.label}>Email or username</Text>
          <TextInput
            style={styles.input}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="username"
            textContentType="username"
            keyboardType="email-address"
            placeholder="you@example.com"
            placeholderTextColor={colors.textMuted}
            value={identifier}
            onChangeText={setIdentifier}
            editable={!busy}
          />

          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input}
            secureTextEntry
            autoCapitalize="none"
            autoComplete="password"
            textContentType="password"
            placeholder="••••••••"
            placeholderTextColor={colors.textMuted}
            value={password}
            onChangeText={setPassword}
            editable={!busy}
            onSubmitEditing={() => void onSubmit()}
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable
            style={[styles.button, busy && styles.buttonDisabled]}
            onPress={() => void onSubmit()}
            disabled={busy}>
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Sign in</Text>
            )}
          </Pressable>

          <View style={styles.dividerRow}>
            <View style={styles.divider} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.divider} />
          </View>

          <Pressable
            style={[styles.googleBtn, busy && styles.buttonDisabled]}
            onPress={() => void onOAuth('google')}
            disabled={busy}>
            {oauthLoading === 'google' ? (
              <ActivityIndicator color={colors.text} />
            ) : (
              <Text style={styles.googleText}>Continue with Google</Text>
            )}
          </Pressable>

          <Pressable
            style={[styles.googleBtn, busy && styles.buttonDisabled]}
            onPress={() => void onOAuth('facebook')}
            disabled={busy}>
            {oauthLoading === 'facebook' ? (
              <ActivityIndicator color={colors.text} />
            ) : (
              <Text style={styles.googleText}>Continue with Facebook</Text>
            )}
          </Pressable>

          <Text style={styles.hint}>API: {API_ORIGIN}</Text>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: 'center',
  },
  hero: {
    marginBottom: 36,
  },
  brand: {
    fontSize: 40,
    fontWeight: '700',
    color: colors.text,
    letterSpacing: -0.5,
  },
  subtitle: {
    marginTop: 8,
    fontSize: 16,
    color: colors.textSecondary,
  },
  form: {
    gap: 8,
  },
  label: {
    marginTop: 12,
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '500',
  },
  input: {
    backgroundColor: colors.inputBg,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    color: colors.text,
    fontSize: 16,
  },
  button: {
    marginTop: 20,
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 18,
    marginBottom: 4,
  },
  divider: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.cardBorder,
  },
  dividerText: {
    color: colors.textMuted,
    fontSize: 13,
  },
  googleBtn: {
    marginTop: 8,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  googleText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  error: {
    marginTop: 12,
    color: '#fca5a5',
    fontSize: 14,
  },
  hint: {
    marginTop: 24,
    textAlign: 'center',
    color: colors.textMuted,
    fontSize: 12,
  },
});
