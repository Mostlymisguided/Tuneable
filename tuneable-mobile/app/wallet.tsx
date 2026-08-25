import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
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
import { WelcomeCreditClaimCard } from '@/src/components/WelcomeCreditClaimCard';
import { paymentAPI } from '@/src/api/payments';
import { useAuth } from '@/src/auth/AuthContext';
import { formatPoundsFromPence } from '@/src/lib/format';
import {
  getExpoIap,
  isExpoGo,
  shouldUseStoreIap,
  type Product,
  type Purchase,
} from '@/src/lib/iap';
import { WALLET_IAP_PRODUCTS, WALLET_IAP_SKUS } from '@/src/lib/iapProducts';
import { totalChargePounds } from '@/src/lib/payments';
import { colors } from '@/src/theme/colors';

WebBrowser.maybeCompleteAuthSession();

const useStoreIap = shouldUseStoreIap();

export default function WalletScreen() {
  const { user, isAuthenticated, isLoading: authLoading, refreshUser, updateBalance } =
    useAuth();
  const params = useLocalSearchParams<{
    success?: string;
    canceled?: string;
    amount?: string;
    session_id?: string;
  }>();
  const [customAmount, setCustomAmount] = useState('5.00');
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [storeProducts, setStoreProducts] = useState<Product[]>([]);
  const [iapReady, setIapReady] = useState(false);
  const [iapError, setIapError] = useState<string | null>(null);
  const verifyingRef = useRef(false);

  const finalizeStripeSuccess = useCallback(
    async (amountPounds: number, sessionId?: string) => {
      setStatusMessage('Confirming payment…');
      try {
        if (sessionId) {
          const response = await paymentAPI.confirmCheckoutSession(sessionId);
          if (typeof response.balance === 'number') {
            updateBalance(response.balance);
          } else {
            await refreshUser();
          }
          setStatusMessage(
            response.alreadyProcessed
              ? `£${amountPounds.toFixed(2)} already added to your wallet.`
              : `Added £${amountPounds.toFixed(2)} to your wallet.`
          );
          return;
        }

        await refreshUser();
        setStatusMessage(
          `Payment received. Your wallet will update shortly.`
        );
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

  const handleVerifiedPurchase = useCallback(
    async (purchase: Purchase) => {
      if (verifyingRef.current) return;
      const iap = getExpoIap();
      if (!iap) return;

      verifyingRef.current = true;
      setLoading(true);
      setStatusMessage('Verifying purchase…');
      try {
        const platform = Platform.OS === 'ios' ? 'ios' : 'android';
        const result = await paymentAPI.verifyIapPurchase({
          platform,
          productId: purchase.productId,
          transactionId: purchase.id,
          purchaseToken: purchase.purchaseToken,
          packageName:
            Platform.OS === 'android' ? 'stream.tuneable.app' : undefined,
        });

        if (typeof result.balance === 'number') {
          updateBalance(result.balance);
        } else {
          await refreshUser();
        }

        await iap.finishTransaction({ purchase, isConsumable: true });

        setStatusMessage(
          result.alreadyProcessed
            ? `Already credited £${result.creditPounds.toFixed(2)}.`
            : `Added £${result.creditPounds.toFixed(2)} to your wallet.`
        );
      } catch (err: unknown) {
        console.error(err);
        const message =
          (err as { response?: { data?: { error?: string } } })?.response?.data
            ?.error ||
          (err instanceof Error ? err.message : 'Could not verify purchase');
        Alert.alert('Top-up failed', message);
        setStatusMessage(null);
      } finally {
        verifyingRef.current = false;
        setLoading(false);
      }
    },
    [refreshUser, updateBalance]
  );

  useEffect(() => {
    if (!useStoreIap) return;
    if (isExpoGo()) {
      setIapError(
        'In-app purchases need a development build or TestFlight / Play build (not Expo Go).'
      );
      return;
    }

    const iap = getExpoIap();
    if (!iap) {
      setIapError('In-app purchase module is unavailable in this build.');
      return;
    }

    let cancelled = false;
    let updateSub: { remove: () => void } | null = null;
    let errorSub: { remove: () => void } | null = null;

    (async () => {
      try {
        await iap.initConnection();
        if (cancelled) return;

        updateSub = iap.purchaseUpdatedListener((purchase) => {
          void handleVerifiedPurchase(purchase);
        });
        errorSub = iap.purchaseErrorListener((error) => {
          if (error.code === iap.ErrorCode.UserCancelled) {
            setLoading(false);
            setStatusMessage('Purchase canceled.');
            return;
          }
          console.error('IAP error', error);
          setLoading(false);
          setStatusMessage(null);
          Alert.alert('Purchase failed', error.message || 'Store error');
        });

        const products = await iap.fetchProducts({
          skus: [...WALLET_IAP_SKUS],
          type: 'in-app',
        });
        if (!cancelled) {
          setStoreProducts(Array.isArray(products) ? (products as Product[]) : []);
          setIapReady(true);
          setIapError(null);
        }
      } catch (err) {
        console.error(err);
        if (!cancelled) {
          setIapError(
            err instanceof Error
              ? err.message
              : 'Could not connect to the store'
          );
          setIapReady(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      updateSub?.remove();
      errorSub?.remove();
      void iap.endConnection();
    };
  }, [handleVerifiedPurchase]);

  useEffect(() => {
    if (useStoreIap) return;
    if (params.success === 'true' && params.amount) {
      const amount = Number.parseFloat(params.amount);
      const sessionId =
        typeof params.session_id === 'string' ? params.session_id : undefined;
      if (!Number.isNaN(amount) && amount > 0) {
        void finalizeStripeSuccess(amount, sessionId);
      }
      router.replace('/wallet');
    } else if (params.canceled === 'true') {
      setStatusMessage('Payment canceled.');
      router.replace('/wallet');
    }
  }, [
    params.success,
    params.canceled,
    params.amount,
    finalizeStripeSuccess,
  ]);

  const startIapPurchase = async (productId: string) => {
    const iap = getExpoIap();
    if (!iap || !iapReady) {
      Alert.alert(
        'Store not ready',
        iapError ||
          'In-app purchases need a development or store build (not Expo Go).'
      );
      return;
    }
    setLoading(true);
    setStatusMessage(null);
    try {
      await iap.requestPurchase({
        request: {
          apple: { sku: productId },
          google: { skus: [productId] },
        },
        type: 'in-app',
      });
    } catch (err: unknown) {
      setLoading(false);
      const message =
        err instanceof Error ? err.message : 'Failed to start purchase';
      Alert.alert('Top-up failed', message);
    }
  };

  const startStripeCheckout = async (walletCredit: number) => {
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
          const sessionId = q.session_id ? String(q.session_id) : undefined;
          if (!Number.isNaN(amount)) await finalizeStripeSuccess(amount, sessionId);
        } else if (q.canceled === 'true') {
          setStatusMessage('Checkout canceled.');
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

  const storePriceBySku = new Map(
    storeProducts.map((p) => [p.id, p.displayPrice] as const)
  );

  return (
    <Screen style={styles.pad}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.scrollContent}>
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

      <WelcomeCreditClaimCard />

      {useStoreIap ? (
        <>
          <Text style={styles.section}>Top up</Text>
          {iapError ? <Text style={styles.error}>{iapError}</Text> : null}
          <View style={styles.quickRow}>
            {WALLET_IAP_PRODUCTS.map((pack) => {
              const displayPrice = storePriceBySku.get(pack.productId);
              return (
                <Pressable
                  key={pack.productId}
                  style={[styles.quickBtn, (loading || !iapReady) && styles.disabled]}
                  disabled={loading || !iapReady}
                  onPress={() => void startIapPurchase(pack.productId)}>
                  <Text style={styles.quickText}>{pack.label}</Text>
                  <Text style={styles.feeHint}>
                    {displayPrice
                      ? displayPrice
                      : iapReady
                        ? 'Price unavailable'
                        : 'Loading…'}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={styles.note}>
            Paid via {Platform.OS === 'ios' ? 'Apple' : 'Google Play'}. Wallet
            credit matches the pack amount. Custom amounts are available on the
            website via card.
          </Text>
        </>
      ) : (
        <>
          <Text style={styles.section}>Quick top-up</Text>
          <View style={styles.quickRow}>
            {[5, 10, 20, 50].map((amount) => (
              <Pressable
                key={amount}
                style={[styles.quickBtn, loading && styles.disabled]}
                disabled={loading}
                onPress={() => void startStripeCheckout(amount)}>
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
                void startStripeCheckout(n);
              }}>
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.customBtnText}>Top up</Text>
              )}
            </Pressable>
          </View>

          <Text style={styles.note}>
            Card checkout opens in your browser. Stripe fees are estimated
            (~3.5% + £0.22); you are credited the amount you choose.
          </Text>
        </>
      )}

      {loading && useStoreIap ? (
        <ActivityIndicator style={{ marginTop: 16 }} color={colors.accentLight} />
      ) : null}

      {statusMessage ? <Text style={styles.status}>{statusMessage}</Text> : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  pad: { paddingHorizontal: 20, paddingTop: 8 },
  scrollContent: { paddingBottom: 24, flexGrow: 1 },
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
  error: {
    color: '#f87171',
    fontSize: 12,
    marginBottom: 10,
    lineHeight: 18,
  },
  status: {
    marginTop: 16,
    color: colors.accentLight,
    fontSize: 14,
    fontWeight: '500',
  },
});
