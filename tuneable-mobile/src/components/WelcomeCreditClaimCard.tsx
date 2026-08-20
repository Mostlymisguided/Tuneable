import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { Ionicons } from '@expo/vector-icons';
import { authAPI } from '@/src/api/auth';
import { userAPI } from '@/src/api/user';
import { useAuth } from '@/src/auth/AuthContext';
import { getApiErrorMessage } from '@/src/lib/apiError';
import { formatPoundsFromPence } from '@/src/lib/format';
import { showToast } from '@/src/stores/toastStore';
import { colors } from '@/src/theme/colors';

const TERMS_URL = 'https://tuneable.stream/terms-of-service#welcome-credit';

type Props = {
  compact?: boolean;
};

export function WelcomeCreditClaimCard({ compact = false }: Props) {
  const { user, refreshUser, updateBalance } = useAuth();
  const offer = user?.welcomeCreditOffer;
  const [accepted, setAccepted] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);

  if (!offer || (offer.status !== 'eligible' && offer.status !== 'needs_verification')) {
    return null;
  }

  const amountLabel = formatPoundsFromPence(offer.amountPence || 1111);

  const handleClaim = async () => {
    if (!accepted || claiming) return;
    setClaiming(true);
    try {
      const result = await userAPI.claimWelcomeCredit();
      if (typeof result.user?.balance === 'number') {
        updateBalance(result.user.balance);
      }
      await refreshUser();
      if (result.alreadyClaimed) {
        showToast('Welcome credit was already on your account.');
      } else {
        showToast(`${amountLabel} welcome credit added to your wallet.`);
      }
    } catch (err) {
      showToast(getApiErrorMessage(err, 'Could not claim welcome credit.'), 'error');
      await refreshUser().catch(() => undefined);
    } finally {
      setClaiming(false);
    }
  };

  const handleVerify = async () => {
    if (sendingEmail) return;
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

  return (
    <View style={[styles.card, compact && styles.cardCompact]}>
      <View style={styles.iconWrap}>
        <Ionicons name="gift-outline" size={20} color={colors.accentLight} />
      </View>
      <View style={styles.copy}>
        {offer.status === 'needs_verification' ? (
          <>
            <Text style={styles.title}>Verify your email to claim {amountLabel}</Text>
            <Text style={styles.body}>
              Confirm your email so we can add promotional welcome credit to your wallet.
            </Text>
            <Pressable onPress={() => void handleVerify()} disabled={sendingEmail} style={styles.ctaWrap}>
              <Text style={styles.cta}>{sendingEmail ? 'Sending…' : 'Send verification email'}</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Text style={styles.title}>Claim your {amountLabel} welcome credit</Text>
            <Text style={styles.body}>
              Promotional credit — not cash, and it can’t be withdrawn. Unused credit can be
              revoked and expires 12 months after you claim it.
              {!compact
                ? ' Spent tips are not clawed back. Welcome tips: max £1.11 per tip, £3.33 / 3 songs per artist, and you can’t tip media you own.'
                : ''}
            </Text>
            <Pressable
              onPress={() => void WebBrowser.openBrowserAsync(TERMS_URL)}
              hitSlop={6}
              style={styles.termsWrap}>
              <Text style={styles.terms}>Read the full welcome credit terms</Text>
            </Pressable>
            <Pressable
              onPress={() => setAccepted((prev) => !prev)}
              style={styles.checkRow}
              hitSlop={6}>
              <Ionicons
                name={accepted ? 'checkbox' : 'square-outline'}
                size={20}
                color={accepted ? colors.accentLight : colors.textMuted}
              />
              <Text style={styles.checkLabel}>I understand this is promotional credit</Text>
            </Pressable>
            <Pressable
              onPress={() => void handleClaim()}
              disabled={!accepted || claiming}
              style={styles.ctaWrap}>
              <Text style={[styles.cta, (!accepted || claiming) && styles.ctaDisabled]}>
                {claiming ? 'Claiming…' : `Claim ${amountLabel}`}
              </Text>
            </Pressable>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.card,
  },
  cardCompact: {
    marginTop: 8,
    marginBottom: 8,
    padding: 12,
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
    gap: 4,
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
  termsWrap: {
    alignSelf: 'flex-start',
    marginTop: 2,
  },
  terms: {
    color: colors.accentLight,
    fontSize: 13,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
  },
  checkLabel: {
    flex: 1,
    color: colors.text,
    fontSize: 13,
  },
  ctaWrap: {
    alignSelf: 'flex-start',
    marginTop: 6,
  },
  cta: {
    color: colors.accentLight,
    fontSize: 14,
    fontWeight: '700',
  },
  ctaDisabled: {
    opacity: 0.45,
  },
});
