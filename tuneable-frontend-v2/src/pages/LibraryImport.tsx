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
import { clarifyOAuthErrorMessage } from '../utils/oauthErrorMessage';
import { isAdmin } from '../utils/permissionHelpers';

type ImportSource = 'spotify' | 'soundcloud' | 'rekordbox' | 'youtube';
type ImportStep = 'connect' | 'summary' | 'review' | 'done';
type MatchStatus = 'in_library' | 'on_catalog' | 'possible_match' | 'new';
type IdentityConfidence = 'verified' | 'catalog' | 'likely' | 'unverified';
type TipMode = 'fixed' | 'spread';
type ImportScope = 'all' | 'playable';

const MIN_TIP_POUNDS = 0.01;

/** Divide balance across N tracks (pence floor). Returns null if below min tip. */
function spreadTipPerTrack(balancePounds: number, count: number, minTip = MIN_TIP_POUNDS): number | null {
  if (count <= 0 || balancePounds < minTip) return null;
  const tip = Math.floor((balancePounds * 100) / count) / 100;
  if (tip < minTip) return null;
  return tip;
}

interface ImportItem {
  key: string;
  title: string;
  artist: string;
  coverArt?: string | null;
  duration?: number;
  album?: string | null;
  matchStatus: MatchStatus;
  matchType?: string | null;
  identityConfidence?: IdentityConfidence | null;
  identityConfidenceSource?: string | null;
  crossRefStatus?: string | null;
  crossRefSources?: string[];
  originalTitle?: string | null;
  originalArtist?: string | null;
  mediaId?: string | null;
  mediaUuid?: string | null;
  suggestedTitle?: string | null;
  suggestedArtist?: string | null;
  useSuggestedMatch?: boolean;
  isPlayable: boolean;
  awaitingUpload: boolean;
  bpm?: number | null;
  musicalKey?: string | null;
  hasLocalFile?: boolean;
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
  identityVerified?: number;
  identityUnverified?: number;
  selectedCount: number;
  estimatedTotal: number;
  userBalance: number;
  defaultTip: number;
  skippedMixes?: number;
  skippedUnplayable?: number;
  skippedJunk?: number;
  skippedUnparsed?: number;
  skippedNoMatch?: number;
  skippedUnavailable?: number;
  mbHigh?: number;
  mbMedium?: number;
  playlistTitle?: string;
  scanned?: number;
  playlistCount?: number;
  playlists?: string[];
  localFiles?: number;
  usedFullCollection?: boolean;
  crossRefVerified?: number;
  crossRefWithIsrc?: number;
  crossRefNoIsrc?: number;
}

const DEFAULT_SCAN_LIMIT = 50;
const SCAN_STEP = 50;
const MAX_SCAN_LIMIT = 200;

function importAutoScanStorageKey(source: ImportSource, mode?: string) {
  return `tuneable:import-autoscanned:${source}${mode ? `:${mode}` : ''}`;
}

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

const IDENTITY_LABELS: Record<IdentityConfidence, string> = {
  verified: 'Verified via catalog',
  catalog: 'Exact catalog match',
  likely: 'Likely match',
  unverified: 'Unverified identity',
};

const IDENTITY_COLORS: Record<IdentityConfidence, string> = {
  verified: 'bg-emerald-900/40 text-emerald-200 border-emerald-700',
  catalog: 'bg-blue-900/40 text-blue-200 border-blue-700',
  likely: 'bg-amber-900/40 text-amber-200 border-amber-700',
  unverified: 'bg-gray-800 text-gray-300 border-gray-600',
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
  rekordbox: {
    label: 'Rekordbox',
    likesLabel: 'Rekordbox playlists',
    accent: 'bg-red-600',
    accentHover: 'hover:bg-red-500',
    badge: 'bg-red-600',
  },
  youtube: {
    label: 'YouTube',
    likesLabel: 'YouTube playlist',
    accent: 'bg-red-600',
    accentHover: 'hover:bg-red-500',
    badge: 'bg-red-700',
  },
};

function parseSource(value: string | null): ImportSource {
  if (value === 'soundcloud') return 'soundcloud';
  if (value === 'rekordbox') return 'rekordbox';
  if (value === 'youtube') return 'youtube';
  return 'spotify';
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
  const [progressMessage, setProgressMessage] = useState<string | null>(null);
  const [progressCurrent, setProgressCurrent] = useState(0);
  const [progressTotal, setProgressTotal] = useState(0);
  const [items, setItems] = useState<ImportItem[]>([]);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [bulkTip, setBulkTip] = useState('1.11');
  const [tipMode, setTipMode] = useState<TipMode>('fixed');
  const [tipAmounts, setTipAmounts] = useState<Record<string, string>>({});
  const [executeResult, setExecuteResult] = useState<{
    tipped: number;
    skipped: number;
    failed: number;
    totalSpent: number;
    updatedBalance: number;
  } | null>(null);
  const [rekordboxFile, setRekordboxFile] = useState<File | null>(null);
  const [rekordboxPlaylists, setRekordboxPlaylists] = useState<Array<{
    name: string;
    fullPath: string;
    trackCount: number;
    missingFiles: number;
    localFiles: number;
  }>>([]);
  const [selectedPlaylistPaths, setSelectedPlaylistPaths] = useState<string[]>([]);
  const [rekordboxTrackCount, setRekordboxTrackCount] = useState(0);
  const [isParsingXml, setIsParsingXml] = useState(false);
  const rekordboxFileInputRef = React.useRef<HTMLInputElement>(null);
  const [youtubePlaylistUrl, setYoutubePlaylistUrl] = useState('');
  const [spotifyOauthAvailable, setSpotifyOauthAvailable] = useState(false);
  const [spotifyRequest, setSpotifyRequest] = useState<{
    status: 'pending' | 'allowlisted' | 'rejected';
    spotifyAccount?: string | null;
  } | null>(null);
  const [spotifyAccountInput, setSpotifyAccountInput] = useState('');
  const [spotifyRequestNote, setSpotifyRequestNote] = useState('');
  const [spotifyRequestSubmitting, setSpotifyRequestSubmitting] = useState(false);

  const adminUser = isAdmin(user);
  const meta = SOURCE_META[source];
  const isRekordbox = source === 'rekordbox';
  const isYouTube = source === 'youtube';
  const isConnected = source === 'spotify'
    ? spotifyConnected
    : source === 'soundcloud'
      ? soundcloudConnected
      : true;
  const oauthHandledRef = React.useRef(false);
  const autoScanStartedRef = React.useRef(false);
  const [shouldAutoScan, setShouldAutoScan] = useState(
    () => searchParams.get('autoScan') === '1' || searchParams.get('oauth_success') === 'true'
  );

  const checkConnections = useCallback(async () => {
    try {
      const [spotify, soundcloud] = await Promise.all([
        userAPI.getSpotifyStatus().catch(
          (): Awaited<ReturnType<typeof userAPI.getSpotifyStatus>> => ({
            connected: false,
          })
        ),
        userAPI.getSoundCloudStatus().catch(() => ({ connected: false })),
      ]);
      const next = {
        spotify: !!spotify.connected,
        soundcloud: !!soundcloud.connected,
      };
      setSpotifyConnected(next.spotify);
      setSoundcloudConnected(next.soundcloud);
      setSpotifyOauthAvailable(Boolean(spotify.oauthAvailable) || next.spotify);
      setSpotifyRequest(spotify.request || null);
      return next;
    } catch {
      setSpotifyConnected(false);
      setSoundcloudConnected(false);
      return { spotify: false, soundcloud: false };
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
      toast.error(
        clarifyOAuthErrorMessage(message, 'Connection failed. Please try again.'),
        { autoClose: 12000, pauseOnHover: true }
      );
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
        if (!next.get('autoScan')) next.set('autoScan', '1');
        setSearchParams(next, { replace: true });
        setShouldAutoScan(true);
        toast.success('Account connected — scanning your likes');
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
    setTipMode('fixed');
    setProgressMessage(null);
    setProgressCurrent(0);
    setProgressTotal(0);
  };

  const resetRekordboxState = () => {
    setRekordboxFile(null);
    setRekordboxPlaylists([]);
    setSelectedPlaylistPaths([]);
    setRekordboxTrackCount(0);
    if (rekordboxFileInputRef.current) rekordboxFileInputRef.current.value = '';
  };

  const applyJobProgress = useCallback((job: {
    message?: string;
    current?: number;
    total?: number;
    partial?: {
      tipped?: number;
      skipped?: number;
      failed?: number;
      totalSpentPence?: number;
    } | null;
  }) => {
    setProgressMessage(job.message || null);
    setProgressCurrent(job.current || 0);
    setProgressTotal(job.total || 0);
  }, []);

  const selectSource = (next: ImportSource) => {
    if (next === 'rekordbox' && !adminUser) return;
    setSource(next);
    setStep('connect');
    resetScanState();
    if (next !== 'rekordbox') resetRekordboxState();
    const params = new URLSearchParams(searchParams);
    params.set('source', next);
    if (next === 'youtube') params.set('mode', 'playlist');
    else params.delete('mode');
    setSearchParams(params, { replace: true });
  };

  useEffect(() => {
    if (source === 'rekordbox' && user && !adminUser) {
      toast.error('Rekordbox import is admin-only');
      selectSource('spotify');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, adminUser, user]);

  const connectSource = () => {
    if (source === 'rekordbox' || isYouTube) return;
    try {
      sessionStorage.removeItem(importAutoScanStorageKey(source));
    } catch {
      // ignore
    }
    const token = localStorage.getItem('token') || undefined;
    const returnPath = `/import?source=${source}&autoScan=1`;
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

  const submitSpotifyImportRequest = async () => {
    const account = spotifyAccountInput.trim();
    if (!account) {
      toast.error('Enter the email on your Spotify account (spotify.com/account/overview)');
      return;
    }
    setSpotifyRequestSubmitting(true);
    try {
      const result = await userAPI.requestSpotifyImport(account, spotifyRequestNote.trim() || undefined);
      toast.success(result.message);
      await checkConnections();
    } catch (error: any) {
      toast.error(error?.response?.data?.error || error?.message || 'Failed to submit request');
    } finally {
      setSpotifyRequestSubmitting(false);
    }
  };

  const loadRekordboxPlaylists = async (file: File) => {
    setIsParsingXml(true);
    setRekordboxFile(file);
    setRekordboxPlaylists([]);
    setSelectedPlaylistPaths([]);
    try {
      const data = await userAPI.listRekordboxPlaylists(file);
      setRekordboxTrackCount(data.trackCount || 0);
      setRekordboxPlaylists(data.playlists || []);
      if ((data.playlists || []).length === 1) {
        setSelectedPlaylistPaths([data.playlists[0].fullPath || data.playlists[0].name]);
      }
      toast.success(`Loaded ${data.playlistCount} playlist${data.playlistCount === 1 ? '' : 's'} (${data.trackCount} tracks)`);
    } catch (error: any) {
      setRekordboxFile(null);
      toast.error(error?.response?.data?.error || error?.message || 'Failed to parse Rekordbox XML');
    } finally {
      setIsParsingXml(false);
    }
  };

  const scanLikes = async (scanLimit = limit) => {
    if (source === 'rekordbox') {
      if (!rekordboxFile) {
        toast.error('Upload a Rekordbox XML export first');
        return;
      }
      setIsLoading(true);
      setProgressMessage('Starting Rekordbox scan…');
      setProgressCurrent(0);
      setProgressTotal(0);
      try {
        const started = await userAPI.startRekordboxImportPreview(
          rekordboxFile,
          selectedPlaylistPaths
        );
        const data = await userAPI.waitForImportJob(started.jobId, applyJobProgress, {
          timeoutMs: 60 * 60 * 1000,
        });
        setItems(data.items || []);
        setSummary(data.summary || null);
        setTipAmounts({});
        setTipMode('fixed');
        setBulkTip(String(data.summary?.defaultTip ?? user?.preferences?.defaultTip ?? 1.11));
        setStep('summary');
      } catch (error: any) {
        toast.error(error?.response?.data?.error || error?.message || 'Failed to scan Rekordbox playlists');
      } finally {
        setIsLoading(false);
        setProgressMessage(null);
        setProgressCurrent(0);
        setProgressTotal(0);
      }
      return;
    }

    if (source === 'youtube') {
      const playlistUrl = youtubePlaylistUrl.trim();
      if (!playlistUrl) {
        toast.error('Paste a public YouTube playlist URL');
        return;
      }
      setIsLoading(true);
      setProgressMessage('Starting YouTube playlist scan…');
      setProgressCurrent(0);
      setProgressTotal(0);
      try {
        const capped = Math.min(MAX_SCAN_LIMIT, Math.max(1, scanLimit));
        setLimit(capped);
        const started = await userAPI.startYouTubeImportPreview(playlistUrl, capped, 'playlist');
        const data = await userAPI.waitForImportJob(started.jobId, applyJobProgress, {
          timeoutMs: 20 * 60 * 1000,
        });
        setItems(data.items || []);
        setSummary(data.summary || null);
        setTipAmounts({});
        setTipMode('fixed');
        setBulkTip(String(data.summary?.defaultTip ?? user?.preferences?.defaultTip ?? 1.11));
        setStep('summary');
      } catch (error: any) {
        toast.error(error?.response?.data?.error || error?.message || 'Failed to scan YouTube playlist');
      } finally {
        setIsLoading(false);
        setProgressMessage(null);
        setProgressCurrent(0);
        setProgressTotal(0);
      }
      return;
    }

    if (!isConnected) {
      connectSource();
      return;
    }
    setIsLoading(true);
    setProgressMessage('Starting scan…');
    setProgressCurrent(0);
    setProgressTotal(0);
    try {
      const capped = Math.min(MAX_SCAN_LIMIT, Math.max(1, scanLimit));
      setLimit(capped);
      const started = source === 'soundcloud'
        ? await userAPI.startSoundCloudImportPreview(capped, 'spotify_only')
        : await userAPI.startSpotifyImportPreview(capped);
      const data = await userAPI.waitForImportJob(started.jobId, applyJobProgress);
      setItems(data.items || []);
      setSummary(data.summary || null);
      setTipAmounts({});
      setTipMode('fixed');
      setBulkTip(String(data.summary?.defaultTip ?? user?.preferences?.defaultTip ?? 1.11));
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
      setProgressMessage(null);
      setProgressCurrent(0);
      setProgressTotal(0);
    }
  };

  useEffect(() => {
    if (!shouldAutoScan || !isConnected || step !== 'connect' || isRekordbox || isYouTube) return;
    if (autoScanStartedRef.current || isLoading) return;
    try {
      if (sessionStorage.getItem(importAutoScanStorageKey(source))) return;
      sessionStorage.setItem(importAutoScanStorageKey(source), '1');
    } catch {
      // Private mode — fall through with the in-memory ref only
    }
    autoScanStartedRef.current = true;
    setShouldAutoScan(false);
    const next = new URLSearchParams(searchParams);
    if (next.has('autoScan') || next.has('oauth_success') || next.has('token')) {
      next.delete('autoScan');
      next.delete('oauth_success');
      next.delete('token');
      setSearchParams(next, { replace: true });
    }
    void scanLikes(DEFAULT_SCAN_LIMIT);
    // scanLikes is recreated each render; autoScanStartedRef prevents a loop
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldAutoScan, isConnected, step, isRekordbox, isYouTube, isLoading, source]);

  const runExecuteJob = async (payload: Array<Record<string, unknown>>, tip: number) => {
    setIsExecuting(true);
    setProgressMessage('Starting import…');
    setProgressCurrent(0);
    setProgressTotal(payload.length);
    try {
      const started = source === 'rekordbox'
        ? await userAPI.startRekordboxImportExecute(payload, tip)
        : source === 'soundcloud'
          ? await userAPI.startSoundCloudImportExecute(payload, tip)
          : source === 'youtube'
            ? await userAPI.startYouTubeImportExecute(payload, tip)
          : await userAPI.startSpotifyImportExecute(payload, tip);
      const result = await userAPI.waitForImportJob<{
        tipped: number;
        skipped: number;
        failed: number;
        totalSpent: number;
        updatedBalance: number;
      }>(started.jobId, applyJobProgress, source === 'rekordbox' ? { timeoutMs: 60 * 60 * 1000 } : undefined);
      setExecuteResult({
        tipped: result.tipped,
        skipped: result.skipped,
        failed: result.failed,
        totalSpent: result.totalSpent,
        updatedBalance: result.updatedBalance,
      });
      setStep('done');
      if (refreshUser) await refreshUser();
      toast.success(`Imported ${result.tipped} track(s) — £${Number(result.totalSpent).toFixed(2)} spent`);
    } catch (error: any) {
      toast.error(error?.response?.data?.error || error?.message || 'Import failed');
    } finally {
      setIsExecuting(false);
      setProgressMessage(null);
      setProgressCurrent(0);
      setProgressTotal(0);
    }
  };

  const tipAmount = useMemo(() => {
    const parsed = parseFloat(bulkTip);
    return Number.isFinite(parsed) && parsed >= MIN_TIP_POUNDS ? parsed : 1.11;
  }, [bulkTip]);

  const selectableItems = useMemo(
    () => items.filter((i) => i.matchStatus !== 'in_library'),
    [items]
  );

  const selectedItems = useMemo(
    () => items.filter((i) => i.selected && i.matchStatus !== 'in_library'),
    [items]
  );

  const playableItems = useMemo(
    () => selectableItems.filter((i) => i.isPlayable),
    [selectableItems]
  );

  const awaitingItems = useMemo(
    () => selectableItems.filter((i) => !i.isPlayable),
    [selectableItems]
  );

  const possibleMatchCount = summary?.possibleMatches
    ?? items.filter((i) => i.matchStatus === 'possible_match').length;

  const onCatalogCount = summary?.onCatalog
    ?? items.filter((i) => i.matchStatus === 'on_catalog').length;

  const newTrackCount = summary?.newTracks
    ?? items.filter((i) => i.matchStatus === 'new').length;

  const actionableCount = selectableItems.length;
  const playableCount = playableItems.length;
  const awaitingCount = awaitingItems.length;

  const userBalance = summary?.userBalance ?? (user?.balance != null ? penceToPoundsNumber(user.balance) : 0);

  const costForScope = useCallback((scope: ImportScope, mode: TipMode) => {
    const targets = scope === 'playable' ? playableItems : selectableItems;
    const count = targets.length;
    if (count === 0) {
      return {
        count: 0,
        tip: tipAmount,
        total: 0,
        affordableCount: 0,
        canAffordAll: true,
        spreadOk: false,
      };
    }
    if (mode === 'spread') {
      const tip = spreadTipPerTrack(userBalance, count);
      if (tip == null) {
        const affordableCount = Math.floor((userBalance + 0.0001) / MIN_TIP_POUNDS);
        return {
          count,
          tip: MIN_TIP_POUNDS,
          total: 0,
          affordableCount,
          canAffordAll: false,
          spreadOk: false,
        };
      }
      return {
        count,
        tip,
        total: tip * count,
        affordableCount: count,
        canAffordAll: true,
        spreadOk: true,
      };
    }
    const total = count * tipAmount;
    const affordableCount = tipAmount > 0
      ? Math.min(count, Math.floor((userBalance + 0.0001) / tipAmount))
      : 0;
    return {
      count,
      tip: tipAmount,
      total,
      affordableCount,
      canAffordAll: total <= userBalance + 0.0001,
      spreadOk: false,
    };
  }, [playableItems, selectableItems, tipAmount, userBalance]);

  const playableCost = useMemo(() => costForScope('playable', tipMode), [costForScope, tipMode]);
  const allCost = useMemo(() => costForScope('all', tipMode), [costForScope, tipMode]);

  const selectedSpreadTip = useMemo(
    () => (selectedItems.length > 0 ? spreadTipPerTrack(userBalance, selectedItems.length) : null),
    [selectedItems.length, userBalance]
  );

  const totalCost = useMemo(() => {
    if (tipMode === 'spread' && selectedSpreadTip != null) {
      return selectedSpreadTip * selectedItems.length;
    }
    return selectedItems.reduce((sum, item) => {
      const raw = tipAmounts[item.key] ?? bulkTip;
      const amount = parseFloat(raw);
      return sum + (Number.isFinite(amount) ? amount : 0);
    }, 0);
  }, [selectedItems, tipAmounts, bulkTip, tipMode, selectedSpreadTip]);

  const canAffordSelected = totalCost <= userBalance + 0.0001
    && (tipMode !== 'spread' || selectedSpreadTip != null || selectedItems.length === 0);

  const applyTipsToTargets = useCallback((targets: ImportItem[], tip: number) => {
    const formatted = tip.toFixed(2);
    setBulkTip(formatted);
    setTipAmounts((prev) => {
      const next = { ...prev };
      targets.forEach((item) => {
        next[item.key] = formatted;
      });
      return next;
    });
    return formatted;
  }, []);

  const toggleAll = (selected: boolean) => {
    setItems((prev) => prev.map((i) => ({
      ...i,
      selected: i.matchStatus === 'in_library' ? false : selected,
    })));
  };

  const selectPlayable = () => {
    setItems((prev) => prev.map((item) => ({
      ...item,
      selected: item.matchStatus !== 'in_library' && item.isPlayable,
    })));
    toast.success(playableCount > 0
      ? `Selected ${playableCount} playable track${playableCount === 1 ? '' : 's'}`
      : 'No playable tracks in this scan');
  };

  const selectAffordable = () => {
    let remaining = userBalance;
    const tip = tipMode === 'spread' ? MIN_TIP_POUNDS : tipAmount;
    setItems((prev) => prev.map((item) => {
      if (item.matchStatus === 'in_library') {
        return { ...item, selected: false };
      }
      const amount = Number.isFinite(tip) && tip >= MIN_TIP_POUNDS ? tip : 1.11;
      if (amount <= remaining + 0.0001) {
        remaining -= amount;
        return { ...item, selected: true };
      }
      return { ...item, selected: false };
    }));
    toast.success(
      tipMode === 'spread'
        ? 'Selected as many tracks as fit at the minimum tip — then spread balance'
        : 'Selected tracks that fit your balance'
    );
  };

  const syncTipToTargets = (rawAmount: string, targets: ImportItem[]) => {
    const amount = parseFloat(rawAmount);
    if (!Number.isFinite(amount) || amount < MIN_TIP_POUNDS) return null;
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
    setTipMode('fixed');
    const result = syncTipToTargets(bulkTip, targets);
    if (!result) {
      toast.error(`Enter a valid tip amount (min £${MIN_TIP_POUNDS.toFixed(2)})`);
      return;
    }
    toast.success(
      `Set ${result.count} track${result.count === 1 ? '' : 's'} to £${result.formatted} (total £${result.total.toFixed(2)})`
    );
  };

  const handleBulkTipChange = (value: string) => {
    setTipMode('fixed');
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

  const enableSpreadMode = (targets?: ImportItem[], opts?: { silent?: boolean }) => {
    const list = targets ?? selectedItems;
    const tip = spreadTipPerTrack(userBalance, list.length);
    if (tip == null) {
      toast.error(
        list.length === 0
          ? 'Select tracks first'
          : `Balance too low to spread £${MIN_TIP_POUNDS.toFixed(2)}+ across ${list.length} tracks — select fewer or top up`
      );
      return false;
    }
    setTipMode('spread');
    applyTipsToTargets(list, tip);
    if (!opts?.silent) {
      toast.success(`Spreading £${(tip * list.length).toFixed(2)} → £${tip.toFixed(2)} each × ${list.length}`);
    }
    return true;
  };

  // Keep per-track tips in sync while in spread mode
  useEffect(() => {
    if (tipMode !== 'spread') return;
    if (selectedItems.length === 0) return;
    const tip = spreadTipPerTrack(userBalance, selectedItems.length);
    if (tip == null) return;
    const formatted = tip.toFixed(2);
    setBulkTip((prev) => (prev === formatted ? prev : formatted));
    setTipAmounts((prev) => {
      const next = { ...prev };
      let changed = false;
      selectedItems.forEach((item) => {
        if (next[item.key] !== formatted) {
          next[item.key] = formatted;
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [tipMode, selectedItems, userBalance]);

  const handleExecute = async () => {
    if (selectedItems.length === 0) {
      toast.error('Select at least one track');
      return;
    }
    if (source !== 'rekordbox' && selectedItems.length > 100) {
      toast.error('Maximum 100 tracks per import batch — deselect some and import the rest next');
      return;
    }
    if (tipMode === 'spread' && selectedSpreadTip == null) {
      toast.error(`Need at least £${MIN_TIP_POUNDS.toFixed(2)} per track — select fewer or top up`);
      return;
    }
    if (!canAffordSelected) {
      toast.error('Insufficient balance — top up your wallet first');
      return;
    }

    const effectiveTip = tipMode === 'spread' && selectedSpreadTip != null
      ? selectedSpreadTip
      : tipAmount;

    const payload = selectedItems.map((item) => ({
      key: item.key,
      title: item.title,
      selected: true,
      mediaId: item.mediaId || undefined,
      matchStatus: item.matchStatus,
      useSuggestedMatch: item.matchStatus === 'possible_match' ? !!item.useSuggestedMatch : undefined,
      crossRefStatus: item.crossRefStatus || undefined,
      identityConfidence: item.identityConfidence || undefined,
      amount: tipMode === 'spread' && selectedSpreadTip != null
        ? selectedSpreadTip
        : parseFloat(tipAmounts[item.key] ?? bulkTip),
      externalMedia: item.externalMedia,
      skipIfInLibrary: true,
    }));

    await runExecuteJob(payload, effectiveTip);
  };

  const importFromSummary = async (scope: ImportScope) => {
    const cost = costForScope(scope, tipMode);
    if (cost.count === 0) {
      toast.info(
        scope === 'playable'
          ? 'No playable tracks in this scan — try Import all or Review'
          : 'Nothing new to import — everything scanned is already in your library'
      );
      return;
    }

    let tip = cost.tip;
    let targets = scope === 'playable' ? [...playableItems] : [...selectableItems];
    if (isYouTube && scope === 'all') {
      targets = items.filter((i) => i.selected && i.matchStatus !== 'in_library');
    }

    if (tipMode === 'spread') {
      if (!cost.spreadOk) {
        toast.error(
          `Balance too low to spread £${MIN_TIP_POUNDS.toFixed(2)}+ across ${cost.count} tracks — select fewer via Review, or top up`
        );
        return;
      }
    } else if (!cost.canAffordAll) {
      if (cost.affordableCount === 0) {
        toast.error('Your balance is too low for even one tip — top up your wallet');
        return;
      }
      let remaining = userBalance;
      targets = targets.filter(() => {
        if (tip <= remaining + 0.0001) {
          remaining -= tip;
          return true;
        }
        return false;
      });
      toast.info(`Importing ${targets.length} of ${cost.count} at £${tip.toFixed(2)} each (balance limit)`);
    }

    const targetKeys = new Set(targets.map((t) => t.key));
    setItems((prev) => prev.map((item) => ({
      ...item,
      selected: targetKeys.has(item.key),
    })));
    applyTipsToTargets(targets, tip);

    if (source !== 'rekordbox' && targets.length > 100) {
      toast.error('Maximum 100 tracks per import batch — deselect some via Review');
      return;
    }

    const payloadItems = targets.map((item) => ({
      key: item.key,
      title: item.title,
      selected: true,
      mediaId: item.mediaId || undefined,
      matchStatus: item.matchStatus,
      useSuggestedMatch: item.matchStatus === 'possible_match' ? !!item.useSuggestedMatch : undefined,
      crossRefStatus: item.crossRefStatus || undefined,
      identityConfidence: item.identityConfidence || undefined,
      amount: tip,
      externalMedia: item.externalMedia,
      skipIfInLibrary: true,
    }));

    if (payloadItems.length === 0) {
      toast.error('No tracks to import');
      return;
    }

    await runExecuteJob(payloadItems, tip);
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
            {isRekordbox
              ? 'Admin: upload a Rekordbox XML export, pick playlists, then tip catalog entries into your library. Audio is not uploaded.'
              : isYouTube
                ? 'Paste a public YouTube playlist URL. Confident MusicBrainz matches are ready to import; weaker ones need a quick confirm.'
                : 'Scan your likes, see what\'s playable vs awaiting audio, then tip to add them to your library.'}
          </p>
          {source === 'spotify' ? (
            <p className="text-sm text-gray-500 mt-2 max-w-2xl">
              Tuneable only reads your likes. We cannot change your Spotify library, playlists, or playback.
            </p>
          ) : null}
          <p className="text-xs text-gray-500 mt-2 uppercase tracking-wide">{stepLabel}</p>
        </div>

        {step === 'connect' && (
          <div className="space-y-4">
            <div className="flex gap-2 flex-wrap">
              {(['spotify', 'soundcloud', 'youtube'] as ImportSource[]).map((s) => {
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
                          {s === 'youtube'
                            ? 'Public playlist'
                            : connected ? 'Connected' : 'Not connected'}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
            {adminUser ? (
              <button
                type="button"
                onClick={() => selectSource('rekordbox')}
                className={`w-full rounded-xl border px-4 py-3 text-left transition-colors ${
                  source === 'rekordbox'
                    ? 'border-red-500 bg-gray-800'
                    : 'border-gray-700 bg-gray-800/50 hover:border-gray-500'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-full ${SOURCE_META.rekordbox.badge} flex items-center justify-center`}>
                    <Music className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="font-semibold">{SOURCE_META.rekordbox.label}</div>
                    <div className="text-xs text-gray-400">Admin catalog import — XML playlists, no audio upload</div>
                  </div>
                </div>
              </button>
            ) : null}

            <div className="bg-gray-800 rounded-xl p-8 border border-gray-700">
              <div className="flex items-center gap-4 mb-6">
                <div className={`w-14 h-14 rounded-full ${meta.badge} flex items-center justify-center`}>
                  <Music className="w-7 h-7" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold">
                    {meta.likesLabel}
                  </h2>
                  <p className="text-gray-400 text-sm">
                    {isRekordbox
                      ? 'Catalog-only: title, artist, BPM, key, duration, and cover art from local files. No MP3s uploaded.'
                      : isYouTube
                        ? 'Paste a public playlist URL. We match tracks against MusicBrainz and skip unreliable channels.'
                        : isConnected
                        ? 'We\'ll match against the Tuneable catalog and skip mixes/sets'
                        : `Connect ${meta.label} to scan your likes`}
                  </p>
                </div>
              </div>

              {isRekordbox ? (
                <div className="space-y-4">
                  <input
                    ref={rekordboxFileInputRef}
                    type="file"
                    accept=".xml,text/xml,application/xml"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void loadRekordboxPlaylists(file);
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => rekordboxFileInputRef.current?.click()}
                    disabled={isParsingXml}
                    className="w-full py-3 bg-red-600 hover:bg-red-500 disabled:opacity-50 rounded-lg font-medium flex items-center justify-center gap-2"
                  >
                    {isParsingXml ? <Loader2 className="w-5 h-5 animate-spin" /> : <Music className="w-5 h-5" />}
                    {isParsingXml
                      ? 'Parsing XML…'
                      : rekordboxFile
                        ? rekordboxFile.name
                        : 'Upload Rekordbox XML'}
                  </button>

                  {rekordboxPlaylists.length > 0 ? (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-300">
                          {rekordboxPlaylists.length} playlist{rekordboxPlaylists.length === 1 ? '' : 's'}
                          {' · '}{rekordboxTrackCount} tracks in collection
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            if (selectedPlaylistPaths.length === rekordboxPlaylists.length) {
                              setSelectedPlaylistPaths([]);
                            } else {
                              setSelectedPlaylistPaths(rekordboxPlaylists.map((p) => p.fullPath || p.name));
                            }
                          }}
                          className="text-purple-400 hover:underline"
                        >
                          {selectedPlaylistPaths.length === rekordboxPlaylists.length ? 'Clear' : 'Select all'}
                        </button>
                      </div>
                      <div className="max-h-64 overflow-y-auto space-y-1 rounded-lg border border-gray-700 p-2">
                        {rekordboxPlaylists.map((playlist) => {
                          const id = playlist.fullPath || playlist.name;
                          const checked = selectedPlaylistPaths.includes(id);
                          return (
                            <label
                              key={id}
                              className={`flex items-center gap-3 rounded-md px-2 py-1.5 text-sm cursor-pointer ${
                                checked ? 'bg-gray-700/80' : 'hover:bg-gray-700/40'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(e) => {
                                  setSelectedPlaylistPaths((prev) => (
                                    e.target.checked
                                      ? [...prev, id]
                                      : prev.filter((p) => p !== id)
                                  ));
                                }}
                              />
                              <span className="flex-1 min-w-0 truncate">{playlist.fullPath || playlist.name}</span>
                              <span className="text-xs text-gray-500 tabular-nums flex-shrink-0">
                                {playlist.trackCount}
                                {playlist.localFiles > 0 ? ` · ${playlist.localFiles} local` : ''}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                      <button
                        type="button"
                        onClick={() => void scanLikes()}
                        disabled={isLoading}
                        className="w-full py-3 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 rounded-lg font-medium flex items-center justify-center gap-2"
                      >
                        {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Search className="w-5 h-5" />}
                        {isLoading ? 'Scanning…' : 'Scan selected playlists'}
                      </button>
                    </div>
                  ) : null}

                  {isLoading && progressMessage ? (
                    <div className="rounded-lg border border-gray-700 bg-gray-900/60 px-3 py-2">
                      <div className="flex items-center justify-between gap-2 text-xs text-gray-300">
                        <span>{progressMessage}</span>
                        {progressTotal > 0 ? (
                          <span className="text-gray-500 tabular-nums">
                            {progressCurrent}/{progressTotal}
                          </span>
                        ) : null}
                      </div>
                      {progressTotal > 0 ? (
                        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-700">
                          <div
                            className="h-full rounded-full bg-purple-500 transition-all duration-300"
                            style={{
                              width: `${Math.min(100, Math.round((progressCurrent / progressTotal) * 100))}%`,
                            }}
                          />
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <p className="text-xs text-gray-500 text-center">
                      Export a playlist (or the library) from Rekordbox as XML. Cover art is read from files on this machine when Location paths are reachable.
                    </p>
                  )}
                </div>
              ) : isYouTube ? (
                <div className="space-y-3">
                  <label className="text-sm text-gray-400 block">
                    Public playlist URL
                    <input
                      type="url"
                      value={youtubePlaylistUrl}
                      onChange={(e) => setYoutubePlaylistUrl(e.target.value)}
                      placeholder="https://www.youtube.com/playlist?list=…"
                      className="mt-1 w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-white"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => void scanLikes(DEFAULT_SCAN_LIMIT)}
                    disabled={isLoading || !youtubePlaylistUrl.trim()}
                    className="w-full py-3 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 rounded-lg font-medium flex items-center justify-center gap-2"
                  >
                    {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Search className="w-5 h-5" />}
                    {isLoading ? 'Matching…' : 'Scan playlist'}
                  </button>
                  {isLoading && progressMessage ? (
                    <p className="text-xs text-gray-400">{progressMessage}</p>
                  ) : (
                    <p className="text-xs text-gray-500 text-center">
                      Confident MusicBrainz matches are ready to import. Weaker matches go to review. Junk/lyric channels are skipped.
                    </p>
                  )}
                </div>
              ) : source === 'spotify' && !isConnected && !spotifyOauthAvailable ? (
                <div className="space-y-3">
                  {spotifyRequest?.status === 'pending' ? (
                    <p className="text-sm text-amber-200">
                      Request pending for {spotifyRequest.spotifyAccount}. We&apos;ll enable Connect once your Spotify account is on the tester list.
                    </p>
                  ) : spotifyRequest?.status === 'rejected' ? (
                    <p className="text-sm text-red-300">
                      Previous request was declined{spotifyRequest.spotifyAccount ? ` for ${spotifyRequest.spotifyAccount}` : ''}. You can submit again.
                    </p>
                  ) : (
                    <p className="text-sm text-gray-400">
                      Spotify import is in tester mode (limited allowlist). Request access with the email on your Spotify account.
                    </p>
                  )}
                  <input
                    type="email"
                    value={spotifyAccountInput}
                    onChange={(e) => setSpotifyAccountInput(e.target.value)}
                    placeholder="Spotify account email"
                    className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-white"
                  />
                  <input
                    type="text"
                    value={spotifyRequestNote}
                    onChange={(e) => setSpotifyRequestNote(e.target.value)}
                    placeholder="Optional note"
                    className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-white"
                  />
                  <button
                    type="button"
                    onClick={() => void submitSpotifyImportRequest()}
                    disabled={spotifyRequestSubmitting}
                    className="w-full py-3 bg-green-700 hover:bg-green-600 disabled:opacity-50 rounded-lg font-medium"
                  >
                    {spotifyRequestSubmitting ? 'Submitting…' : 'Request Spotify import'}
                  </button>
                </div>
              ) : !isConnected ? (
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
                  {isLoading && progressMessage ? (
                    <div className="rounded-lg border border-gray-700 bg-gray-900/60 px-3 py-2">
                      <div className="flex items-center justify-between gap-2 text-xs text-gray-300">
                        <span>{progressMessage}</span>
                        {progressTotal > 0 ? (
                          <span className="text-gray-500 tabular-nums">
                            {progressCurrent}/{progressTotal}
                          </span>
                        ) : null}
                      </div>
                      {progressTotal > 0 ? (
                        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-700">
                          <div
                            className="h-full rounded-full bg-purple-500 transition-all duration-300"
                            style={{
                              width: `${Math.min(100, Math.round((progressCurrent / progressTotal) * 100))}%`,
                            }}
                          />
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <p className="text-xs text-gray-500 text-center">
                      Scans your latest {DEFAULT_SCAN_LIMIT} likes by default — you can load more after
                    </p>
                  )}
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
              {typeof summary.skippedUnplayable === 'number' && summary.skippedUnplayable > 0 ? (
                <span className="ml-1 text-amber-300/90">
                  · skipped {summary.skippedUnplayable} private/unplayable
                </span>
              ) : null}
              {typeof summary.localFiles === 'number' && source === 'rekordbox' ? (
                <span className="ml-1 text-gray-400">
                  · {summary.localFiles} local file{summary.localFiles === 1 ? '' : 's'} for artwork
                </span>
              ) : null}
              {typeof summary.skippedNoMatch === 'number' && summary.skippedNoMatch > 0 ? (
                <span className="ml-1 text-amber-300/90">
                  · skipped {summary.skippedNoMatch} unmatched
                </span>
              ) : null}
              {typeof summary.skippedJunk === 'number' && summary.skippedJunk > 0 ? (
                <span className="ml-1 text-amber-300/90">
                  · skipped {summary.skippedJunk} unreliable channel{summary.skippedJunk === 1 ? '' : 's'}
                </span>
              ) : null}
              {typeof summary.skippedUnparsed === 'number' && summary.skippedUnparsed > 0 ? (
                <span className="ml-1 text-gray-400">
                  · skipped {summary.skippedUnparsed} unparsed
                </span>
              ) : null}
              {typeof summary.crossRefVerified === 'number' && summary.crossRefVerified > 0 ? (
                <span className="ml-1 text-emerald-300/90">
                  · {summary.crossRefVerified} verified via ISRC
                </span>
              ) : null}
              {typeof summary.identityUnverified === 'number' && summary.identityUnverified > 0 && source === 'soundcloud' ? (
                <span className="ml-1 text-gray-400">
                  · {summary.identityUnverified} unverified (imported anyway)
                </span>
              ) : null}
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                <div className="text-2xl font-bold text-green-300">{summary.inLibrary}</div>
                <div className="text-xs text-gray-400 mt-1">Already supported</div>
              </div>
              <div className="bg-gray-800 rounded-lg p-4 border border-emerald-800/60">
                <div className="text-2xl font-bold text-emerald-300">{playableCount}</div>
                <div className="text-xs text-gray-400 mt-1">Playable now</div>
              </div>
              <div className="bg-gray-800 rounded-lg p-4 border border-amber-800/60">
                <div className="text-2xl font-bold text-amber-300">{awaitingCount}</div>
                <div className="text-xs text-gray-400 mt-1">Awaiting audio</div>
              </div>
              <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                <div className="text-2xl font-bold text-blue-300">{onCatalogCount}</div>
                <div className="text-xs text-gray-400 mt-1">Exact catalog matches</div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-gray-800/80 rounded-lg p-3 border border-emerald-800/50">
                <div className="text-lg font-semibold text-emerald-200">{summary.selectedCount ?? selectedItems.length}</div>
                <div className="text-xs text-gray-400 mt-0.5">Ready to import</div>
              </div>
              <div className="bg-gray-800/80 rounded-lg p-3 border border-gray-700">
                <div className="text-lg font-semibold text-amber-200">{possibleMatchCount}</div>
                <div className="text-xs text-gray-400 mt-0.5">Possible matches</div>
              </div>
              <div className="bg-gray-800/80 rounded-lg p-3 border border-gray-700 col-span-2 md:col-span-1">
                <div className="text-lg font-semibold text-purple-300">{newTrackCount}</div>
                <div className="text-xs text-gray-400 mt-0.5">New to Tuneable</div>
              </div>
            </div>

            {actionableCount > 0 ? (
              <p className="text-sm text-gray-400">
                Of {actionableCount} track{actionableCount === 1 ? '' : 's'} to add,{' '}
                <span className="text-emerald-300 font-medium">{playableCount} playable</span>
                {awaitingCount > 0 ? (
                  <>
                    {' '}and{' '}
                    <span className="text-amber-300 font-medium">
                      {awaitingCount} catalog/new (awaiting audio)
                    </span>
                  </>
                ) : null}
                .
              </p>
            ) : null}

            <div className="bg-gray-800 rounded-xl border border-gray-700 p-6 space-y-5">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div className="space-y-3">
                  <div className="flex rounded-lg border border-gray-600 overflow-hidden text-sm">
                    <button
                      type="button"
                      onClick={() => setTipMode('fixed')}
                      className={`px-3 py-1.5 ${
                        tipMode === 'fixed'
                          ? 'bg-purple-600 text-white'
                          : 'bg-gray-900 text-gray-400 hover:text-white'
                      }`}
                    >
                      Fixed tip
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const previewTargets = playableCount > 0 ? playableItems : selectableItems;
                        if (!enableSpreadMode(previewTargets, { silent: true })) return;
                      }}
                      className={`px-3 py-1.5 ${
                        tipMode === 'spread'
                          ? 'bg-purple-600 text-white'
                          : 'bg-gray-900 text-gray-400 hover:text-white'
                      }`}
                    >
                      Spread balance
                    </button>
                  </div>
                  {tipMode === 'fixed' ? (
                    <div>
                      <label className="text-xs text-gray-400 block mb-1">Default tip per track</label>
                      <div className="flex items-center gap-2">
                        <span className="text-gray-400">£</span>
                        <input
                          type="number"
                          min={MIN_TIP_POUNDS}
                          step={0.01}
                          value={bulkTip}
                          onChange={(e) => {
                            setTipMode('fixed');
                            setBulkTip(e.target.value);
                          }}
                          className="w-24 bg-gray-900 border border-gray-600 rounded px-2 py-1"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="text-sm text-gray-300 space-y-1">
                      <div>
                        Spreads your balance evenly across the import set (min £{MIN_TIP_POUNDS.toFixed(2)} each).
                      </div>
                      {playableCount > 0 && playableCost.spreadOk ? (
                        <div className="text-emerald-300">
                          Playable: £{playableCost.tip.toFixed(2)} × {playableCost.count}
                          {' '}· £{playableCost.total.toFixed(2)}
                        </div>
                      ) : null}
                      {actionableCount > 0 && allCost.spreadOk ? (
                        <div className="text-gray-400">
                          All: £{allCost.tip.toFixed(2)} × {allCost.count}
                          {' '}· £{allCost.total.toFixed(2)}
                        </div>
                      ) : null}
                    </div>
                  )}
                </div>
                <div className="text-right">
                  <div className="text-sm text-gray-400">Your balance</div>
                  <div className="text-xl font-semibold text-yellow-300">£{userBalance.toFixed(2)}</div>
                </div>
              </div>

              <div className="border-t border-gray-700 pt-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">
                    Playable to add
                  </span>
                  <span className="text-emerald-300 font-medium">
                    {playableCount}
                    {playableCount > 0
                      ? ` · £${playableCost.total.toFixed(2)}${tipMode === 'spread' && playableCost.spreadOk ? ` (£${playableCost.tip.toFixed(2)} ea)` : ''}`
                      : ''}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">
                    All tracks to add
                  </span>
                  <span className="text-white font-medium">
                    {actionableCount}
                    {actionableCount > 0
                      ? ` · £${allCost.total.toFixed(2)}${tipMode === 'spread' && allCost.spreadOk ? ` (£${allCost.tip.toFixed(2)} ea)` : ''}`
                      : ''}
                  </span>
                </div>
                {tipMode === 'fixed' && actionableCount > 0 && !allCost.canAffordAll && (
                  <div className="text-sm text-amber-300 pt-1">
                    At £{tipAmount.toFixed(2)} each you can afford {allCost.affordableCount} of {actionableCount}
                    {playableCount > 0 && !playableCost.canAffordAll
                      ? ` · ${playableCost.affordableCount} of ${playableCount} playable`
                      : ''}
                    . Switch to Spread balance to tip everyone selected, or{' '}
                    <Link to="/wallet" className="underline">top up</Link>.
                  </div>
                )}
                {tipMode === 'spread' && playableCount > 0 && !playableCost.spreadOk && (
                  <div className="text-sm text-red-400 flex items-center gap-1 pt-1">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    <span>
                      Need at least £{(MIN_TIP_POUNDS * playableCount).toFixed(2)} to spread across {playableCount} playable tracks —{' '}
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

              <div className="flex flex-col gap-3 pt-2">
                {actionableCount > 0 && (
                  <>
                    <div className="flex flex-col sm:flex-row gap-3">
                      <button
                        type="button"
                        onClick={() => void importFromSummary('playable')}
                        disabled={
                          isExecuting
                          || isLoading
                          || playableCount === 0
                          || (tipMode === 'spread' ? !playableCost.spreadOk : playableCost.affordableCount === 0)
                        }
                        className="flex-1 px-4 py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 rounded-lg font-medium flex items-center justify-center gap-2"
                      >
                        {isExecuting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Coins className="w-5 h-5" />}
                        {playableCount === 0
                          ? 'No playable tracks'
                          : tipMode === 'spread' && playableCost.spreadOk
                            ? `Import playable · £${playableCost.total.toFixed(2)}`
                            : tipMode === 'fixed' && !playableCost.canAffordAll && playableCost.affordableCount > 0
                              ? `Import ${playableCost.affordableCount} playable · £${(playableCost.affordableCount * tipAmount).toFixed(2)}`
                              : `Import playable · £${playableCost.total.toFixed(2)}`}
                      </button>
                      <button
                        type="button"
                        onClick={() => void importFromSummary('all')}
                        disabled={
                          isExecuting
                          || isLoading
                          || (tipMode === 'spread' ? !allCost.spreadOk : allCost.affordableCount === 0)
                        }
                        className="flex-1 px-4 py-3 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 rounded-lg font-medium flex items-center justify-center gap-2"
                      >
                        {isExecuting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Coins className="w-5 h-5" />}
                        {tipMode === 'spread' && allCost.spreadOk
                          ? `Import all · £${allCost.total.toFixed(2)}`
                          : tipMode === 'fixed' && !allCost.canAffordAll && allCost.affordableCount > 0
                            ? `Import ${allCost.affordableCount} I can afford · £${(allCost.affordableCount * tipAmount).toFixed(2)}`
                            : `Import all · £${allCost.total.toFixed(2)}`}
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        if (playableCount > 0) {
                          setItems((prev) => prev.map((item) => ({
                            ...item,
                            selected: item.matchStatus !== 'in_library' && item.isPlayable,
                          })));
                        } else {
                          toggleAll(true);
                        }
                        if (tipMode === 'spread') {
                          enableSpreadMode(playableCount > 0 ? playableItems : selectableItems, { silent: true });
                        }
                        setStep('review');
                      }}
                      disabled={isExecuting || isLoading}
                      className="px-4 py-3 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 rounded-lg font-medium"
                    >
                      Review tracks
                      {possibleMatchCount > 0 ? ` (${possibleMatchCount} possible)` : ''}
                      {playableCount > 0 ? ` · ${playableCount} playable pre-selected` : ''}
                    </button>
                  </>
                )}
              </div>
              {(isExecuting || isLoading) && progressMessage ? (
                <div className="rounded-lg border border-purple-800/60 bg-purple-950/30 px-3 py-2">
                  <div className="flex items-center justify-between gap-2 text-xs text-purple-100">
                    <span>{progressMessage}</span>
                    {progressTotal > 0 ? (
                      <span className="tabular-nums text-purple-300/80">
                        {progressCurrent}/{progressTotal}
                      </span>
                    ) : null}
                  </div>
                  {progressTotal > 0 ? (
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-purple-950">
                      <div
                        className="h-full rounded-full bg-purple-400 transition-all duration-300"
                        style={{
                          width: `${Math.min(100, Math.round((progressCurrent / progressTotal) * 100))}%`,
                        }}
                      />
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
              <div className="flex flex-wrap items-center gap-3">
                {!isRekordbox && !isYouTube && limit < MAX_SCAN_LIMIT ? (
                  <button
                    type="button"
                    onClick={() => void scanLikes(Math.min(MAX_SCAN_LIMIT, limit + SCAN_STEP))}
                    disabled={isLoading || isExecuting}
                    className="text-purple-300 hover:text-purple-200 underline disabled:opacity-50"
                  >
                    {isLoading ? 'Scanning…' : `Load ${Math.min(SCAN_STEP, MAX_SCAN_LIMIT - limit)} more likes`}
                  </button>
                ) : null}
                {!isRekordbox ? (
                <button
                  type="button"
                  onClick={() => setShowAdvancedLimit((v) => !v)}
                  className="text-gray-400 hover:text-white underline"
                >
                  {showAdvancedLimit ? 'Hide scan options' : 'Custom scan limit'}
                </button>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => setStep('connect')}
                className="text-gray-400 hover:text-white"
              >
                Change source
              </button>
            </div>

            {showAdvancedLimit && !isRekordbox && (
              <div className="bg-gray-800/80 border border-gray-700 rounded-lg p-4 flex flex-wrap items-end gap-3">
                <label className="text-sm text-gray-400">
                  {isYouTube ? 'Tracks to scan' : 'Likes to scan'} (max {MAX_SCAN_LIMIT})
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
              <div className="space-y-3">
                <div className="flex rounded-lg border border-gray-600 overflow-hidden text-sm w-fit">
                  <button
                    type="button"
                    onClick={() => setTipMode('fixed')}
                    className={`px-3 py-1.5 ${
                      tipMode === 'fixed'
                        ? 'bg-purple-600 text-white'
                        : 'bg-gray-900 text-gray-400 hover:text-white'
                    }`}
                  >
                    Fixed tip
                  </button>
                  <button
                    type="button"
                    onClick={() => enableSpreadMode(selectedItems)}
                    className={`px-3 py-1.5 ${
                      tipMode === 'spread'
                        ? 'bg-purple-600 text-white'
                        : 'bg-gray-900 text-gray-400 hover:text-white'
                    }`}
                  >
                    Spread balance
                  </button>
                </div>
                {tipMode === 'fixed' ? (
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">Default tip for selection</label>
                    <div className="flex items-center gap-2">
                      <span className="text-gray-400">£</span>
                      <input
                        type="number"
                        min={MIN_TIP_POUNDS}
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
                ) : (
                  <div className="text-sm text-gray-300">
                    {selectedSpreadTip != null && selectedItems.length > 0 ? (
                      <>
                        £{userBalance.toFixed(2)} ÷ {selectedItems.length}
                        {' = '}
                        <span className="text-yellow-300 font-medium">£{selectedSpreadTip.toFixed(2)}</span>
                        {' each'}
                        <span className="text-gray-500">
                          {' '}(£{(selectedSpreadTip * selectedItems.length).toFixed(2)} total)
                        </span>
                      </>
                    ) : (
                      <span className="text-red-400">
                        Select fewer tracks or top up to spread at least £{MIN_TIP_POUNDS.toFixed(2)} each
                      </span>
                    )}
                  </div>
                )}
              </div>
              <div className="flex flex-wrap gap-3 text-sm items-center">
                <button type="button" onClick={selectPlayable} className="text-emerald-400 hover:underline">
                  Select playable ({playableCount})
                </button>
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
                    {selectedItems.length > 0 ? (
                      <>
                        {' · '}
                        <span className="text-emerald-300">
                          {selectedItems.filter((i) => i.isPlayable).length} playable
                        </span>
                        {' / '}
                        <span className="text-amber-300">
                          {selectedItems.filter((i) => !i.isPlayable).length} awaiting
                        </span>
                      </>
                    ) : null}
                  </div>
                  <div className="text-xl font-bold flex items-center gap-2">
                    <Coins className="w-5 h-5 text-yellow-400" />
                    £{totalCost.toFixed(2)}
                  </div>
                  {!canAffordSelected && (
                    <div className="text-sm text-red-400 flex items-center gap-1 mt-1">
                      <AlertCircle className="w-4 h-4" />
                      Need £{Math.max(0, totalCost - userBalance).toFixed(2)} more —{' '}
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
                  {isExecuting && progressMessage
                    ? progressMessage
                    : `Import & tip £${totalCost.toFixed(2)}`}
                </button>
              </div>
              {isExecuting && progressTotal > 0 ? (
                <div className="pt-2">
                  <div className="h-1.5 overflow-hidden rounded-full bg-gray-700">
                    <div
                      className="h-full rounded-full bg-purple-500 transition-all duration-300"
                      style={{
                        width: `${Math.min(100, Math.round((progressCurrent / progressTotal) * 100))}%`,
                      }}
                    />
                  </div>
                </div>
              ) : null}
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
                    <div className="text-sm text-gray-400 truncate">
                      {item.artist}
                      {item.bpm || item.musicalKey ? (
                        <span className="text-gray-500">
                          {item.bpm ? ` · ${Math.round(Number(item.bpm))} BPM` : ''}
                          {item.musicalKey ? ` · ${item.musicalKey}` : ''}
                        </span>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap gap-1 mt-1">
                      <span className={`text-xs px-2 py-0.5 rounded border ${STATUS_COLORS[item.matchStatus]}`}>
                        {STATUS_LABELS[item.matchStatus]}
                      </span>
                      {item.identityConfidence && (
                        <span
                          className={`text-xs px-2 py-0.5 rounded border ${IDENTITY_COLORS[item.identityConfidence]}`}
                          title={item.identityConfidenceSource || undefined}
                        >
                          {item.crossRefStatus === 'isrc_verified'
                            ? `ISRC · ${(item.crossRefSources || []).join('+') || 'verified'}`
                            : item.crossRefStatus === 'spotify_catalog'
                              ? 'Spotify catalog'
                              : IDENTITY_LABELS[item.identityConfidence]}
                        </span>
                      )}
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
                    {item.crossRefStatus === 'isrc_verified'
                      && item.originalTitle
                      && (item.originalTitle !== item.title || item.originalArtist !== item.artist) && (
                      <div className="mt-1 text-xs text-gray-500 truncate">
                        SoundCloud: {item.originalTitle}
                        {item.originalArtist ? ` · ${item.originalArtist}` : ''}
                      </div>
                    )}
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
                                i.key === item.key
                                  ? { ...i, useSuggestedMatch: true, selected: true }
                                  : i
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
                                i.key === item.key
                                  ? {
                                    ...i,
                                    useSuggestedMatch: false,
                                    selected: isYouTube ? false : i.selected,
                                  }
                                  : i
                              )));
                            }}
                            className={`px-2 py-0.5 rounded border ${
                              item.useSuggestedMatch === false
                                ? 'bg-purple-700/50 border-purple-500 text-white'
                                : 'bg-gray-900 border-gray-600 text-gray-300 hover:border-purple-600'
                            }`}
                          >
                            {isYouTube ? 'Skip' : 'Create as new'}
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
                          setTipMode('fixed');
                          const cur = parseFloat(tipAmounts[item.key] ?? bulkTip);
                          setTipAmounts((p) => ({ ...p, [item.key]: Math.max(MIN_TIP_POUNDS, cur - 0.01).toFixed(2) }));
                        }}
                        className="p-1 bg-gray-700 rounded"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <input
                        type="number"
                        min={MIN_TIP_POUNDS}
                        step={0.01}
                        value={tipAmounts[item.key] ?? bulkTip}
                        onChange={(e) => {
                          setTipMode('fixed');
                          setTipAmounts((p) => ({ ...p, [item.key]: e.target.value }));
                        }}
                        className="w-16 text-center bg-gray-900 border border-gray-600 rounded px-1 py-1 text-sm"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setTipMode('fixed');
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
                    {isExecuting && progressTotal > 0
                      ? `${progressCurrent}/${progressTotal}`
                      : `Import & tip £${totalCost.toFixed(2)}`}
                  </button>
                </div>
              </div>
              {isExecuting && progressMessage ? (
                <p className="mt-2 text-xs text-gray-400">{progressMessage}</p>
              ) : null}
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
