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
import axios from 'axios';
import { mediaAPI } from '@/src/api/media';
import {
  isKnownElement,
  normalizeTipChipForDisplay,
} from '@/src/lib/elementNormalizer';
import { formatPoundsFromPence } from '@/src/lib/format';
import { colors } from '@/src/theme/colors';

type RankedTag = {
  tag: string;
  aggregate?: number;
  tipperCount?: number;
};

type Props = {
  visible: boolean;
  mediaId: string;
  mediaTitle?: string;
  /** Existing / ranked tags to reinforce. */
  suggestedTags?: RankedTag[] | string[];
  onClose: () => void;
  onClaimed?: (result: {
    tags?: string[];
    rankedTags?: RankedTag[];
  }) => void;
};

function toTagList(suggested?: RankedTag[] | string[]): RankedTag[] {
  if (!suggested?.length) return [];
  if (typeof suggested[0] === 'string') {
    return (suggested as string[]).map((tag) => ({ tag }));
  }
  return suggested as RankedTag[];
}

/** Post-tip tagging for tippers: claim new tags or back existing ones. */
export function TagClaimSheet({
  visible,
  mediaId,
  mediaTitle,
  suggestedTags,
  onClose,
  onClaimed,
}: Props) {
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ranked = useMemo(() => toTagList(suggestedTags).slice(0, 8), [suggestedTags]);

  useEffect(() => {
    if (!visible) return;
    setTagInput('');
    setTags([]);
    setError(null);
    setSubmitting(false);
  }, [visible, mediaId]);

  const handleAddTag = () => {
    const input = tagInput.trim();
    if (!input) return;
    const next = input
      .split(',')
      .map((t) => normalizeTipChipForDisplay(t.trim()))
      .filter(Boolean)
      .filter(
        (chip) => !tags.some((t) => t.toLowerCase() === chip.toLowerCase())
      );
    const remaining = 5 - tags.length;
    if (remaining > 0 && next.length) {
      setTags([...tags, ...next.slice(0, remaining)]);
      setTagInput('');
    }
  };

  const toggleSuggested = (tag: string) => {
    const display = normalizeTipChipForDisplay(tag);
    if (!display) return;
    setTags((prev) => {
      if (prev.some((t) => t.toLowerCase() === display.toLowerCase())) {
        return prev.filter((t) => t.toLowerCase() !== display.toLowerCase());
      }
      if (prev.length >= 5) return prev;
      return [...prev, display];
    });
  };

  const submit = async (agreeTop = false) => {
    if (!mediaId) return;
    if (!agreeTop && tags.length === 0) {
      setError('Add or select at least one tag');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const result = await mediaAPI.claimTags(mediaId, {
        ...(agreeTop ? { agreeTop: true, agreeLimit: 5 } : { tags }),
      });
      onClaimed?.({
        tags: result.tags,
        rankedTags: result.rankedTags,
      });
      onClose();
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const msg =
          (err.response?.data as { error?: string; message?: string } | undefined)
            ?.error ||
          (err.response?.data as { message?: string } | undefined)?.message ||
          err.message;
        setError(msg || 'Could not claim tags');
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Could not claim tags');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={styles.sheet}>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.content}>
            <View style={styles.header}>
              <Ionicons name="pricetag" size={18} color={colors.accentLight} />
              <Text style={styles.heading}>Tag this tune</Text>
            </View>
            {mediaTitle ? (
              <Text style={styles.title} numberOfLines={2}>
                {mediaTitle}
              </Text>
            ) : null}
            <Text style={styles.copy}>
              Your tip stakes £ behind tags you claim. Nothing is auto-backed.
            </Text>

            {ranked.length > 0 ? (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>Back existing tags</Text>
                <View style={styles.chips}>
                  {ranked.map((item) => {
                    const selected = tags.some(
                      (t) => t.toLowerCase() === item.tag.toLowerCase()
                    );
                    return (
                      <Pressable
                        key={item.tag}
                        onPress={() => toggleSuggested(item.tag)}
                        disabled={submitting}
                        style={[
                          styles.chip,
                          selected ? styles.chipSelected : styles.chipIdle,
                        ]}>
                        <Text style={styles.chipText}>#{item.tag}</Text>
                        {typeof item.aggregate === 'number' && item.aggregate > 0 ? (
                          <Text style={styles.chipMeta}>
                            {formatPoundsFromPence(item.aggregate)}
                          </Text>
                        ) : null}
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ) : null}

            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Add your own</Text>
              <View style={styles.inputRow}>
                <TextInput
                  style={styles.input}
                  value={tagInput}
                  onChangeText={setTagInput}
                  placeholder="e.g. chill, workout"
                  placeholderTextColor={colors.textMuted}
                  maxLength={32}
                  editable={!submitting}
                  onSubmitEditing={handleAddTag}
                  returnKeyType="done"
                />
                <Pressable
                  style={[
                    styles.addBtn,
                    (!tagInput.trim() || tags.length >= 5 || submitting) &&
                      styles.addBtnDisabled,
                  ]}
                  onPress={handleAddTag}
                  disabled={!tagInput.trim() || tags.length >= 5 || submitting}>
                  <Text style={styles.addBtnText}>Add</Text>
                </Pressable>
              </View>
              {tags.length > 0 ? (
                <View style={styles.chips}>
                  {tags.map((tag) => (
                    <View
                      key={tag}
                      style={[
                        styles.chip,
                        isKnownElement(tag) ? styles.chipElement : styles.chipSelected,
                      ]}>
                      <Text style={styles.chipText}>{tag}</Text>
                      <Pressable
                        onPress={() =>
                          setTags((prev) => prev.filter((t) => t !== tag))
                        }
                        hitSlop={8}
                        disabled={submitting}>
                        <Text style={styles.remove}>×</Text>
                      </Pressable>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <Pressable
              style={[styles.confirm, submitting && styles.confirmDisabled]}
              onPress={() => void submit(false)}
              disabled={submitting || tags.length === 0}>
              {submitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.confirmText}>Add Tags</Text>
              )}
            </Pressable>

            {ranked.length > 0 ? (
              <Pressable
                style={styles.secondary}
                onPress={() => void submit(true)}
                disabled={submitting}>
                <Text style={styles.secondaryText}>Agree with top tags</Text>
              </Pressable>
            ) : null}

            <Pressable style={styles.cancel} onPress={onClose} disabled={submitting}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, justifyContent: 'flex-end' },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  sheet: {
    backgroundColor: colors.gradientStart,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '88%',
  },
  content: {
    padding: 20,
    paddingBottom: 32,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  heading: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  title: {
    marginTop: 8,
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  copy: {
    marginTop: 8,
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
  },
  section: {
    marginTop: 16,
  },
  sectionLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 8,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  chipIdle: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  chipSelected: {
    backgroundColor: colors.accent,
  },
  chipElement: {
    backgroundColor: '#0d9488',
  },
  chipText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  chipMeta: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 11,
    fontWeight: '600',
  },
  remove: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 16,
    fontWeight: '700',
  },
  inputRow: {
    flexDirection: 'row',
    gap: 8,
  },
  input: {
    flex: 1,
    backgroundColor: colors.inputBg,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.text,
    fontSize: 15,
  },
  addBtn: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  addBtnDisabled: {
    opacity: 0.45,
  },
  addBtnText: {
    color: '#fff',
    fontWeight: '700',
  },
  error: {
    marginTop: 12,
    color: '#fca5a5',
    fontSize: 14,
  },
  confirm: {
    marginTop: 18,
    backgroundColor: colors.accent,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  confirmDisabled: {
    opacity: 0.55,
  },
  confirmText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  secondary: {
    marginTop: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryText: {
    color: colors.accentLight,
    fontWeight: '600',
    fontSize: 14,
  },
  cancel: {
    marginTop: 4,
    paddingVertical: 12,
    alignItems: 'center',
  },
  cancelText: {
    color: colors.textMuted,
    fontSize: 14,
  },
});
