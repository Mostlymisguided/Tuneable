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
import * as AppleAuthentication from 'expo-apple-authentication';
import { Screen } from '@/src/components/Screen';
import { LegalLinks } from '@/src/components/LegalLinks';
import { authAPI } from '@/src/api/auth';
import { useAuth } from '@/src/auth/AuthContext';
import { getApiErrorMessage } from '@/src/lib/apiError';
import {
  isAppleSignInAvailable,
  signInWithApple,
} from '@/src/lib/appleAuth';
import {
  buildOAuthStartUrl,
  extractOAuthError,
  extractTokenFromUrl,
  getOAuthCallbackRedirect,
} from '@/src/lib/oauth';
import { getPostAuthHref } from '@/src/lib/onboarding';
import { colors } from '@/src/theme/colors';

WebBrowser.maybeCompleteAuthSession();

export default function RegisterScreen() {
  const { invite: inviteParam } = useLocalSearchParams<{ invite?: string }>();
  const {
    register,
    handleOAuthCallback,
    applySession,
    isAuthenticated,
    isLoading: authLoading,
    user: authUser,
  } = useAuth();

  const initialInvite = (
    typeof inviteParam === 'string' && inviteParam ? inviteParam : ''
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
  const [oauthLoading, setOauthLoading] = useState<
    'google' | 'facebook' | 'apple' | null
  >(null);
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const validateSeq = useRef(0);

  useEffect(() => {
    void isAppleSignInAvailable().then(setAppleAvailable);
  }, []);

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
    return <Redirect href={getPostAuthHref(authUser)} />;
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

  const optionalInvite =
    inviteCode.trim().length === 5 ? inviteCode.trim().toUpperCase() : undefined;

  const assertInviteOk = (): boolean => {
    if (inviteCode.trim().length > 0 && inviteCode.trim().length < 5) {
      setError('Invite codes are 5 characters. Clear the field to continue without one.');
      return false;
    }
    if (inviteStatus === 'invalid') {
      setError('Invalid invite code. Clear it or use a valid referral link.');
      return false;
    }
    return true;
  };

  const onSubmit = async () => {
    setError(null);
    if (!assertInviteOk()) return;
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
      if (optionalInvite && inviteStatus !== 'valid') {
        await validateInvite(optionalInvite);
      }
      const nextUser = await register({
        username,
        email,
        password,
        ...(optionalInvite ? { parentInviteCode: optionalInvite } : {}),
      });
      router.replace(getPostAuthHref(nextUser));
    } catch (err) {
      setError(getApiErrorMessage(err, 'Registration failed.'));
    } finally {
      setSubmitting(false);
    }
  };

  const onOAuth = async (provider: 'google' | 'facebook') => {
    setError(null);
    if (!assertInviteOk()) return;
    setOauthLoading(provider);
    try {
      if (optionalInvite && inviteStatus !== 'valid') {
        await validateInvite(optionalInvite);
      }
      const redirectUrl = getOAuthCallbackRedirect();
      const startUrl = buildOAuthStartUrl(provider, {
        inviteCode: optionalInvite,
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
        const nextUser = await handleOAuthCallback(token);
        router.replace(getPostAuthHref(nextUser));
      }
    } catch (err) {
      setError(getApiErrorMessage(err, `${provider} sign-up failed.`));
    } finally {
      setOauthLoading(null);
    }
  };

  const onApple = async () => {
    setError(null);
    if (!assertInviteOk()) return;
    setOauthLoading('apple');
    try {
      if (optionalInvite && inviteStatus !== 'valid') {
        await validateInvite(optionalInvite);
      }
      const { token, user } = await signInWithApple({
        inviteCode: optionalInvite,
      });
      const nextUser = await applySession(token, user);
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
      setError(getApiErrorMessage(err, 'Apple sign-up failed.'));
    } finally {
      setOauthLoading(null);
    }
  };

  const busy = submitting || oauthLoading !== null;
  const showInviteField = Boolean(initialInvite) || inviteCode.length > 0 || inviteStatus !== 'idle';

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
            {showInviteField ? (
              <>
                <Text style={styles.label}>Invite code (optional)</Text>
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
              </>
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
              placeholder="Confirm password"
              placeholderTextColor={colors.textMuted}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              editable={!busy}
            />

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <Pressable
              style={[styles.primaryBtn, busy && styles.btnDisabled]}
              onPress={() => void onSubmit()}
              disabled={busy}>
              {submitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryBtnText}>Create account</Text>
              )}
            </Pressable>

            <Text style={styles.or}>or</Text>

            <Pressable
              style={[styles.oauthBtn, busy && styles.btnDisabled]}
              onPress={() => void onOAuth('google')}
              disabled={busy}>
              {oauthLoading === 'google' ? (
                <ActivityIndicator color={colors.text} />
              ) : (
                <Text style={styles.oauthBtnText}>Continue with Google</Text>
              )}
            </Pressable>

            <Pressable
              style={[styles.oauthBtn, styles.facebookBtn, busy && styles.btnDisabled]}
              onPress={() => void onOAuth('facebook')}
              disabled={busy}>
              {oauthLoading === 'facebook' ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={[styles.oauthBtnText, styles.facebookBtnText]}>
                  Continue with Facebook
                </Text>
              )}
            </Pressable>

            {appleAvailable ? (
              <AppleAuthentication.AppleAuthenticationButton
                buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_UP}
                buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
                cornerRadius={10}
                style={styles.appleBtn}
                onPress={() => void onApple()}
              />
            ) : null}
          </View>

          <Pressable onPress={() => router.replace('/login')} disabled={busy}>
            <Text style={styles.switchAuth}>
              Already have an account? <Text style={styles.switchAuthLink}>Sign in</Text>
            </Text>
          </Pressable>

          <LegalLinks />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 48,
    paddingBottom: 40,
  },
  hero: { marginBottom: 28 },
  brand: {
    fontSize: 36,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -0.5,
  },
  subtitle: {
    marginTop: 8,
    fontSize: 16,
    color: colors.textMuted,
  },
  form: { gap: 10 },
  label: {
    marginTop: 6,
    fontSize: 13,
    fontWeight: '600',
    color: colors.textMuted,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  inviteHint: { fontSize: 13, color: colors.textMuted },
  inviteValid: { fontSize: 13, color: '#22c55e' },
  inviteInvalid: { fontSize: 13, color: '#ef4444' },
  error: { marginTop: 4, color: '#ef4444', fontSize: 14 },
  primaryBtn: {
    marginTop: 12,
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  btnDisabled: { opacity: 0.6 },
  or: {
    textAlign: 'center',
    marginVertical: 8,
    color: colors.textMuted,
    fontSize: 13,
  },
  oauthBtn: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: colors.surface,
  },
  oauthBtnText: { color: colors.text, fontSize: 15, fontWeight: '600' },
  facebookBtn: { backgroundColor: '#1877F2', borderColor: '#1877F2' },
  facebookBtnText: { color: '#fff' },
  appleBtn: { width: '100%', height: 48, marginTop: 4 },
  switchAuth: {
    marginTop: 28,
    textAlign: 'center',
    color: colors.textMuted,
    fontSize: 14,
  },
  switchAuthLink: { color: colors.accent, fontWeight: '600' },
});
