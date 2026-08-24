import { useCallback, useEffect, useState } from 'react';
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
import { formatLocationLabel } from '@/src/lib/location';
import {
  getCurrentLocationStatus,
  getTipCurrentLocation,
  maybeRefreshCurrentLocationIfGranted,
  refreshCurrentLocation,
} from '@/src/lib/currentLocation';
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
import { requestAndRegisterPush } from '@/src/lib/pushNotifications';
import type { ResolvedLocation } from '@/src/types/user';

WebBrowser.maybeCompleteAuthSession();

type OnboardingStep = 'location' | 'notifications' | 'import';
type ImportSource = 'soundcloud' | 'youtube';

const STEP_ORDER: OnboardingStep[] = ['location', 'notifications', 'import'];
const ONBOARDING_IMPORT_LIMIT = 25;

function parseStep(value: string | string[] | undefined): OnboardingStep {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === 'import' || raw === 'notifications') return raw;
  return 'location';
}

function parseSource(value: string | string[] | undefined): ImportSource | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === 'soundcloud' || raw === 'youtube') return raw;
  return null;
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

  const [homeLocation, setHomeLocation] = useState<ResolvedLocation | null>(null);
  const [detectingLocation, setDetectingLocation] = useState(false);
  const [requestingGps, setRequestingGps] = useState(false);
  const [locationFromGps, setLocationFromGps] = useState(false);

  const [soundcloudConnected, setSoundcloudConnected] = useState(false);
  const [youtubePlaylistUrl, setYoutubePlaylistUrl] = useState('');
  const [importLoading, setImportLoading] = useState(false);
  const [importProgress, setImportProgress] = useState<string | null>(null);
  const [importPreview, setImportPreview] = useState<{
    actionableCount: number;
    estimatedCost: number;
    userBalance: number;
  } | null>(null);

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
      try {
        await maybeRefreshCurrentLocationIfGranted();
        if (cancelled) return;
        const gpsLocation = getTipCurrentLocation();
        if (gpsLocation) {
          setHomeLocation((prev) => (hasHomeLocation(prev) ? prev : gpsLocation));
          setLocationFromGps(true);
          return;
        }
      } catch {
        // Fall through to optional IP hint
      }

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

  const requestDeviceLocation = async () => {
    setRequestingGps(true);
    setError(null);
    try {
      const location = await refreshCurrentLocation({ force: true });
      if (location) {
        setHomeLocation(location);
        setLocationFromGps(true);
        return;
      }
      const status = getCurrentLocationStatus();
      if (status === 'denied') {
        setError(
          'Location access was blocked. Search for your city, or enable it in Settings.'
        );
        return;
      }
      setError('Could not detect your location. Search for your city instead.');
    } finally {
      setRequestingGps(false);
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
      goToStep('notifications');
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to save home location.'));
    } finally {
      setSaving(false);
    }
  };

  const markNotificationsSeen = async () => {
    await authAPI.updateProfile({
      onboarding: { notificationsPromptSeenAt: new Date().toISOString() },
    });
    await refreshUser();
  };

  const allowNotificationsStep = async () => {
    setSaving(true);
    setError(null);
    try {
      const result = await requestAndRegisterPush();
      if (result === 'denied') {
        setError(
          'Notifications were blocked. You can enable them later in Settings.'
        );
      }
      await markNotificationsSeen();
      goToStep('import');
    } catch (err) {
      setError(getApiErrorMessage(err, 'Could not enable notifications.'));
    } finally {
      setSaving(false);
    }
  };

  const skipNotificationsStep = async () => {
    setSaving(true);
    setError(null);
    try {
      await markNotificationsSeen();
      goToStep('import');
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to continue.'));
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
      const soundcloud = await userAPI.getSoundCloudStatus();
      const connected = Boolean(soundcloud?.connected);
      setSoundcloudConnected(connected);
      return { soundcloud: connected };
    } catch {
      return { soundcloud: false };
    }
  }, []);

  useEffect(() => {
    if (step !== 'import') return;
    void checkConnections();
  }, [step, checkConnections]);

  const loadImportPreview = useCallback(
    async (source: ImportSource, playlistUrl?: string) => {
      setImportLoading(true);
      setImportProgress(
        source === 'youtube' ? 'Matching playlist…' : 'Scanning your likes…'
      );
      setImportPreview(null);
      try {
        const started =
          source === 'soundcloud'
            ? await userAPI.startSoundCloudImportPreview(
                ONBOARDING_IMPORT_LIMIT,
                'spotify_only'
              )
            : await userAPI.startYouTubeImportPreview(
                playlistUrl || youtubePlaylistUrl,
                ONBOARDING_IMPORT_LIMIT,
                'playlist'
              );
        const data = await userAPI.waitForImportJob<{
          items?: Array<{ matchStatus: string; selected?: boolean }>;
          summary?: { userBalance?: number };
        }>(started.jobId, (job) => {
          setImportProgress(
            job.message
              || (source === 'youtube'
                ? 'Matching playlist…'
                : 'Scanning your likes…')
          );
        });

        const tip = user?.preferences?.defaultTip ?? DEFAULT_TIP_POUNDS;
        const items = data.items || [];
        const actionable = items.filter(
          (i) =>
            i.matchStatus !== 'in_library' &&
            (source !== 'youtube' || i.selected !== false)
        );
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
    [user?.balance, user?.preferences?.defaultTip, youtubePlaylistUrl]
  );

  useEffect(() => {
    if (step !== 'import') return;
    const sourceParam = parseSource(params.source);
    if (!sourceParam || sourceParam === 'youtube') return;

    void (async () => {
      const connections = await checkConnections();
      if (connections.soundcloud) {
        await loadImportPreview(sourceParam);
      }
    })();
  }, [step, params.source, checkConnections, loadImportPreview]);

  const connectImportSource = async () => {
    if (!token) {
      setError('You need to be signed in to connect an account.');
      return;
    }
    setError(null);
    setImportLoading(true);
    try {
      const redirect = Linking.createURL('onboarding', {
        queryParams: { step: 'import', source: 'soundcloud' },
      });
      const startUrl = buildOAuthStartUrl('soundcloud', {
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
        goToStep('import', 'soundcloud');
        const connections = await checkConnections();
        if (connections.soundcloud) {
          await loadImportPreview('soundcloud');
        } else {
          setError('SoundCloud did not connect. Try again.');
        }
      }
    } catch (err) {
      setError(getApiErrorMessage(err, 'Connection failed.'));
    } finally {
      setImportLoading(false);
    }
  };

  const clearImportSource = () => {
    setImportPreview(null);
    setError(null);
    goToStep('import');
  };

  const handleImportSourcePress = (source: ImportSource) => {
    if (source === 'youtube') {
      goToStep('import', 'youtube');
      return;
    }
    if (soundcloudConnected) {
      if (importSource === source) {
        void loadImportPreview(source);
        return;
      }
      goToStep('import', source);
      return;
    }
    void connectImportSource();
  };

  const runQuickImport = async () => {
    if (!importSource) return;
    setImportLoading(true);
    setImportProgress('Preparing import…');
    setError(null);
    try {
      const tip = user?.preferences?.defaultTip ?? DEFAULT_TIP_POUNDS;
      const previewStarted =
        importSource === 'soundcloud'
          ? await userAPI.startSoundCloudImportPreview(
              ONBOARDING_IMPORT_LIMIT,
              'spotify_only'
            )
          : await userAPI.startYouTubeImportPreview(
              youtubePlaylistUrl,
              ONBOARDING_IMPORT_LIMIT,
              'playlist'
            );
      const data = await userAPI.waitForImportJob<{
        items?: Array<{
          key: string;
          title?: string;
          mediaId?: string;
          matchStatus?: string;
          useSuggestedMatch?: boolean;
          crossRefStatus?: string;
          selected?: boolean;
          externalMedia?: Record<string, unknown>;
        }>;
      }>(previewStarted.jobId, (job) => {
        setImportProgress(job.message || 'Scanning…');
      });

      const items = (data.items || [])
        .filter((i) => i.matchStatus !== 'in_library')
        .filter((i) => importSource !== 'youtube' || i.selected !== false)
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
          : await userAPI.startYouTubeImportExecute(items, tip);
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

  const busy = saving || importLoading || requestingGps;

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
            {step === 'location' && (
              <View style={styles.stepBody}>
                <View style={styles.stepHeader}>
                  <View style={styles.iconBubble}>
                    <Ionicons name="location-outline" size={20} color={colors.accentLight} />
                  </View>
                  <View style={styles.stepHeaderCopy}>
                    <Text style={styles.stepTitle}>Enable location for local charts</Text>
                    <Text style={styles.stepText}>
                      Tips influence charts where you are — at home, and wherever
                      you tip. Location is only used while Tuneable is open,
                      never in the background. Search if GPS isn&apos;t home.
                    </Text>
                  </View>
                </View>

                <Pressable
                  style={[
                    homeLocation?.placeId ? styles.gpsBtnOutline : styles.primaryBtn,
                    busy && styles.btnDisabled,
                  ]}
                  disabled={busy}
                  onPress={() => void requestDeviceLocation()}>
                  {requestingGps ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <View style={styles.gpsBtnInner}>
                      <Ionicons
                        name="navigate-outline"
                        size={18}
                        color={homeLocation?.placeId ? colors.accentLight : '#fff'}
                      />
                      <Text
                        style={
                          homeLocation?.placeId
                            ? styles.gpsBtnOutlineText
                            : styles.primaryBtnText
                        }>
                        {locationFromGps ? 'Detect again' : 'Enable location'}
                      </Text>
                    </View>
                  )}
                </Pressable>

                {locationFromGps && homeLocation ? (
                  <Text style={styles.successHint}>
                    Detected {formatLocationLabel(homeLocation)}. Confirm below,
                    or search if that&apos;s not home.
                  </Text>
                ) : null}

                <View style={styles.orRow}>
                  <View style={styles.orLine} />
                  <Text style={styles.orText}>or search</Text>
                  <View style={styles.orLine} />
                </View>

                <LocationAutocomplete
                  value={homeLocation}
                  onChange={(location) => {
                    setLocationFromGps(false);
                    setHomeLocation(location);
                  }}
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
                    goToStep('notifications');
                  }}>
                  <Text style={styles.secondaryBtnText}>Skip for now</Text>
                </Pressable>
              </View>
            )}

            {step === 'notifications' && (
              <View style={styles.stepBody}>
                <View style={styles.stepHeader}>
                  <View style={styles.iconBubble}>
                    <Ionicons name="notifications-outline" size={20} color={colors.accentLight} />
                  </View>
                  <View style={styles.stepHeaderCopy}>
                    <Text style={styles.stepTitle}>Stay in the loop</Text>
                    <Text style={styles.stepText}>
                      Get a ping when someone tips your tracks, or when you&apos;re
                      out-tipped on a chart. You can skip and enable this later.
                    </Text>
                  </View>
                </View>

                {error ? <Text style={styles.error}>{error}</Text> : null}

                <Pressable
                  style={[styles.primaryBtn, busy && styles.btnDisabled]}
                  disabled={busy}
                  onPress={() => void allowNotificationsStep()}>
                  {saving ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.primaryBtnText}>Allow notifications</Text>
                  )}
                </Pressable>
                <Pressable
                  style={[styles.secondaryBtn, busy && styles.btnDisabled]}
                  disabled={busy}
                  onPress={() => void skipNotificationsStep()}>
                  <Text style={styles.secondaryBtnText}>Skip for now</Text>
                </Pressable>
                <Pressable
                  style={styles.backBtn}
                  disabled={busy}
                  onPress={() => goToStep('location')}>
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
                    <Text style={styles.stepTitle}>Import your existing library</Text>
                    <Text style={styles.stepText}>
                      Bring in likes from SoundCloud or a public YouTube
                      playlist. Each track gets a tip at your default (£
                      {(user?.preferences?.defaultTip ?? DEFAULT_TIP_POUNDS).toFixed(2)}
                      ).
                    </Text>
                  </View>
                </View>

                {!importLoading && !importPreview && !importSource ? (
                  <View style={styles.importGrid}>
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
                    <Pressable
                      style={[styles.importCard, styles.youtubeCard]}
                      disabled={busy}
                      onPress={() => handleImportSourcePress('youtube')}>
                      <Text style={styles.importTitleYt}>YouTube</Text>
                      <Text style={styles.importSub}>
                        Paste a public playlist URL — no YouTube login
                      </Text>
                    </Pressable>
                  </View>
                ) : (
                  <View style={styles.previewBox}>
                    {importSource === 'youtube' && !importPreview && !importLoading ? (
                      <>
                        <Text style={styles.previewText}>
                          Paste a public YouTube playlist URL
                        </Text>
                        <TextInput
                          value={youtubePlaylistUrl}
                          onChangeText={setYoutubePlaylistUrl}
                          placeholder="https://www.youtube.com/playlist?list=…"
                          placeholderTextColor={colors.textMuted}
                          autoCapitalize="none"
                          autoCorrect={false}
                          style={styles.input}
                        />
                        <Pressable
                          style={[
                            styles.primaryBtn,
                            (busy || !youtubePlaylistUrl.trim()) && styles.btnDisabled,
                          ]}
                          disabled={busy || !youtubePlaylistUrl.trim()}
                          onPress={() =>
                            void loadImportPreview('youtube', youtubePlaylistUrl)
                          }>
                          <Text style={styles.primaryBtnText}>Scan playlist</Text>
                        </Pressable>
                      </>
                    ) : importLoading && !importPreview ? (
                      <View style={styles.previewLoading}>
                        <ActivityIndicator color={colors.accentLight} />
                        <Text style={styles.hint}>
                          {importProgress ||
                            (importSource === 'youtube'
                              ? 'Matching playlist…'
                              : `Scanning your SoundCloud likes…`)}
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
                          {importSource === 'youtube'
                            ? 'Matching playlist…'
                            : `Scanning your SoundCloud likes…`}
                        </Text>
                      </View>
                    )}
                    <Pressable
                      style={styles.backBtn}
                      disabled={busy}
                      onPress={clearImportSource}>
                      <Text style={styles.backBtnText}>Choose a different source</Text>
                    </Pressable>
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
                  onPress={() => goToStep('notifications')}>
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
  successHint: {
    color: '#86efac',
    fontSize: 13,
    lineHeight: 18,
  },
  gpsBtnInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  gpsBtnOutline: {
    marginTop: 4,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(168, 85, 247, 0.5)',
  },
  gpsBtnOutlineText: {
    color: colors.accentLight,
    fontSize: 15,
    fontWeight: '700',
  },
  orRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 4,
  },
  orLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.cardBorder,
  },
  orText: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
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
  soundcloudCard: {
    borderColor: 'rgba(249, 115, 22, 0.4)',
    backgroundColor: 'rgba(249, 115, 22, 0.1)',
  },
  importTitleSc: {
    color: '#fdba74',
    fontSize: 16,
    fontWeight: '700',
  },
  importTitleYt: {
    color: '#fca5a5',
    fontSize: 16,
    fontWeight: '700',
  },
  importSub: {
    marginTop: 4,
    color: colors.textMuted,
    fontSize: 13,
  },
  youtubeCard: {
    borderColor: 'rgba(239, 68, 68, 0.4)',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
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
