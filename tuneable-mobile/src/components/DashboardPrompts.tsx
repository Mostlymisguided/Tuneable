import { useEffect, useRef, useState } from 'react';
import { AppState, Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
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
import {
  getPushPermissionSnapshot,
  requestAndRegisterPush,
} from '@/src/lib/pushNotifications';
import { showToast } from '@/src/stores/toastStore';
import { colors } from '@/src/theme/colors';
import { hasCustomProfilePic } from '@/src/types/user';

type PushSnap = { status: string; canAskAgain: boolean } | null;

export function DashboardPrompts() {
  const { user, refreshUser } = useAuth();
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [sendingEmail, setSendingEmail] = useState(false);
  const [enablingPush, setEnablingPush] = useState(false);
  const [pushSnap, setPushSnap] = useState<PushSnap>(null);
  const [pushSnapReady, setPushSnapReady] = useState(Platform.OS === 'web');
  const autoRegisterTried = useRef(false);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    let cancelled = false;
    const load = async () => {
      try {
        const snap = await getPushPermissionSnapshot();
        if (cancelled) return;
        setPushSnap(snap);
      } finally {
        if (!cancelled) setPushSnapReady(true);
      }
    };
    void load();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void load();
    });
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, []);

  const homeReady = !!user && hasHomeLocation(user.homeLocation);
  const showPushEligible =
    Platform.OS !== 'web' &&
    !!user &&
    !needsOnboarding(user) &&
    homeReady &&
    pushSnapReady &&
    !user.hasPushDevice &&
    !user.onboarding?.notificationsPromptSeenAt &&
    pushSnap?.status === 'granted';

  useEffect(() => {
    if (!showPushEligible || autoRegisterTried.current) return;
    autoRegisterTried.current = true;
    void (async () => {
      const result = await requestAndRegisterPush();
      if (result !== 'granted') {
        autoRegisterTried.current = false;
        return;
      }
      try {
        await authAPI.updateProfile({
          onboarding: { notificationsPromptSeenAt: new Date().toISOString() },
        });
        await refreshUser();
      } catch {
        // Device is registered; the card hides once hasPushDevice is refreshed
        await refreshUser().catch(() => undefined);
      }
    })();
  }, [showPushEligible, refreshUser]);

  const markNotificationsSeen = async () => {
    try {
      await authAPI.updateProfile({
        onboarding: { notificationsPromptSeenAt: new Date().toISOString() },
      });
      await refreshUser();
    } catch {
      // Card can show again next visit if this save fails
    }
  };

  const allowNotifications = async () => {
    setEnablingPush(true);
    try {
      const result = await requestAndRegisterPush();
      if (result === 'granted' || result === 'denied') {
        await markNotificationsSeen();
        return;
      }
      showToast('Could not register this device for notifications. Try again.', 'error');
    } finally {
      setEnablingPush(false);
    }
  };

  if (!user) return null;

  const showLocation = !hasHomeLocation(user.homeLocation);
  const pushBlocked =
    !!pushSnap && pushSnap.status !== 'granted' && pushSnap.canAskAgain === false;
  const pushAlreadyAllowed = pushSnap?.status === 'granted';
  const showPush =
    Platform.OS !== 'web' &&
    !needsOnboarding(user) &&
    !showLocation &&
    pushSnapReady &&
    !user.hasPushDevice &&
    !user.onboarding?.notificationsPromptSeenAt;

  const currentDefaultTip = user.preferences?.defaultTip ?? DEFAULT_TIP_POUNDS;
  const showDefaultTip =
    !user.onboarding?.defaultTipPromptSeenAt && !dismissed.has('defaultTip');
  const showEmail = !user.emailVerified && !dismissed.has('email');
  const showPic = !hasCustomProfilePic(user.profilePic) && !dismissed.has('pic');

  if (!showLocation && !showPush && !showDefaultTip && !showEmail && !showPic) return null;

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
          title="Set a home place for local charts"
          body="Tips on local charts use the home place you save. Use your current place once, or search. GPS is only used while Tuneable is open."
          actionLabel="Set home place"
          onAction={() => router.push('/set-home-location')}
        />
      ) : null}
      {showPush ? (
        <PromptCard
          icon="notifications-outline"
          title={
            pushBlocked
              ? 'Notifications are off'
              : pushAlreadyAllowed
                ? 'Turn on notifications'
                : 'Allow notifications'
          }
          body={
            pushBlocked
              ? 'Tuneable cannot ask again. Turn on notifications in Settings to hear about tips, replies, and outtips.'
              : pushAlreadyAllowed
                ? 'Notifications are allowed. Finish setup to get alerts for tips, replies, and outtips.'
                : 'Get alerts for tips, replies, and when someone outtips you.'
          }
          actionLabel={
            enablingPush
              ? 'Turning on…'
              : pushBlocked
                ? 'Open Settings'
                : pushAlreadyAllowed
                  ? 'Turn on'
                  : 'Allow notifications'
          }
          onAction={() => {
            if (pushBlocked) {
              void Linking.openSettings();
              return;
            }
            void allowNotifications();
          }}
          onDismiss={() => void markNotificationsSeen()}
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
