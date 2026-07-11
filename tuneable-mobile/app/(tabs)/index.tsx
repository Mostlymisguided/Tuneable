import { StyleSheet, Text, View } from 'react-native';
import { Screen } from '@/src/components/Screen';
import { useAuth } from '@/src/auth/AuthContext';
import { formatPoundsFromPence } from '@/src/lib/format';
import { colors } from '@/src/theme/colors';

export default function HomeScreen() {
  const { user } = useAuth();

  return (
    <Screen style={styles.pad}>
      <Text style={styles.greeting}>Hey {user?.username ?? 'there'}</Text>
      <Text style={styles.lede}>
        Welcome to Tuneable mobile. Music and podcasts charts land next; for now
        you can confirm auth and wallet balance.
      </Text>

      <View style={styles.card}>
        <Text style={styles.cardLabel}>Wallet</Text>
        <Text style={styles.cardValue}>{formatPoundsFromPence(user?.balance)}</Text>
      </View>

      {typeof user?.tuneBytes === 'number' ? (
        <View style={styles.card}>
          <Text style={styles.cardLabel}>TuneBytes</Text>
          <Text style={styles.cardValue}>{user.tuneBytes}</Text>
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  pad: {
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  greeting: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.text,
  },
  lede: {
    marginTop: 10,
    marginBottom: 24,
    fontSize: 15,
    lineHeight: 22,
    color: colors.textSecondary,
  },
  card: {
    backgroundColor: colors.card,
    borderColor: colors.cardBorder,
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
  },
  cardLabel: {
    color: colors.textMuted,
    fontSize: 13,
    marginBottom: 4,
  },
  cardValue: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '600',
  },
});
