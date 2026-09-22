import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import { InviteShareCard } from '@/src/components/InviteShareCard';
import { LEGAL_URLS, LegalLinks } from '@/src/components/LegalLinks';
import { useAuth } from '@/src/auth/AuthContext';
import { authAPI } from '@/src/api/auth';
import {
  disablePushOnThisDevice,
  getPushPermissionSnapshot,
  requestAndRegisterPush,
} from '@/src/lib/pushNotifications';
import { showToast } from '@/src/stores/toastStore';
import { colors } from '@/src/theme/colors';

type Props = {
  visible: boolean;
  inviteCode?: string | null;
  username?: string;
  canUpload?: boolean;
  deleting?: boolean;
  onClose: () => void;
  onWallet: () => void;
  onUpload?: () => void;
  onEditProfile: () => void;
  onSignOut: () => void;
  onDeleteAccount: () => Promise<void>;
};

export function ProfileSettingsSheet({
  visible,
  inviteCode,
  username,
  canUpload = false,
  deleting = false,
  onClose,
  onWallet,
  onUpload,
  onEditProfile,
  onSignOut,
  onDeleteAccount,
}: Props) {
  const [busy, setBusy] = useState(false);

  const openAdvancedOnWeb = async () => {
    await WebBrowser.openBrowserAsync(
      'https://tuneable.stream/profile?settings=true'
    );
  };

  const confirmDelete = () => {
    Alert.alert(
      'Delete account?',
      'This permanently deletes your Tuneable account and personal data. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete account',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Confirm deletion',
              'Are you sure? Your profile, wallet balance, and personal data will be removed.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Delete forever',
                  style: 'destructive',
                  onPress: () => {
                    void (async () => {
                      setBusy(true);
                      try {
                        await onDeleteAccount();
                        onClose();
                      } catch (err) {
                        Alert.alert(
                          'Could not delete account',
                          err instanceof Error
                            ? err.message
                            : 'Please try again or email privacy@tuneable.com'
                        );
                      } finally {
                        setBusy(false);
                      }
                    })();
                  },
                },
              ]
            );
          },
        },
      ]
    );
  };

  const disabled = busy || deleting;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <Text style={styles.title}>Settings</Text>
            <Pressable onPress={onClose} hitSlop={10} disabled={disabled}>
              <Ionicons name="close" size={24} color={colors.textMuted} />
            </Pressable>
          </View>

          <Pressable style={styles.row} onPress={onWallet} disabled={disabled}>
            <Ionicons name="wallet-outline" size={20} color={colors.accentLight} />
            <Text style={styles.rowText}>Wallet & top up</Text>
          </Pressable>

          {canUpload && onUpload ? (
            <Pressable style={styles.row} onPress={onUpload} disabled={disabled}>
              <Ionicons
                name="cloud-upload-outline"
                size={20}
                color={colors.accentLight}
              />
              <Text style={styles.rowText}>Upload audio</Text>
            </Pressable>
          ) : null}

          <Pressable
            style={styles.row}
            onPress={onEditProfile}
            disabled={disabled}>
            <Ionicons name="create-outline" size={20} color={colors.accentLight} />
            <Text style={styles.rowText}>Edit profile</Text>
          </Pressable>

          {Platform.OS !== 'web' ? <PushNotificationsRow disabled={disabled} /> : null}

          <Pressable
            style={styles.row}
            onPress={() => void openAdvancedOnWeb()}
            disabled={disabled}>
            <Ionicons name="globe-outline" size={20} color={colors.accentLight} />
            <Text style={styles.rowText}>Advanced settings on web</Text>
          </Pressable>

          <Pressable
            style={styles.row}
            onPress={() => void Linking.openURL(LEGAL_URLS.dataDeletion)}
            disabled={disabled}>
            <Ionicons
              name="document-text-outline"
              size={20}
              color={colors.accentLight}
            />
            <Text style={styles.rowText}>Data deletion info</Text>
          </Pressable>

          <InviteShareCard inviteCode={inviteCode} username={username} />

          <LegalLinks compact />

          <Pressable
            style={styles.signOut}
            disabled={disabled}
            onPress={() => {
              onClose();
              onSignOut();
            }}>
            <Text style={styles.signOutText}>Sign out</Text>
          </Pressable>

          <Pressable
            style={[styles.deleteBtn, disabled && styles.disabled]}
            onPress={confirmDelete}
            disabled={disabled}>
            {disabled ? (
              <ActivityIndicator color="#fecaca" />
            ) : (
              <Text style={styles.deleteText}>Delete account</Text>
            )}
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  sheet: {
    backgroundColor: colors.gradientStart,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingBottom: 36,
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
    marginBottom: 12,
  },
  title: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '700',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.cardBorder,
  },
  rowText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '500',
  },
  rowCopy: {
    flex: 1,
    gap: 2,
  },
  rowHint: {
    color: colors.textMuted,
    fontSize: 12,
  },
  signOut: {
    marginTop: 8,
    backgroundColor: 'rgba(239, 68, 68, 0.25)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.5)',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  signOutText: {
    color: '#fecaca',
    fontSize: 16,
    fontWeight: '600',
  },
  deleteBtn: {
    marginTop: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  deleteText: {
    color: '#fca5a5',
    fontSize: 14,
    fontWeight: '600',
  },
  disabled: { opacity: 0.6 },
});

function PushNotificationsRow({ disabled }: { disabled: boolean }) {
  const { user, refreshUser } = useAuth();
  const [osGranted, setOsGranted] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void getPushPermissionSnapshot()
      .then((snap) => {
        if (cancelled) return;
        setOsGranted(snap?.status === 'granted');
      })
      .catch(() => {
        if (!cancelled) setOsGranted(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.hasPushDevice]);

  const enabled =
    osGranted === true &&
    !!user?.hasPushDevice &&
    user?.preferences?.notifications?.push !== false;

  const promptForSettings = () => {
    Alert.alert(
      'Notifications are off',
      'Turn on notifications for Tuneable in Settings.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Open Settings', onPress: () => void Linking.openSettings() },
      ]
    );
  };

  const onToggle = (next: boolean) => {
    if (busy || disabled) return;
    setBusy(true);
    void (async () => {
      try {
        if (!next) {
          await disablePushOnThisDevice();
          await authAPI.updateProfile({
            onboarding: { notificationsPromptSeenAt: new Date().toISOString() },
          });
          await refreshUser();
          return;
        }
        const snap = await getPushPermissionSnapshot();
        if (snap && snap.status !== 'granted' && snap.canAskAgain === false) {
          setOsGranted(false);
          promptForSettings();
          return;
        }
        const result = await requestAndRegisterPush();
        if (result === 'granted') {
          setOsGranted(true);
          await refreshUser();
          return;
        }
        if (result === 'denied') {
          const again = await getPushPermissionSnapshot();
          setOsGranted(false);
          if (again && again.canAskAgain === false) promptForSettings();
          return;
        }
        showToast('Could not turn on notifications. Try again.', 'error');
      } catch {
        showToast('Could not update notifications.', 'error');
      } finally {
        setBusy(false);
      }
    })();
  };

  return (
    <View style={styles.row}>
      <Ionicons name="notifications-outline" size={20} color={colors.accentLight} />
      <View style={styles.rowCopy}>
        <Text style={styles.rowText}>Push notifications</Text>
        <Text style={styles.rowHint}>Tips, replies, and outtips</Text>
      </View>
      {busy || osGranted === null ? (
        <ActivityIndicator color={colors.accentLight} />
      ) : (
        <Switch
          value={enabled}
          onValueChange={onToggle}
          disabled={disabled}
          trackColor={{ false: 'rgba(255,255,255,0.2)', true: colors.accent }}
          thumbColor="#fff"
        />
      )}
    </View>
  );
}
