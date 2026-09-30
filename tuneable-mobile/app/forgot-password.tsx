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
import { Screen } from '@/src/components/Screen';
import { AuthHero, authStyles } from '@/src/components/AuthChrome';
import { authAPI } from '@/src/api/auth';
import { getApiErrorMessage } from '@/src/lib/apiError';
import { colors } from '@/src/theme/colors';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ForgotPasswordScreen() {
  const params = useLocalSearchParams<{ email?: string }>();
  const [email, setEmail] = useState(
    typeof params.email === 'string' && params.email.includes('@') ? params.email : ''
  );
  const [submitting, setSubmitting] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async () => {
    setError(null);
    const trimmed = email.trim();
    if (!EMAIL_REGEX.test(trimmed)) {
      setError('Enter the email address on your account.');
      return;
    }
    setSubmitting(true);
    try {
      await authAPI.requestPasswordReset(trimmed);
      setSentTo(trimmed);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Could not send the reset email. Please try again.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen>
      <KeyboardAvoidingView
        style={authStyles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          style={{ paddingHorizontal: 16, paddingTop: 8, alignSelf: 'flex-start' }}
          accessibilityRole="button"
          accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </Pressable>
        <ScrollView
          contentContainerStyle={authStyles.scroll}
          keyboardShouldPersistTaps="handled">
          <AuthHero subtitle="Reset your password" />

          <View style={authStyles.card}>
            {sentTo ? (
              <>
                <Text style={{ color: colors.text, fontSize: 17, fontWeight: '700' }}>
                  Check your email
                </Text>
                <Text style={{ color: colors.textMuted, fontSize: 14, lineHeight: 20, marginTop: 8 }}>
                  If {sentTo} has a Tuneable account, we&apos;ve sent it a reset link. It expires in
                  1 hour. Check your spam folder if it doesn&apos;t arrive in a few minutes.
                </Text>
                <Pressable style={authStyles.primaryBtn} onPress={() => router.back()}>
                  <Text style={authStyles.primaryBtnText}>Done</Text>
                </Pressable>
                <Pressable
                  style={authStyles.ghostBtn}
                  onPress={() => {
                    setSentTo(null);
                    setError(null);
                  }}>
                  <Text style={authStyles.ghostBtnText}>Use a different email</Text>
                </Pressable>
              </>
            ) : (
              <>
                <Text style={{ color: colors.textMuted, fontSize: 14, lineHeight: 20 }}>
                  Enter the email on your account and we&apos;ll send you a link to choose a new
                  password.
                </Text>
                <Text style={authStyles.label}>Email</Text>
                <TextInput
                  style={authStyles.input}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="email"
                  textContentType="emailAddress"
                  keyboardType="email-address"
                  placeholder="you@example.com"
                  placeholderTextColor={colors.textMuted}
                  value={email}
                  onChangeText={setEmail}
                  editable={!submitting}
                  onSubmitEditing={() => void onSubmit()}
                  returnKeyType="send"
                />

                {error ? <Text style={authStyles.error}>{error}</Text> : null}

                <Pressable
                  style={[authStyles.primaryBtn, submitting && authStyles.disabled]}
                  onPress={() => void onSubmit()}
                  disabled={submitting}>
                  {submitting ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={authStyles.primaryBtnText}>Send reset link</Text>
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
