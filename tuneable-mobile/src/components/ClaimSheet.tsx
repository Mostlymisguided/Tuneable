import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import axios from 'axios';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useAuth } from '@/src/auth/AuthContext';
import { claimsAPI, type ClaimIntent } from '@/src/api/claims';
import { colors } from '@/src/theme/colors';

type Step = 'intent' | 'login' | 'creator' | 'proof';

type Props = {
  visible: boolean;
  mediaId: string;
  mediaTitle: string;
  onClose: () => void;
  onSubmitted?: () => void;
};

function isCreator(user: { role?: string[] } | null | undefined): boolean {
  return Boolean(user?.role?.includes('creator') || user?.role?.includes('admin'));
}

export function ClaimSheet({
  visible,
  mediaId,
  mediaTitle,
  onClose,
  onSubmitted,
}: Props) {
  const { user } = useAuth();
  const [step, setStep] = useState<Step>('intent');
  const [intent, setIntent] = useState<ClaimIntent | null>(null);
  const [proofText, setProofText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setStep('intent');
      setIntent(null);
      setProofText('');
      setSubmitting(false);
      setError(null);
    }
  }, [visible]);

  const continueAfterIntent = (selected: ClaimIntent) => {
    setIntent(selected);
    setError(null);
    if (!user) {
      setStep('login');
      return;
    }
    if (selected === 'claim_keep' && !isCreator(user)) {
      setStep('creator');
      return;
    }
    setStep('proof');
  };

  const submit = async () => {
    if (!intent) return;
    if (!proofText.trim()) {
      setError('Please provide proof of ownership');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await claimsAPI.submitClaim({
        mediaId,
        proofText: proofText.trim(),
        intent,
      });
      onSubmitted?.();
      onClose();
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const msg =
          (err.response?.data as { error?: string } | undefined)?.error ||
          err.message;
        setError(msg || 'Failed to submit claim');
      } else {
        setError('Failed to submit claim');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const titleByStep: Record<Step, string> = {
    intent: 'This is my tune',
    login: 'Sign in to continue',
    creator: 'Enable creator mode',
    proof: intent === 'takedown' ? `Take down "${mediaTitle}"` : `Claim "${mediaTitle}"`,
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title} numberOfLines={2}>
              {titleByStep[step]}
            </Text>
            <Pressable onPress={onClose} hitSlop={12} disabled={submitting}>
              <Ionicons name="close" size={24} color={colors.textMuted} />
            </Pressable>
          </View>

          <ScrollView
            contentContainerStyle={styles.body}
            keyboardShouldPersistTaps="handled"
          >
            {step === 'intent' && (
              <>
                <Text style={styles.copy}>
                  This tune is awaiting rights clearance. What would you like to do?
                </Text>
                <Pressable
                  style={[styles.choice, styles.choiceKeep]}
                  onPress={() => continueAfterIntent('claim_keep')}
                >
                  <Ionicons name="ribbon-outline" size={22} color="#34d399" />
                  <View style={styles.choiceText}>
                    <Text style={styles.choiceTitle}>Claim & keep it live</Text>
                    <Text style={styles.choiceSub}>
                      Verify you're the rights holder and receive tips held in
                      escrow.
                    </Text>
                  </View>
                </Pressable>
                <Pressable
                  style={[styles.choice, styles.choiceDown]}
                  onPress={() => continueAfterIntent('takedown')}
                >
                  <Ionicons name="ban-outline" size={22} color="#f87171" />
                  <View style={styles.choiceText}>
                    <Text style={styles.choiceTitle}>Take it down</Text>
                    <Text style={styles.choiceSub}>
                      Remove this tune and refund active tips to supporters.
                    </Text>
                  </View>
                </Pressable>
              </>
            )}

            {step === 'login' && (
              <>
                <Text style={styles.copy}>
                  {intent === 'takedown'
                    ? 'Sign in so we can verify your takedown request.'
                    : 'Sign in (and enable creator mode if needed) to claim this media and receive tips.'}
                </Text>
                <Pressable
                  style={styles.primaryBtn}
                  onPress={() => {
                    onClose();
                    router.push('/login');
                  }}
                >
                  <Text style={styles.primaryBtnText}>Sign in</Text>
                </Pressable>
                <Pressable style={styles.secondaryBtn} onPress={() => setStep('intent')}>
                  <Text style={styles.secondaryBtnText}>Back</Text>
                </Pressable>
              </>
            )}

            {step === 'creator' && (
              <>
                <Text style={styles.copy}>
                  To claim ownership and earn from tips, enable creator mode on the
                  web app (Profile → Creator).
                </Text>
                <Pressable style={styles.secondaryBtn} onPress={() => setStep('intent')}>
                  <Text style={styles.secondaryBtnText}>Back</Text>
                </Pressable>
              </>
            )}

            {step === 'proof' && (
              <>
                <Text style={styles.copy}>
                  {intent === 'takedown'
                    ? 'Provide proof of ownership to take this tune down:'
                    : 'Provide proof of ownership to claim this tune:'}
                </Text>
                {intent === 'takedown' ? (
                  <View style={styles.warnBox}>
                    <Text style={styles.warnText}>
                      If approved, this tune will be removed and active tips refunded.
                      You will not receive tip revenue from a takedown.
                    </Text>
                  </View>
                ) : null}
                <Text style={styles.label}>Proof of ownership</Text>
                <TextInput
                  style={styles.input}
                  value={proofText}
                  onChangeText={setProofText}
                  placeholder="Describe your role and links to profiles, DistroKid, ISRC, etc."
                  placeholderTextColor={colors.textMuted}
                  multiline
                  maxLength={2000}
                  editable={!submitting}
                />
                <Text style={styles.charCount}>{proofText.length}/2000</Text>
                {error ? <Text style={styles.error}>{error}</Text> : null}
                <Pressable
                  style={[
                    styles.primaryBtn,
                    (!proofText.trim() || submitting) && styles.primaryBtnDisabled,
                  ]}
                  onPress={() => void submit()}
                  disabled={!proofText.trim() || submitting}
                >
                  {submitting ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.primaryBtnText}>
                      {intent === 'takedown'
                        ? 'Submit takedown request'
                        : 'Submit claim'}
                    </Text>
                  )}
                </Pressable>
                <Pressable
                  style={styles.secondaryBtn}
                  onPress={() => setStep('intent')}
                  disabled={submitting}
                >
                  <Text style={styles.secondaryBtnText}>Back</Text>
                </Pressable>
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  sheet: {
    maxHeight: '88%',
    backgroundColor: '#1a1028',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(168, 85, 247, 0.35)',
    paddingBottom: 24,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
    gap: 12,
  },
  title: {
    flex: 1,
    color: colors.text,
    fontSize: 20,
    fontWeight: '700',
  },
  body: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 12,
  },
  copy: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 4,
  },
  choice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  choiceKeep: {
    borderColor: 'rgba(52, 211, 153, 0.4)',
    backgroundColor: 'rgba(6, 78, 59, 0.25)',
  },
  choiceDown: {
    borderColor: 'rgba(248, 113, 113, 0.4)',
    backgroundColor: 'rgba(127, 29, 29, 0.25)',
  },
  choiceText: {
    flex: 1,
  },
  choiceTitle: {
    color: colors.text,
    fontWeight: '700',
    fontSize: 15,
  },
  choiceSub: {
    color: colors.textMuted,
    fontSize: 13,
    marginTop: 4,
    lineHeight: 18,
  },
  label: {
    color: colors.text,
    fontWeight: '600',
    fontSize: 14,
  },
  input: {
    minHeight: 120,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    backgroundColor: 'rgba(0,0,0,0.3)',
    color: colors.text,
    padding: 12,
    textAlignVertical: 'top',
    fontSize: 14,
  },
  charCount: {
    color: colors.textMuted,
    fontSize: 12,
    alignSelf: 'flex-end',
  },
  warnBox: {
    backgroundColor: 'rgba(127, 29, 29, 0.35)',
    borderColor: 'rgba(248, 113, 113, 0.35)',
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
  },
  warnText: {
    color: '#fecaca',
    fontSize: 13,
    lineHeight: 18,
  },
  error: {
    color: '#f87171',
    fontSize: 13,
  },
  primaryBtn: {
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  primaryBtnDisabled: {
    opacity: 0.5,
  },
  primaryBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
  secondaryBtn: {
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  secondaryBtnText: {
    color: colors.text,
    fontWeight: '600',
    fontSize: 14,
  },
});
