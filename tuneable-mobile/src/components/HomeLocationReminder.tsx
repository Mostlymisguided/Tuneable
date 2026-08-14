import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useAuth } from '@/src/auth/AuthContext';
import { hasHomeLocation } from '@/src/lib/onboarding';
import { colors } from '@/src/theme/colors';

/** Persistent home-location nudge — shown until home location is set. */
export function HomeLocationReminder() {
  const { user } = useAuth();

  if (!user || hasHomeLocation(user.homeLocation)) {
    return null;
  }

  return (
    <Pressable
      style={styles.card}
      onPress={() => router.push('/set-home-location')}>
      <View style={styles.iconWrap}>
        <Ionicons name="location" size={20} color={colors.accentLight} />
      </View>
      <View style={styles.copy}>
        <Text style={styles.title}>Add your home location</Text>
        <Text style={styles.body}>
          Connect to local parties and charts where you&apos;re from.
        </Text>
      </View>
      <Text style={styles.cta}>Add</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 10,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(168, 85, 247, 0.45)',
    backgroundColor: 'rgba(147, 51, 234, 0.15)',
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
  cta: {
    color: colors.accentLight,
    fontSize: 14,
    fontWeight: '700',
  },
});
