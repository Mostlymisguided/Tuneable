import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowRight,
  Coins,
  Loader2,
  MapPin,
  Music,
  Navigation,
  Sparkles,
  CheckCircle2,
} from 'lucide-react';
import { toast } from 'react-toastify';
import { useAuth } from '../contexts/AuthContext';
import { authAPI, userAPI } from '../lib/api';
import { buildOnboardingCompletePath } from '../utils/authHelpers';
import { buildOAuthStartUrl } from '../utils/platform';
import { penceToPoundsNumber } from '../utils/currency';
import { DEFAULT_TIP_POUNDS } from '../constants';
import LocationAutocomplete from '../components/LocationAutocomplete';
import { formatLocation, type ResolvedLocation } from '../utils/locationHelpers';
import {
  getCurrentLocationStatus,
  getTipCurrentLocation,
  maybeRefreshCurrentLocationIfGranted,
  refreshCurrentLocation,
} from '../utils/currentLocationCache';

type OnboardingStep = 'tip' | 'location' | 'import';
type ImportSource = 'spotify' | 'soundcloud' | 'youtube';

const QUICK_TIP_OPTIONS = [0.11, 0.5, 1.11, 5, 11.11];
const ONBOARDING_IMPORT_LIMIT = 25;
const SPOTIFY_READONLY_COPY =
  'Tuneable only reads your likes. We cannot change your Spotify library, playlists, or playback.';

const STEP_ORDER: OnboardingStep[] = ['tip', 'location', 'import'];

function parseStep(value: string | null): OnboardingStep {
  if (value === 'location' || value === 'import') return value;
  return 'tip';
}

function parseImportSource(value: string | null): ImportSource | null {
  if (value === 'soundcloud' || value === 'spotify' || value === 'youtube') return value;
  return null;
}

const Onboarding: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, refreshUser, updateBalance } = useAuth();

  const step = parseStep(searchParams.get('step'));
  const importSource = parseImportSource(searchParams.get('source'));

  const [isSaving, setIsSaving] = useState(false);

  const [defaultTip, setDefaultTip] = useState(DEFAULT_TIP_POUNDS.toFixed(2));

  const [homeLocation, setHomeLocation] = useState<ResolvedLocation | null>(null);
  const [isDetectingLocation, setIsDetectingLocation] = useState(false);
  const [isRequestingGps, setIsRequestingGps] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [locationFromGps, setLocationFromGps] = useState(false);

  const [spotifyConnected, setSpotifyConnected] = useState(false);
  const [soundcloudConnected, setSoundcloudConnected] = useState(false);
  const [spotifyOauthAvailable, setSpotifyOauthAvailable] = useState(false);
  const [spotifyRequestStatus, setSpotifyRequestStatus] = useState<string | null>(null);
  const [spotifyAccountInput, setSpotifyAccountInput] = useState('');
  const [youtubePlaylistUrl, setYoutubePlaylistUrl] = useState('');
  const [importPreview, setImportPreview] = useState<{
    actionableCount: number;
    estimatedCost: number;
    userBalance: number;
  } | null>(null);
  const [isImportLoading, setIsImportLoading] = useState(false);
  const [importProgressMessage, setImportProgressMessage] = useState<string | null>(null);
  const [importDone, setImportDone] = useState(false);

  const stepIndex = STEP_ORDER.indexOf(step);

  useEffect(() => {
    if (!user) return;
    // Only leave the wizard when onboarding is fully finished — tip step alone must not redirect
    if (user.onboarding?.completedAt) {
      const tags = user.preferences?.favoriteTags ?? [];
      navigate(buildOnboardingCompletePath(tags), { replace: true });
    }
  }, [user, navigate]);

  useEffect(() => {
    if (!user) return;
    // Suggest £1.11 until the user saves a tip during onboarding
    if (!user.onboarding?.defaultTipPromptSeenAt) {
      setDefaultTip(DEFAULT_TIP_POUNDS.toFixed(2));
    } else {
      const tip = user.preferences?.defaultTip ?? DEFAULT_TIP_POUNDS;
      setDefaultTip(tip.toFixed(2));
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    if (user.homeLocation?.city || user.homeLocation?.country || user.homeLocation?.placeId) {
      setHomeLocation(user.homeLocation);
    }
  }, [user]);

  useEffect(() => {
    if (step !== 'location') return;
    if (homeLocation?.city || homeLocation?.country || homeLocation?.placeId) return;

    let cancelled = false;
    const detectUserLocation = async () => {
      try {
        await maybeRefreshCurrentLocationIfGranted();
        if (cancelled) return;
        const gpsLocation = getTipCurrentLocation();
        if (gpsLocation) {
          setHomeLocation((prev) => (prev?.placeId || prev?.city ? prev : gpsLocation));
          setLocationFromGps(true);
          return;
        }
      } catch {
        // Fall through to optional IP hint
      }

      setIsDetectingLocation(true);
      try {
        const response = await userAPI.detectLocation();
        if (cancelled) return;
        if (response.success && response.location) {
          setHomeLocation((prev) => {
            if (prev?.placeId || prev?.city) return prev;
            return {
              ...(prev || {}),
              country: response.location.country,
              city: prev?.city || response.location.city,
              region: prev?.region || response.location.region,
              detectedFromIP: true,
            };
          });
        }
      } catch {
        // IP hint is optional — user can still search or use GPS
      } finally {
        if (!cancelled) setIsDetectingLocation(false);
      }
    };

    void detectUserLocation();
    return () => {
      cancelled = true;
    };
  }, [step, homeLocation?.city, homeLocation?.country, homeLocation?.placeId]);

  const checkConnections = useCallback(async () => {
    try {
      const [spotify, soundcloud] = await Promise.all([
        userAPI.getSpotifyStatus(),
        userAPI.getSoundCloudStatus(),
      ]);
      setSpotifyConnected(Boolean(spotify?.connected));
      setSoundcloudConnected(Boolean(soundcloud?.connected));
      setSpotifyOauthAvailable(Boolean(spotify?.oauthAvailable) || Boolean(spotify?.connected));
      setSpotifyRequestStatus(spotify?.request?.status || null);
      return {
        spotify: Boolean(spotify?.connected),
        soundcloud: Boolean(soundcloud?.connected),
        oauthAvailable: Boolean(spotify?.oauthAvailable) || Boolean(spotify?.connected),
      };
    } catch {
      return { spotify: false, soundcloud: false, oauthAvailable: false };
    }
  }, []);

  useEffect(() => {
    if (step !== 'import') return;
    void checkConnections();
  }, [step, checkConnections]);

  const loadImportPreview = useCallback(async (source: ImportSource, playlistUrl?: string) => {
    setIsImportLoading(true);
    setImportProgressMessage(source === 'youtube' ? 'Matching playlist…' : 'Scanning your likes…');
    try {
      const started = source === 'soundcloud'
        ? await userAPI.startSoundCloudImportPreview(ONBOARDING_IMPORT_LIMIT, 'spotify_only')
        : source === 'youtube'
          ? await userAPI.startYouTubeImportPreview(
              playlistUrl || youtubePlaylistUrl,
              ONBOARDING_IMPORT_LIMIT,
              'playlist'
            )
        : await userAPI.startSpotifyImportPreview(ONBOARDING_IMPORT_LIMIT);
      const data = await userAPI.waitForImportJob(started.jobId, (job) => {
        setImportProgressMessage(
          job.message || (source === 'youtube' ? 'Matching playlist…' : 'Scanning your likes…')
        );
      });

      const items = data.items || [];
      const tip = user?.preferences?.defaultTip ?? parseFloat(defaultTip) ?? DEFAULT_TIP_POUNDS;
      const actionable = items.filter((i: { matchStatus: string; selected?: boolean }) =>
        i.matchStatus !== 'in_library' && (source !== 'youtube' || i.selected !== false)
      );
      const balance = data.summary?.userBalance
        ?? (user?.balance != null ? penceToPoundsNumber(user.balance) : 0);

      setImportPreview({
        actionableCount: actionable.length,
        estimatedCost: actionable.length * tip,
        userBalance: balance,
      });
    } catch (error: unknown) {
      const message = (error as { response?: { data?: { error?: string } } })?.response?.data?.error
        || 'Could not preview your library';
      toast.error(message);
      setImportPreview(null);
    } finally {
      setIsImportLoading(false);
      setImportProgressMessage(null);
    }
  }, [defaultTip, user?.balance, user?.preferences?.defaultTip, youtubePlaylistUrl]);

  useEffect(() => {
    if (step !== 'import') return;
    const sourceParam = searchParams.get('source');
    if (sourceParam !== 'spotify' && sourceParam !== 'soundcloud') return;

    void (async () => {
      const connections = await checkConnections();
      const connected = sourceParam === 'soundcloud' ? connections.soundcloud : connections.spotify;
      if (connected) {
        await loadImportPreview(sourceParam);
      }
    })();
  }, [step, searchParams, checkConnections, loadImportPreview]);

  const goToStep = (next: OnboardingStep) => {
    const params = new URLSearchParams(searchParams);
    params.set('step', next);
    if (next !== 'import') {
      params.delete('source');
    }
    setSearchParams(params, { replace: true });
  };

  const markTipSeen = async (tipAmount?: number) => {
    const payload: Record<string, unknown> = {
      onboarding: { defaultTipPromptSeenAt: new Date().toISOString() },
    };
    if (tipAmount !== undefined) {
      payload.preferences = { defaultTip: tipAmount };
    }
    await authAPI.updateProfile(payload);
    await refreshUser();
  };

  const saveTipStep = async () => {
    const parsedTip = parseFloat(defaultTip);
    if (Number.isNaN(parsedTip) || parsedTip < 0.01) {
      toast.error('Default tip must be at least £0.01');
      return;
    }

    setIsSaving(true);
    try {
      await markTipSeen(parsedTip);
      goToStep('location');
    } catch (error: unknown) {
      const message = (error as { response?: { data?: { error?: string } } })?.response?.data?.error
        || 'Failed to save default tip';
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  };

  const skipTipStep = async () => {
    setIsSaving(true);
    try {
      await markTipSeen();
      goToStep('location');
    } catch (error: unknown) {
      const message = (error as { response?: { data?: { error?: string } } })?.response?.data?.error
        || 'Failed to continue';
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  };

  const requestDeviceLocation = async () => {
    setIsRequestingGps(true);
    setGpsError(null);
    try {
      const location = await refreshCurrentLocation({ force: true });
      if (location) {
        setHomeLocation(location);
        setLocationFromGps(true);
        return;
      }
      const status = getCurrentLocationStatus();
      if (status === 'denied') {
        setGpsError(
          'Location access was blocked. Search for your city, or enable it in your browser settings.'
        );
        return;
      }
      setGpsError('Could not detect your location. Search for your city instead.');
    } finally {
      setIsRequestingGps(false);
    }
  };

  const saveLocationStep = async () => {
    const hasLocation = !!(homeLocation?.city || homeLocation?.country || homeLocation?.placeId);
    if (!hasLocation) {
      toast.error('Pick a home location, or skip for now');
      return;
    }

    setIsSaving(true);
    try {
      await authAPI.updateProfile({ homeLocation });
      await refreshUser();
      goToStep('import');
    } catch (error: unknown) {
      const message = (error as { response?: { data?: { error?: string } } })?.response?.data?.error
        || 'Failed to save home location';
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  };

  const skipLocationStep = () => {
    goToStep('import');
  };

  const finishOnboarding = async (options?: { importSkipped?: boolean }) => {
    setIsSaving(true);
    try {
      await authAPI.updateProfile({
        onboarding: {
          completedAt: new Date().toISOString(),
          importPromptSeenAt: new Date().toISOString(),
          importSkipped: options?.importSkipped ?? false,
        },
      });
      await refreshUser();
      navigate(buildOnboardingCompletePath(user?.preferences?.favoriteTags ?? []), { replace: true });
    } catch (error: unknown) {
      const message = (error as { response?: { data?: { error?: string } } })?.response?.data?.error
        || 'Failed to complete setup';
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  };

  const connectImportSource = (source: 'spotify' | 'soundcloud') => {
    const token = localStorage.getItem('token') || undefined;
    const returnPath = `/onboarding?step=import&source=${source}`;
    const redirect = `${window.location.origin}/auth/callback?oauth_success=true&returnUrl=${encodeURIComponent(returnPath)}`;

    if (source === 'soundcloud') {
      window.location.href = buildOAuthStartUrl('soundcloud', {
        linkAccount: true,
        token,
        customRedirect: redirect,
      });
      return;
    }

    const baseUrl = import.meta.env.VITE_API_URL?.replace('/api', '')
      || import.meta.env.VITE_BACKEND_URL
      || 'http://localhost:8000';
    const redirectUrl = encodeURIComponent(redirect);
    window.location.href = `${baseUrl}/api/auth/spotify?link_account=true&redirect=${redirectUrl}${token ? `&token=${encodeURIComponent(token)}` : ''}`;
  };

  const startImportFromSource = (source: ImportSource) => {
    const params = new URLSearchParams(searchParams);
    params.set('step', 'import');
    params.set('source', source);
    setSearchParams(params, { replace: true });
  };

  const clearImportSource = () => {
    const params = new URLSearchParams(searchParams);
    params.set('step', 'import');
    params.delete('source');
    setImportPreview(null);
    setSearchParams(params, { replace: true });
  };

  const handleSourceCardClick = (source: ImportSource) => {
    if (source === 'youtube') {
      startImportFromSource('youtube');
      return;
    }
    const connected = source === 'soundcloud' ? soundcloudConnected : spotifyConnected;
    if (connected) {
      if (searchParams.get('source') === source) {
        void loadImportPreview(source);
        return;
      }
      startImportFromSource(source);
      return;
    }
    if (source === 'spotify' && !spotifyOauthAvailable) {
      startImportFromSource(source);
      return;
    }
    connectImportSource(source);
  };

  const submitSpotifyImportRequest = async () => {
    const account = spotifyAccountInput.trim();
    if (!account) {
      toast.error('Enter the email on your Spotify account (spotify.com/account/overview)');
      return;
    }
    setIsImportLoading(true);
    try {
      const result = await userAPI.requestSpotifyImport(account);
      toast.success(result.message);
      await checkConnections();
    } catch (error: unknown) {
      const message = (error as { response?: { data?: { error?: string } } })?.response?.data?.error
        || 'Failed to submit request';
      toast.error(message);
    } finally {
      setIsImportLoading(false);
    }
  };

  const runQuickImport = async () => {
    if (!importSource) return;
    setIsImportLoading(true);
    setImportProgressMessage('Preparing import…');
    try {
      const tip = user?.preferences?.defaultTip ?? parseFloat(defaultTip) ?? DEFAULT_TIP_POUNDS;
      const previewStarted = importSource === 'soundcloud'
        ? await userAPI.startSoundCloudImportPreview(ONBOARDING_IMPORT_LIMIT, 'spotify_only')
        : importSource === 'youtube'
          ? await userAPI.startYouTubeImportPreview(youtubePlaylistUrl, ONBOARDING_IMPORT_LIMIT, 'playlist')
        : await userAPI.startSpotifyImportPreview(ONBOARDING_IMPORT_LIMIT);
      const data = await userAPI.waitForImportJob(previewStarted.jobId, (job) => {
        setImportProgressMessage(job.message || 'Scanning your likes…');
      });

      const items = (data.items || [])
        .filter((i: { matchStatus: string; selected?: boolean }) => i.matchStatus !== 'in_library')
        .filter((i: { selected?: boolean }) => importSource !== 'youtube' || i.selected !== false)
        .slice(0, ONBOARDING_IMPORT_LIMIT)
        .map((i: {
          key: string;
          title?: string;
          mediaId?: string;
          matchStatus?: string;
          useSuggestedMatch?: boolean;
          crossRefStatus?: string;
          externalMedia?: Record<string, unknown>;
        }) => ({
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
        toast.info('No new tracks to import — you\'re all set!');
        await finishOnboarding({ importSkipped: false });
        return;
      }

      setImportProgressMessage(`Importing ${items.length} track${items.length === 1 ? '' : 's'}…`);
      const executeStarted = importSource === 'soundcloud'
        ? await userAPI.startSoundCloudImportExecute(items, tip)
        : importSource === 'youtube'
          ? await userAPI.startYouTubeImportExecute(items, tip)
        : await userAPI.startSpotifyImportExecute(items, tip);
      const result = await userAPI.waitForImportJob<{
        tipped: number;
        updatedBalance: number;
      }>(executeStarted.jobId, (job) => {
        setImportProgressMessage(job.message || 'Importing…');
      });

      if (result.updatedBalance != null) {
        updateBalance(Math.round(result.updatedBalance * 100));
      }

      setImportDone(true);
      toast.success(`Imported ${result.tipped} track${result.tipped === 1 ? '' : 's'} with tips`);
      await finishOnboarding({ importSkipped: false });
    } catch (error: unknown) {
      const message = (error as { response?: { data?: { error?: string } } })?.response?.data?.error
        || 'Import failed';
      toast.error(message);
    } finally {
      setIsImportLoading(false);
      setImportProgressMessage(null);
    }
  };

  const userBalance = user?.balance != null ? penceToPoundsNumber(user.balance) : 0;

  const parsedDefaultTip = useMemo(() => {
    const parsed = parseFloat(defaultTip);
    return Number.isFinite(parsed) && parsed >= 0.01 ? parsed : DEFAULT_TIP_POUNDS;
  }, [defaultTip]);

  const tunesCovered = useMemo(() => {
    if (userBalance <= 0 || parsedDefaultTip < 0.01) return null;
    return Math.floor((userBalance + 0.0001) / parsedDefaultTip);
  }, [userBalance, parsedDefaultTip]);

  const tunesCoveredLabel = useMemo(() => {
    if (tunesCovered == null) return null;
    if (tunesCovered >= 100) return '100+';
    return String(tunesCovered);
  }, [tunesCovered]);

  return (
    <div className="mx-auto flex min-h-[calc(100vh-8rem)] max-w-2xl flex-col px-4 py-8">
      <div className="mb-8 text-center">
        <p className="text-sm font-medium text-purple-300">
          Step {stepIndex + 1} of {STEP_ORDER.length}
        </p>
        <h1 className="mt-2 text-3xl font-bold text-white">Welcome to Tuneable</h1>
        <p className="mt-2 text-gray-400">
          A few quick steps to get set up. Everything can be changed later.
        </p>
        <div className="mt-6 flex justify-center gap-2">
          {STEP_ORDER.map((s, i) => (
            <div
              key={s}
              className={`h-2 w-12 rounded-full transition-colors ${
                i <= stepIndex ? 'bg-purple-500' : 'bg-gray-700'
              }`}
            />
          ))}
        </div>
      </div>

      <div className="flex-1 rounded-2xl border border-gray-700 bg-gray-900 p-6 shadow-xl">
        {step === 'tip' && (
          <div className="space-y-6">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-purple-600/20 text-purple-300">
                <Coins className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-white">Tip to add music to your library</h2>
                <p className="mt-2 text-sm text-gray-400">
                  Adding a tune to your library means placing a tip. Your default is set to{' '}
                  <strong className="text-white">£{DEFAULT_TIP_POUNDS.toFixed(2)}</strong>. Change it below if you
                  wish, or skip and keep this amount. You can update it any time in settings.
                </p>
              </div>
            </div>

            {userBalance > 0 && (
              <div className="flex items-center gap-3 rounded-xl border border-green-800/50 bg-green-900/20 p-4 text-sm text-green-200">
                <Sparkles className="h-5 w-5 shrink-0" />
                <span>
                  You have <strong>£{userBalance.toFixed(2)}</strong> welcome credit to start tipping.
                </span>
              </div>
            )}

            <div>
              <label htmlFor="onboarding-default-tip" className="mb-2 block text-sm font-medium text-white">
                Your default tip (£)
              </label>
              <input
                id="onboarding-default-tip"
                type="number"
                step="0.01"
                min="0.01"
                value={defaultTip}
                onChange={(e) => setDefaultTip(e.target.value)}
                className="w-full rounded-lg border border-gray-600 bg-gray-800 px-4 py-3 text-lg text-white focus:border-purple-500 focus:outline-none"
              />
              <div className="mt-3 flex flex-wrap gap-2">
                {QUICK_TIP_OPTIONS.map((amount) => (
                  <button
                    key={amount}
                    type="button"
                    onClick={() => setDefaultTip(amount.toFixed(2))}
                    className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                      Math.abs(parseFloat(defaultTip) - amount) < 0.001
                        ? 'bg-purple-600 text-white'
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                  >
                    £{amount.toFixed(2)}
                  </button>
                ))}
              </div>
              {tunesCoveredLabel != null && (
                <p className="mt-3 text-sm text-gray-400">
                  At <strong className="text-white">£{parsedDefaultTip.toFixed(2)}</strong>, your
                  balance covers about{' '}
                  <strong className="text-white">{tunesCoveredLabel}</strong>{' '}
                  {tunesCovered === 1 ? 'tune' : 'tunes'}.
                </p>
              )}
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={skipTipStep}
                disabled={isSaving}
                className="rounded-xl border border-gray-600 px-5 py-3 font-semibold text-gray-200 hover:bg-gray-800 disabled:opacity-50 sm:order-1 sm:flex-1"
              >
                Skip for now
              </button>
              <button
                type="button"
                onClick={saveTipStep}
                disabled={isSaving}
                className="flex items-center justify-center gap-2 rounded-xl bg-purple-600 py-3 font-semibold text-white hover:bg-purple-500 disabled:opacity-50 sm:order-2 sm:flex-[1.4]"
              >
                {isSaving ? <Loader2 className="h-5 w-5 animate-spin" /> : <ArrowRight className="h-5 w-5" />}
                {Math.abs(parsedDefaultTip - DEFAULT_TIP_POUNDS) < 0.001
                  ? `Continue with £${DEFAULT_TIP_POUNDS.toFixed(2)}`
                  : `Save £${parsedDefaultTip.toFixed(2)} and continue`}
              </button>
            </div>
          </div>
        )}

        {step === 'location' && (
          <div className="space-y-6">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-purple-600/20 text-purple-300">
                <MapPin className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-white">Enable location for local charts</h2>
                <p className="mt-2 text-sm text-gray-400">
                  Tips influence charts where you are — at home, and wherever you tip.
                  Location is only used while Tuneable is open. Search if GPS isn&apos;t home.
                  You can skip and set it later.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => void requestDeviceLocation()}
              disabled={isSaving || isRequestingGps}
              className={`flex w-full items-center justify-center gap-2 rounded-xl py-3 font-semibold disabled:opacity-50 ${
                homeLocation?.placeId
                  ? 'border border-purple-500/50 text-purple-200 hover:bg-purple-600/20'
                  : 'bg-purple-600 text-white hover:bg-purple-500'
              }`}
            >
              {isRequestingGps ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Navigation className="h-5 w-5" />
              )}
              {isRequestingGps
                ? 'Detecting your location…'
                : locationFromGps
                  ? 'Detect again'
                  : 'Enable location'}
            </button>

            {gpsError && <p className="text-sm text-amber-300/90">{gpsError}</p>}
            {locationFromGps && homeLocation && (
              <p className="text-sm text-green-300">
                Detected {formatLocation(homeLocation)}. Confirm below, or search if that&apos;s not home.
              </p>
            )}

            <div className="relative">
              <div className="mb-3 flex items-center gap-3 text-xs uppercase tracking-wide text-gray-500">
                <span className="h-px flex-1 bg-gray-700" />
                or search
                <span className="h-px flex-1 bg-gray-700" />
              </div>
              <LocationAutocomplete
                variant="dark"
                label="Home location"
                value={homeLocation}
                onChange={(location) => {
                  setLocationFromGps(false);
                  setHomeLocation(location);
                }}
                placeholder="Search for your home city or town"
              />
              {isDetectingLocation && (
                <p className="mt-2 flex items-center gap-2 text-xs text-gray-400">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Detecting a country hint from your IP…
                </p>
              )}
              {!isDetectingLocation && homeLocation?.detectedFromIP && !homeLocation?.placeId && (
                <p className="mt-2 text-xs text-gray-500">
                  Country hint auto-detected. Search above to pick your exact place.
                </p>
              )}
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={() => goToStep('tip')}
                className="rounded-xl border border-gray-600 px-5 py-3 text-sm font-medium text-gray-300 hover:bg-gray-800 sm:order-1"
              >
                Back
              </button>
              <button
                type="button"
                onClick={skipLocationStep}
                disabled={isSaving}
                className="rounded-xl border border-gray-600 px-5 py-3 font-semibold text-gray-200 hover:bg-gray-800 disabled:opacity-50 sm:order-2 sm:flex-1"
              >
                Skip for now
              </button>
              <button
                type="button"
                onClick={saveLocationStep}
                disabled={isSaving}
                className="flex items-center justify-center gap-2 rounded-xl bg-purple-600 py-3 font-semibold text-white hover:bg-purple-500 disabled:opacity-50 sm:order-3 sm:flex-[1.4]"
              >
                {isSaving ? <Loader2 className="h-5 w-5 animate-spin" /> : <ArrowRight className="h-5 w-5" />}
                Save and continue
              </button>
            </div>
          </div>
        )}

        {step === 'import' && (
          <div className="space-y-6">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-purple-600/20 text-purple-300">
                <Music className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-white">Import your existing library</h2>
                <p className="mt-2 text-sm text-gray-400">
                  Bring in likes from Spotify or SoundCloud, or a public YouTube playlist. Each imported
                  track gets a tip at your default
                  (£{(user?.preferences?.defaultTip ?? parseFloat(defaultTip) ?? DEFAULT_TIP_POUNDS).toFixed(2)}).
                  You can skip and do this later.
                </p>
              </div>
            </div>

            {!isImportLoading && !importPreview && !searchParams.get('source') && (
              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => handleSourceCardClick('spotify')}
                  disabled={isSaving || isImportLoading}
                  className="rounded-xl border border-green-700/50 bg-green-900/20 p-5 text-left transition-colors hover:bg-green-900/30"
                >
                  <p className="font-semibold text-green-300">
                    {spotifyConnected
                      ? 'Import from Spotify'
                      : spotifyOauthAvailable
                        ? 'Connect Spotify'
                        : 'Request Spotify import'}
                  </p>
                  <p className="mt-1 text-sm text-gray-400">
                    {spotifyConnected
                      ? 'Connected — tap to scan your likes'
                      : spotifyOauthAvailable
                        ? 'Read-only access to your saved tracks'
                        : 'Tester allowlist — request access'}
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => handleSourceCardClick('soundcloud')}
                  disabled={isSaving || isImportLoading}
                  className="rounded-xl border border-orange-700/50 bg-orange-900/20 p-5 text-left transition-colors hover:bg-orange-900/30"
                >
                  <p className="font-semibold text-orange-300">
                    {soundcloudConnected ? 'Import from SoundCloud' : 'Connect SoundCloud'}
                  </p>
                  <p className="mt-1 text-sm text-gray-400">
                    {soundcloudConnected ? 'Connected — tap to scan your likes' : 'Import your liked tracks'}
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => handleSourceCardClick('youtube')}
                  disabled={isSaving || isImportLoading}
                  className="rounded-xl border border-red-700/50 bg-red-900/20 p-5 text-left transition-colors hover:bg-red-900/30 sm:col-span-2"
                >
                  <p className="font-semibold text-red-300">YouTube playlist</p>
                  <p className="mt-1 text-sm text-gray-400">
                    Paste a public playlist URL — no YouTube login
                  </p>
                </button>
                <p className="sm:col-span-2 text-xs text-gray-500">{SPOTIFY_READONLY_COPY}</p>
              </div>
            )}

            {(isImportLoading || importPreview || searchParams.get('source')) && (
              <div className="rounded-xl border border-gray-700 bg-black/30 p-5 space-y-4">
                {importSource === 'youtube' && !importPreview && !isImportLoading ? (
                  <div className="space-y-3">
                    <p className="text-sm text-gray-400">Paste a public YouTube playlist URL</p>
                    <input
                      type="url"
                      value={youtubePlaylistUrl}
                      onChange={(e) => setYoutubePlaylistUrl(e.target.value)}
                      placeholder="https://www.youtube.com/playlist?list=…"
                      className="w-full rounded-lg border border-gray-600 bg-black/40 px-3 py-2 text-white"
                    />
                    <button
                      type="button"
                      onClick={() => void loadImportPreview('youtube', youtubePlaylistUrl)}
                      disabled={isSaving || isImportLoading || !youtubePlaylistUrl.trim()}
                      className="flex w-full items-center justify-center gap-2 rounded-xl bg-purple-600 py-3 font-semibold text-white hover:bg-purple-500 disabled:opacity-50"
                    >
                      Scan playlist
                    </button>
                  </div>
                ) : isImportLoading && !importPreview ? (
                  <div className="flex items-center gap-2 text-gray-400">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    {importProgressMessage
                      || (importSource === 'youtube'
                        ? 'Matching playlist…'
                        : `Scanning your ${importSource === 'soundcloud' ? 'SoundCloud' : 'Spotify'} likes…`)}
                  </div>
                ) : importPreview ? (
                  <div className="space-y-4">
                    <p className="text-white">
                      Found <strong>{importPreview.actionableCount}</strong> tracks on Tuneable
                      {importPreview.actionableCount > 0 && (
                        <> · estimated <strong>£{importPreview.estimatedCost.toFixed(2)}</strong></>
                      )}
                    </p>
                    {importPreview.actionableCount > 0 && importPreview.estimatedCost > importPreview.userBalance + 0.01 && (
                      <p className="text-sm text-amber-300">
                        Your balance is £{importPreview.userBalance.toFixed(2)} — we&apos;ll import as many as you can afford.
                      </p>
                    )}
                    {isImportLoading && importProgressMessage ? (
                      <p className="flex items-center gap-2 text-sm text-gray-400">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        {importProgressMessage}
                      </p>
                    ) : null}
                    <button
                      type="button"
                      onClick={runQuickImport}
                      disabled={isImportLoading || importDone || isSaving}
                      className="flex w-full items-center justify-center gap-2 rounded-xl bg-purple-600 py-3 font-semibold text-white hover:bg-purple-500 disabled:opacity-50"
                    >
                      {isImportLoading ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                      ) : (
                        <CheckCircle2 className="h-5 w-5" />
                      )}
                      Import up to {ONBOARDING_IMPORT_LIMIT} tracks
                    </button>
                    <button
                      type="button"
                      onClick={() => navigate(`/import?source=${importSource}`)}
                      className="text-sm text-purple-300 hover:text-purple-200"
                    >
                      Review all tracks before importing →
                    </button>
                  </div>
                ) : importSource === 'spotify' && !spotifyConnected && !spotifyOauthAvailable ? (
                  <div className="space-y-3">
                    <p className="text-sm text-gray-400">
                      {spotifyRequestStatus === 'pending'
                        ? 'Request pending — Connect will unlock after we add your Spotify account to the tester list.'
                        : 'Spotify import is currently limited to testers. Request access with the email on your Spotify account.'}
                    </p>
                    <input
                      type="email"
                      value={spotifyAccountInput}
                      onChange={(e) => setSpotifyAccountInput(e.target.value)}
                      placeholder="Spotify account email"
                      className="w-full rounded-lg border border-gray-600 bg-black/40 px-3 py-2 text-white"
                    />
                    <button
                      type="button"
                      onClick={() => void submitSpotifyImportRequest()}
                      disabled={isSaving || isImportLoading}
                      className="flex w-full items-center justify-center gap-2 rounded-xl bg-green-700 py-3 font-semibold text-white hover:bg-green-600 disabled:opacity-50"
                    >
                      {isImportLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
                      Request Spotify import
                    </button>
                  </div>
                ) : (importSource === 'soundcloud' ? soundcloudConnected : importSource === 'spotify' && spotifyConnected) ? (
                  <div className="flex items-center gap-2 text-gray-400">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Scanning your {importSource === 'soundcloud' ? 'SoundCloud' : 'Spotify'} likes…
                  </div>
                ) : importSource === 'soundcloud' || importSource === 'spotify' ? (
                  <div className="space-y-3">
                    <p className="text-sm text-gray-400">
                      Connect {importSource === 'soundcloud' ? 'SoundCloud' : 'Spotify'} to preview your import.
                    </p>
                    <p className="text-xs text-gray-500">{importSource === 'spotify' ? SPOTIFY_READONLY_COPY : null}</p>
                    <button
                      type="button"
                      onClick={() => connectImportSource(importSource)}
                      disabled={isSaving || isImportLoading}
                      className="flex w-full items-center justify-center gap-2 rounded-xl bg-purple-600 py-3 font-semibold text-white hover:bg-purple-500 disabled:opacity-50"
                    >
                      Connect {importSource === 'soundcloud' ? 'SoundCloud' : 'Spotify'}
                    </button>
                  </div>
                ) : null}
                <button
                  type="button"
                  onClick={clearImportSource}
                  className="text-sm text-gray-400 hover:text-gray-200"
                >
                  Choose a different source
                </button>
              </div>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => goToStep('location')}
                className="rounded-xl border border-gray-600 px-5 py-3 text-sm font-medium text-gray-300 hover:bg-gray-800"
              >
                Back
              </button>
              <button
                type="button"
                onClick={() => finishOnboarding({ importSkipped: true })}
                disabled={isSaving || isImportLoading}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-gray-600 py-3 font-semibold text-gray-200 hover:bg-gray-800 disabled:opacity-50"
              >
                {isSaving ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
                Skip for now
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Onboarding;
