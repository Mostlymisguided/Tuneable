import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '@/src/components/Screen';
import { paymentAPI } from '@/src/api/payments';
import { useAuth } from '@/src/auth/AuthContext';
import { formatPoundsFromPence } from '@/src/lib/format';
import { totalChargePounds } from '@/src/lib/payments';
import { colors } from '@/src/theme/colors';

WebBrowser.maybeCompleteAuthSession();

const QUICK_AMOUNTS = [5, 10, 20, 50];

export default function WalletScreen() {
  const { user, isAuthenticated, isLoading: authLoading, refreshUser, updateBalance } =
    useAuth();
  const params = useLocalSearchParams<{
    success?: string;
    canceled?: string;
    amount?: string;
  }>();
  const [customAmount, setCustomAmount] = useState('5.00');
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const finalizeSuccess = useCallback(
    async (amountPounds: number) => {
      setStatusMessage('Confirming payment…');
      try {
        // Give webhook a moment, then refresh / fallback credit (same as web)
        await new Promise((r) => setTimeout(r, 2500));
        await refreshUser();
        const response = await paymentAPI.updateBalance(amountPounds);
        if (typeof response.balance === 'number') {
          updateBalance(response.balance);
        } else {
          await refreshUser();
        }
        setStatusMessage(`Added £${amountPounds.toFixed(2)} to your wallet.`);
      } catch (err) {
        console.error(err);
        await refreshUser();
        setStatusMessage(
          'Payment may have succeeded — pull to refresh balance if it looks wrong.'
        );
      }
    },
    [refreshUser, updateBalance]
  );

  useEffect(() => {
    if (params.success === 'true' && params.amount) {
      const amount = Number.parseFloat(params.amount);
      if (!Number.isNaN(amount) && amount > 0) {
        void finalizeSuccess(amount);
      }
      router.replace('/wallet');
    } else if (params.canceled === 'true') {
      setStatusMessage('Payment canceled.');
      router.replace('/wallet');
    }
  }, [params.success, params.canceled, params.amount, finalizeSuccess]);

  const startCheckout = async (walletCredit: number) => {
    if (walletCredit < 0.3) {
      Alert.alert('Minimum top-up', 'Minimum top-up is £0.30');
      return;
    }
    setLoading(true);
    setStatusMessage(null);
    try {
      const charge = totalChargePounds(walletCredit);
      const successUrl = Linking.createURL('wallet', {
        queryParams: { success: 'true', amount: String(walletCredit) },
      });
      const cancelUrl = Linking.createURL('wallet', {
        queryParams: { canceled: 'true' },
      });

      const { url } = await paymentAPI.createCheckoutSession(
        walletCredit,
        'gbp',
        charge,
        { successUrl, cancelUrl }
      );

      if (!url) throw new Error('No checkout URL');

      const result = await WebBrowser.openAuthSessionAsync(url, successUrl);

      if (result.type === 'success' && result.url) {
        const parsed = Linking.parse(result.url);
        const q = parsed.queryParams || {};
        if (q.success === 'true' && q.amount) {
          const amount = Number.parseFloat(String(q.amount));
          if (!Number.isNaN(amount)) await finalizeSuccess(amount);
        } else if (q.canceled === 'true') {
          setStatusMessage('Payment canceled.');
        }
      } else if (result.type === 'cancel') {
        setStatusMessage('Checkout closed.');
      }
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data
          ?.error ||
        (err instanceof Error ? err.message : 'Failed to start checkout');
      Alert.alert('Top-up failed', message);
    } finally {
      setLoading(false);
    }
  };

  if (!authLoading && !isAuthenticated) {
    return <Redirect href="/login" />;
  }

  return (
    <Screen style={styles.pad}>
      <View style={styles.headerRow}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.back}>
          <Ionicons name="chevron-back" size={28} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>Wallet</Text>
      </View>

      <View style={styles.balanceCard}>
        <Text style={styles.balanceLabel}>Current balance</Text>
        <Text style={styles.balanceValue}>
          {formatPoundsFromPence(user?.balance)}
        </Text>
      </View>

      <Text style={styles.section}>Quick top-up</Text>
      <View style={styles.quickRow}>
        {QUICK_AMOUNTS.map((amount) => (
          <Pressable
            key={amount}
            style={[styles.quickBtn, loading && styles.disabled]}
            disabled={loading}
            onPress={() => void startCheckout(amount)}>
            <Text style={styles.quickText}>£{amount}</Text>
            <Text style={styles.feeHint}>
              ~£{totalChargePounds(amount).toFixed(2)} charged
            </Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.section}>Custom amount</Text>
      <View style={styles.customRow}>
        <View style={styles.inputWrap}>
          <Text style={styles.currency}>£</Text>
          <TextInput
            style={styles.input}
            keyboardType="decimal-pad"
            value={customAmount}
            onChangeText={setCustomAmount}
            editable={!loading}
          />
        </View>
        <Pressable
          style={[styles.customBtn, loading && styles.disabled]}
          disabled={loading}
          onPress={() => {
            const n = Number.parseFloat(customAmount);
            if (Number.isNaN(n)) {
              Alert.alert('Invalid amount');
              return;
            }
            void startCheckout(n);
          }}>
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.customBtnText}>Top up</Text>
          )}
        </Pressable>
      </View>

      <Text style={styles.note}>
        Card checkout opens in your browser. Stripe fees are estimated (~3.5% +
        £0.22); you are credited the amount you choose.
      </Text>

      {statusMessage ? <Text style={styles.status}>{statusMessage}</Text> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  pad: { paddingHorizontal: 20, paddingTop: 8 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    gap: 4,
  },
  back: { marginLeft: -6 },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.text,
  },
  balanceCard: {
    backgroundColor: colors.card,
    borderColor: colors.cardBorder,
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
    marginBottom: 24,
  },
  balanceLabel: { color: colors.textMuted, fontSize: 13 },
  balanceValue: {
    marginTop: 6,
    color: colors.success,
    fontSize: 32,
    fontWeight: '700',
  },
  section: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 10,
  },
  quickRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 22,
  },
  quickBtn: {
    width: '47%',
    backgroundColor: 'rgba(147, 51, 234, 0.22)',
    borderWidth: 1,
    borderColor: 'rgba(147, 51, 234, 0.45)',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 12,
  },
  quickText: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  feeHint: {
    marginTop: 4,
    color: colors.textMuted,
    fontSize: 11,
  },
  customRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  inputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.inputBg,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 48,
  },
  currency: {
    color: colors.textSecondary,
    fontSize: 18,
    fontWeight: '600',
    marginRight: 4,
  },
  input: {
    flex: 1,
    color: colors.text,
    fontSize: 18,
    fontWeight: '600',
    paddingVertical: 0,
  },
  customBtn: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingHorizontal: 18,
    minWidth: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  customBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  disabled: { opacity: 0.6 },
  note: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  status: {
    marginTop: 16,
    color: colors.accentLight,
    fontSize: 14,
    fontWeight: '500',
  },
});
