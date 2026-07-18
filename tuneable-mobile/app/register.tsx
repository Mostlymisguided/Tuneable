import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import Constants from 'expo-constants';
import { Screen } from '@/src/components/Screen';
import { authAPI } from '@/src/api/auth';
import { API_ORIGIN } from '@/src/api/client';
import { useAuth } from '@/src/auth/AuthContext';
import { getApiErrorMessage } from '@/src/lib/apiError';
import {
  buildOAuthStartUrl,
  extractOAuthError,
  extractTokenFromUrl,
  getOAuthCallbackRedirect,
} from '@/src/lib/oauth';
import { colors } from '@/src/theme/colors';

WebBrowser.maybeCompleteAuthSession();

const DEFAULT_INVITE_CODE = (
  process.env.EXPO_PUBLIC_DEFAULT_INVITE_CODE ||
  Constants.expoConfig?.extra?.defaultInviteCode ||
  'PE856'
)
  .toString()
  .trim()
  .toUpperCase();

export default function RegisterScreen() {
  const { invite: inviteParam } = useLocalSearchParams<{ invite?: string }>();
  const {
    register,
    handleOAuthCallback,
    isAuthenticated,
    isLoading: authLoading,
  } = useAuth();

  const initialInvite = (
    (typeof inviteParam === 'string' && inviteParam) ||
    DEFAULT_INVITE_CODE ||
    ''
  )
    .trim()
    .toUpperCase()
    .slice(0, 5);

  const [inviteCode, setInviteCode] = useState(initialInvite);
  const [inviteStatus, setInviteStatus] = useState<
    'idle' | 'checking' | 'valid' | 'invalid'
  >('idle');
  const [inviterUsername, setInviterUsername] = useState<string | null>(null);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<'google' | 'facebook' | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);
  const validateSeq = useRef(0);

  const validateInvite = useCallback(async (code: string) => {
    const trimmed = code.trim().toUpperCase();
    if (trimmed.length !== 5) {
      setInviteStatus('idle');
      setInviterUsername(null);
      return;
    }
    const seq = ++validateSeq.current;
    setInviteStatus('checking');
    try {
      const res = await authAPI.validateInvite(trimmed);
      if (seq !== validateSeq.current) return;
      if (res.valid) {
        setInviteStatus('valid');
        setInviterUsername(res.inviterUsername ?? null);
      } else {
        setInviteStatus('invalid');
        setInviterUsername(null);
      }
    } catch {
      if (seq !== validateSeq.current) return;
      setInviteStatus('invalid');
      setInviterUsername(null);
    }
  }, []);

  useEffect(() => {
    if (initialInvite.length === 5) {
      void validateInvite(initialInvite);
    }
  }, [initialInvite, validateInvite]);

  if (!authLoading && isAuthenticated) {
    return <Redirect href="/(tabs)" />;
  }

  const onInviteChange = (value: string) => {
    const next = value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 5);
    setInviteCode(next);
    if (next.length === 5) {
      void validateInvite(next);
    } else {
      setInviteStatus('idle');
      setInviterUsername(null);
    }
  };

  const onSubmit = async () => {
    setError(null);
    if (inviteCode.trim().length !== 5) {
      setError('A valid 5-character invite code is required.');
      return;
    }
    if (inviteStatus === 'invalid') {
      setError('Invalid invite code.');
      return;
    }
    if (!username.trim() || !email.trim() || !password) {
      setError('Fill in username, email, and password.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    try {
      if (inviteStatus !== 'valid') {
        await validateInvite(inviteCode);
      }
      await register({
        username,
        email,
        password,
        parentInviteCode: inviteCode,
      });
      router.replace('/(tabs)');
    } catch (err) {
      setError(getApiErrorMessage(err, 'Registration failed.'));
    } finally {
      setSubmitting(false);
    }
  };

  const onOAuth = async (provider: 'google' | 'facebook') => {
    setError(null);
    if (inviteCode.trim().length !== 5) {
      setError('Enter a valid invite code before continuing with social sign-up.');
      return;
    }
    if (inviteStatus === 'invalid') {
      setError('Invalid invite code.');
      return;
    }
    setOauthLoading(provider);
    try {
      if (inviteStatus !== 'valid') {
        await validateInvite(inviteCode);
      }
      const redirectUrl = getOAuthCallbackRedirect();
      const startUrl = buildOAuthStartUrl(provider, {
        inviteCode: inviteCode.trim().toUpperCase(),
      });
      const result = await WebBrowser.openAuthSessionAsync(startUrl, redirectUrl);

      if (result.type === 'success' && result.url) {
        const oauthError = extractOAuthError(result.url);
        if (oauthError) {
          setError(oauthError.replace(/_/g, ' '));
          return;
        }
        const token = extractTokenFromUrl(result.url);
        if (!token) {
          setError(`${provider} sign-up did not return a token.`);
          return;
        }
        await handleOAuthCallback(token);
        router.replace('/(tabs)');
      }
    } catch (err) {
      setError(getApiErrorMessage(err, `${provider} sign-up failed.`));
    } finally {
      setOauthLoading(null);
    }
  };

  const busy = submitting || oauthLoading !== null;

  return (
    <Screen>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled">
          <View style={styles.hero}>
            <Text style={styles.brand}>Tuneable</Text>
            <Text style={styles.subtitle}>Create your account</Text>
          </View>

          <View style={styles.form}>
            <Text style={styles.label}>Invite code *</Text>
            <TextInput
              style={styles.input}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={5}
              placeholder="XXXXX"
              placeholderTextColor={colors.textMuted}
              value={inviteCode}
              onChangeText={onInviteChange}
              editable={!busy}
            />
            {inviteStatus === 'checking' ? (
              <Text style={styles.inviteHint}>Checking invite…</Text>
            ) : inviteStatus === 'valid' ? (
              <Text style={styles.inviteValid}>
                {inviterUsername
                  ? `Invited by @${inviterUsername}`
                  : 'Invite code valid'}
              </Text>
            ) : inviteStatus === 'invalid' ? (
              <Text style={styles.inviteInvalid}>Invalid invite code</Text>
            ) : null}

            <Text style={styles.label}>Username *</Text>
            <TextInput
              style={styles.input}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="username"
              textContentType="username"
              placeholder="yourname"
              placeholderTextColor={colors.textMuted}
              value={username}
              onChangeText={setUsername}
              editable={!busy}
            />

            <Text style={styles.label}>Email *</Text>
            <TextInput
              style={styles.input}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              textContentType="emailAddress"
              keyboardType="email-address"
              placeholder="you@example.com"
              placeholderTextColor={colors.textMuted}
              value={email}
              onChangeText={setEmail}
              editable={!busy}
            />

            <Text style={styles.label}>Password *</Text>
            <TextInput
              style={styles.input}
              secureTextEntry
              autoCapitalize="none"
              autoComplete="new-password"
              textContentType="newPassword"
              placeholder="At least 6 characters"
              placeholderTextColor={colors.textMuted}
              value={password}
              onChangeText={setPassword}
              editable={!busy}
            />

            <Text style={styles.label}>Confirm password *</Text>
            <TextInput
              style={styles.input}
              secureTextEntry
              autoCapitalize="none"
              autoComplete="new-password"
              textContentType="newPassword"
              placeholder="••••••••"
              placeholderTextColor={colors.textMuted}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
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
                <Text style={styles.buttonText}>Create account</Text>
              )}
            </Pressable>

            <View style={styles.dividerRow}>
              <View style={styles.divider} />
              <Text style={styles.dividerText}>or</Text>
              <View style={styles.divider} />
            </View>

            <Pressable
              style={[styles.oauthBtn, busy && styles.buttonDisabled]}
              onPress={() => void onOAuth('google')}
              disabled={busy}>
              {oauthLoading === 'google' ? (
                <ActivityIndicator color={colors.text} />
              ) : (
                <Text style={styles.oauthText}>Continue with Google</Text>
              )}
            </Pressable>

            <Pressable
              style={[styles.oauthBtn, busy && styles.buttonDisabled]}
              onPress={() => void onOAuth('facebook')}
              disabled={busy}>
              {oauthLoading === 'facebook' ? (
                <ActivityIndicator color={colors.text} />
              ) : (
                <Text style={styles.oauthText}>Continue with Facebook</Text>
              )}
            </Pressable>

            <Pressable
              style={styles.linkBtn}
              onPress={() => router.replace('/login')}
              disabled={busy}>
              <Text style={styles.linkText}>
                Already have an account? Sign in
              </Text>
            </Pressable>

            <Text style={styles.hint}>API: {API_ORIGIN}</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 40,
  },
  hero: {
    marginBottom: 28,
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
  inviteHint: {
    color: colors.textMuted,
    fontSize: 13,
  },
  inviteValid: {
    color: '#86efac',
    fontSize: 13,
    fontWeight: '500',
  },
  inviteInvalid: {
    color: '#fca5a5',
    fontSize: 13,
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
  oauthBtn: {
    marginTop: 8,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  oauthText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  linkBtn: {
    marginTop: 18,
    alignItems: 'center',
  },
  linkText: {
    color: colors.accentLight,
    fontSize: 14,
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
