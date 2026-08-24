import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '@/src/theme/colors';

export const LEGAL_URLS = {
  privacy: 'https://tuneable.stream/privacy-policy',
  terms: 'https://tuneable.stream/terms-of-service',
  dataDeletion: 'https://tuneable.stream/data-deletion',
  aboutHowMoneyWorks: 'https://tuneable.stream/about#how-money-works',
} as const;

type Props = {
  compact?: boolean;
};

export function LegalLinks({ compact = false }: Props) {
  const open = (url: string) => {
    void Linking.openURL(url);
  };

  return (
    <View style={[styles.row, compact && styles.compact]}>
      <Pressable onPress={() => open(LEGAL_URLS.privacy)} hitSlop={6}>
        <Text style={styles.link}>Privacy Policy</Text>
      </Pressable>
      <Text style={styles.sep}>·</Text>
      <Pressable onPress={() => open(LEGAL_URLS.terms)} hitSlop={6}>
        <Text style={styles.link}>Terms of Service</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginTop: 20,
  },
  compact: {
    marginTop: 12,
  },
  link: {
    color: colors.accentLight,
    fontSize: 13,
    fontWeight: '500',
  },
  sep: {
    color: colors.textMuted,
    fontSize: 13,
  },
});
