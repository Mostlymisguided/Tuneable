import { useState } from 'react';
import {
  Alert,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/src/theme/colors';

type Props = {
  inviteCode?: string | null;
  username?: string;
};

function getInviteShareUrl(code: string): string {
  return `https://tuneable.stream/register?invite=${encodeURIComponent(code)}`;
}

export function InviteShareCard({ inviteCode, username }: Props) {
  const code = (inviteCode || '').trim().toUpperCase();
  const [copied, setCopied] = useState(false);

  if (!code) return null;

  const shareMessage = username
    ? `Join me on Tuneable — use my invite code ${code}\n${getInviteShareUrl(code)}`
    : `Join Tuneable with invite code ${code}\n${getInviteShareUrl(code)}`;

  const onCopy = async () => {
    try {
      await Clipboard.setStringAsync(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      Alert.alert('Copy failed', 'Could not copy invite code.');
    }
  };

  const onShare = async () => {
    try {
      await Share.share({ message: shareMessage });
    } catch {
      // user dismissed share sheet
    }
  };

  return (
    <View style={styles.card}>
      <Text style={styles.label}>Your invite code</Text>
      <Text style={styles.code}>{code}</Text>
      <Text style={styles.hint}>
        Friends need this 5-character code to create an account.
      </Text>
      <View style={styles.actions}>
        <Pressable style={styles.actionBtn} onPress={() => void onCopy()}>
          <Ionicons
            name={copied ? 'checkmark' : 'copy-outline'}
            size={18}
            color={colors.accentLight}
          />
          <Text style={styles.actionText}>{copied ? 'Copied' : 'Copy'}</Text>
        </Pressable>
        <Pressable style={styles.actionBtn} onPress={() => void onShare()}>
          <Ionicons name="share-outline" size={18} color={colors.accentLight} />
          <Text style={styles.actionText}>Share</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: 16,
    padding: 14,
    borderRadius: 14,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  label: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  code: {
    marginTop: 6,
    color: colors.text,
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: 3,
  },
  hint: {
    marginTop: 6,
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(126, 34, 206, 0.25)',
  },
  actionText: {
    color: '#e9d5ff',
    fontSize: 13,
    fontWeight: '600',
  },
});
