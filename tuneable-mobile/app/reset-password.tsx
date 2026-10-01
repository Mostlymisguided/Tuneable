import { useState } from 'react';
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
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { Screen } from '@/src/components/Screen';
import { AuthHero, authStyles } from '@/src/components/AuthChrome';
import { authAPI } from '@/src/api/auth';
import { useAuth } from '@/src/auth/AuthContext';
import { getApiErrorMessage } from '@/src/lib/apiError';
import {
  IOS_PASSWORD_RULES,
  PASSWORD_HINT,
  PASSWORD_MAX_LENGTH,
  PASSWORD_PLACEHOLDER,
  passwordLengthError,
  submitWithPasswordWarnings,
} from '@/src/lib/passwordPolicy';
import { colors } from '@/src/theme/colors';

/** Opened from the emailed link https://tuneable.stream/reset-password?token=… */
export default function ResetPasswordScreen() {
  const params = useLocalSearchParams<{ token?: string }>();
  const token = typeof params.token === 'string' ? params.token : '';
  const { isAuthenticated, logout } = useAuth();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [linkInvalid, setLinkInvalid] = useState(!token);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async () => {
    setError(null);
    const lengthError = passwordLengthError(newPassword);
    if (lengthError) {
      setError(lengthError);
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setSubmitting(true);
    try {
      const result = await submitWithPasswordWarnings((acceptPasswordWarnings) =>
        authAPI.confirmPasswordReset(token, newPassword, acceptPasswordWarnings)
      );
      if (!result) return;
      // The reset revokes every existing session, including this device's.
      if (isAuthenticated) await logout().catch(() => undefined);
      setDone(true);
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.data?.code === 'RESET_TOKEN_INVALID') {
        setLinkInvalid(true);
      } else {
        setError(getApiErrorMessage(err, 'Could not reset your password. Please try again.'));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const passwordField = (value: string, onChange: (text: string) => void, placeholder?: string) => (
    <View style={authStyles.inputWrap}>
      <TextInput
        style={authStyles.inputBare}
        secureTextEntry={!showPasswords}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="new-password"
        textContentType="newPassword"
        passwordRules={IOS_PASSWORD_RULES}
        maxLength={PASSWORD_MAX_LENGTH}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        value={value}
        onChangeText={onChange}
        editable={!submitting}
      />
    </View>
  );

  const body = { color: colors.textMuted, fontSize: 14, lineHeight: 20 } as const;
  const heading = { color: colors.text, fontSize: 17, fontWeight: '700' } as const;

  return (
    <Screen>
      <KeyboardAvoidingView
        style={authStyles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/login'))}
          hitSlop={12}
          style={{ paddingHorizontal: 16, paddingTop: 8, alignSelf: 'flex-start' }}
          accessibilityRole="button"
          accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </Pressable>
        <ScrollView contentContainerStyle={authStyles.scroll} keyboardShouldPersistTaps="handled">
          <AuthHero subtitle="Choose a new password" />

          <View style={authStyles.card}>
            {done ? (
              <>
                <Text style={heading}>Password updated</Text>
                <Text style={[body, { marginTop: 8 }]}>
                  You&apos;ve been signed out on every device. Sign in with your new password.
                </Text>
                <Pressable style={authStyles.primaryBtn} onPress={() => router.replace('/login')}>
                  <Text style={authStyles.primaryBtnText}>Sign in</Text>
                </Pressable>
              </>
            ) : linkInvalid ? (
              <>
                <Text style={heading}>This link has expired</Text>
                <Text style={[body, { marginTop: 8 }]}>
                  Reset links work once and expire after 1 hour. Request a new one below.
                </Text>
                <Pressable
                  style={authStyles.primaryBtn}
                  onPress={() => router.replace('/forgot-password')}>
                  <Text style={authStyles.primaryBtnText}>Send a new link</Text>
                </Pressable>
              </>
            ) : (
              <>
                <Text style={authStyles.label}>New password</Text>
                {passwordField(newPassword, setNewPassword, PASSWORD_PLACEHOLDER)}
                <Text style={[body, { fontSize: 12, lineHeight: 17, marginTop: 6 }]}>
                  {PASSWORD_HINT}
                </Text>

                <Text style={authStyles.label}>Confirm new password</Text>
                {passwordField(confirmPassword, setConfirmPassword)}

                <Pressable
                  onPress={() => setShowPasswords((v) => !v)}
                  hitSlop={6}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12 }}
                  accessibilityRole="button">
                  <Ionicons
                    name={showPasswords ? 'eye-off-outline' : 'eye-outline'}
                    size={18}
                    color={colors.textMuted}
                  />
                  <Text style={{ color: colors.textMuted, fontSize: 13, fontWeight: '600' }}>
                    {showPasswords ? 'Hide passwords' : 'Show passwords'}
                  </Text>
                </Pressable>

                {error ? <Text style={authStyles.error}>{error}</Text> : null}

                <Pressable
                  style={[authStyles.primaryBtn, submitting && authStyles.disabled]}
                  onPress={() => void onSubmit()}
                  disabled={submitting}>
                  {submitting ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={authStyles.primaryBtnText}>Set new password</Text>
                  )}
                </Pressable>
              </>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
