import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  useWindowDimensions,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useAuth } from '@/src/auth/AuthContext';
import { TipAmountPicker, MAX_TIP_POUNDS } from '@/src/components/TipAmountPicker';
import { WelcomeCreditClaimCard } from '@/src/components/WelcomeCreditClaimCard';
import {
  canRequestLocationPermission,
  getCurrentLocationStatus,
  getTipCurrentLocation,
  maybeRefreshCurrentLocationIfGranted,
  refreshCurrentLocation,
  subscribeCurrentLocation,
  type CurrentLocationStatus,
} from '@/src/lib/currentLocation';
import {
  appendTipChips,
  isKnownElement,
  normalizeTipChipForDisplay,
} from '@/src/lib/elementNormalizer';
import { getApiErrorMessage } from '@/src/lib/apiError';
import { formatPoundsFromPence } from '@/src/lib/format';
import {
  isInsufficientBalanceError,
  TIP_TOP_UP_MESSAGE,
} from '@/src/lib/tipBalance';
import { showToast } from '@/src/stores/toastStore';
import { formatLocationLabel } from '@/src/lib/location';
import {
  buildTipStatChips,
  resolveTipStatInputs,
  type TipBidLike,
  type TipViewerLike,
} from '@/src/lib/tipStats';
import { colors } from '@/src/theme/colors';

export type TipMediaLike = {
  _id?: string;
  id?: string;
  uuid?: string;
  tags?: string[] | null;
  bids?: TipBidLike[] | null;
  globalMediaAggregate?: number | null;
  globalMediaAggregateAvg?: number | null;
  globalMediaAggregateTop?: number | null;
  globalMediaAggregateTopUser?: TipViewerLike | string | null;
  partyMediaAggregateTop?: number | null;
  partyMediaAggregateTopUser?: TipViewerLike | string | null;
  partyBids?: TipBidLike[] | null;
  minimumBid?: number | null;
} | null;

/** Slide-out of the native modal. Android does not fire Modal onDismiss. */
const TIP_SHEET_DISMISS_MS = 420;

function tipSuccessMessage(amount: number, mediaTitle: string, tagCount: number): string {
  const label = `£${amount.toFixed(2)}`;
  const name = mediaTitle.trim();
  const placed = name
    ? `Placed ${label} tip on "${name}"`
    : `Placed ${label} tip`;
  if (tagCount <= 0) return placed;
  const tagsLabel = tagCount === 1 ? '1 tag' : `${tagCount} tags`;
  return `${placed} and backed ${tagsLabel}`;
}

type Props = {
  visible: boolean;
  title: string;
  subtitle?: string;
  balancePence: number;
  defaultTipPounds?: number;
  /** When set, overrides default tip when the sheet opens. */
  initialAmountPounds?: number | null;
  /** Media used to resolve Min / Avg / Champion shortcuts. */
  tipMedia?: TipMediaLike;
  /** Tags pre-selected when the sheet opens (for example the tag page the tip came from). */
  initialTags?: string[];
  minTip?: number;
  onClose: () => void;
  onConfirm: (amountPounds: number, tags: string[]) => Promise<unknown>;
};

function roundPounds(n: number): number {
  return Math.round(n * 100) / 100;
}

export function TipSheet({
  visible,
  title,
  subtitle,
  balancePence,
  defaultTipPounds = 1.11,
  initialAmountPounds = null,
  tipMedia = null,
  initialTags,
  minTip = 0.01,
  onClose,
  onConfirm,
}: Props) {
  const { user } = useAuth();
  const { height: windowHeight } = useWindowDimensions();
  const [headerHeight, setHeaderHeight] = useState(0);
  const liveBalancePence = user?.balance ?? balancePence;
  const [amount, setAmount] = useState(defaultTipPounds);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [currentLocation, setCurrentLocation] = useState(getTipCurrentLocation);
  const [locationStatus, setLocationStatus] = useState<CurrentLocationStatus>(
    getCurrentLocationStatus
  );
  const [canAskLocation, setCanAskLocation] = useState(canRequestLocationPermission);
  const [enablingLocation, setEnablingLocation] = useState(false);
  const pendingWalletNav = useRef(false);
  const walletNavTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSuccessMessage = useRef<string | null>(null);
  const successToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flushSuccessToast = () => {
    const message = pendingSuccessMessage.current;
    if (!message) return;
    pendingSuccessMessage.current = null;
    if (successToastTimer.current) {
      clearTimeout(successToastTimer.current);
      successToastTimer.current = null;
    }
    showToast(message);
  };

  useEffect(() => {
    return () => {
      if (walletNavTimer.current) clearTimeout(walletNavTimer.current);
      if (successToastTimer.current) {
        clearTimeout(successToastTimer.current);
        successToastTimer.current = null;
      }
      const message = pendingSuccessMessage.current;
      if (message) {
        pendingSuccessMessage.current = null;
        showToast(message);
      }
    };
  }, []);

  const flushWalletNav = () => {
    if (!pendingWalletNav.current) return;
    pendingWalletNav.current = false;
    if (walletNavTimer.current) {
      clearTimeout(walletNavTimer.current);
      walletNavTimer.current = null;
    }
    router.push('/wallet');
  };

  const queueSuccessToast = (message: string) => {
    pendingSuccessMessage.current = message;
    if (successToastTimer.current) clearTimeout(successToastTimer.current);
    // Toast sits under the native modal, so it stays invisible until the sheet
    // is gone. onDismiss covers iOS; the timer covers Android.
    successToastTimer.current = setTimeout(flushSuccessToast, TIP_SHEET_DISMISS_MS);
  };

  const sendToWalletTopUp = () => {
    showToast(TIP_TOP_UP_MESSAGE, 'error');
    pendingWalletNav.current = true;
    onClose();
    if (walletNavTimer.current) clearTimeout(walletNavTimer.current);
    // The tip sheet is a native modal. Wait for it to dismiss so it does not
    // cover the wallet screen. onDismiss covers iOS; the timer covers Android.
    walletNavTimer.current = setTimeout(flushWalletNav, 320);
  };

  const tipStats = useMemo(
    () => resolveTipStatInputs(tipMedia, user),
    [tipMedia, user]
  );

  const effectiveMinTip = useMemo(() => {
    const fromMedia =
      typeof tipMedia?.minimumBid === 'number' && tipMedia.minimumBid > 0
        ? tipMedia.minimumBid
        : null;
    return Math.max(0.01, fromMedia ?? minTip);
  }, [tipMedia, minTip]);

  const tipChips = useMemo(
    () =>
      buildTipStatChips({
        minTip: effectiveMinTip,
        avgTip: tipStats.avgTip,
        championAggregate: tipStats.championAggregate,
        viewerAggregate: tipStats.viewerAggregate,
        viewerIsChampion: tipStats.viewerIsChampion,
      }),
    [effectiveMinTip, tipStats]
  );

  const existingTags = useMemo(() => {
    const out: string[] = [];
    for (const raw of tipMedia?.tags || []) {
      const chip = normalizeTipChipForDisplay(String(raw || ''));
      if (!chip || out.some((item) => item.toLowerCase() === chip.toLowerCase())) continue;
      out.push(chip);
      if (out.length >= 8) break;
    }
    return out;
  }, [tipMedia]);

  const homeLocation = user?.homeLocation || null;
  const homeLabel = formatLocationLabel(homeLocation);
  const currentLabel = formatLocationLabel(currentLocation);
  const samePlace = Boolean(
    homeLocation?.placeId &&
      currentLocation?.placeId &&
      homeLocation.placeId === currentLocation.placeId
  );
  // Hard-denied needs Settings. A one-time deny can still be requested again.
  const locationBlocked = locationStatus === 'denied' && !canAskLocation;
  const canOfferCurrentLocation = !locationBlocked;
  const locationNeedsRetry =
    locationStatus === 'unavailable' || locationStatus === 'error';

  useEffect(() => {
    return subscribeCurrentLocation(() => {
      setCurrentLocation(getTipCurrentLocation());
      setLocationStatus(getCurrentLocationStatus());
      setCanAskLocation(canRequestLocationPermission());
    });
  }, []);

  useEffect(() => {
    if (visible && user) {
      void maybeRefreshCurrentLocationIfGranted();
    }
  }, [visible, user]);

  const initialTagsKey = (initialTags || []).join(',');
  useEffect(() => {
    if (!visible) return;
    const start = Math.min(
      MAX_TIP_POUNDS,
      Math.max(
        effectiveMinTip,
        roundPounds(initialAmountPounds ?? defaultTipPounds ?? 1.11)
      )
    );
    setAmount(start);
    setError(null);
    setSubmitting(false);
    setTagInput('');
    setTags(appendTipChips([], initialTags || []));
  }, [
    visible,
    defaultTipPounds,
    initialAmountPounds,
    effectiveMinTip,
    initialTagsKey,
  ]);

  const finishAndClose = (success?: { tagCount: number }) => {
    if (success) {
      queueSuccessToast(tipSuccessMessage(amount, title, success.tagCount));
    }
    setTags([]);
    setTagInput('');
    onClose();
  };

  const applyAmount = useCallback((next: number) => {
    const safe = Math.min(
      MAX_TIP_POUNDS,
      Math.max(effectiveMinTip, roundPounds(next))
    );
    setAmount(safe);
  }, [effectiveMinTip]);

  const handleAddTag = () => {
    const input = tagInput.trim();
    if (!input) return;

    const next = appendTipChips(tags, input.split(','));
    if (next.length === tags.length) return;
    setTags(next);
    setTagInput('');
  };

  const toggleExistingTag = (tag: string) => {
    setTags((prev) =>
      prev.some((item) => item.toLowerCase() === tag.toLowerCase())
        ? prev.filter((item) => item.toLowerCase() !== tag.toLowerCase())
        : appendTipChips(prev, [tag])
    );
  };

  const handleEnableCurrentLocation = async () => {
    setEnablingLocation(true);
    setError(null);
    try {
      const location = await refreshCurrentLocation({ force: true });
      if (!location) {
        const status = getCurrentLocationStatus();
        if (status === 'denied' && !canRequestLocationPermission()) {
          setError(null);
        } else if (status === 'denied') {
          setError('Location permission denied. You can try again.');
        } else {
          setError('Could not detect your current location');
        }
      }
    } finally {
      setEnablingLocation(false);
    }
  };

  const executeTip = async () => {
    setSubmitting(true);
    try {
      await onConfirm(amount, tags);
      finishAndClose({ tagCount: tags.length });
    } catch (err) {
      if (isInsufficientBalanceError(err)) {
        sendToWalletTopUp();
        return;
      }
      setError(getApiErrorMessage(err, 'Tip failed'));
    } finally {
      setSubmitting(false);
    }
  };

  const submit = async () => {
    setError(null);
    if (amount < effectiveMinTip) {
      setError(`Minimum tip is £${effectiveMinTip.toFixed(2)}`);
      return;
    }
    const neededPence = Math.round(amount * 100);
    if (neededPence > liveBalancePence) {
      sendToWalletTopUp();
      return;
    }

    await executeTip();
  };

  const handleClose = () => {
    if (submitting) return;
    finishAndClose();
  };

  const scrollMaxHeight = Math.max(
    160,
    windowHeight * 0.92 - (headerHeight || windowHeight * 0.5)
  );

  const currentStatusLabel =
    currentLabel ||
    (locationStatus === 'denied'
      ? 'Permission denied'
      : locationStatus === 'unavailable' || locationStatus === 'error'
        ? 'Couldn’t detect'
        : locationStatus === 'loading' || enablingLocation
          ? 'Detecting…'
          : 'Not enabled');

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onDismiss={() => {
        flushWalletNav();
        flushSuccessToast();
      }}
      onRequestClose={handleClose}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable
          style={styles.backdrop}
          onPress={() => {
            if (Keyboard.isVisible()) {
              Keyboard.dismiss();
              return;
            }
            handleClose();
          }}
        />
        <View style={styles.sheet}>
          <View
            style={styles.pickerBlock}
            onLayout={(event) => {
              const next = Math.round(event.nativeEvent.layout.height);
              setHeaderHeight((prev) => (prev === next ? prev : next));
            }}>
            <Text style={styles.heading}>Confirm Your Tip</Text>
            <Text style={styles.title} numberOfLines={2}>
              {title}
            </Text>
            {subtitle ? (
              <Text style={styles.subtitle} numberOfLines={1}>
                {subtitle}
              </Text>
            ) : null}
            <Text style={styles.balance}>
              Balance {formatPoundsFromPence(liveBalancePence)}
            </Text>

            {visible ? (
              <TipAmountPicker
                value={amount}
                onChange={applyAmount}
                disabled={submitting}
              />
            ) : null}

            <View style={styles.chipRow}>
              {tipChips.map((chip) => {
                const disabled =
                  submitting || (chip.kind === 'champion' && chip.disabled);
                const label =
                  chip.kind === 'champion' && chip.disabled
                    ? chip.label
                    : chip.kind === 'champion' && chip.displayValue != null
                      ? `${chip.label} £${chip.displayValue.toFixed(2)}`
                      : `${chip.label} £${chip.value.toFixed(2)}`;
                return (
                  <Pressable
                    key={chip.label}
                    disabled={disabled}
                    onPress={() => applyAmount(chip.value)}
                    style={[
                      styles.tipChip,
                      chip.kind === 'champion' && styles.tipChipChampion,
                      disabled && styles.tipChipDisabled,
                    ]}>
                    <Text
                      style={[
                        styles.tipChipText,
                        chip.kind === 'champion' && styles.tipChipChampionText,
                      ]}>
                      {label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
          <ScrollView
            style={{ maxHeight: scrollMaxHeight }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.sheetContent}>
            {user ? (
              <View
                style={[
                  styles.influenceCard,
                  !currentLocation &&
                    canOfferCurrentLocation &&
                    styles.influenceCardAttention,
                ]}>
                <View style={styles.influenceHeader}>
                  <Ionicons
                    name="location-outline"
                    size={18}
                    color={colors.accentLight}
                  />
                  <Text style={styles.influenceTitle}>Chart influence</Text>
                </View>

                {samePlace && currentLabel ? (
                  <Text style={styles.influenceBody}>
                    Home & current:{' '}
                    <Text style={styles.influenceStrong}>{currentLabel}</Text>
                  </Text>
                ) : (
                  <View style={styles.influenceLines}>
                    <Text style={styles.influenceBody}>
                      Home:{' '}
                      <Text style={styles.influenceStrong}>
                        {homeLabel || 'Not set'}
                      </Text>
                    </Text>
                    <Text style={styles.influenceBody}>
                      Current:{' '}
                      <Text style={styles.influenceStrong}>
                        {currentStatusLabel}
                      </Text>
                    </Text>
                  </View>
                )}

                {currentLocation && !homeLabel ? (
                  <Text style={styles.influenceHint}>
                    This tip will influence charts where you are now.
                  </Text>
                ) : null}

                {!currentLocation && canOfferCurrentLocation ? (
                  <View style={styles.enableRow}>
                    <Text style={styles.enableCopy}>
                      {locationNeedsRetry
                        ? 'We couldn’t detect your location. Try again, or tip with your home place only.'
                        : 'Also count this tip where you are now. Location is only used while Tuneable is open.'}
                    </Text>
                    <Pressable
                      style={styles.enableBtn}
                      onPress={() => void handleEnableCurrentLocation()}
                      disabled={
                        submitting ||
                        enablingLocation ||
                        locationStatus === 'loading'
                      }>
                      {enablingLocation || locationStatus === 'loading' ? (
                        <ActivityIndicator color="#fff" size="small" />
                      ) : (
                        <>
                          <Ionicons name="navigate" size={16} color="#fff" />
                          <Text style={styles.enableBtnText}>
                            {locationNeedsRetry || locationStatus === 'denied'
                              ? 'Try again'
                              : 'Also count this tip where I am'}
                          </Text>
                        </>
                      )}
                    </Pressable>
                  </View>
                ) : null}

                {!currentLocation && locationBlocked ? (
                  <View style={styles.enableRow}>
                    <Text style={styles.influenceWarn}>
                      Location is off for Tuneable. This tip will use your home place only.
                    </Text>
                    <Pressable
                      style={styles.enableBtn}
                      onPress={() => void Linking.openSettings()}
                      disabled={submitting}>
                      <Ionicons name="settings-outline" size={16} color="#fff" />
                      <Text style={styles.enableBtnText}>Open Settings</Text>
                    </Pressable>
                  </View>
                ) : null}

                {!homeLabel && !currentLocation ? (
                  <Text style={styles.influenceHint}>
                    Add a home location on your profile so tips count on local
                    charts.
                  </Text>
                ) : null}
              </View>
            ) : null}

            <View style={styles.tagsSection}>
              <View style={styles.tagsHeader}>
                <Ionicons name="pricetag-outline" size={16} color={colors.accentLight} />
                <Text style={styles.tagsTitle}>Add Tags & Elements (Optional)</Text>
              </View>
              {existingTags.length > 0 ? (
                <View style={styles.tagChips}>
                  {existingTags.map((tag) => {
                    const selected = tags.some(
                      (item) => item.toLowerCase() === tag.toLowerCase()
                    );
                    return (
                      <Pressable
                        key={tag}
                        onPress={() => toggleExistingTag(tag)}
                        disabled={submitting}
                        style={[
                          styles.tagChip,
                          selected ? styles.tagChipTag : styles.tagChipIdle,
                        ]}>
                        <Text
                          style={[
                            styles.tagChipText,
                            !selected && styles.tagChipTextIdle,
                          ]}>
                          #{tag}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}
              <View style={styles.tagInputRow}>
                <TextInput
                  style={styles.tagInput}
                  value={tagInput}
                  onChangeText={setTagInput}
                  placeholder="e.g., chill, guitar, workout"
                  placeholderTextColor={colors.textMuted}
                  maxLength={32}
                  editable={!submitting}
                  onSubmitEditing={handleAddTag}
                  returnKeyType="done"
                />
                <Pressable
                  style={[
                    styles.addTagBtn,
                    (!tagInput.trim() || submitting) && styles.addTagBtnDisabled,
                  ]}
                  onPress={handleAddTag}
                  disabled={!tagInput.trim() || submitting}>
                  <Text style={styles.addTagBtnText}>Add</Text>
                </Pressable>
              </View>
              {tags.some(
                (tag) =>
                  !existingTags.some((existing) => existing.toLowerCase() === tag.toLowerCase())
              ) ? (
                <View style={styles.tagChips}>
                  {tags
                    .filter(
                      (tag) =>
                        !existingTags.some(
                          (existing) => existing.toLowerCase() === tag.toLowerCase()
                        )
                    )
                    .map((tag) => {
                    const asElement = isKnownElement(tag);
                    return (
                      <View
                        key={tag}
                        style={[
                          styles.tagChip,
                          asElement ? styles.tagChipElement : styles.tagChipTag,
                        ]}>
                        <Text style={styles.tagChipText}>{tag}</Text>
                        <Pressable
                          onPress={() =>
                            setTags((prev) => prev.filter((t) => t !== tag))
                          }
                          disabled={submitting}
                          hitSlop={8}>
                          <Text style={styles.tagChipRemove}>×</Text>
                        </Pressable>
                      </View>
                    );
                  })}
                </View>
              ) : null}
            </View>

            {error ? <Text style={styles.error}>{error}</Text> : null}
            {liveBalancePence <= 0 || (error && error.startsWith('Insufficient')) ? (
              <WelcomeCreditClaimCard compact />
            ) : null}

            <Pressable
              style={[styles.confirm, submitting && styles.confirmDisabled]}
              onPress={() => void submit()}
              disabled={submitting}>
              {submitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.confirmText}>
                  Confirm Tip {formatPoundsFromPence(Math.round(amount * 100))}
                </Text>
              )}
            </Pressable>

            <Pressable
              style={styles.cancel}
              onPress={handleClose}
              disabled={submitting}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, justifyContent: 'flex-end' },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  sheet: {
    maxHeight: '92%',
    backgroundColor: colors.gradientStart,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    borderColor: colors.cardBorder,
  },
  pickerBlock: {
    paddingHorizontal: 20,
    paddingTop: 18,
  },
  sheetContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 28,
  },
  heading: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  title: {
    marginTop: 10,
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  subtitle: {
    marginTop: 4,
    color: colors.textSecondary,
    fontSize: 14,
  },
  balance: {
    marginTop: 10,
    marginBottom: 14,
    color: colors.textMuted,
    fontSize: 13,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    marginTop: 14,
  },
  tipChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(147, 51, 234, 0.28)',
    borderWidth: 1,
    borderColor: 'rgba(147, 51, 234, 0.45)',
  },
  tipChipChampion: {
    backgroundColor: 'rgba(180, 83, 9, 0.35)',
    borderColor: 'rgba(251, 191, 36, 0.45)',
  },
  tipChipDisabled: { opacity: 0.55 },
  tipChipText: {
    color: '#e9d5ff',
    fontWeight: '600',
    fontSize: 12,
  },
  tipChipChampionText: {
    color: '#fde68a',
  },
  influenceCard: {
    marginTop: 16,
    padding: 12,
    borderRadius: 12,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  influenceCardAttention: {
    backgroundColor: 'rgba(147, 51, 234, 0.18)',
    borderColor: 'rgba(168, 85, 247, 0.65)',
  },
  influenceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  influenceTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  influenceLines: {
    gap: 4,
  },
  influenceBody: {
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
  },
  influenceStrong: {
    color: colors.text,
    fontWeight: '600',
  },
  influenceHint: {
    marginTop: 8,
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 17,
  },
  influenceWarn: {
    marginTop: 8,
    color: '#fcd34d',
    fontSize: 12,
    lineHeight: 17,
  },
  enableRow: {
    marginTop: 12,
    gap: 10,
  },
  enableCopy: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
  },
  enableBtn: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  enableBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    flexShrink: 1,
    textAlign: 'center',
  },
  tagsSection: {
    marginTop: 16,
  },
  tagsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  tagsTitle: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  tagInputRow: {
    marginTop: 10,
    flexDirection: 'row',
    gap: 8,
  },
  tagInput: {
    flex: 1,
    height: 42,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.inputBg,
    color: colors.text,
    paddingHorizontal: 12,
    fontSize: 14,
  },
  addTagBtn: {
    borderRadius: 10,
    backgroundColor: colors.accent,
    paddingHorizontal: 14,
    justifyContent: 'center',
  },
  addTagBtnDisabled: {
    opacity: 0.45,
  },
  addTagBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
  },
  tagsMeta: {
    marginTop: 6,
    color: colors.textMuted,
    fontSize: 11,
  },
  tagChips: {
    marginTop: 10,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tagChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  tagChipTag: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  tagChipIdle: {
    backgroundColor: 'transparent',
    borderColor: colors.cardBorder,
  },
  tagChipElement: {
    backgroundColor: '#0d9488',
    borderColor: '#0d9488',
  },
  tagChipText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  tagChipTextIdle: {
    color: colors.text,
  },
  tagChipRemove: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 16,
    lineHeight: 16,
    fontWeight: '700',
  },
  error: {
    marginTop: 12,
    color: '#fca5a5',
    fontSize: 14,
  },
  confirm: {
    marginTop: 18,
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
  },
  confirmDisabled: { opacity: 0.7 },
  confirmText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  cancel: {
    marginTop: 12,
    alignItems: 'center',
    paddingVertical: 8,
  },
  cancelText: {
    color: colors.textSecondary,
    fontSize: 15,
  },
});
