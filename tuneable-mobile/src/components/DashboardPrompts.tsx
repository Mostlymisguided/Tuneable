import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { Ionicons } from '@expo/vector-icons';
import { HomeLocationReminder } from '@/src/components/HomeLocationReminder';
import { authAPI } from '@/src/api/auth';
import { useAuth } from '@/src/auth/AuthContext';
import { getApiErrorMessage } from '@/src/lib/apiError';
import { showToast } from '@/src/stores/toastStore';
import { colors } from '@/src/theme/colors';
import { hasCustomProfilePic } from '@/src/types/user';

export function DashboardPrompts() {
  const { user } = useAuth();
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [sendingEmail, setSendingEmail] = useState(false);

  if (!user) return null;

  const showEmail = !user.emailVerified && !dismissed.has('email');
  const showPic = !hasCustomProfilePic(user.profilePic) && !dismissed.has('pic');

  const sendVerification = async () => {
    setSendingEmail(true);
    try {
      await authAPI.resendVerification();
      showToast('Verification email sent — check your inbox.');
    } catch (err) {
      showToast(getApiErrorMessage(err, 'Could not send verification email.'), 'error');
    } finally {
      setSendingEmail(false);
    }
  };

  return (
    <View>
      <HomeLocationReminder />
      {showEmail ? (
        <PromptCard
          icon="mail"
          title="Verify your email"
          body="Unlock uploads and keep your account recoverable."
          actionLabel={sendingEmail ? 'Sending…' : 'Send link'}
          onAction={() => void sendVerification()}
          onDismiss={() => setDismissed((prev) => new Set(prev).add('email'))}
        />
      ) : null}
      {showPic ? (
        <PromptCard
          icon="person-circle-outline"
          title="Add a profile picture"
          body="Put a face to your tips on charts and supporter lists."
          actionLabel="Add photo"
          onAction={() => {
            void WebBrowser.openBrowserAsync('https://tuneable.stream/profile');
          }}
          onDismiss={() => setDismissed((prev) => new Set(prev).add('pic'))}
        />
      ) : null}
    </View>
  );
}

function PromptCard({
  icon,
  title,
  body,
  actionLabel,
  onAction,
  onDismiss,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
  actionLabel: string;
  onAction: () => void;
  onDismiss: () => void;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.iconWrap}>
        <Ionicons name={icon} size={20} color={colors.accentLight} />
      </View>
      <View style={styles.copy}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.body}>{body}</Text>
        <Pressable onPress={onAction} hitSlop={6} style={styles.actionWrap}>
          <Text style={styles.cta}>{actionLabel}</Text>
        </Pressable>
      </View>
      <Pressable onPress={onDismiss} hitSlop={10} accessibilityLabel="Dismiss">
        <Ionicons name="close" size={18} color={colors.textMuted} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 10,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.card,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(147, 51, 234, 0.25)',
  },
  copy: {
    flex: 1,
    gap: 2,
  },
  title: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  body: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  actionWrap: {
    alignSelf: 'flex-start',
    marginTop: 6,
  },
  cta: {
    color: colors.accentLight,
    fontSize: 14,
    fontWeight: '700',
  },
});
