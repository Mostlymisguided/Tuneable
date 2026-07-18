import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import { InviteShareCard } from '@/src/components/InviteShareCard';
import { colors } from '@/src/theme/colors';

type Props = {
  visible: boolean;
  inviteCode?: string | null;
  username?: string;
  canUpload?: boolean;
  onClose: () => void;
  onWallet: () => void;
  onUpload?: () => void;
  onSignOut: () => void;
};

export function ProfileSettingsSheet({
  visible,
  inviteCode,
  username,
  canUpload = false,
  onClose,
  onWallet,
  onUpload,
  onSignOut,
}: Props) {
  const openEditOnWeb = async () => {
    await WebBrowser.openBrowserAsync('https://tuneable.stream/profile');
  };

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
            <Pressable onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={24} color={colors.textMuted} />
            </Pressable>
          </View>

          <Pressable style={styles.row} onPress={onWallet}>
            <Ionicons name="wallet-outline" size={20} color={colors.accentLight} />
            <Text style={styles.rowText}>Wallet & top up</Text>
          </Pressable>

          {canUpload && onUpload ? (
            <Pressable style={styles.row} onPress={onUpload}>
              <Ionicons
                name="cloud-upload-outline"
                size={20}
                color={colors.accentLight}
              />
              <Text style={styles.rowText}>Upload MP3</Text>
            </Pressable>
          ) : null}

          <Pressable style={styles.row} onPress={() => void openEditOnWeb()}>
            <Ionicons name="create-outline" size={20} color={colors.accentLight} />
            <Text style={styles.rowText}>Edit profile on web</Text>
          </Pressable>

          <InviteShareCard inviteCode={inviteCode} username={username} />

          <Pressable
            style={styles.signOut}
            onPress={() => {
              onClose();
              onSignOut();
            }}>
            <Text style={styles.signOutText}>Sign out</Text>
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
});
