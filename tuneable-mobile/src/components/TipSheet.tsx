import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import axios from 'axios';
import { colors } from '@/src/theme/colors';
import { formatPoundsFromPence } from '@/src/lib/format';

type Props = {
  visible: boolean;
  title: string;
  subtitle?: string;
  balancePence: number;
  defaultTipPounds?: number;
  onClose: () => void;
  onConfirm: (amountPounds: number) => Promise<void>;
};

function roundPounds(n: number): number {
  return Math.round(n * 100) / 100;
}

export function TipSheet({
  visible,
  title,
  subtitle,
  balancePence,
  defaultTipPounds = 1.11,
  onClose,
  onConfirm,
}: Props) {
  const [amount, setAmount] = useState(defaultTipPounds);
  const [amountText, setAmountText] = useState(defaultTipPounds.toFixed(2));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      const start = Math.max(0.01, defaultTipPounds || 1.11);
      setAmount(start);
      setAmountText(start.toFixed(2));
      setError(null);
      setSubmitting(false);
    }
  }, [visible, defaultTipPounds]);

  const applyAmount = (next: number) => {
    const safe = Math.max(0.01, roundPounds(next));
    setAmount(safe);
    setAmountText(safe.toFixed(2));
  };

  const onChangeText = (text: string) => {
    setAmountText(text);
    const parsed = Number.parseFloat(text);
    if (!Number.isNaN(parsed) && parsed >= 0) {
      setAmount(roundPounds(parsed));
    }
  };

  const submit = async () => {
    setError(null);
    if (amount < 0.01) {
      setError('Minimum tip is £0.01');
      return;
    }
    const neededPence = Math.round(amount * 100);
    if (neededPence > balancePence) {
      setError(
        `Insufficient balance (${formatPoundsFromPence(balancePence)} available)`
      );
      return;
    }
    setSubmitting(true);
    try {
      await onConfirm(amount);
      onClose();
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const msg =
          (err.response?.data as { message?: string } | undefined)?.message ||
          err.message;
        setError(msg || 'Tip failed');
      } else {
        setError('Tip failed');
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
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <Text style={styles.heading}>Tip</Text>
        <Text style={styles.title} numberOfLines={2}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
        <Text style={styles.balance}>
          Balance {formatPoundsFromPence(balancePence)}
        </Text>

        <View style={styles.amountRow}>
          <Pressable
            style={styles.stepBtn}
            onPress={() => applyAmount(amount - 0.1)}
            disabled={submitting}>
            <Text style={styles.stepText}>−</Text>
          </Pressable>
          <View style={styles.amountField}>
            <Text style={styles.currency}>£</Text>
            <TextInput
              style={styles.input}
              keyboardType="decimal-pad"
              value={amountText}
              onChangeText={onChangeText}
              editable={!submitting}
              selectTextOnFocus
            />
          </View>
          <Pressable
            style={styles.stepBtn}
            onPress={() => applyAmount(amount + 0.1)}
            disabled={submitting}>
            <Text style={styles.stepText}>+</Text>
          </Pressable>
        </View>

        <View style={styles.presets}>
          {[0.11, 0.5, 1.11, 5].map((preset) => (
            <Pressable
              key={preset}
              style={styles.preset}
              onPress={() => applyAmount(preset)}
              disabled={submitting}>
              <Text style={styles.presetText}>£{preset.toFixed(2)}</Text>
            </Pressable>
          ))}
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable
          style={[styles.confirm, submitting && styles.confirmDisabled]}
          onPress={() => void submit()}
          disabled={submitting}>
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.confirmText}>
              Tip {formatPoundsFromPence(Math.round(amount * 100))}
            </Text>
          )}
        </Pressable>

        <Pressable style={styles.cancel} onPress={onClose} disabled={submitting}>
          <Text style={styles.cancelText}>Cancel</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  sheet: {
    backgroundColor: colors.gradientStart,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 28,
    borderTopWidth: 1,
    borderColor: colors.cardBorder,
  },
  heading: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  title: {
    marginTop: 6,
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  subtitle: {
    marginTop: 4,
    color: colors.textSecondary,
    fontSize: 14,
  },
  balance: {
    marginTop: 12,
    marginBottom: 16,
    color: colors.textMuted,
    fontSize: 13,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  stepBtn: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepText: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '500',
    lineHeight: 32,
  },
  amountField: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.inputBg,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 52,
  },
  currency: {
    color: colors.textSecondary,
    fontSize: 20,
    fontWeight: '600',
    marginRight: 4,
  },
  input: {
    flex: 1,
    color: colors.text,
    fontSize: 22,
    fontWeight: '700',
    paddingVertical: 0,
  },
  presets: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
  },
  preset: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(147, 51, 234, 0.25)',
    borderWidth: 1,
    borderColor: 'rgba(147, 51, 234, 0.45)',
    alignItems: 'center',
  },
  presetText: {
    color: colors.text,
    fontWeight: '600',
    fontSize: 13,
  },
  error: {
    marginTop: 12,
    color: '#fca5a5',
    fontSize: 14,
  },
  confirm: {
    marginTop: 18,
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
  },
  confirmDisabled: { opacity: 0.7 },
  confirmText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  cancel: {
    marginTop: 12,
    alignItems: 'center',
    paddingVertical: 8,
  },
  cancelText: {
    color: colors.textSecondary,
    fontSize: 15,
  },
});
