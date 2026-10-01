import { useState } from 'react';
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
import { Redirect, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { Screen } from '@/src/components/Screen';
import { authStyles } from '@/src/components/AuthChrome';
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
import { showToast } from '@/src/stores/toastStore';
import { colors } from '@/src/theme/colors';

export default function ChangePasswordScreen() {
  const { user, isAuthenticated, isLoading, replaceToken, refreshUser } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sendingLink, setSendingLink] = useState(false);
  const [linkSent, setLinkSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isLoading && !isAuthenticated) {
    return <Redirect href="/login" />;
  }
  if (!user) return null;

  const onSubmit = async () => {
    setError(null);
    if (!currentPassword) {
      setError('Enter your current password.');
      return;
    }
    const lengthError = passwordLengthError(newPassword);
    if (lengthError) {
      setError(lengthError);
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('New passwords do not match.');
      return;
    }
    if (newPassword === currentPassword) {
      setError('New password must be different from your current one.');
      return;
    }

    setSaving(true);
    try {
      const result = await submitWithPasswordWarnings((acceptPasswordWarnings) =>
        authAPI.changePassword(currentPassword, newPassword, acceptPasswordWarnings)
      );
      if (!result) return;
      await replaceToken(result.token);
      showToast('Password changed. Other devices have been signed out.');
      router.back();
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.data?.code === 'NO_PASSWORD') {
        await refreshUser().catch(() => undefined);
      }
      setError(getApiErrorMessage(err, 'Could not change password. Please try again.'));
    } finally {
      setSaving(false);
    }
  };

  const onSendSetPasswordLink = async () => {
    if (!user.email) return;
    setSendingLink(true);
    setError(null);
    try {
      await authAPI.requestPasswordReset(user.email);
      setLinkSent(true);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Could not send the email. Please try again.'));
    } finally {
      setSendingLink(false);
    }
  };

  const passwordField = (
    value: string,
    onChange: (text: string) => void,
    kind: 'current' | 'new',
    placeholder?: string
  ) => (
    <View style={authStyles.inputWrap}>
      <TextInput
        style={authStyles.inputBare}
        secureTextEntry={!showPasswords}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete={kind === 'current' ? 'current-password' : 'new-password'}
        textContentType={kind === 'current' ? 'password' : 'newPassword'}
        passwordRules={kind === 'new' ? IOS_PASSWORD_RULES : undefined}
        maxLength={kind === 'new' ? PASSWORD_MAX_LENGTH : undefined}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        value={value}
        onChangeText={onChange}
        editable={!saving}
      />
    </View>
  );

  return (
    <Screen>
      <KeyboardAvoidingView
        style={authStyles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.topBar}>
          <Pressable onPress={() => router.back()} hitSlop={8} disabled={saving}>
            <Text style={styles.back}>← Back</Text>
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag">
          <Text style={styles.title}>Password</Text>

          {user.hasPassword === false ? (
            <View style={authStyles.card}>
              <Text style={styles.body}>
                You sign in with a connected account (such as Apple, Google or Facebook), so
                there&apos;s no password on your Tuneable account yet.
              </Text>
              {!user.email ? (
                <Text style={[styles.body, { marginTop: 10 }]}>
                  Add an email address on the web first, so we can send you a secure link to set a
                  password.
                </Text>
              ) : linkSent ? (
                <Text style={[styles.body, styles.success]}>
                  We&apos;ve emailed a link to {user.email}. It expires in 1 hour.
                </Text>
              ) : (
                <>
                  <Text style={[styles.body, { marginTop: 10 }]}>
                    To also sign in with a password, we&apos;ll email a secure link to {user.email}{' '}
                    so you can set one.
                  </Text>
                  <Pressable
                    style={[authStyles.primaryBtn, sendingLink && authStyles.disabled]}
                    onPress={() => void onSendSetPasswordLink()}
                    disabled={sendingLink}>
                    {sendingLink ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={authStyles.primaryBtnText}>Email me a link</Text>
                    )}
                  </Pressable>
                </>
              )}
              {error ? <Text style={authStyles.error}>{error}</Text> : null}
            </View>
          ) : (
            <View style={authStyles.card}>
              <Text style={styles.body}>
                Changing your password signs you out on every other device.
              </Text>

              {/* Lets iOS Keychain / Google Password Manager update the right saved login. */}
              <Text style={authStyles.label}>Account</Text>
              <TextInput
                style={[authStyles.input, styles.readOnly]}
                value={user.email || user.username}
                editable={false}
                autoComplete="username"
                textContentType="username"
              />

              <Text style={authStyles.label}>Current password</Text>
              {passwordField(currentPassword, setCurrentPassword, 'current')}

              <Text style={authStyles.label}>New password</Text>
              {passwordField(newPassword, setNewPassword, 'new', PASSWORD_PLACEHOLDER)}
              <Text style={styles.hint}>{PASSWORD_HINT}</Text>

              <Text style={authStyles.label}>Confirm new password</Text>
              {passwordField(confirmPassword, setConfirmPassword, 'new')}

              <Pressable
                onPress={() => setShowPasswords((v) => !v)}
                hitSlop={6}
                style={styles.showRow}
                accessibilityRole="button">
                <Ionicons
                  name={showPasswords ? 'eye-off-outline' : 'eye-outline'}
                  size={18}
                  color={colors.textMuted}
                />
                <Text style={styles.showText}>
                  {showPasswords ? 'Hide passwords' : 'Show passwords'}
                </Text>
              </Pressable>

              {error ? <Text style={authStyles.error}>{error}</Text> : null}

              <Pressable
                style={[authStyles.primaryBtn, saving && authStyles.disabled]}
                onPress={() => void onSubmit()}
                disabled={saving}>
                {saving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={authStyles.primaryBtnText}>Change password</Text>
                )}
              </Pressable>

              <Pressable
                onPress={() => router.push('/forgot-password')}
                hitSlop={6}
                style={{ alignSelf: 'center', marginTop: 14 }}
                disabled={saving}>
                <Text style={authStyles.switchAuthLink}>Forgot your current password?</Text>
              </Pressable>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 4,
  },
  back: {
    color: colors.accentLight,
    fontSize: 15,
    fontWeight: '600',
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 40,
    gap: 16,
  },
  title: {
    color: colors.text,
    fontSize: 26,
    fontWeight: '800',
    marginBottom: 4,
  },
  body: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  success: {
    marginTop: 10,
    color: '#86efac',
  },
  readOnly: {
    opacity: 0.7,
  },
  hint: {
    marginTop: 6,
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 17,
  },
  showRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
  },
  showText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
});
