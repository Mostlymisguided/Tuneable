import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Redirect, router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import * as AppleAuthentication from 'expo-apple-authentication';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { Screen } from '@/src/components/Screen';
import {
  AuthHero,
  AuthSocialButton,
  authStyles,
} from '@/src/components/AuthChrome';
import { LegalLinks } from '@/src/components/LegalLinks';
import { useAuth } from '@/src/auth/AuthContext';
import { getApiErrorMessage } from '@/src/lib/apiError';
import {
  isAppleSignInAvailable,
  signInWithApple,
} from '@/src/lib/appleAuth';
import { API_ORIGIN } from '@/src/api/client';
import {
  buildOAuthStartUrl,
  extractOAuthError,
  extractTokenFromUrl,
  getOAuthCallbackRedirect,
} from '@/src/lib/oauth';
import { getPostAuthHref } from '@/src/lib/onboarding';
import { colors } from '@/src/theme/colors';

WebBrowser.maybeCompleteAuthSession();

export default function LoginScreen() {
  const {
    login,
    handleOAuthCallback,
    applySession,
    isAuthenticated,
    isLoading: authLoading,
    user,
  } = useAuth();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<
    'google' | 'facebook' | 'apple' | null
  >(null);
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void isAppleSignInAvailable().then(setAppleAvailable);
  }, []);

  if (!authLoading && isAuthenticated) {
    return <Redirect href={getPostAuthHref(user)} />;
  }

  const onSubmit = async () => {
    setError(null);
    if (!identifier.trim() || !password) {
      setError('Enter your email/username and password.');
      return;
    }
    setSubmitting(true);
    try {
      const nextUser = await login(identifier, password);
      router.replace(getPostAuthHref(nextUser));
    } catch (err) {
      if (axios.isAxiosError(err) && !err.response) {
        setError(
          __DEV__
            ? `Cannot reach API at ${API_ORIGIN}. Is the backend running? On a device, use your Mac's LAN IP.`
            : 'Cannot reach the server. Check your connection and try again.'
        );
      } else {
        setError(getApiErrorMessage(err, 'Login failed.'));
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
        const nextUser = await handleOAuthCallback(token);
        router.replace(getPostAuthHref(nextUser));
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

  const onApple = async () => {
    setError(null);
    setOauthLoading('apple');
    try {
      const { token, user: appleUser } = await signInWithApple();
      const nextUser = await applySession(token, appleUser);
      router.replace(getPostAuthHref(nextUser));
    } catch (err) {
      if (
        err &&
        typeof err === 'object' &&
        'code' in err &&
        (err as { code?: string }).code === 'ERR_REQUEST_CANCELED'
      ) {
        setError(null);
        return;
      }
      setError(getApiErrorMessage(err, 'Apple Sign In failed.'));
    } finally {
      setOauthLoading(null);
    }
  };

  const busy = submitting || oauthLoading !== null;

  return (
    <Screen>
      <KeyboardAvoidingView
        style={authStyles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={authStyles.scroll}
          keyboardShouldPersistTaps="handled">
          <AuthHero
            subtitle="Tip What You Love"
            tagline="The Social Charting App"
          />

          <View style={authStyles.card}>
            <Text style={[authStyles.label, { marginTop: 0 }]}>
              Email or username
            </Text>
            <TextInput
              style={authStyles.input}
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

            <Text style={authStyles.label}>Password</Text>
            <View style={authStyles.inputWrap}>
              <TextInput
                style={authStyles.inputBare}
                secureTextEntry={!showPassword}
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
              <Pressable
                style={authStyles.eyeBtn}
                onPress={() => setShowPassword((v) => !v)}
                hitSlop={6}
                accessibilityLabel={
                  showPassword ? 'Hide password' : 'Show password'
                }>
                <Ionicons
                  name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                  size={20}
                  color={colors.textMuted}
                />
              </Pressable>
            </View>

            <Pressable
              onPress={() =>
                void WebBrowser.openBrowserAsync(
                  'https://tuneable.stream/forgot-password'
                )
              }
              hitSlop={6}
              style={{ alignSelf: 'flex-end', marginTop: 10 }}>
              <Text style={authStyles.switchAuthLink}>Forgot password?</Text>
            </Pressable>

            {error ? <Text style={authStyles.error}>{error}</Text> : null}

            <Pressable
              style={[authStyles.primaryBtn, busy && authStyles.disabled]}
              onPress={() => void onSubmit()}
              disabled={busy}>
              {submitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={authStyles.primaryBtnText}>Sign in</Text>
              )}
            </Pressable>
          </View>

          <View style={authStyles.dividerRow}>
            <View style={authStyles.divider} />
            <Text style={authStyles.dividerText}>or</Text>
            <View style={authStyles.divider} />
          </View>

          {appleAvailable ? (
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={
                AppleAuthentication.AppleAuthenticationButtonType.CONTINUE
              }
              buttonStyle={
                AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
              }
              cornerRadius={14}
              style={authStyles.appleBtn}
              onPress={() => void onApple()}
            />
          ) : null}

          <AuthSocialButton
            icon="logo-google"
            label="Continue with Google"
            onPress={() => void onOAuth('google')}
            loading={oauthLoading === 'google'}
            disabled={busy}
          />
          <AuthSocialButton
            icon="logo-facebook"
            label="Continue with Facebook"
            onPress={() => void onOAuth('facebook')}
            loading={oauthLoading === 'facebook'}
            disabled={busy}
          />

          <Pressable
            onPress={() => router.push('/register')}
            disabled={busy}
            style={{ marginTop: 8 }}>
            <Text style={authStyles.switchAuth}>
              New here?{' '}
              <Text style={authStyles.switchAuthLink}>Create an account</Text>
            </Text>
          </Pressable>

          <LegalLinks />
          {__DEV__ ? (
            <Text style={authStyles.hint}>API: {API_ORIGIN}</Text>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
