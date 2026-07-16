import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowRight,
  Coins,
  Loader2,
  Music,
  Sparkles,
  CheckCircle2,
} from 'lucide-react';
import { toast } from 'react-toastify';
import { useAuth } from '../contexts/AuthContext';
import { authAPI, tagAPI, userAPI } from '../lib/api';
import { buildOnboardingCompletePath, needsOnboarding } from '../utils/authHelpers';
import { buildOAuthStartUrl } from '../utils/platform';
import { normalizeTagForStorage, tagsMatch } from '../utils/tagNormalizer';
import { penceToPoundsNumber } from '../utils/currency';

type OnboardingStep = 'tags' | 'tip' | 'import';
type ImportSource = 'spotify' | 'soundcloud';

const MAX_TAGS = 8;
const QUICK_TIP_OPTIONS = [0.05, 0.11, 0.25, 0.5];
const ONBOARDING_IMPORT_LIMIT = 25;

const STEP_ORDER: OnboardingStep[] = ['tags', 'tip', 'import'];

function parseStep(value: string | null): OnboardingStep {
  if (value === 'tip' || value === 'import') return value;
  return 'tags';
}

const Onboarding: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, refreshUser, updateBalance } = useAuth();

  const step = parseStep(searchParams.get('step'));
  const importSource = (searchParams.get('source') === 'soundcloud' ? 'soundcloud' : 'spotify') as ImportSource;

  const [popularTags, setPopularTags] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [tagSearch, setTagSearch] = useState('');
  const [isLoadingTags, setIsLoadingTags] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const [defaultTip, setDefaultTip] = useState('0.11');

  const [spotifyConnected, setSpotifyConnected] = useState(false);
  const [soundcloudConnected, setSoundcloudConnected] = useState(false);
  const [importPreview, setImportPreview] = useState<{
    actionableCount: number;
    estimatedCost: number;
    userBalance: number;
  } | null>(null);
  const [isImportLoading, setIsImportLoading] = useState(false);
  const [importDone, setImportDone] = useState(false);

  const stepIndex = STEP_ORDER.indexOf(step);

  useEffect(() => {
    if (!user) return;
    if (!needsOnboarding(user)) {
      const tags = user.preferences?.favoriteTags ?? [];
      navigate(buildOnboardingCompletePath(tags), { replace: true });
    }
  }, [user, navigate]);

  useEffect(() => {
    if (!user) return;
    const existing = user.preferences?.favoriteTags ?? [];
    if (existing.length > 0) setSelectedTags(existing);
    const tip = user.preferences?.defaultTip ?? 0.11;
    setDefaultTip(tip.toFixed(2));
  }, [user]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setIsLoadingTags(true);
      try {
        const data = await tagAPI.getPopular(48);
        if (!cancelled) {
          setPopularTags((data.tags || []).map((entry) => entry.tag));
        }
      } catch {
        if (!cancelled) {
          toast.error('Could not load tags — try refreshing');
        }
      } finally {
        if (!cancelled) setIsLoadingTags(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

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

  const loadImportPreview = useCallback(async (source: ImportSource) => {
    setIsImportLoading(true);
    try {
      const data = source === 'soundcloud'
        ? await userAPI.previewSoundCloudImport(ONBOARDING_IMPORT_LIMIT)
        : await userAPI.previewSpotifyImport(ONBOARDING_IMPORT_LIMIT);

      const items = data.items || [];
      const tip = user?.preferences?.defaultTip ?? parseFloat(defaultTip) ?? 0.11;
      const actionable = items.filter((i: { matchStatus: string }) => i.matchStatus !== 'in_library');
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
    }
  }, [defaultTip, user?.balance, user?.preferences?.defaultTip]);

  useEffect(() => {
    if (step !== 'import') return;
    const sourceParam = searchParams.get('source');
    if (!sourceParam) return;

    void (async () => {
      const connections = await checkConnections();
      const connected = sourceParam === 'soundcloud' ? connections.soundcloud : connections.spotify;
      if (connected) {
        await loadImportPreview(sourceParam as ImportSource);
      }
    })();
  }, [step, searchParams, checkConnections, loadImportPreview]);

  const filteredTagOptions = useMemo(() => {
    const query = tagSearch.trim().toLowerCase();
    if (!query) return popularTags;
    return popularTags.filter((tag) => tag.toLowerCase().includes(query));
  }, [popularTags, tagSearch]);

  const goToStep = (next: OnboardingStep) => {
    const params = new URLSearchParams(searchParams);
    params.set('step', next);
    if (next !== 'import') {
      params.delete('source');
    }
    setSearchParams(params, { replace: true });
  };

  const toggleTag = (tag: string) => {
    const display = normalizeTagForStorage(tag);
    if (!display) return;

    setSelectedTags((prev) => {
      if (prev.some((t) => tagsMatch(t, display))) {
        return prev.filter((t) => !tagsMatch(t, display));
      }
      if (prev.length >= MAX_TAGS) {
        toast.info(`Choose up to ${MAX_TAGS} tags`);
        return prev;
      }
      return [...prev, display];
    });
  };

  const addCustomTag = () => {
    const display = normalizeTagForStorage(tagSearch.trim());
    if (!display) {
      toast.error('Enter a valid tag name');
      return;
    }
    toggleTag(display);
    setTagSearch('');
  };

  const saveTagsStep = async (options?: { skipped?: boolean }) => {
    setIsSaving(true);
    try {
      const tags = options?.skipped ? [] : selectedTags;
      await authAPI.updateProfile({
        preferences: { favoriteTags: tags },
        onboarding: { favoriteTagsSelectedAt: new Date().toISOString() },
      });
      if (options?.skipped) setSelectedTags([]);
      await refreshUser();
      goToStep('tip');
    } catch (error: unknown) {
      const message = (error as { response?: { data?: { error?: string } } })?.response?.data?.error
        || 'Failed to save tags';
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  };

  const saveTipStep = async () => {
    const parsedTip = parseFloat(defaultTip);
    if (Number.isNaN(parsedTip) || parsedTip < 0.01) {
      toast.error('Default tip must be at least £0.01');
      return;
    }

    setIsSaving(true);
    try {
      await authAPI.updateProfile({
        preferences: { defaultTip: parsedTip },
        onboarding: { defaultTipPromptSeenAt: new Date().toISOString() },
      });
      await refreshUser();
      goToStep('import');
    } catch (error: unknown) {
      const message = (error as { response?: { data?: { error?: string } } })?.response?.data?.error
        || 'Failed to save default tip';
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
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
      navigate(buildOnboardingCompletePath(selectedTags), { replace: true });
    } catch (error: unknown) {
      const message = (error as { response?: { data?: { error?: string } } })?.response?.data?.error
        || 'Failed to complete setup';
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  };

  const connectImportSource = (source: ImportSource) => {
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

  const runQuickImport = async () => {
    setIsImportLoading(true);
    try {
      const tip = user?.preferences?.defaultTip ?? parseFloat(defaultTip) ?? 0.11;
      const data = importSource === 'soundcloud'
        ? await userAPI.previewSoundCloudImport(ONBOARDING_IMPORT_LIMIT)
        : await userAPI.previewSpotifyImport(ONBOARDING_IMPORT_LIMIT);

      const items = (data.items || [])
        .filter((i: { matchStatus: string }) => i.matchStatus !== 'in_library')
        .slice(0, ONBOARDING_IMPORT_LIMIT)
        .map((i: {
          key: string;
          title?: string;
          mediaId?: string;
          externalMedia?: Record<string, unknown>;
        }) => ({
          key: i.key,
          title: i.title,
          selected: true,
          mediaId: i.mediaId,
          amount: tip,
          externalMedia: i.externalMedia,
          skipIfInLibrary: true,
        }));

      if (items.length === 0) {
        toast.info('No new tracks to import — you\'re all set!');
        await finishOnboarding({ importSkipped: false });
        return;
      }

      const result = importSource === 'soundcloud'
        ? await userAPI.executeSoundCloudImport(items, tip)
        : await userAPI.executeSpotifyImport(items, tip);

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
    }
  };

  const userBalance = user?.balance != null ? penceToPoundsNumber(user.balance) : 0;

  return (
    <div className="mx-auto flex min-h-[calc(100vh-8rem)] max-w-2xl flex-col px-4 py-8">
      <div className="mb-8 text-center">
        <p className="text-sm font-medium text-purple-300">
          Step {stepIndex + 1} of {STEP_ORDER.length}
        </p>
        <h1 className="mt-2 text-3xl font-bold text-white">Welcome to Tuneable</h1>
        <p className="mt-2 text-gray-400">
          A quick setup so your feed matches your taste.
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
        {step === 'tags' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-semibold text-white">Choose your favourite tags</h2>
              <p className="mt-2 text-sm text-gray-400">
                Pick up to {MAX_TAGS} genres or styles. We&apos;ll use these to filter your music feed — or skip for now.
              </p>
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                value={tagSearch}
                onChange={(e) => setTagSearch(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustomTag(); } }}
                placeholder="Search or add a tag…"
                className="flex-1 rounded-lg border border-gray-600 bg-gray-800 px-4 py-2.5 text-white placeholder-gray-500 focus:border-purple-500 focus:outline-none"
              />
              <button
                type="button"
                onClick={addCustomTag}
                disabled={!tagSearch.trim()}
                className="rounded-lg bg-gray-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-600 disabled:opacity-40"
              >
                Add
              </button>
            </div>

            {selectedTags.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {selectedTags.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleTag(tag)}
                    className="rounded-full bg-purple-600 px-3 py-1 text-sm font-medium text-white"
                  >
                    {tag} ×
                  </button>
                ))}
              </div>
            )}

            {isLoadingTags ? (
              <div className="flex items-center justify-center py-12 text-gray-400">
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Loading tags…
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {filteredTagOptions.map((tag) => {
                  const selected = selectedTags.some((t) => tagsMatch(t, tag));
                  return (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => toggleTag(tag)}
                      className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
                        selected
                          ? 'border-purple-500 bg-purple-600/30 text-purple-200'
                          : 'border-gray-600 bg-gray-800 text-gray-300 hover:border-gray-500'
                      }`}
                    >
                      {tag}
                    </button>
                  );
                })}
              </div>
            )}

            <p className="text-sm text-gray-500">
              {selectedTags.length} of {MAX_TAGS} selected
            </p>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => saveTagsStep({ skipped: true })}
                disabled={isSaving}
                className="rounded-xl border border-gray-600 px-5 py-3 text-sm font-medium text-gray-300 hover:bg-gray-800 disabled:opacity-50"
              >
                Skip for now
              </button>
              <button
                type="button"
                onClick={() => saveTagsStep()}
                disabled={isSaving}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-purple-600 py-3 font-semibold text-white hover:bg-purple-500 disabled:opacity-50"
              >
                {isSaving ? <Loader2 className="h-5 w-5 animate-spin" /> : <ArrowRight className="h-5 w-5" />}
                Continue
              </button>
            </div>
          </div>
        )}

        {step === 'tip' && (
          <div className="space-y-6">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-purple-600/20 text-purple-300">
                <Coins className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-white">How tipping works</h2>
                <p className="mt-2 text-sm text-gray-400">
                  Tuneable revolves around tipping to support your favourite music and artists.
                  Adding a tune to your library means placing a tip — minimum <strong className="text-white">1p</strong>,
                  with no maximum. You can change your default any time in settings.
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
                      parseFloat(defaultTip) === amount
                        ? 'bg-purple-600 text-white'
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                  >
                    £{amount.toFixed(2)}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => goToStep('tags')}
                className="rounded-xl border border-gray-600 px-5 py-3 text-sm font-medium text-gray-300 hover:bg-gray-800"
              >
                Back
              </button>
              <button
                type="button"
                onClick={saveTipStep}
                disabled={isSaving}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-purple-600 py-3 font-semibold text-white hover:bg-purple-500 disabled:opacity-50"
              >
                {isSaving ? <Loader2 className="h-5 w-5 animate-spin" /> : <ArrowRight className="h-5 w-5" />}
                Continue
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
                <h2 className="text-xl font-semibold text-white">Jump-start your library</h2>
                <p className="mt-2 text-sm text-gray-400">
                  Import likes from Spotify or SoundCloud. Each imported track gets a tip at your default
                  (£{(user?.preferences?.defaultTip ?? parseFloat(defaultTip) ?? 0.11).toFixed(2)}).
                  You can skip and do this later.
                </p>
              </div>
            </div>

            {!searchParams.get('source') && (
              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => connectImportSource('spotify')}
                  disabled={isSaving || isImportLoading}
                  className="rounded-xl border border-green-700/50 bg-green-900/20 p-5 text-left transition-colors hover:bg-green-900/30"
                >
                  <p className="font-semibold text-green-300">Connect Spotify</p>
                  <p className="mt-1 text-sm text-gray-400">
                    {spotifyConnected ? 'Connected — tap to reconnect' : 'Import your saved tracks'}
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => connectImportSource('soundcloud')}
                  disabled={isSaving || isImportLoading}
                  className="rounded-xl border border-orange-700/50 bg-orange-900/20 p-5 text-left transition-colors hover:bg-orange-900/30"
                >
                  <p className="font-semibold text-orange-300">Connect SoundCloud</p>
                  <p className="mt-1 text-sm text-gray-400">
                    {soundcloudConnected ? 'Connected — tap to reconnect' : 'Import your liked tracks'}
                  </p>
                </button>
              </div>
            )}

            {searchParams.get('source') && (
              <div className="rounded-xl border border-gray-700 bg-black/30 p-5">
                {isImportLoading && !importPreview ? (
                  <div className="flex items-center gap-2 text-gray-400">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Scanning your {importSource === 'soundcloud' ? 'SoundCloud' : 'Spotify'} likes…
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
                ) : (
                  <p className="text-sm text-gray-400">
                    Connect {importSource === 'soundcloud' ? 'SoundCloud' : 'Spotify'} to preview your import.
                  </p>
                )}
              </div>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => goToStep('tip')}
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
