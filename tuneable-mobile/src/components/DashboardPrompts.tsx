import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { authAPI } from '@/src/api/auth';
import { useAuth } from '@/src/auth/AuthContext';
import { getApiErrorMessage } from '@/src/lib/apiError';
import {
  DEFAULT_TIP_POUNDS,
  hasHomeLocation,
  needsOnboarding,
} from '@/src/lib/onboarding';
import { maybePromptForPush } from '@/src/lib/pushNotifications';
import { showToast } from '@/src/stores/toastStore';
import { colors } from '@/src/theme/colors';
import { hasCustomProfilePic } from '@/src/types/user';

export function DashboardPrompts() {
  const { user, refreshUser } = useAuth();
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [sendingEmail, setSendingEmail] = useState(false);
  const pushAskStarted = useRef(false);

  useEffect(() => {
    if (!user || pushAskStarted.current) return;
    if (needsOnboarding(user)) return;
    if (user.hasPushDevice || user.onboarding?.notificationsPromptSeenAt) return;
    pushAskStarted.current = true;
    let cancelled = false;
    void (async () => {
      await maybePromptForPush();
      if (cancelled) return;
      try {
        await authAPI.updateProfile({
          onboarding: { notificationsPromptSeenAt: new Date().toISOString() },
        });
        await refreshUser();
      } catch {
        // Token sync still runs on later logins if they granted
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, refreshUser]);

  if (!user) return null;

  const showLocation = !hasHomeLocation(user.homeLocation);
  const currentDefaultTip = user.preferences?.defaultTip ?? DEFAULT_TIP_POUNDS;
  const showDefaultTip =
    !user.onboarding?.defaultTipPromptSeenAt && !dismissed.has('defaultTip');
  const showEmail = !user.emailVerified && !dismissed.has('email');
  const showPic = !hasCustomProfilePic(user.profilePic) && !dismissed.has('pic');

  if (!showLocation && !showDefaultTip && !showEmail && !showPic) return null;

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

  const dismissDefaultTip = async () => {
    setDismissed((prev) => new Set(prev).add('defaultTip'));
    try {
      await authAPI.updateProfile({
        onboarding: { defaultTipPromptSeenAt: new Date().toISOString() },
      });
      await refreshUser();
    } catch {
      // Local dismiss still hides it this session
    }
  };

  return (
    <View>
      {showLocation ? (
        <PromptCard
          icon="location-outline"
          title="Enable location for local charts"
          body="Tips influence charts where you are. Set home, or allow location while the app is open."
          actionLabel="Set location"
          onAction={() => router.push('/set-home-location')}
        />
      ) : null}
      {showDefaultTip ? (
        <PromptCard
          icon="cash-outline"
          title="Set your default tip"
          body={`Adding a tune to your library places a tip. Currently £${currentDefaultTip.toFixed(2)} — change it, or keep this amount.`}
          actionLabel="Set tip"
          onAction={() => router.push('/edit-profile')}
          onDismiss={() => void dismissDefaultTip()}
        />
      ) : null}
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
          onAction={() => router.push('/edit-profile')}
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
  onDismiss?: () => void;
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
      {onDismiss ? (
        <Pressable onPress={onDismiss} hitSlop={10} accessibilityLabel="Dismiss">
          <Ionicons name="close" size={18} color={colors.textMuted} />
        </Pressable>
      ) : null}
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
