import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowRight,
  Library,
  Loader2,
  MapPin,
  Navigation,
} from 'lucide-react';
import { toast } from '../utils/toast';
import { useAuth } from '../contexts/AuthContext';
import { authAPI, userAPI } from '../lib/api';
import { buildOnboardingCompletePath, importPathFromLegacyOnboarding } from '../utils/authHelpers';
import LocationAutocomplete from '../components/LocationAutocomplete';
import { formatLocation, type ResolvedLocation } from '../utils/locationHelpers';
import {
  getCurrentLocationStatus,
  getTipCurrentLocation,
  maybeRefreshCurrentLocationIfGranted,
  refreshCurrentLocation,
} from '../utils/currentLocationCache';

type OnboardingStep = 'intro' | 'location';

const STEP_ORDER: OnboardingStep[] = ['intro', 'location'];

function parseStep(value: string | null): OnboardingStep {
  if (value === 'location') return 'location';
  return 'intro';
}

const Onboarding: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, refreshUser } = useAuth();

  const step = parseStep(searchParams.get('step'));

  const [isSaving, setIsSaving] = useState(false);

  const [homeLocation, setHomeLocation] = useState<ResolvedLocation | null>(null);
  const [isDetectingLocation, setIsDetectingLocation] = useState(false);
  const [isRequestingGps, setIsRequestingGps] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [locationFromGps, setLocationFromGps] = useState(false);

  const stepIndex = STEP_ORDER.indexOf(step);

  useEffect(() => {
    const legacyImport = importPathFromLegacyOnboarding(
      `${window.location.pathname}${window.location.search}`
    );
    if (legacyImport) {
      navigate(legacyImport, { replace: true });
    }
  }, [searchParams, navigate]);

  useEffect(() => {
    if (!user) return;
    if (searchParams.get('step') === 'import') return;
    // Only leave the wizard when onboarding is fully finished
    if (user.onboarding?.completedAt) {
      const tags = user.preferences?.favoriteTags ?? [];
      navigate(buildOnboardingCompletePath(tags), { replace: true });
    }
  }, [user, navigate, searchParams]);

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

  const goToStep = (next: OnboardingStep) => {
    const params = new URLSearchParams(searchParams);
    params.set('step', next);
    params.delete('source');
    params.delete('requestAccess');
    setSearchParams(params, { replace: true });
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

  const finishOnboarding = async () => {
    setIsSaving(true);
    try {
      await authAPI.updateProfile({
        onboarding: {
          completedAt: new Date().toISOString(),
          importSkipped: true,
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
      await finishOnboarding();
    } catch (error: unknown) {
      const message = (error as { response?: { data?: { error?: string } } })?.response?.data?.error
        || 'Failed to save home location';
      toast.error(message);
      setIsSaving(false);
    }
  };

  if (searchParams.get('step') === 'import') {
    return null;
  }

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
        {step === 'intro' && (
          <div className="space-y-6">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-purple-600/20 text-purple-300">
                <Library className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-white">Your showcase, not a subscription</h2>
                <p className="mt-2 text-sm leading-relaxed text-gray-300">
                  Tuneable is where you show your taste in music, podcasts, and books.
                </p>
                <p className="mt-3 text-sm leading-relaxed text-gray-400">
                  Tip what you love. Each tip supports the creator, moves global and local charts,
                  and puts that work in your public showcase.
                </p>
                <p className="mt-3 text-sm leading-relaxed text-gray-400">
                  Tip a work more than anyone else where you live — or worldwide — and you become its
                  champion. Your name stands beside the media you love most.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => goToStep('location')}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-purple-600 py-3 font-semibold text-white hover:bg-purple-500"
            >
              Continue
              <ArrowRight className="h-5 w-5" />
            </button>
          </div>
        )}

        {step === 'location' && (
          <div className="space-y-6">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-purple-600/20 text-purple-300">
                <MapPin className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-white">Set a home place for local charts</h2>
                <p className="mt-2 text-sm text-gray-400">
                  Tips on local charts use the home place you save. Use your current place once, or search.
                  GPS is only used while Tuneable is open. The saved place stays on your profile.
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
                  : 'Use current place'}
            </button>

            {gpsError && <p className="text-sm text-amber-300/90">{gpsError}</p>}
            {locationFromGps && homeLocation && (
              <p className="text-sm text-green-300">
                Detected {formatLocation(homeLocation)}. Save it as your home place, or search if that&apos;s not home.
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
                onClick={() => goToStep('intro')}
                disabled={isSaving}
                className="rounded-xl border border-gray-600 px-5 py-3 text-sm font-medium text-gray-300 hover:bg-gray-800 disabled:opacity-50"
              >
                Back
              </button>
              <button
                type="button"
                onClick={() => void finishOnboarding()}
                disabled={isSaving}
                className="rounded-xl border border-gray-600 px-5 py-3 font-semibold text-gray-200 hover:bg-gray-800 disabled:opacity-50 sm:order-1 sm:flex-1"
              >
                Skip for now
              </button>
              <button
                type="button"
                onClick={() => void saveLocationStep()}
                disabled={isSaving}
                className="flex items-center justify-center gap-2 rounded-xl bg-purple-600 py-3 font-semibold text-white hover:bg-purple-500 disabled:opacity-50 sm:order-3 sm:flex-[1.4]"
              >
                {isSaving ? <Loader2 className="h-5 w-5 animate-spin" /> : <ArrowRight className="h-5 w-5" />}
                Save and finish
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Onboarding;
