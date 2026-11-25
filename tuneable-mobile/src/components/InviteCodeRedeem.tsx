import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { userAPI } from '@/src/api/user';
import { useAuth } from '@/src/auth/AuthContext';
import { WelcomeCreditClaimCard } from '@/src/components/WelcomeCreditClaimCard';
import { getApiErrorMessage } from '@/src/lib/apiError';
import { showToast } from '@/src/stores/toastStore';
import { colors } from '@/src/theme/colors';

function normalizeCode(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
}

export function InviteCodeRedeem() {
  const { user, refreshUser } = useAuth();
  const savedCode = (user?.parentInviteCode || '').trim().toUpperCase();
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const applyCode = async () => {
    const next = normalizeCode(code);
    if (next.length !== 5 || submitting) return;
    setSubmitting(true);
    try {
      const result = await userAPI.attachFoundingInvite(next);
      const refreshed = await refreshUser();
      setCode('');
      const status = refreshed?.welcomeCreditOffer?.status;
      if (status === 'eligible' || status === 'needs_verification') {
        showToast('Invite code saved.');
      } else {
        showToast(result.message || 'Invite code saved.');
      }
    } catch (err) {
      showToast(getApiErrorMessage(err, 'Could not apply that invite code.'), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.wrap}>
      {savedCode ? (
        <Text style={styles.saved}>
          Invite code on this account: <Text style={styles.code}>{savedCode}</Text>
        </Text>
      ) : (
        <>
          <Text style={styles.title}>Have an invite code?</Text>
          <Text style={styles.body}>
            Enter a code from someone on Tuneable to apply it to this account.
          </Text>
          <TextInput
            value={code}
            onChangeText={(value) => setCode(normalizeCode(value))}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={5}
            placeholder="ABCDE"
            placeholderTextColor={colors.textMuted}
            style={styles.input}
            accessibilityLabel="Invite code"
          />
          <Pressable
            onPress={() => void applyCode()}
            disabled={code.length !== 5 || submitting}
            style={[styles.button, (code.length !== 5 || submitting) && styles.buttonDisabled]}>
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Apply code</Text>
            )}
          </Pressable>
        </>
      )}
      <WelcomeCreditClaimCard embedded />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 16,
    marginBottom: 8,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.card,
  },
  title: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  body: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 4,
  },
  saved: {
    color: colors.text,
    fontSize: 14,
    lineHeight: 20,
  },
  code: {
    color: colors.accentLight,
    fontWeight: '700',
    letterSpacing: 1,
  },
  input: {
    marginTop: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.inputBg,
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 4,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  button: {
    marginTop: 10,
    alignSelf: 'flex-start',
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  buttonDisabled: {
    opacity: 0.45,
  },
  buttonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
});
