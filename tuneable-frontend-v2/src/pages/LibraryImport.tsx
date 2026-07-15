import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  CheckCircle2,
  Coins,
  Loader2,
  Music,
  Plus,
  Minus,
  Sparkles,
  AlertCircle,
  Search,
} from 'lucide-react';
import { toast } from 'react-toastify';
import { useAuth } from '../contexts/AuthContext';
import { userAPI } from '../lib/api';
import { penceToPoundsNumber } from '../utils/currency';
import { DEFAULT_PROFILE_PIC } from '../constants';
import { buildOAuthStartUrl } from '../utils/platform';

type ImportSource = 'spotify' | 'soundcloud';
type ImportStep = 'connect' | 'summary' | 'review' | 'done';
type MatchStatus = 'in_library' | 'on_catalog' | 'possible_match' | 'new';

interface ImportItem {
  key: string;
  title: string;
  artist: string;
  coverArt?: string | null;
  duration?: number;
  album?: string | null;
  matchStatus: MatchStatus;
  matchType?: string | null;
  mediaId?: string | null;
  mediaUuid?: string | null;
  suggestedTitle?: string | null;
  suggestedArtist?: string | null;
  useSuggestedMatch?: boolean;
  isPlayable: boolean;
  awaitingUpload: boolean;
  userBidTotalPence: number;
  defaultTip: number;
  minTip: number;
  selected: boolean;
  externalMedia: Record<string, unknown>;
}

interface ImportSummary {
  total: number;
  inLibrary: number;
  onCatalog: number;
  possibleMatches?: number;
  newTracks: number;
  selectedCount: number;
  estimatedTotal: number;
  userBalance: number;
  defaultTip: number;
  skippedMixes?: number;
  scanned?: number;
}

const DEFAULT_SCAN_LIMIT = 100;
const MAX_SCAN_LIMIT = 200;

const STATUS_LABELS: Record<MatchStatus, string> = {
  in_library: 'In your library',
  on_catalog: 'On Tuneable',
  possible_match: 'Possible match',
  new: 'New to Tuneable',
};

const STATUS_COLORS: Record<MatchStatus, string> = {
  in_library: 'bg-green-900/40 text-green-300 border-green-700',
  on_catalog: 'bg-blue-900/40 text-blue-300 border-blue-700',
  possible_match: 'bg-amber-900/40 text-amber-200 border-amber-700',
  new: 'bg-purple-900/40 text-purple-300 border-purple-700',
};

const SOURCE_META: Record<ImportSource, {
  label: string;
  likesLabel: string;
  accent: string;
  accentHover: string;
  badge: string;
}> = {
  spotify: {
    label: 'Spotify',
    likesLabel: 'Spotify likes',
    accent: 'bg-green-600',
    accentHover: 'hover:bg-green-500',
    badge: 'bg-green-600',
  },
  soundcloud: {
    label: 'SoundCloud',
    likesLabel: 'SoundCloud likes',
    accent: 'bg-orange-600',
    accentHover: 'hover:bg-orange-500',
    badge: 'bg-orange-600',
  },
};

function parseSource(value: string | null): ImportSource {
  return value === 'soundcloud' ? 'soundcloud' : 'spotify';
}

const LibraryImport: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, refreshUser, handleOAuthCallback } = useAuth();

  const [source, setSource] = useState<ImportSource>(() => parseSource(searchParams.get('source')));
  const [step, setStep] = useState<ImportStep>('connect');
  const [spotifyConnected, setSpotifyConnected] = useState(false);
  const [soundcloudConnected, setSoundcloudConnected] = useState(false);
  const [limit, setLimit] = useState(DEFAULT_SCAN_LIMIT);
  const [showAdvancedLimit, setShowAdvancedLimit] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [items, setItems] = useState<ImportItem[]>([]);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [bulkTip, setBulkTip] = useState('0.11');
  const [tipAmounts, setTipAmounts] = useState<Record<string, string>>({});
  const [executeResult, setExecuteResult] = useState<{
    tipped: number;
    skipped: number;
    failed: number;
    totalSpent: number;
    updatedBalance: number;
  } | null>(null);

  const meta = SOURCE_META[source];
  const isConnected = source === 'spotify' ? spotifyConnected : soundcloudConnected;
  const oauthHandledRef = React.useRef(false);

  const checkConnections = useCallback(async () => {
    try {
      const [spotify, soundcloud] = await Promise.all([
        userAPI.getSpotifyStatus().catch(() => ({ connected: false })),
        userAPI.getSoundCloudStatus().catch(() => ({ connected: false })),
      ]);
      setSpotifyConnected(!!spotify.connected);
      setSoundcloudConnected(!!soundcloud.connected);
    } catch {
      setSpotifyConnected(false);
      setSoundcloudConnected(false);
    }
  }, []);

  useEffect(() => {
    void checkConnections();
  }, [checkConnections]);

  useEffect(() => {
    const urlToken = searchParams.get('token');
    const error = searchParams.get('error');
    const message = searchParams.get('message');

    if (error) {
      toast.error(decodeURIComponent(message || 'Connection failed'));
      const next = new URLSearchParams(searchParams);
      next.delete('error');
      next.delete('message');
      setSearchParams(next, { replace: true });
      return;
    }

    if (!urlToken || !handleOAuthCallback || oauthHandledRef.current) return;
    oauthHandledRef.current = true;

    handleOAuthCallback(urlToken)
      .then(async () => {
        await refreshUser?.();
        await checkConnections();
        const next = new URLSearchParams(searchParams);
        next.delete('token');
        next.delete('oauth_success');
        setSearchParams(next, { replace: true });
        toast.success('Account connected — ready to scan your likes');
      })
      .catch(() => {
        oauthHandledRef.current = false;
        toast.error('Failed to complete account connection');
        const next = new URLSearchParams(searchParams);
        next.delete('token');
        setSearchParams(next, { replace: true });
      });
  }, [searchParams, handleOAuthCallback, refreshUser, checkConnections, setSearchParams]);

  useEffect(() => {
    const fromQuery = parseSource(searchParams.get('source'));
    if (fromQuery !== source) setSource(fromQuery);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync URL → state only
  }, [searchParams]);

  const resetScanState = () => {
    setItems([]);
    setSummary(null);
    setExecuteResult(null);
    setTipAmounts({});
  };

  const selectSource = (next: ImportSource) => {
    setSource(next);
    setStep('connect');
    resetScanState();
    const params = new URLSearchParams(searchParams);
    params.set('source', next);
    setSearchParams(params, { replace: true });
  };

  const connectSource = () => {
    const token = localStorage.getItem('token') || undefined;
    const returnPath = `/import?source=${source}`;
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

  const scanLikes = async (scanLimit = limit) => {
    if (!isConnected) {
      connectSource();
      return;
    }
    setIsLoading(true);
    try {
      const capped = Math.min(MAX_SCAN_LIMIT, Math.max(1, scanLimit));
      const data = source === 'soundcloud'
        ? await userAPI.previewSoundCloudImport(capped)
        : await userAPI.previewSpotifyImport(capped);
      setItems(data.items || []);
      setSummary(data.summary || null);
      setTipAmounts({});
      setBulkTip(String(data.summary?.defaultTip ?? user?.preferences?.defaultTip ?? 0.11));
      setStep('summary');
    } catch (error: any) {
      const message = error?.response?.data?.error || error?.message || `Failed to scan ${meta.likesLabel}`;
      const needsReauth =
        error?.response?.data?.code === 'PROVIDER_REAUTH_REQUIRED' ||
        /reconnect|token expired/i.test(message);

      toast.error(message);
      if (needsReauth) {
        if (source === 'spotify') setSpotifyConnected(false);
        else setSoundcloudConnected(false);
        toast.info(`Reconnect ${meta.label} to continue`);
        setTimeout(() => connectSource(), 400);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const tipAmount = useMemo(() => {
    const parsed = parseFloat(bulkTip);
    return Number.isFinite(parsed) && parsed >= 0.01 ? parsed : 0.11;
  }, [bulkTip]);

  const selectableItems = useMemo(
    () => items.filter((i) => i.matchStatus !== 'in_library'),
    [items]
  );

  const selectedItems = useMemo(
    () => items.filter((i) => i.selected && i.matchStatus !== 'in_library'),
    [items]
  );

  const possibleMatchCount = summary?.possibleMatches
    ?? items.filter((i) => i.matchStatus === 'possible_match').length;

  const onCatalogCount = summary?.onCatalog
    ?? items.filter((i) => i.matchStatus === 'on_catalog').length;

  const newTrackCount = summary?.newTracks
    ?? items.filter((i) => i.matchStatus === 'new').length;

  const actionableCount = selectableItems.length;

  const userBalance = summary?.userBalance ?? (user?.balance != null ? penceToPoundsNumber(user.balance) : 0);

  const fullImportCost = actionableCount * tipAmount;
  const affordableCount = tipAmount > 0
    ? Math.min(actionableCount, Math.floor((userBalance + 0.0001) / tipAmount))
    : 0;
  const affordableCost = affordableCount * tipAmount;
  const canAffordAll = fullImportCost <= userBalance + 0.0001;

  const totalCost = useMemo(() => {
    return selectedItems.reduce((sum, item) => {
      const raw = tipAmounts[item.key] ?? bulkTip;
      const amount = parseFloat(raw);
      return sum + (Number.isFinite(amount) ? amount : 0);
    }, 0);
  }, [selectedItems, tipAmounts, bulkTip]);

  const canAffordSelected = totalCost <= userBalance + 0.0001;

  const toggleAll = (selected: boolean) => {
    setItems((prev) => prev.map((i) => ({
      ...i,
      selected: i.matchStatus === 'in_library' ? false : selected,
    })));
  };

  const selectAffordable = () => {
    let remaining = userBalance;
    const nextTips = { ...tipAmounts };
    setItems((prev) => prev.map((item) => {
      if (item.matchStatus === 'in_library') {
        return { ...item, selected: false };
      }
      const tip = parseFloat(nextTips[item.key] ?? bulkTip);
      const amount = Number.isFinite(tip) && tip >= 0.01 ? tip : 0.11;
      if (amount <= remaining + 0.0001) {
        remaining -= amount;
        return { ...item, selected: true };
      }
      return { ...item, selected: false };
    }));
    toast.success('Selected tracks that fit your balance');
  };

  const prepareAffordableSelection = () => {
    let remaining = userBalance;
    setItems((prev) => prev.map((item) => {
      if (item.matchStatus === 'in_library') {
        return { ...item, selected: false };
      }
      const amount = tipAmount;
      if (amount <= remaining + 0.0001) {
        remaining -= amount;
        return { ...item, selected: true };
      }
      return { ...item, selected: false };
    }));
    setTipAmounts({});
  };

  const syncTipToTargets = (rawAmount: string, targets: ImportItem[]) => {
    const amount = parseFloat(rawAmount);
    if (!Number.isFinite(amount) || amount < 0.01) return null;
    const formatted = amount.toFixed(2);
    setBulkTip(formatted);
    setTipAmounts((prev) => {
      const next = { ...prev };
      targets.forEach((item) => {
        next[item.key] = formatted;
      });
      return next;
    });
    return { formatted, count: targets.length, total: amount * targets.length };
  };

  const applyBulkTip = () => {
    const targets = items.filter((i) => i.selected && i.matchStatus !== 'in_library');
    if (targets.length === 0) {
      toast.error('Select at least one track first');
      return;
    }
    const result = syncTipToTargets(bulkTip, targets);
    if (!result) {
      toast.error('Enter a valid tip amount (min £0.01)');
      return;
    }
    toast.success(
      `Set ${result.count} track${result.count === 1 ? '' : 's'} to £${result.formatted} (total £${result.total.toFixed(2)})`
    );
  };

  const handleBulkTipChange = (value: string) => {
    setBulkTip(value);
    const targets = items.filter((i) => i.selected && i.matchStatus !== 'in_library');
    if (targets.length === 0) return;
    setTipAmounts((prev) => {
      const next = { ...prev };
      targets.forEach((item) => {
        next[item.key] = value;
      });
      return next;
    });
  };

  const handleExecute = async () => {
    if (selectedItems.length === 0) {
      toast.error('Select at least one track');
      return;
    }
    if (!canAffordSelected) {
      toast.error('Insufficient balance — top up your wallet first');
      return;
    }

    setIsExecuting(true);
    try {
      const payload = selectedItems.map((item) => ({
        key: item.key,
        title: item.title,
        selected: true,
        mediaId: item.mediaId || undefined,
        matchStatus: item.matchStatus,
        useSuggestedMatch: item.matchStatus === 'possible_match' ? !!item.useSuggestedMatch : undefined,
        amount: parseFloat(tipAmounts[item.key] ?? bulkTip),
        externalMedia: item.externalMedia,
        skipIfInLibrary: true,
      }));

      const result = source === 'soundcloud'
        ? await userAPI.executeSoundCloudImport(payload, parseFloat(bulkTip))
        : await userAPI.executeSpotifyImport(payload, parseFloat(bulkTip));
      setExecuteResult({
        tipped: result.tipped,
        skipped: result.skipped,
        failed: result.failed,
        totalSpent: result.totalSpent,
        updatedBalance: result.updatedBalance,
      });
      setStep('done');
      if (refreshUser) await refreshUser();
      toast.success(`Imported ${result.tipped} track(s) — £${result.totalSpent.toFixed(2)} spent`);
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Import failed');
    } finally {
      setIsExecuting(false);
    }
  };

  const importFromSummary = async (mode: 'all' | 'affordable') => {
    if (actionableCount === 0) {
      toast.info('Nothing new to import — everything scanned is already in your library');
      return;
    }
    if (mode === 'all' && !canAffordAll) {
      toast.error('Insufficient balance for the full scan — try “Import what I can afford”');
      return;
    }
    if (mode === 'affordable' && affordableCount === 0) {
      toast.error('Your balance is too low for even one tip — top up your wallet');
      return;
    }

    if (mode === 'affordable') {
      prepareAffordableSelection();
    } else {
      toggleAll(true);
      setTipAmounts({});
    }

    // Allow state to flush before reading selected via a local payload
    const tip = tipAmount;
    let remaining = mode === 'affordable' ? userBalance : Number.POSITIVE_INFINITY;
    const payloadItems = items
      .filter((i) => i.matchStatus !== 'in_library')
      .filter(() => {
        if (mode === 'all') return true;
        if (tip <= remaining + 0.0001) {
          remaining -= tip;
          return true;
        }
        return false;
      })
      .map((item) => ({
        key: item.key,
        title: item.title,
        selected: true,
        mediaId: item.mediaId || undefined,
        matchStatus: item.matchStatus,
        useSuggestedMatch: item.matchStatus === 'possible_match' ? !!item.useSuggestedMatch : undefined,
        amount: tip,
        externalMedia: item.externalMedia,
        skipIfInLibrary: true,
      }));

    if (payloadItems.length === 0) {
      toast.error('No tracks to import');
      return;
    }

    setIsExecuting(true);
    try {
      const result = source === 'soundcloud'
        ? await userAPI.executeSoundCloudImport(payloadItems, tip)
        : await userAPI.executeSpotifyImport(payloadItems, tip);
      setExecuteResult({
        tipped: result.tipped,
        skipped: result.skipped,
        failed: result.failed,
        totalSpent: result.totalSpent,
        updatedBalance: result.updatedBalance,
      });
      setStep('done');
      if (refreshUser) await refreshUser();
      toast.success(`Imported ${result.tipped} track(s) — £${result.totalSpent.toFixed(2)} spent`);
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Import failed');
    } finally {
      setIsExecuting(false);
    }
  };

  const formatDuration = (sec?: number) => {
    if (!sec) return '';
    const m = Math.floor(sec / 60);
    const s = Math.round(sec % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  const stepLabel = (() => {
    if (step === 'connect') return 'Connect & scan';
    if (step === 'summary') return 'Scan results';
    if (step === 'review') return 'Review tracks';
    return 'Done';
  })();

  return (
    <div className="min-h-screen bg-gray-900 text-white pb-40">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <button
          type="button"
          onClick={() => {
            if (step === 'review') setStep('summary');
            else if (step === 'summary') setStep('connect');
            else navigate(-1);
          }}
          className="flex items-center gap-2 text-gray-400 hover:text-white mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>

        <div className="mb-8">
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <Sparkles className="w-8 h-8 text-purple-400" />
            Import &amp; Support
          </h1>
          <p className="text-gray-400 mt-2 max-w-2xl">
            Scan your likes, see what&apos;s already on Tuneable, then tip to add the rest to your library.
          </p>
          <p className="text-xs text-gray-500 mt-2 uppercase tracking-wide">{stepLabel}</p>
        </div>

        {step === 'connect' && (
          <div className="space-y-4">
            <div className="flex gap-2">
              {(['spotify', 'soundcloud'] as ImportSource[]).map((s) => {
                const sMeta = SOURCE_META[s];
                const connected = s === 'spotify' ? spotifyConnected : soundcloudConnected;
                const active = source === s;
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => selectSource(s)}
                    className={`flex-1 rounded-xl border px-4 py-3 text-left transition-colors ${
                      active
                        ? 'border-purple-500 bg-gray-800'
                        : 'border-gray-700 bg-gray-800/50 hover:border-gray-500'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-full ${sMeta.badge} flex items-center justify-center`}>
                        <Music className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="font-semibold">{sMeta.label}</div>
                        <div className="text-xs text-gray-400">
                          {connected ? 'Connected' : 'Not connected'}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="bg-gray-800 rounded-xl p-8 border border-gray-700">
              <div className="flex items-center gap-4 mb-6">
                <div className={`w-14 h-14 rounded-full ${meta.badge} flex items-center justify-center`}>
                  <Music className="w-7 h-7" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold">{meta.likesLabel}</h2>
                  <p className="text-gray-400 text-sm">
                    {isConnected
                      ? 'We\'ll match against the Tuneable catalog and skip mixes/sets'
                      : `Connect ${meta.label} to scan your likes`}
                  </p>
                </div>
              </div>

              {!isConnected ? (
                <button
                  type="button"
                  onClick={connectSource}
                  className={`w-full py-3 ${meta.accent} ${meta.accentHover} rounded-lg font-medium`}
                >
                  Connect {meta.label}
                </button>
              ) : (
                <div className="space-y-3">
                  <button
                    type="button"
                    onClick={() => void scanLikes(DEFAULT_SCAN_LIMIT)}
                    disabled={isLoading}
                    className="w-full py-3 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 rounded-lg font-medium flex items-center justify-center gap-2"
                  >
                    {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Search className="w-5 h-5" />}
                    {isLoading ? 'Scanning…' : `Scan ${meta.label} likes`}
                  </button>
                  <p className="text-xs text-gray-500 text-center">
                    Scans your latest {DEFAULT_SCAN_LIMIT} likes by default
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {step === 'summary' && summary && (
          <div className="space-y-6">
            <div className="text-sm text-gray-400">
              Source: <span className="text-white font-medium">{meta.label}</span>
              {typeof summary.scanned === 'number' ? (
                <span> · scanned {summary.scanned}</span>
              ) : (
                <span> · scanned {summary.total + (summary.skippedMixes || 0)}</span>
              )}
              {typeof summary.skippedMixes === 'number' && summary.skippedMixes > 0 ? (
                <span className="ml-1 text-amber-300/90">
                  · skipped {summary.skippedMixes} mix{summary.skippedMixes === 1 ? '' : 'es'}/set
                </span>
              ) : null}
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                <div className="text-2xl font-bold text-green-300">{summary.inLibrary}</div>
                <div className="text-xs text-gray-400 mt-1">Already supported</div>
              </div>
              <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                <div className="text-2xl font-bold text-blue-300">{onCatalogCount}</div>
                <div className="text-xs text-gray-400 mt-1">Exact catalog matches</div>
              </div>
              <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                <div className="text-2xl font-bold text-amber-300">{possibleMatchCount}</div>
                <div className="text-xs text-gray-400 mt-1">Possible matches</div>
              </div>
              <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                <div className="text-2xl font-bold text-purple-300">{newTrackCount}</div>
                <div className="text-xs text-gray-400 mt-1">New to Tuneable</div>
              </div>
            </div>

            <div className="bg-gray-800 rounded-xl border border-gray-700 p-6 space-y-5">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Default tip per track</label>
                  <div className="flex items-center gap-2">
                    <span className="text-gray-400">£</span>
                    <input
                      type="number"
                      min={0.01}
                      step={0.01}
                      value={bulkTip}
                      onChange={(e) => setBulkTip(e.target.value)}
                      className="w-24 bg-gray-900 border border-gray-600 rounded px-2 py-1"
                    />
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm text-gray-400">Your balance</div>
                  <div className="text-xl font-semibold text-yellow-300">£{userBalance.toFixed(2)}</div>
                </div>
              </div>

              <div className="border-t border-gray-700 pt-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">
                    {actionableCount} track{actionableCount === 1 ? '' : 's'} to add
                  </span>
                  <span className="text-white font-medium">£{fullImportCost.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">You can afford</span>
                  <span className={affordableCount < actionableCount ? 'text-amber-300' : 'text-green-300'}>
                    {affordableCount} of {actionableCount}
                    {affordableCount > 0 ? ` (£${affordableCost.toFixed(2)})` : ''}
                  </span>
                </div>
                {!canAffordAll && actionableCount > 0 && (
                  <div className="text-sm text-red-400 flex items-center gap-1 pt-1">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    <span>
                      Need £{(fullImportCost - userBalance).toFixed(2)} more for everything —{' '}
                      <Link to="/wallet" className="underline">top up wallet</Link>
                    </span>
                  </div>
                )}
                {actionableCount === 0 && (
                  <p className="text-sm text-green-300">
                    All scanned likes are already in your library. Nothing to tip.
                  </p>
                )}
              </div>

              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                {actionableCount > 0 && (
                  <>
                    <button
                      type="button"
                      onClick={() => void importFromSummary(canAffordAll ? 'all' : 'affordable')}
                      disabled={isExecuting || (!canAffordAll && affordableCount === 0)}
                      className="flex-1 px-4 py-3 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 rounded-lg font-medium flex items-center justify-center gap-2"
                    >
                      {isExecuting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Coins className="w-5 h-5" />}
                      {canAffordAll
                        ? `Import & tip all · £${fullImportCost.toFixed(2)}`
                        : `Import what I can afford · £${affordableCost.toFixed(2)}`}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (!canAffordAll) prepareAffordableSelection();
                        else toggleAll(true);
                        setStep('review');
                      }}
                      className="px-4 py-3 bg-gray-700 hover:bg-gray-600 rounded-lg font-medium"
                    >
                      Review tracks
                      {possibleMatchCount > 0 ? ` (${possibleMatchCount} possible)` : ''}
                    </button>
                  </>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
              <button
                type="button"
                onClick={() => setShowAdvancedLimit((v) => !v)}
                className="text-gray-400 hover:text-white underline"
              >
                {showAdvancedLimit ? 'Hide scan options' : 'Scan more / change limit'}
              </button>
              <button
                type="button"
                onClick={() => setStep('connect')}
                className="text-gray-400 hover:text-white"
              >
                Change source
              </button>
            </div>

            {showAdvancedLimit && (
              <div className="bg-gray-800/80 border border-gray-700 rounded-lg p-4 flex flex-wrap items-end gap-3">
                <label className="text-sm text-gray-400">
                  Likes to scan (max {MAX_SCAN_LIMIT})
                  <input
                    type="number"
                    min={1}
                    max={MAX_SCAN_LIMIT}
                    value={limit}
                    onChange={(e) => setLimit(Math.min(MAX_SCAN_LIMIT, Math.max(1, parseInt(e.target.value, 10) || DEFAULT_SCAN_LIMIT)))}
                    className="mt-1 block w-32 bg-gray-900 border border-gray-600 rounded px-2 py-1 text-white"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => void scanLikes(limit)}
                  disabled={isLoading}
                  className="px-4 py-2 bg-purple-700 hover:bg-purple-600 disabled:opacity-50 rounded-lg flex items-center gap-2"
                >
                  {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                  Rescan
                </button>
              </div>
            )}
          </div>
        )}

        {step === 'review' && summary && (
          <>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-sm text-gray-400">
              <div>
                Source: <span className="text-white font-medium">{meta.label}</span>
                {' · '}
                <button type="button" onClick={() => setStep('summary')} className="text-purple-300 hover:underline">
                  Back to summary
                </button>
              </div>
              {possibleMatchCount > 0 ? (
                <span className="text-amber-300">{possibleMatchCount} possible match{possibleMatchCount === 1 ? '' : 'es'} to confirm</span>
              ) : null}
            </div>

            <div className="bg-gray-800 rounded-xl p-4 border border-gray-700 mb-4 flex flex-wrap gap-4 items-end justify-between">
              <div>
                <label className="text-xs text-gray-400 block mb-1">Default tip for selection</label>
                <div className="flex items-center gap-2">
                  <span className="text-gray-400">£</span>
                  <input
                    type="number"
                    min={0.01}
                    step={0.01}
                    value={bulkTip}
                    onChange={(e) => handleBulkTipChange(e.target.value)}
                    className="w-24 bg-gray-900 border border-gray-600 rounded px-2 py-1"
                  />
                  <button
                    type="button"
                    onClick={applyBulkTip}
                    className="text-sm px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded"
                  >
                    Apply to selected
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap gap-3 text-sm items-center">
                <button type="button" onClick={() => toggleAll(true)} className="text-purple-400 hover:underline">
                  Select all
                </button>
                <button type="button" onClick={() => toggleAll(false)} className="text-gray-400 hover:underline">
                  Clear
                </button>
                <button type="button" onClick={selectAffordable} className="text-yellow-300 hover:underline">
                  Select what I can afford
                </button>
              </div>
              <div className="w-full flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-gray-700">
                <div>
                  <div className="text-sm text-gray-400">
                    {selectedItems.length} track{selectedItems.length !== 1 ? 's' : ''} selected
                  </div>
                  <div className="text-xl font-bold flex items-center gap-2">
                    <Coins className="w-5 h-5 text-yellow-400" />
                    £{totalCost.toFixed(2)}
                  </div>
                  {!canAffordSelected && (
                    <div className="text-sm text-red-400 flex items-center gap-1 mt-1">
                      <AlertCircle className="w-4 h-4" />
                      Need £{(totalCost - userBalance).toFixed(2)} more —{' '}
                      <Link to="/wallet" className="underline">top up wallet</Link>
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => void handleExecute()}
                  disabled={isExecuting || selectedItems.length === 0 || !canAffordSelected}
                  className="px-6 py-2.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 rounded-lg font-medium flex items-center gap-2"
                >
                  {isExecuting ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
                  Import &amp; tip £{totalCost.toFixed(2)}
                </button>
              </div>
            </div>

            <div className="space-y-2 mb-8 max-h-[45vh] overflow-y-auto pr-1">
              {items.map((item) => (
                <div
                  key={item.key}
                  className={`flex items-center gap-3 p-3 rounded-lg border ${
                    item.matchStatus === 'in_library'
                      ? 'bg-gray-800/50 border-gray-700 opacity-60'
                      : item.selected
                        ? 'bg-gray-800 border-purple-700'
                        : 'bg-gray-800 border-gray-700'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={item.selected && item.matchStatus !== 'in_library'}
                    disabled={item.matchStatus === 'in_library'}
                    onChange={(e) => {
                      setItems((prev) => prev.map((i) => (
                        i.key === item.key ? { ...i, selected: e.target.checked } : i
                      )));
                    }}
                    className="w-4 h-4"
                  />
                  <img
                    src={item.coverArt || DEFAULT_PROFILE_PIC}
                    alt=""
                    className="w-12 h-12 rounded object-cover flex-shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{item.title}</div>
                    <div className="text-sm text-gray-400 truncate">{item.artist}</div>
                    <div className="flex flex-wrap gap-1 mt-1">
                      <span className={`text-xs px-2 py-0.5 rounded border ${STATUS_COLORS[item.matchStatus]}`}>
                        {STATUS_LABELS[item.matchStatus]}
                      </span>
                      {!item.isPlayable && item.matchStatus !== 'in_library' && (
                        <span className="text-xs px-2 py-0.5 rounded border bg-amber-900/30 text-amber-200 border-amber-700">
                          Awaiting audio
                        </span>
                      )}
                      {item.isPlayable && (
                        <span className="text-xs px-2 py-0.5 rounded border bg-emerald-900/30 text-emerald-200 border-emerald-700">
                          Playable
                        </span>
                      )}
                    </div>
                    {item.matchStatus === 'possible_match' && (
                      <div className="mt-2 text-xs text-amber-100/90 space-y-1.5">
                        <div>
                          Suggested: <span className="text-white font-medium">{item.suggestedTitle}</span>
                          {item.suggestedArtist ? (
                            <span className="text-gray-400"> by {item.suggestedArtist}</span>
                          ) : null}
                          {item.matchType ? (
                            <span className="text-gray-500"> · {item.matchType}</span>
                          ) : null}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setItems((prev) => prev.map((i) => (
                                i.key === item.key ? { ...i, useSuggestedMatch: true } : i
                              )));
                            }}
                            className={`px-2 py-0.5 rounded border ${
                              item.useSuggestedMatch !== false
                                ? 'bg-amber-700/50 border-amber-500 text-white'
                                : 'bg-gray-900 border-gray-600 text-gray-300 hover:border-amber-600'
                            }`}
                          >
                            Use match
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setItems((prev) => prev.map((i) => (
                                i.key === item.key ? { ...i, useSuggestedMatch: false } : i
                              )));
                            }}
                            className={`px-2 py-0.5 rounded border ${
                              item.useSuggestedMatch === false
                                ? 'bg-purple-700/50 border-purple-500 text-white'
                                : 'bg-gray-900 border-gray-600 text-gray-300 hover:border-purple-600'
                            }`}
                          >
                            Create as new
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                  {item.matchStatus !== 'in_library' && (
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          const cur = parseFloat(tipAmounts[item.key] ?? bulkTip);
                          setTipAmounts((p) => ({ ...p, [item.key]: Math.max(0.01, cur - 0.01).toFixed(2) }));
                        }}
                        className="p-1 bg-gray-700 rounded"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <input
                        type="number"
                        min={0.01}
                        step={0.01}
                        value={tipAmounts[item.key] ?? bulkTip}
                        onChange={(e) => setTipAmounts((p) => ({ ...p, [item.key]: e.target.value }))}
                        className="w-16 text-center bg-gray-900 border border-gray-600 rounded px-1 py-1 text-sm"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const cur = parseFloat(tipAmounts[item.key] ?? bulkTip);
                          setTipAmounts((p) => ({ ...p, [item.key]: (cur + 0.01).toFixed(2) }));
                        }}
                        className="p-1 bg-gray-700 rounded"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                  {item.duration ? (
                    <span className="text-xs text-gray-500 w-10 text-right">{formatDuration(item.duration)}</span>
                  ) : null}
                </div>
              ))}
            </div>

            <div className="sticky bottom-28 sm:bottom-32 z-40 bg-gray-900/95 border border-gray-700 rounded-xl p-4 backdrop-blur shadow-xl">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <div className="text-sm text-gray-400">
                    {selectedItems.length} track{selectedItems.length !== 1 ? 's' : ''} selected
                  </div>
                  <div className="text-2xl font-bold flex items-center gap-2">
                    <Coins className="w-6 h-6 text-yellow-400" />
                    £{totalCost.toFixed(2)}
                  </div>
                </div>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setStep('summary')}
                    className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg"
                  >
                    Summary
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleExecute()}
                    disabled={isExecuting || selectedItems.length === 0 || !canAffordSelected}
                    className="px-6 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 rounded-lg font-medium flex items-center gap-2"
                  >
                    {isExecuting ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
                    Import &amp; tip £{totalCost.toFixed(2)}
                  </button>
                </div>
              </div>
            </div>
          </>
        )}

        {step === 'done' && executeResult && (
          <div className="bg-gray-800 rounded-xl p-8 border border-gray-700 text-center">
            <CheckCircle2 className="w-16 h-16 text-green-400 mx-auto mb-4" />
            <h2 className="text-2xl font-bold mb-2">Import complete</h2>
            <p className="text-gray-400 mb-6">
              {executeResult.tipped} tipped · {executeResult.skipped} skipped · {executeResult.failed} failed
            </p>
            <div className="text-lg mb-8">
              Spent <strong>£{executeResult.totalSpent.toFixed(2)}</strong>
              {' · '}
              Balance <strong>£{executeResult.updatedBalance.toFixed(2)}</strong>
            </div>
            <div className="flex flex-wrap gap-3 justify-center">
              <button
                type="button"
                onClick={() => {
                  setStep('connect');
                  resetScanState();
                }}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg"
              >
                Scan again
              </button>
              <button
                type="button"
                onClick={() => navigate(user?.uuid ? `/user/${user.uuid}?view=tune-library` : '/dashboard')}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-500 rounded-lg"
              >
                View tune library
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default LibraryImport;
