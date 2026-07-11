import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Screen } from '@/src/components/Screen';
import { useAuth } from '@/src/auth/AuthContext';
import { formatPoundsFromPence } from '@/src/lib/format';
import { colors } from '@/src/theme/colors';

export default function ProfileScreen() {
  const { user, logout } = useAuth();

  const onLogout = async () => {
    await logout();
    router.replace('/login');
  };

  return (
    <Screen style={styles.pad}>
      <Text style={styles.title}>Profile</Text>

      <View style={styles.card}>
        <Text style={styles.label}>Username</Text>
        <Text style={styles.value}>{user?.username}</Text>
        <Text style={[styles.label, styles.spaced]}>Email</Text>
        <Text style={styles.value}>{user?.email}</Text>
        <Text style={[styles.label, styles.spaced]}>Balance</Text>
        <Text style={styles.value}>{formatPoundsFromPence(user?.balance)}</Text>
      </View>

      <Pressable style={styles.walletBtn} onPress={() => router.push('/wallet')}>
        <Text style={styles.walletBtnText}>Top up wallet</Text>
      </Pressable>

      <Pressable style={styles.button} onPress={() => void onLogout()}>
        <Text style={styles.buttonText}>Sign out</Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  pad: { paddingHorizontal: 20, paddingTop: 8 },
  title: { fontSize: 28, fontWeight: '700', color: colors.text, marginBottom: 20 },
  card: {
    backgroundColor: colors.card,
    borderColor: colors.cardBorder,
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
  },
  label: { color: colors.textMuted, fontSize: 13 },
  spaced: { marginTop: 14 },
  value: { color: colors.text, fontSize: 17, marginTop: 4 },
  walletBtn: {
    marginTop: 16,
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  walletBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  button: {
    marginTop: 16,
    backgroundColor: 'rgba(239, 68, 68, 0.25)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.5)',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonText: { color: '#fecaca', fontSize: 16, fontWeight: '600' },
});
