import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import { InviteShareCard } from '@/src/components/InviteShareCard';
import { LEGAL_URLS, LegalLinks } from '@/src/components/LegalLinks';
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
