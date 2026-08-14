import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '@/src/components/Screen';
import { LocationAutocomplete } from '@/src/components/LocationAutocomplete';
import { authAPI } from '@/src/api/auth';
import { userAPI } from '@/src/api/user';
import { useAuth } from '@/src/auth/AuthContext';
import { getApiErrorMessage } from '@/src/lib/apiError';
import { formatPoundsFromPence } from '@/src/lib/format';
import {
  DEFAULT_TIP_POUNDS,
  hasHomeLocation,
  needsOnboarding,
} from '@/src/lib/onboarding';
import {
  buildOAuthStartUrl,
  extractOAuthError,
} from '@/src/lib/oauth';
import { showToast } from '@/src/stores/toastStore';
import { colors } from '@/src/theme/colors';
import type { ResolvedLocation } from '@/src/types/user';

WebBrowser.maybeCompleteAuthSession();

type OnboardingStep = 'tip' | 'location' | 'import';
type ImportSource = 'spotify' | 'soundcloud';

const STEP_ORDER: OnboardingStep[] = ['tip', 'location', 'import'];
const QUICK_TIP_OPTIONS = [0.11, 0.5, 1.11, 5, 11.11];
const ONBOARDING_IMPORT_LIMIT = 25;

function parseStep(value: string | string[] | undefined): OnboardingStep {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === 'location' || raw === 'import') return raw;
  return 'tip';
}

function parseSource(value: string | string[] | undefined): ImportSource {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === 'soundcloud' ? 'soundcloud' : 'spotify';
}

export default function OnboardingScreen() {
  const params = useLocalSearchParams<{ step?: string; source?: string }>();
  const {
    user,
    token,
    refreshUser,
    updateBalance,
    isAuthenticated,
    isLoading: authLoading,
  } = useAuth();

  const step = parseStep(params.step);
  const importSource = parseSource(params.source);
  const stepIndex = STEP_ORDER.indexOf(step);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [defaultTip, setDefaultTip] = useState(DEFAULT_TIP_POUNDS.toFixed(2));
  const [homeLocation, setHomeLocation] = useState<ResolvedLocation | null>(null);
  const [detectingLocation, setDetectingLocation] = useState(false);

  const [spotifyConnected, setSpotifyConnected] = useState(false);
  const [soundcloudConnected, setSoundcloudConnected] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [importProgress, setImportProgress] = useState<string | null>(null);
  const [importPreview, setImportPreview] = useState<{
    actionableCount: number;
    estimatedCost: number;
    userBalance: number;
  } | null>(null);

  useEffect(() => {
    if (!user) return;
    if (!user.onboarding?.defaultTipPromptSeenAt) {
      setDefaultTip(DEFAULT_TIP_POUNDS.toFixed(2));
    } else {
      const tip = user.preferences?.defaultTip ?? DEFAULT_TIP_POUNDS;
      setDefaultTip(tip.toFixed(2));
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    if (hasHomeLocation(user.homeLocation)) {
      setHomeLocation(user.homeLocation ?? null);
    }
  }, [user]);

  useEffect(() => {
    if (step !== 'location') return;
    if (hasHomeLocation(homeLocation)) return;

    let cancelled = false;
    const detect = async () => {
      setDetectingLocation(true);
      try {
        const response = await userAPI.detectLocation();
        if (cancelled) return;
        if (response.success && response.location) {
          setHomeLocation((prev) => {
            if (prev?.placeId || prev?.city) return prev;
            return {
              ...(prev || {}),
              country: response.location?.country,
              city: prev?.city || response.location?.city,
              region: prev?.region || response.location?.region,
              detectedFromIP: true,
            };
          });
        }
      } catch {
        // optional hint
      } finally {
        if (!cancelled) setDetectingLocation(false);
      }
    };
    void detect();
    return () => {
      cancelled = true;
    };
  }, [step, homeLocation?.city, homeLocation?.country, homeLocation?.placeId]);

  const goToStep = (next: OnboardingStep, source?: ImportSource) => {
    router.replace({
      pathname: '/onboarding',
      params:
        next === 'import' && source
          ? { step: next, source }
          : { step: next },
    });
  };

  const markTipSeen = async (tipAmount?: number) => {
    await authAPI.updateProfile({
      onboarding: { defaultTipPromptSeenAt: new Date().toISOString() },
      ...(tipAmount !== undefined
        ? { preferences: { defaultTip: tipAmount } }
        : {}),
    });
    await refreshUser();
  };

  const saveTipStep = async () => {
    const parsed = parseFloat(defaultTip);
    if (Number.isNaN(parsed) || parsed < 0.01) {
      setError('Default tip must be at least £0.01');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await markTipSeen(parsed);
      goToStep('location');
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to save default tip.'));
    } finally {
      setSaving(false);
    }
  };

  const skipTipStep = async () => {
    setSaving(true);
    setError(null);
    try {
      await markTipSeen();
      goToStep('location');
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to continue.'));
    } finally {
      setSaving(false);
    }
  };

  const saveLocationStep = async () => {
    if (!hasHomeLocation(homeLocation)) {
      setError('Pick a home location, or skip for now.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await authAPI.updateProfile({ homeLocation });
      await refreshUser();
      goToStep('import');
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to save home location.'));
    } finally {
      setSaving(false);
    }
  };

  const finishOnboarding = async (options?: { importSkipped?: boolean }) => {
    setSaving(true);
    setError(null);
    try {
      await authAPI.updateProfile({
        onboarding: {
          completedAt: new Date().toISOString(),
          importPromptSeenAt: new Date().toISOString(),
          importSkipped: options?.importSkipped ?? false,
        },
      });
      await refreshUser();
      router.replace('/(tabs)');
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to complete setup.'));
    } finally {
      setSaving(false);
    }
  };

  const checkConnections = useCallback(async () => {
    try {
      const [spotify, soundcloud] = await Promise.all([
        userAPI.getSpotifyStatus(),
        userAPI.getSoundCloudStatus(),
      ]);
      setSpotifyConnected(Boolean(spotify?.connected));
      setSoundcloudConnected(Boolean(soundcloud?.connected));
      return {
        spotify: Boolean(spotify?.connected),
        soundcloud: Boolean(soundcloud?.connected),
      };
    } catch {
      return { spotify: false, soundcloud: false };
    }
  }, []);

  useEffect(() => {
    if (step !== 'import') return;
    void checkConnections();
  }, [step, checkConnections]);

  const loadImportPreview = useCallback(
    async (source: ImportSource) => {
      setImportLoading(true);
      setImportProgress('Scanning your likes…');
      setImportPreview(null);
      try {
        const started =
          source === 'soundcloud'
            ? await userAPI.startSoundCloudImportPreview(
                ONBOARDING_IMPORT_LIMIT,
                'spotify_only'
              )
            : await userAPI.startSpotifyImportPreview(ONBOARDING_IMPORT_LIMIT);
        const data = await userAPI.waitForImportJob<{
          items?: Array<{ matchStatus: string }>;
          summary?: { userBalance?: number };
        }>(started.jobId, (job) => {
          setImportProgress(job.message || 'Scanning your likes…');
        });

        const tip =
          user?.preferences?.defaultTip ??
          parseFloat(defaultTip) ??
          DEFAULT_TIP_POUNDS;
        const items = data.items || [];
        const actionable = items.filter((i) => i.matchStatus !== 'in_library');
        const balance =
          data.summary?.userBalance ??
          (user?.balance != null ? user.balance / 100 : 0);

        setImportPreview({
          actionableCount: actionable.length,
          estimatedCost: actionable.length * tip,
          userBalance: balance,
        });
      } catch (err) {
        setError(getApiErrorMessage(err, 'Could not preview your library.'));
        setImportPreview(null);
      } finally {
        setImportLoading(false);
        setImportProgress(null);
      }
    },
    [defaultTip, user?.balance, user?.preferences?.defaultTip]
  );

  useEffect(() => {
    if (step !== 'import') return;
    const sourceParam = Array.isArray(params.source)
      ? params.source[0]
      : params.source;
    if (!sourceParam) return;

    void (async () => {
      const connections = await checkConnections();
      const connected =
        sourceParam === 'soundcloud'
          ? connections.soundcloud
          : connections.spotify;
      if (connected) {
        await loadImportPreview(sourceParam as ImportSource);
      }
    })();
  }, [step, params.source, checkConnections, loadImportPreview]);

  const connectImportSource = async (source: ImportSource) => {
    if (!token) {
      setError('You need to be signed in to connect an account.');
      return;
    }
    setError(null);
    setImportLoading(true);
    try {
      const redirect = Linking.createURL('onboarding', {
        queryParams: { step: 'import', source },
      });
      const startUrl = buildOAuthStartUrl(source, {
        linkAccount: true,
        token,
        customRedirect: redirect,
      });
      const result = await WebBrowser.openAuthSessionAsync(startUrl, redirect);
      if (result.type === 'success' && result.url) {
        const oauthError = extractOAuthError(result.url);
        if (oauthError) {
          setError(oauthError.replace(/_/g, ' '));
          return;
        }
        goToStep('import', source);
        const connections = await checkConnections();
        const connected =
          source === 'soundcloud' ? connections.soundcloud : connections.spotify;
        if (connected) {
          await loadImportPreview(source);
        } else {
          setError(
            `${source === 'soundcloud' ? 'SoundCloud' : 'Spotify'} did not connect. Try again.`
          );
        }
      }
    } catch (err) {
      setError(getApiErrorMessage(err, 'Connection failed.'));
    } finally {
      setImportLoading(false);
    }
  };

  const handleImportSourcePress = (source: ImportSource) => {
    const connected =
      source === 'soundcloud' ? soundcloudConnected : spotifyConnected;
    if (connected) {
      if (importSource === source) {
        void loadImportPreview(source);
        return;
      }
      goToStep('import', source);
      return;
    }
    void connectImportSource(source);
  };

  const runQuickImport = async () => {
    setImportLoading(true);
    setImportProgress('Preparing import…');
    setError(null);
    try {
      const tip =
        user?.preferences?.defaultTip ??
        parseFloat(defaultTip) ??
        DEFAULT_TIP_POUNDS;
      const previewStarted =
        importSource === 'soundcloud'
          ? await userAPI.startSoundCloudImportPreview(
              ONBOARDING_IMPORT_LIMIT,
              'spotify_only'
            )
          : await userAPI.startSpotifyImportPreview(ONBOARDING_IMPORT_LIMIT);
      const data = await userAPI.waitForImportJob<{
        items?: Array<{
          key: string;
          title?: string;
          mediaId?: string;
          matchStatus?: string;
          useSuggestedMatch?: boolean;
          crossRefStatus?: string;
          externalMedia?: Record<string, unknown>;
        }>;
      }>(previewStarted.jobId, (job) => {
        setImportProgress(job.message || 'Scanning your likes…');
      });

      const items = (data.items || [])
        .filter((i) => i.matchStatus !== 'in_library')
        .slice(0, ONBOARDING_IMPORT_LIMIT)
        .map((i) => ({
          key: i.key,
          title: i.title,
          selected: true,
          mediaId: i.mediaId,
          matchStatus: i.matchStatus,
          useSuggestedMatch: i.useSuggestedMatch,
          crossRefStatus: i.crossRefStatus,
          amount: tip,
          externalMedia: i.externalMedia,
          skipIfInLibrary: true,
        }));

      if (items.length === 0) {
        showToast("No new tracks to import — you're all set!");
        await finishOnboarding({ importSkipped: false });
        return;
      }

      setImportProgress(
        `Importing ${items.length} track${items.length === 1 ? '' : 's'}…`
      );
      const executeStarted =
        importSource === 'soundcloud'
          ? await userAPI.startSoundCloudImportExecute(items, tip)
          : await userAPI.startSpotifyImportExecute(items, tip);
      const result = await userAPI.waitForImportJob<{
        tipped: number;
        updatedBalance: number;
      }>(executeStarted.jobId, (job) => {
        setImportProgress(job.message || 'Importing…');
      });

      if (result.updatedBalance != null) {
        updateBalance(Math.round(result.updatedBalance * 100));
      }
      showToast(
        `Imported ${result.tipped} track${result.tipped === 1 ? '' : 's'} with tips`
      );
      await finishOnboarding({ importSkipped: false });
    } catch (err) {
      setError(getApiErrorMessage(err, 'Import failed.'));
    } finally {
      setImportLoading(false);
      setImportProgress(null);
    }
  };

  const parsedDefaultTip = useMemo(() => {
    const parsed = parseFloat(defaultTip);
    return Number.isFinite(parsed) && parsed >= 0.01
      ? parsed
      : DEFAULT_TIP_POUNDS;
  }, [defaultTip]);

  const userBalancePounds = user?.balance != null ? user.balance / 100 : 0;
  const tunesCovered =
    userBalancePounds > 0 && parsedDefaultTip >= 0.01
      ? Math.floor((userBalancePounds + 0.0001) / parsedDefaultTip)
      : null;
  const tunesCoveredLabel =
    tunesCovered == null ? null : tunesCovered >= 100 ? '100+' : String(tunesCovered);

  const busy = saving || importLoading;

  if (authLoading) {
    return (
      <Screen style={styles.center}>
        <ActivityIndicator color={colors.accentLight} size="large" />
      </Screen>
    );
  }

  if (!isAuthenticated) {
    return <Redirect href="/login" />;
  }

  if (user && !needsOnboarding(user)) {
    return <Redirect href="/(tabs)" />;
  }

  return (
    <Screen>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled">
          <Text style={styles.stepLabel}>
            Step {stepIndex + 1} of {STEP_ORDER.length}
          </Text>
          <Text style={styles.heading}>Welcome to Tuneable</Text>
          <Text style={styles.lede}>
            A few quick steps to get set up. Everything can be changed later.
          </Text>

          <View style={styles.progressRow}>
            {STEP_ORDER.map((s, i) => (
              <View
                key={s}
                style={[
                  styles.progressDot,
                  i <= stepIndex && styles.progressDotActive,
                ]}
              />
            ))}
          </View>

          <View style={styles.card}>
            {step === 'tip' && (
              <View style={styles.stepBody}>
                <View style={styles.stepHeader}>
                  <View style={styles.iconBubble}>
                    <Ionicons name="cash-outline" size={20} color={colors.accentLight} />
                  </View>
                  <View style={styles.stepHeaderCopy}>
                    <Text style={styles.stepTitle}>
                      Tip to add music to your library
                    </Text>
                    <Text style={styles.stepText}>
                      Your default is £{DEFAULT_TIP_POUNDS.toFixed(2)}. Change it
                      below, continue, or skip and keep this amount.
                    </Text>
                  </View>
                </View>

                {userBalancePounds > 0 ? (
                  <View style={styles.creditBanner}>
                    <Text style={styles.creditText}>
                      You have {formatPoundsFromPence(user?.balance)} welcome
                      credit to start tipping.
                    </Text>
                  </View>
                ) : null}

                <Text style={styles.label}>Your default tip (£)</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="decimal-pad"
                  value={defaultTip}
                  onChangeText={setDefaultTip}
                  editable={!busy}
                />
                <View style={styles.chipRow}>
                  {QUICK_TIP_OPTIONS.map((amount) => {
                    const selected =
                      Math.abs(parseFloat(defaultTip) - amount) < 0.001;
                    return (
                      <Pressable
                        key={amount}
                        style={[styles.chip, selected && styles.chipSelected]}
                        onPress={() => setDefaultTip(amount.toFixed(2))}
                        disabled={busy}>
                        <Text
                          style={[
                            styles.chipText,
                            selected && styles.chipTextSelected,
                          ]}>
                          £{amount.toFixed(2)}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                {tunesCoveredLabel != null ? (
                  <Text style={styles.hint}>
                    At £{parsedDefaultTip.toFixed(2)}, your balance covers about{' '}
                    {tunesCoveredLabel}{' '}
                    {tunesCovered === 1 ? 'tune' : 'tunes'}.
                  </Text>
                ) : null}

                {error ? <Text style={styles.error}>{error}</Text> : null}

                <Pressable
                  style={[styles.primaryBtn, busy && styles.btnDisabled]}
                  disabled={busy}
                  onPress={() => void saveTipStep()}>
                  {saving ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.primaryBtnText}>
                      {Math.abs(parsedDefaultTip - DEFAULT_TIP_POUNDS) < 0.001
                        ? `Continue with £${DEFAULT_TIP_POUNDS.toFixed(2)}`
                        : `Save £${parsedDefaultTip.toFixed(2)} and continue`}
                    </Text>
                  )}
                </Pressable>
                <Pressable
                  style={[styles.secondaryBtn, busy && styles.btnDisabled]}
                  disabled={busy}
                  onPress={() => void skipTipStep()}>
                  <Text style={styles.secondaryBtnText}>Skip for now</Text>
                </Pressable>
              </View>
            )}

            {step === 'location' && (
              <View style={styles.stepBody}>
                <View style={styles.stepHeader}>
                  <View style={styles.iconBubble}>
                    <Ionicons name="location-outline" size={20} color={colors.accentLight} />
                  </View>
                  <View style={styles.stepHeaderCopy}>
                    <Text style={styles.stepTitle}>Where are you based?</Text>
                    <Text style={styles.stepText}>
                      Connect to local parties and charts. Skip and we&apos;ll
                      remind you on Home until you set it.
                    </Text>
                  </View>
                </View>

                <LocationAutocomplete
                  value={homeLocation}
                  onChange={setHomeLocation}
                  disabled={busy}
                />
                {detectingLocation ? (
                  <Text style={styles.hint}>Detecting a country hint…</Text>
                ) : null}
                {!detectingLocation &&
                homeLocation?.detectedFromIP &&
                !homeLocation?.placeId ? (
                  <Text style={styles.hint}>
                    Country hint auto-detected. Search above to pick your exact
                    place.
                  </Text>
                ) : null}

                {error ? <Text style={styles.error}>{error}</Text> : null}

                <Pressable
                  style={[styles.primaryBtn, busy && styles.btnDisabled]}
                  disabled={busy}
                  onPress={() => void saveLocationStep()}>
                  {saving ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.primaryBtnText}>Save and continue</Text>
                  )}
                </Pressable>
                <Pressable
                  style={[styles.secondaryBtn, busy && styles.btnDisabled]}
                  disabled={busy}
                  onPress={() => {
                    setError(null);
                    goToStep('import');
                  }}>
                  <Text style={styles.secondaryBtnText}>Skip for now</Text>
                </Pressable>
                <Pressable
                  style={styles.backBtn}
                  disabled={busy}
                  onPress={() => goToStep('tip')}>
                  <Text style={styles.backBtnText}>Back</Text>
                </Pressable>
              </View>
            )}

            {step === 'import' && (
              <View style={styles.stepBody}>
                <View style={styles.stepHeader}>
                  <View style={styles.iconBubble}>
                    <Ionicons name="musical-notes-outline" size={20} color={colors.accentLight} />
                  </View>
                  <View style={styles.stepHeaderCopy}>
                    <Text style={styles.stepTitle}>Jump-start your library</Text>
                    <Text style={styles.stepText}>
                      Import likes from Spotify or SoundCloud. Each track gets a
                      tip at your default (£
                      {(
                        user?.preferences?.defaultTip ??
                        parsedDefaultTip
                      ).toFixed(2)}
                      ).
                    </Text>
                  </View>
                </View>

                {!importLoading && !importPreview && !params.source ? (
                  <View style={styles.importGrid}>
                    <Pressable
                      style={[styles.importCard, styles.spotifyCard]}
                      disabled={busy}
                      onPress={() => handleImportSourcePress('spotify')}>
                      <Text style={styles.importTitle}>
                        {spotifyConnected ? 'Import from Spotify' : 'Connect Spotify'}
                      </Text>
                      <Text style={styles.importSub}>
                        {spotifyConnected
                          ? 'Connected — tap to scan your likes'
                          : 'Import your saved tracks'}
                      </Text>
                    </Pressable>
                    <Pressable
                      style={[styles.importCard, styles.soundcloudCard]}
                      disabled={busy}
                      onPress={() => handleImportSourcePress('soundcloud')}>
                      <Text style={styles.importTitleSc}>
                        {soundcloudConnected
                          ? 'Import from SoundCloud'
                          : 'Connect SoundCloud'}
                      </Text>
                      <Text style={styles.importSub}>
                        {soundcloudConnected
                          ? 'Connected — tap to scan your likes'
                          : 'Import your liked tracks'}
                      </Text>
                    </Pressable>
                  </View>
                ) : (
                  <View style={styles.previewBox}>
                    {importLoading && !importPreview ? (
                      <View style={styles.previewLoading}>
                        <ActivityIndicator color={colors.accentLight} />
                        <Text style={styles.hint}>
                          {importProgress ||
                            `Scanning your ${
                              importSource === 'soundcloud'
                                ? 'SoundCloud'
                                : 'Spotify'
                            } likes…`}
                        </Text>
                      </View>
                    ) : importPreview ? (
                      <>
                        <Text style={styles.previewText}>
                          Found {importPreview.actionableCount} tracks on
                          Tuneable
                          {importPreview.actionableCount > 0
                            ? ` · estimated £${importPreview.estimatedCost.toFixed(2)}`
                            : ''}
                        </Text>
                        {importLoading && importProgress ? (
                          <Text style={styles.hint}>{importProgress}</Text>
                        ) : null}
                        <Pressable
                          style={[styles.primaryBtn, busy && styles.btnDisabled]}
                          disabled={busy}
                          onPress={() => void runQuickImport()}>
                          {importLoading ? (
                            <ActivityIndicator color="#fff" />
                          ) : (
                            <Text style={styles.primaryBtnText}>
                              Import up to {ONBOARDING_IMPORT_LIMIT} tracks
                            </Text>
                          )}
                        </Pressable>
                      </>
                    ) : (
                      <View style={styles.previewLoading}>
                        <ActivityIndicator color={colors.accentLight} />
                        <Text style={styles.hint}>
                          Scanning your{' '}
                          {importSource === 'soundcloud'
                            ? 'SoundCloud'
                            : 'Spotify'}{' '}
                          likes…
                        </Text>
                      </View>
                    )}
                  </View>
                )}

                {error ? <Text style={styles.error}>{error}</Text> : null}

                <Pressable
                  style={[styles.secondaryBtn, busy && styles.btnDisabled]}
                  disabled={busy}
                  onPress={() => void finishOnboarding({ importSkipped: true })}>
                  {saving ? (
                    <ActivityIndicator color={colors.text} />
                  ) : (
                    <Text style={styles.secondaryBtnText}>Skip for now</Text>
                  )}
                </Pressable>
                <Pressable
                  style={styles.backBtn}
                  disabled={busy}
                  onPress={() => goToStep('location')}>
                  <Text style={styles.backBtnText}>Back</Text>
                </Pressable>
              </View>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 48,
  },
  stepLabel: {
    color: colors.accentLight,
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  heading: {
    marginTop: 8,
    color: colors.text,
    fontSize: 28,
    fontWeight: '800',
    textAlign: 'center',
  },
  lede: {
    marginTop: 8,
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  progressRow: {
    marginTop: 20,
    marginBottom: 20,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  progressDot: {
    width: 40,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  progressDotActive: {
    backgroundColor: colors.accent,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.card,
    padding: 16,
  },
  stepBody: {
    gap: 12,
  },
  stepHeader: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 4,
  },
  iconBubble: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(147, 51, 234, 0.25)',
  },
  stepHeaderCopy: {
    flex: 1,
    gap: 4,
  },
  stepTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  stepText: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
  },
  creditBanner: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(34, 197, 94, 0.35)',
    backgroundColor: 'rgba(34, 197, 94, 0.12)',
    padding: 12,
  },
  creditText: {
    color: '#bbf7d0',
    fontSize: 13,
  },
  label: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  input: {
    backgroundColor: colors.inputBg,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.text,
    fontSize: 18,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  chipSelected: {
    backgroundColor: colors.accent,
  },
  chipText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  chipTextSelected: {
    color: '#fff',
  },
  hint: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  error: {
    color: '#fca5a5',
    fontSize: 14,
  },
  primaryBtn: {
    marginTop: 4,
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  secondaryBtn: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    paddingVertical: 14,
    alignItems: 'center',
  },
  secondaryBtnText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  backBtn: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  backBtnText: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: '600',
  },
  btnDisabled: {
    opacity: 0.55,
  },
  importGrid: {
    gap: 10,
  },
  importCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
  },
  spotifyCard: {
    borderColor: 'rgba(34, 197, 94, 0.4)',
    backgroundColor: 'rgba(34, 197, 94, 0.1)',
  },
  soundcloudCard: {
    borderColor: 'rgba(249, 115, 22, 0.4)',
    backgroundColor: 'rgba(249, 115, 22, 0.1)',
  },
  importTitle: {
    color: '#86efac',
    fontSize: 16,
    fontWeight: '700',
  },
  importTitleSc: {
    color: '#fdba74',
    fontSize: 16,
    fontWeight: '700',
  },
  importSub: {
    marginTop: 4,
    color: colors.textMuted,
    fontSize: 13,
  },
  previewBox: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: 'rgba(0,0,0,0.25)',
    padding: 14,
    gap: 12,
  },
  previewLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  previewText: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 22,
  },
});
