import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/src/theme/colors';

const LOGO = require('../../assets/images/tuneable-logo.png');

type BrandMarkProps = {
  size?: number;
};

/** Circular Tuneable mark with a soft purple bloom behind it. */
export function BrandMark({ size = 96 }: BrandMarkProps) {
  const glow = size * 0.92;
  return (
    <View style={[styles.markStage, { width: size + 28, height: size + 28 }]}>
      <View
        style={[
          styles.markGlow,
          {
            width: glow,
            height: glow,
            borderRadius: glow / 2,
          },
        ]}
      />
      <View
        style={[
          styles.markClip,
          { width: size, height: size, borderRadius: size / 2 },
        ]}>
        <Image
          source={LOGO}
          accessibilityLabel="Tuneable"
          style={{
            width: size,
            height: size,
            transform: [{ scale: 1.08 }],
          }}
        />
      </View>
    </View>
  );
}

export function AuthBackButton() {
  return (
    <Pressable
      onPress={() => router.replace('/')}
      hitSlop={12}
      style={styles.backBtn}
      accessibilityRole="button"
      accessibilityLabel="Back">
      <Ionicons name="chevron-back" size={26} color={colors.text} />
    </Pressable>
  );
}

export function AuthHero({
  subtitle = 'Tip What You Love',
}: {
  subtitle?: string;
}) {
  return (
    <View style={styles.hero}>
      <BrandMark />
      <Text style={styles.wordmark}>Tuneable</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>
    </View>
  );
}

type SocialButtonProps = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
};

export function AuthSocialButton({
  icon,
  label,
  onPress,
  loading = false,
  disabled = false,
}: SocialButtonProps) {
  return (
    <Pressable
      style={[styles.socialBtn, disabled && authStyles.disabled]}
      onPress={onPress}
      disabled={disabled}>
      {loading ? (
        <ActivityIndicator color={colors.text} />
      ) : (
        <>
          <Ionicons name={icon} size={18} color={colors.text} />
          <Text style={styles.socialText}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

export const authStyles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 36,
    justifyContent: 'center',
  },
  scrollTop: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 36,
  },
  card: {
    backgroundColor: colors.card,
    borderColor: colors.cardBorder,
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
  },
  label: {
    marginTop: 10,
    marginBottom: 6,
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  input: {
    backgroundColor: colors.inputBg,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    color: colors.text,
    fontSize: 16,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.inputBg,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 12,
    paddingRight: 6,
  },
  inputBare: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 13,
    color: colors.text,
    fontSize: 16,
  },
  eyeBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtn: {
    marginTop: 16,
    backgroundColor: colors.accent,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  ghostBtn: {
    marginTop: 12,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.28)',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  ghostBtnText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  disabled: { opacity: 0.7 },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 20,
    marginBottom: 8,
  },
  divider: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.cardBorder,
  },
  dividerText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  appleBtn: {
    width: '100%',
    height: 50,
    marginTop: 8,
  },
  switchAuth: {
    marginTop: 22,
    textAlign: 'center',
    color: colors.textMuted,
    fontSize: 14,
  },
  switchAuthLink: {
    color: colors.accentLight,
    fontWeight: '700',
  },
  error: {
    marginTop: 12,
    color: '#fca5a5',
    fontSize: 14,
  },
  hint: {
    marginTop: 16,
    textAlign: 'center',
    color: colors.textMuted,
    fontSize: 12,
  },
});

const styles = StyleSheet.create({
  markStage: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  markGlow: {
    position: 'absolute',
    backgroundColor: 'rgba(168, 85, 247, 0.38)',
    shadowColor: '#c084fc',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 22,
  },
  markClip: {
    overflow: 'hidden',
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 4,
  },
  hero: {
    alignItems: 'center',
    marginBottom: 22,
  },
  wordmark: {
    marginTop: 12,
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 1.4,
    color: colors.text,
  },
  subtitle: {
    marginTop: 6,
    fontSize: 14,
    lineHeight: 20,
    color: '#e9d5ff',
    textAlign: 'center',
    fontWeight: '600',
  },
  socialBtn: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 14,
    paddingVertical: 14,
  },
  socialText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
});
