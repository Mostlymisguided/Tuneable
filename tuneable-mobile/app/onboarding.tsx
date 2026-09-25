import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
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
import { hasHomeLocation, needsOnboarding } from '@/src/lib/onboarding';
import { colors } from '@/src/theme/colors';
import type { ResolvedLocation } from '@/src/types/user';

type OnboardingStep = 'intro' | 'location';

const STEP_ORDER: OnboardingStep[] = ['intro', 'location'];

function parseStep(value: string | string[] | undefined): OnboardingStep {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === 'location' || raw === 'import' || raw === 'notifications') {
    return 'location';
  }
  return 'intro';
}

export default function OnboardingScreen() {
  const params = useLocalSearchParams<{ step?: string }>();
  const {
    user,
    refreshUser,
    isAuthenticated,
    isLoading: authLoading,
  } = useAuth();

  const step = parseStep(params.step);
  const stepIndex = STEP_ORDER.indexOf(step);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [homeLocation, setHomeLocation] = useState<ResolvedLocation | null>(null);
  const [detectingLocation, setDetectingLocation] = useState(false);
  const [requestingGps, setRequestingGps] = useState(false);
  const [locationFromGps, setLocationFromGps] = useState(false);

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

  const goToStep = (next: OnboardingStep) => {
    router.replace({
      pathname: '/onboarding',
      params: { step: next },
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
      await finishOnboarding();
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to save home location.'));
    } finally {
      setSaving(false);
    }
  };

  const finishOnboarding = async () => {
    setSaving(true);
    setError(null);
    try {
      await authAPI.updateProfile({
        onboarding: {
          completedAt: new Date().toISOString(),
          importPromptSeenAt: new Date().toISOString(),
          importSkipped: true,
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

  const busy = saving || requestingGps;

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
            {step === 'intro' && (
              <View style={styles.stepBody}>
                <View style={styles.stepHeader}>
                  <View style={styles.iconBubble}>
                    <Ionicons name="library-outline" size={20} color={colors.accentLight} />
                  </View>
                  <View style={styles.stepHeaderCopy}>
                    <Text style={styles.stepTitle}>Your showcase, not a subscription</Text>
                    <Text style={styles.introLead}>
                      Tuneable is where you show your taste in music, podcasts, and books.
                    </Text>
                    <Text style={styles.stepText}>
                      Tip what you love. Each tip supports the creator, moves global and local
                      charts, and puts that work in your public showcase. Tip a work more than anyone
                      else where you live — or worldwide — and you become its champion. Your name
                      stands beside the media you love most.
                    </Text>
                  </View>
                </View>
                <Pressable
                  style={styles.primaryBtn}
                  onPress={() => goToStep('location')}>
                  <Text style={styles.primaryBtnText}>Continue</Text>
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
                    <Text style={styles.stepTitle}>Set a home place for local charts</Text>
                    <Text style={styles.stepText}>
                      Tips on local charts use the home place you save. Use your
                      current place once, or search. GPS is only used while
                      Tuneable is open. The saved place stays on your profile.
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
                        {locationFromGps ? 'Detect again' : 'Use current place'}
                      </Text>
                    </View>
                  )}
                </Pressable>

                {locationFromGps && homeLocation ? (
                  <Text style={styles.successHint}>
                    Detected {formatLocationLabel(homeLocation)}. Save it as your
                    home place, or search if that isn&apos;t home.
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
                    <Text style={styles.primaryBtnText}>Save and finish</Text>
                  )}
                </Pressable>
                <Pressable
                  style={[styles.secondaryBtn, busy && styles.btnDisabled]}
                  disabled={busy}
                  onPress={() => {
                    setError(null);
                    void finishOnboarding();
                  }}>
                  <Text style={styles.secondaryBtnText}>Skip for now</Text>
                </Pressable>
                <Pressable
                  style={styles.backBtn}
                  disabled={busy}
                  onPress={() => goToStep('intro')}>
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
  introLead: {
    color: colors.text,
    fontSize: 14,
    lineHeight: 20,
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
});
