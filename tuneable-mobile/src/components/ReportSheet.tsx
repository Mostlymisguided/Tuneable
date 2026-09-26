import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useAuth } from '@/src/auth/AuthContext';
import { reportAPI, type ReportType } from '@/src/api/reports';
import { getApiErrorMessage } from '@/src/lib/apiError';
import { showToast } from '@/src/stores/toastStore';
import { colors } from '@/src/theme/colors';

type Category = {
  value: string;
  label: string;
  description: string;
  requiresEmail?: boolean;
};

const MEDIA_CATEGORIES: Category[] = [
  {
    value: 'copyright',
    label: 'Copyright / rights',
    description: 'I own the rights or represent the rights holder',
    requiresEmail: true,
  },
  {
    value: 'inappropriate',
    label: 'Inappropriate content',
    description: 'Offensive, explicit, or otherwise harmful',
  },
  {
    value: 'incorrect_info',
    label: 'Incorrect information',
    description: 'Title, artist, or other metadata is wrong',
  },
  {
    value: 'duplicate',
    label: 'Duplicate',
    description: 'This already exists on Tuneable',
  },
  {
    value: 'something_broken',
    label: 'Something is broken',
    description: 'A bug or technical issue on this page',
  },
  {
    value: 'other',
    label: 'Other',
    description: 'Something else needs attention',
  },
];

const USER_CATEGORIES: Category[] = [
  {
    value: 'harassment',
    label: 'Harassment / bullying',
    description: 'This user is harassing or bullying others',
  },
  {
    value: 'spam',
    label: 'Spam / scam',
    description: 'Spam, scams, or commercial abuse',
  },
  {
    value: 'impersonation',
    label: 'Impersonation',
    description: 'Pretending to be someone else',
  },
  {
    value: 'inappropriate',
    label: 'Inappropriate behaviour',
    description: 'Offensive content or conduct',
  },
  {
    value: 'copyright',
    label: 'Copyright infringement',
    description: 'This user is infringing rights',
    requiresEmail: true,
  },
  {
    value: 'something_broken',
    label: 'Something is broken',
    description: 'A bug or technical issue on this page',
  },
  {
    value: 'other',
    label: 'Other',
    description: 'Something else needs attention',
  },
];

type Props = {
  visible: boolean;
  reportType: ReportType;
  targetId: string;
  targetTitle: string;
  onClose: () => void;
};

export function ReportHeaderButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={12}
      accessibilityRole="button"
      accessibilityLabel="Report">
      <Ionicons name="flag-outline" size={22} color={colors.textMuted} />
    </Pressable>
  );
}

export function ReportSheet({
  visible,
  reportType,
  targetId,
  targetTitle,
  onClose,
}: Props) {
  const { user, isAuthenticated } = useAuth();
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const categories = reportType === 'user' ? USER_CATEGORIES : MEDIA_CATEGORIES;
  const selected = useMemo(
    () => categories.find((item) => item.value === category),
    [categories, category]
  );

  useEffect(() => {
    if (!visible) return;
    setCategory('');
    setDescription('');
    setContactEmail(user?.email ?? '');
    setSubmitting(false);
    setError(null);
  }, [visible, user?.email]);

  const submit = async () => {
    if (!isAuthenticated) {
      onClose();
      router.push('/login');
      return;
    }
    if (!category) {
      setError('Choose a reason for this report.');
      return;
    }
    if (!description.trim()) {
      setError('Please describe the issue.');
      return;
    }
    if (selected?.requiresEmail && !contactEmail.trim()) {
      setError('A contact email is required for this type of report.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const payload = {
        category,
        description: description.trim(),
        contactEmail: contactEmail.trim() || undefined,
      };
      if (reportType === 'user') {
        await reportAPI.reportUser(targetId, payload);
      } else {
        await reportAPI.reportMedia(targetId, payload);
      }
      showToast("Report submitted. We'll review it shortly.");
      onClose();
    } catch (err) {
      setError(getApiErrorMessage(err, 'Could not submit report.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={styles.backdrop} onPress={onClose}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.handle} />
            <View style={styles.header}>
              <Text style={styles.title}>Report</Text>
              <Pressable onPress={onClose} hitSlop={10} disabled={submitting}>
                <Ionicons name="close" size={24} color={colors.textMuted} />
              </Pressable>
            </View>
            <Text style={styles.subtitle} numberOfLines={2}>
              {targetTitle}
            </Text>

            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.scroll}>
              {categories.map((item) => {
                const active = item.value === category;
                return (
                  <Pressable
                    key={item.value}
                    style={[styles.category, active && styles.categoryActive]}
                    onPress={() => setCategory(item.value)}
                    disabled={submitting}>
                    <Text style={[styles.categoryLabel, active && styles.categoryLabelActive]}>
                      {item.label}
                    </Text>
                    <Text style={styles.categoryHint}>{item.description}</Text>
                  </Pressable>
                );
              })}

              <Text style={styles.fieldLabel}>Details</Text>
              <TextInput
                style={styles.input}
                value={description}
                onChangeText={setDescription}
                placeholder="Tell us what happened"
                placeholderTextColor={colors.textMuted}
                multiline
                editable={!submitting}
              />

              {selected?.requiresEmail ? (
                <>
                  <Text style={styles.fieldLabel}>Contact email</Text>
                  <TextInput
                    style={styles.emailInput}
                    value={contactEmail}
                    onChangeText={setContactEmail}
                    placeholder="you@example.com"
                    placeholderTextColor={colors.textMuted}
                    autoCapitalize="none"
                    keyboardType="email-address"
                    editable={!submitting}
                  />
                </>
              ) : null}

              {error ? <Text style={styles.error}>{error}</Text> : null}

              <Pressable
                style={[styles.submit, submitting && styles.disabled]}
                onPress={() => void submit()}
                disabled={submitting}>
                {submitting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.submitText}>
                    {isAuthenticated ? 'Submit report' : 'Sign in to report'}
                  </Text>
                )}
              </Pressable>
            </ScrollView>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  sheet: {
    maxHeight: '88%',
    backgroundColor: colors.gradientStart,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingBottom: 28,
    paddingTop: 10,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.25)',
    marginBottom: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  title: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '700',
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 14,
    marginBottom: 12,
  },
  scroll: {
    paddingBottom: 12,
    gap: 8,
  },
  category: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  categoryActive: {
    borderColor: colors.accentLight,
    backgroundColor: 'rgba(168, 85, 247, 0.18)',
  },
  categoryLabel: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  categoryLabelActive: {
    color: colors.accentLight,
  },
  categoryHint: {
    color: colors.textMuted,
    fontSize: 13,
    marginTop: 2,
  },
  fieldLabel: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
    marginTop: 8,
  },
  input: {
    minHeight: 88,
    textAlignVertical: 'top',
    color: colors.text,
    backgroundColor: colors.inputBg,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  emailInput: {
    color: colors.text,
    backgroundColor: colors.inputBg,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  error: {
    color: '#fca5a5',
    fontSize: 14,
    marginTop: 4,
  },
  submit: {
    marginTop: 8,
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  submitText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  disabled: { opacity: 0.65 },
});
