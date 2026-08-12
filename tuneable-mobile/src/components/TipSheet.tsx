import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { useAuth } from '@/src/auth/AuthContext';
import {
  getCurrentLocationStatus,
  getTipCurrentLocation,
  maybeRefreshCurrentLocationIfGranted,
  refreshCurrentLocation,
  subscribeCurrentLocation,
  type CurrentLocationStatus,
} from '@/src/lib/currentLocation';
import {
  isKnownElement,
  normalizeTipChipForDisplay,
} from '@/src/lib/elementNormalizer';
import { formatPoundsFromPence } from '@/src/lib/format';
import { formatLocationLabel } from '@/src/lib/location';
import {
  buildTipStatChips,
  resolveTipStatInputs,
  type TipBidLike,
  type TipViewerLike,
} from '@/src/lib/tipStats';
import { colors } from '@/src/theme/colors';

export type TipMediaLike = {
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
  /** Tags pre-selected when the sheet opens. */
  initialTags?: string[];
  minTip?: number;
  onClose: () => void;
  onConfirm: (amountPounds: number, tags: string[]) => Promise<void>;
};

function roundPounds(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Soft-gate skip for this app session after "Tip with home only". */
let skipLocationPromptThisSession = false;

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
  const [amount, setAmount] = useState(defaultTipPounds);
  const [amountText, setAmountText] = useState(defaultTipPounds.toFixed(2));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [currentLocation, setCurrentLocation] = useState(getTipCurrentLocation);
  const [locationStatus, setLocationStatus] = useState<CurrentLocationStatus>(
    getCurrentLocationStatus
  );
  const [enablingLocation, setEnablingLocation] = useState(false);

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

  const homeLocation = user?.homeLocation || null;
  const homeLabel = formatLocationLabel(homeLocation);
  const currentLabel = formatLocationLabel(currentLocation);
  const samePlace = Boolean(
    homeLocation?.placeId &&
      currentLocation?.placeId &&
      homeLocation.placeId === currentLocation.placeId
  );
  const canOfferCurrentLocation =
    locationStatus !== 'denied' && locationStatus !== 'unavailable';

  useEffect(() => {
    return subscribeCurrentLocation(() => {
      setCurrentLocation(getTipCurrentLocation());
      setLocationStatus(getCurrentLocationStatus());
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
    const start = Math.max(
      effectiveMinTip,
      initialAmountPounds ?? defaultTipPounds ?? 1.11
    );
    setAmount(start);
    setAmountText(start.toFixed(2));
    setError(null);
    setSubmitting(false);
    setTagInput('');
    const seeded = (initialTags || [])
      .map((tag) => normalizeTipChipForDisplay(tag))
      .filter(Boolean)
      .filter(
        (chip, index, arr) =>
          arr.findIndex((c) => c.toLowerCase() === chip.toLowerCase()) === index
      )
      .slice(0, 5);
    setTags(seeded);
  }, [
    visible,
    defaultTipPounds,
    initialAmountPounds,
    effectiveMinTip,
    initialTagsKey,
  ]);

  const applyAmount = (next: number) => {
    const safe = Math.max(effectiveMinTip, roundPounds(next));
    setAmount(safe);
    setAmountText(safe.toFixed(2));
  };

  const onChangeText = (text: string) => {
    setAmountText(text);
    const parsed = Number.parseFloat(text);
    if (!Number.isNaN(parsed) && parsed >= 0) {
      setAmount(roundPounds(parsed));
    }
  };

  const handleAddTag = () => {
    const input = tagInput.trim();
    if (!input) return;

    const newTags = input
      .split(',')
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0)
      .map((tag) => normalizeTipChipForDisplay(tag))
      .filter((tag) => {
        const tagLower = tag.toLowerCase();
        return !tags.some((existing) => existing.toLowerCase() === tagLower);
      });

    const remainingSlots = 5 - tags.length;
    if (remainingSlots > 0 && newTags.length > 0) {
      setTags([...tags, ...newTags.slice(0, remainingSlots)]);
      setTagInput('');
    } else if (remainingSlots === 0) {
      setTagInput('');
    }
  };

  const handleEnableCurrentLocation = async () => {
    setEnablingLocation(true);
    setError(null);
    try {
      const location = await refreshCurrentLocation({ force: true });
      if (!location) {
        const status = getCurrentLocationStatus();
        if (status === 'denied') {
          setError(
            'Location permission denied. You can enable it in Settings.'
          );
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
      onClose();
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const msg =
          (err.response?.data as { message?: string } | undefined)?.message ||
          err.message;
        setError(msg || 'Tip failed');
      } else if (err instanceof Error && err.message) {
        setError(err.message);
      } else {
        setError('Tip failed');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const enableLocationThenTip = async () => {
    setError(null);
    setEnablingLocation(true);
    try {
      await refreshCurrentLocation({ force: true });
    } finally {
      setEnablingLocation(false);
    }
    await executeTip();
  };

  const submit = async () => {
    setError(null);
    if (amount < effectiveMinTip) {
      setError(`Minimum tip is £${effectiveMinTip.toFixed(2)}`);
      return;
    }
    const neededPence = Math.round(amount * 100);
    if (neededPence > balancePence) {
      setError(
        `Insufficient balance (${formatPoundsFromPence(balancePence)} available)`
      );
      return;
    }

    const shouldPromptLocation =
      !currentLocation &&
      canOfferCurrentLocation &&
      !skipLocationPromptThisSession;

    if (shouldPromptLocation) {
      Alert.alert(
        'Influence local charts?',
        'Enable location so this tip also counts where you are now. You can still tip using home only.',
        [
          {
            text: 'Enable current location',
            style: 'default',
            onPress: () => {
              void enableLocationThenTip();
            },
          },
          {
            text: 'Tip without location',
            onPress: () => {
              skipLocationPromptThisSession = true;
              void executeTip();
            },
          },
          { text: 'Cancel', style: 'cancel' },
        ]
      );
      return;
    }

    await executeTip();
  };

  const handleClose = () => {
    if (submitting) return;
    setTags([]);
    setTagInput('');
    onClose();
  };

  const currentStatusLabel =
    currentLabel ||
    (locationStatus === 'denied'
      ? 'Permission denied'
      : locationStatus === 'unavailable'
        ? 'Unavailable'
        : locationStatus === 'loading' || enablingLocation
          ? 'Detecting…'
          : 'Not enabled');

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={handleClose}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={styles.backdrop} onPress={handleClose} />
        <View style={styles.sheet}>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.sheetContent}>
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
              Balance {formatPoundsFromPence(balancePence)}
            </Text>

            <View style={styles.amountRow}>
              <Pressable
                style={styles.stepBtn}
                onPress={() => applyAmount(amount - 0.01)}
                disabled={submitting || amount <= effectiveMinTip}>
                <Text style={styles.stepText}>−</Text>
              </Pressable>
              <View style={styles.amountField}>
                <Text style={styles.currency}>£</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="decimal-pad"
                  value={amountText}
                  onChangeText={onChangeText}
                  editable={!submitting}
                  selectTextOnFocus
                />
              </View>
              <Pressable
                style={styles.stepBtn}
                onPress={() => applyAmount(amount + 0.01)}
                disabled={submitting}>
                <Text style={styles.stepText}>+</Text>
              </Pressable>
            </View>

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

                {currentLocation && homeLabel && !samePlace ? (
                  <Text style={styles.influenceHint}>
                    This tip will influence charts in both places.
                  </Text>
                ) : null}

                {currentLocation && !homeLabel ? (
                  <Text style={styles.influenceHint}>
                    This tip will influence charts where you are now.
                  </Text>
                ) : null}

                {!currentLocation && canOfferCurrentLocation ? (
                  <View style={styles.enableRow}>
                    <Text style={styles.enableCopy}>
                      Without location, this tip only counts on your home
                      charts. Enable it to also influence charts where you are.
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
                            Enable location
                          </Text>
                        </>
                      )}
                    </Pressable>
                  </View>
                ) : null}

                {!currentLocation && locationStatus === 'denied' ? (
                  <Text style={styles.influenceWarn}>
                    Location blocked in Settings — tip will use home only.
                  </Text>
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
              <Text style={styles.tagsHint}>
                Genre, mood, setting — or instruments like guitar, 808s, vocals
              </Text>
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
                    (!tagInput.trim() || tags.length >= 5 || submitting) &&
                      styles.addTagBtnDisabled,
                  ]}
                  onPress={handleAddTag}
                  disabled={!tagInput.trim() || tags.length >= 5 || submitting}>
                  <Text style={styles.addTagBtnText}>Add</Text>
                </Pressable>
              </View>
              <Text style={styles.tagsMeta}>
                Max 5 · {tags.length}/5 used
              </Text>
              {tags.length > 0 ? (
                <View style={styles.tagChips}>
                  {tags.map((tag) => {
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
  sheetContent: {
    paddingHorizontal: 20,
    paddingTop: 18,
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
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  stepBtn: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepText: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '500',
    lineHeight: 32,
  },
  amountField: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.inputBg,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 52,
  },
  currency: {
    color: colors.textSecondary,
    fontSize: 20,
    fontWeight: '600',
    marginRight: 4,
  },
  input: {
    flex: 1,
    color: colors.text,
    fontSize: 22,
    fontWeight: '700',
    paddingVertical: 0,
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
    gap: 8,
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    justifyContent: 'center',
  },
  enableBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
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
  tagsHint: {
    marginTop: 6,
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 17,
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
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  tagChipTag: {
    backgroundColor: colors.accent,
  },
  tagChipElement: {
    backgroundColor: '#0d9488',
  },
  tagChipText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
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
