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
  /** Compact header that expands to copy/share — used on home. */
  collapsible?: boolean;
  defaultCollapsed?: boolean;
};

function getInviteShareUrl(code: string): string {
  return `https://tuneable.stream/register?invite=${encodeURIComponent(code)}`;
}

export function InviteShareCard({
  inviteCode,
  username,
  collapsible = false,
  defaultCollapsed = true,
}: Props) {
  const code = (inviteCode || '').trim().toUpperCase();
  const [copied, setCopied] = useState(false);
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

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

  const details = (
    <>
      {!collapsible ? (
        <Text style={styles.label}>Your invite code</Text>
      ) : null}
      {!collapsible ? <Text style={styles.code}>{code}</Text> : null}
      <Text style={[styles.hint, collapsible && styles.hintCollapsed]}>
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
    </>
  );

  if (!collapsible) {
    return <View style={styles.card}>{details}</View>;
  }

  return (
    <View style={styles.card}>
      <Pressable
        onPress={() => setCollapsed((prev) => !prev)}
        style={styles.collapseHeader}
        accessibilityRole="button"
        accessibilityLabel={
          collapsed ? 'Show invite code' : 'Hide invite code'
        }
        accessibilityState={{ expanded: !collapsed }}>
        <View style={styles.collapseTitleRow}>
          <Ionicons name="gift-outline" size={18} color={colors.accentLight} />
          <Text style={styles.collapseTitle}>Invite</Text>
          <View style={styles.codePill}>
            <Text style={styles.codePillText}>{code}</Text>
          </View>
        </View>
        <Ionicons
          name={collapsed ? 'chevron-down' : 'chevron-up'}
          size={18}
          color={colors.textMuted}
        />
      </Pressable>
      {collapsed ? null : details}
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
  collapseHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  collapseTitleRow: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  collapseTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  codePill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(126, 34, 206, 0.35)',
    borderWidth: 1,
    borderColor: 'rgba(168, 85, 247, 0.4)',
  },
  codePillText: {
    color: '#e9d5ff',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1.4,
    fontVariant: ['tabular-nums'],
  },
  hintCollapsed: {
    marginTop: 10,
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
