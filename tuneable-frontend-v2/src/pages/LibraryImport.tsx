import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
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
} from 'lucide-react';
import { toast } from 'react-toastify';
import { useAuth } from '../contexts/AuthContext';
import { userAPI } from '../lib/api';
import { penceToPoundsNumber } from '../utils/currency';
import { DEFAULT_PROFILE_PIC } from '../constants';

type MatchStatus = 'in_library' | 'on_catalog' | 'new';

interface ImportItem {
  key: string;
  title: string;
  artist: string;
  coverArt?: string | null;
  duration?: number;
  album?: string | null;
  matchStatus: MatchStatus;
  mediaId?: string | null;
  mediaUuid?: string | null;
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
  newTracks: number;
  selectedCount: number;
  estimatedTotal: number;
  userBalance: number;
  defaultTip: number;
}

const STATUS_LABELS: Record<MatchStatus, string> = {
  in_library: 'In your library',
  on_catalog: 'On Tuneable',
  new: 'New to Tuneable',
};

const STATUS_COLORS: Record<MatchStatus, string> = {
  in_library: 'bg-green-900/40 text-green-300 border-green-700',
  on_catalog: 'bg-blue-900/40 text-blue-300 border-blue-700',
  new: 'bg-purple-900/40 text-purple-300 border-purple-700',
};

const LibraryImport: React.FC = () => {
  const navigate = useNavigate();
  const { user, refreshUser } = useAuth();

  const [step, setStep] = useState<'connect' | 'review' | 'done'>('connect');
  const [spotifyConnected, setSpotifyConnected] = useState(false);
  const [limit, setLimit] = useState(50);
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

  const checkSpotify = useCallback(async () => {
    try {
      const status = await userAPI.getSpotifyStatus();
      setSpotifyConnected(status.connected);
    } catch {
      setSpotifyConnected(false);
    }
  }, []);

  useEffect(() => {
    void checkSpotify();
  }, [checkSpotify]);

  const connectSpotify = () => {
    const baseUrl = import.meta.env.VITE_API_URL?.replace('/api', '')
      || import.meta.env.VITE_BACKEND_URL
      || 'http://localhost:8000';
    const redirectUrl = encodeURIComponent(`${window.location.origin}/import`);
    const token = localStorage.getItem('token');
    window.location.href = `${baseUrl}/api/auth/spotify?link_account=true&redirect=${redirectUrl}${token ? `&token=${encodeURIComponent(token)}` : ''}`;
  };

  const loadPreview = async () => {
    if (!spotifyConnected) {
      connectSpotify();
      return;
    }
    setIsLoading(true);
    try {
      const data = await userAPI.previewSpotifyImport(limit);
      setItems(data.items || []);
      setSummary(data.summary || null);
      const amounts: Record<string, string> = {};
      (data.items || []).forEach((item: ImportItem) => {
        amounts[item.key] = String(item.defaultTip ?? data.summary?.defaultTip ?? 0.11);
      });
      setTipAmounts(amounts);
      setBulkTip(String(data.summary?.defaultTip ?? user?.preferences?.defaultTip ?? 0.11));
      setStep('review');
    } catch (error: any) {
      toast.error(error?.response?.data?.error || error?.message || 'Failed to load Spotify likes');
    } finally {
      setIsLoading(false);
    }
  };

  const selectedItems = useMemo(
    () => items.filter((i) => i.selected && i.matchStatus !== 'in_library'),
    [items]
  );

  const totalCost = useMemo(() => {
    return selectedItems.reduce((sum, item) => {
      const raw = tipAmounts[item.key] ?? bulkTip;
      const amount = parseFloat(raw);
      return sum + (Number.isFinite(amount) ? amount : 0);
    }, 0);
  }, [selectedItems, tipAmounts, bulkTip]);

  const userBalance = summary?.userBalance ?? (user?.balance != null ? penceToPoundsNumber(user.balance) : 0);
  const canAfford = totalCost <= userBalance + 0.0001;

  const toggleAll = (selected: boolean) => {
    setItems((prev) => prev.map((i) => ({
      ...i,
      selected: i.matchStatus === 'in_library' ? false : selected,
    })));
  };

  const applyBulkTip = () => {
    const amount = parseFloat(bulkTip);
    if (!Number.isFinite(amount) || amount < 0.01) {
      toast.error('Enter a valid tip amount (min £0.01)');
      return;
    }
    setTipAmounts((prev) => {
      const next = { ...prev };
      selectedItems.forEach((item) => {
        next[item.key] = amount.toFixed(2);
      });
      return next;
    });
    toast.success(`Set ${selectedItems.length} tracks to £${amount.toFixed(2)}`);
  };

  const handleExecute = async () => {
    if (selectedItems.length === 0) {
      toast.error('Select at least one track');
      return;
    }
    if (!canAfford) {
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
        amount: parseFloat(tipAmounts[item.key] ?? bulkTip),
        externalMedia: item.externalMedia,
        skipIfInLibrary: true,
      }));

      const result = await userAPI.executeSpotifyImport(payload, parseFloat(bulkTip));
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

  return (
    <div className="min-h-screen bg-gray-900 text-white pb-32">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <button
          type="button"
          onClick={() => navigate(-1)}
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
            Bring your Spotify likes onto Tuneable and tip each track to add it to your library.
            Tracks without audio yet are still tip-able — you&apos;re backing artists before playback is available.
          </p>
        </div>

        {step === 'connect' && (
          <div className="bg-gray-800 rounded-xl p-8 border border-gray-700">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-14 h-14 rounded-full bg-green-600 flex items-center justify-center">
                <Music className="w-7 h-7" />
              </div>
              <div>
                <h2 className="text-xl font-semibold">Spotify Likes</h2>
                <p className="text-gray-400 text-sm">
                  {spotifyConnected ? 'Connected' : 'Connect to import saved tracks'}
                </p>
              </div>
            </div>

            {!spotifyConnected ? (
              <button
                type="button"
                onClick={connectSpotify}
                className="w-full py-3 bg-green-600 hover:bg-green-500 rounded-lg font-medium"
              >
                Connect Spotify
              </button>
            ) : (
              <div className="space-y-4">
                <label className="block text-sm text-gray-400">
                  How many liked tracks to load? (max 200)
                  <input
                    type="number"
                    min={1}
                    max={200}
                    value={limit}
                    onChange={(e) => setLimit(Math.min(200, Math.max(1, parseInt(e.target.value, 10) || 50)))}
                    className="mt-1 w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-white"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => void loadPreview()}
                  disabled={isLoading}
                  className="w-full py-3 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 rounded-lg font-medium flex items-center justify-center gap-2"
                >
                  {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
                  Load my Spotify likes
                </button>
              </div>
            )}
          </div>
        )}

        {step === 'review' && summary && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                <div className="text-2xl font-bold">{summary.total}</div>
                <div className="text-xs text-gray-400">Tracks loaded</div>
              </div>
              <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                <div className="text-2xl font-bold text-purple-300">{summary.newTracks}</div>
                <div className="text-xs text-gray-400">New to Tuneable</div>
              </div>
              <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                <div className="text-2xl font-bold text-green-300">{summary.inLibrary}</div>
                <div className="text-xs text-gray-400">Already supported</div>
              </div>
              <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                <div className="text-2xl font-bold text-yellow-300">£{userBalance.toFixed(2)}</div>
                <div className="text-xs text-gray-400">Your balance</div>
              </div>
            </div>

            <div className="bg-gray-800 rounded-xl p-4 border border-gray-700 mb-4 flex flex-wrap gap-4 items-end">
              <div>
                <label className="text-xs text-gray-400 block mb-1">Default tip for selection</label>
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
                  <button
                    type="button"
                    onClick={applyBulkTip}
                    className="text-sm px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded"
                  >
                    Apply to selected
                  </button>
                </div>
              </div>
              <div className="flex gap-2 text-sm">
                <button type="button" onClick={() => toggleAll(true)} className="text-purple-400 hover:underline">
                  Select all
                </button>
                <button type="button" onClick={() => toggleAll(false)} className="text-gray-400 hover:underline">
                  Clear
                </button>
              </div>
            </div>

            <div className="space-y-2 mb-24 max-h-[50vh] overflow-y-auto pr-1">
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

            <div className="fixed bottom-0 left-0 right-0 bg-gray-900/95 border-t border-gray-700 p-4 backdrop-blur">
              <div className="max-w-4xl mx-auto flex flex-wrap items-center justify-between gap-4">
                <div>
                  <div className="text-sm text-gray-400">
                    {selectedItems.length} track{selectedItems.length !== 1 ? 's' : ''} selected
                  </div>
                  <div className="text-2xl font-bold flex items-center gap-2">
                    <Coins className="w-6 h-6 text-yellow-400" />
                    £{totalCost.toFixed(2)}
                  </div>
                  {!canAfford && (
                    <div className="text-sm text-red-400 flex items-center gap-1 mt-1">
                      <AlertCircle className="w-4 h-4" />
                      Need £{(totalCost - userBalance).toFixed(2)} more —{' '}
                      <Link to="/wallet" className="underline">top up wallet</Link>
                    </div>
                  )}
                </div>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setStep('connect')}
                    className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleExecute()}
                    disabled={isExecuting || selectedItems.length === 0 || !canAfford}
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
                  setExecuteResult(null);
                  setItems([]);
                }}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg"
              >
                Import more
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
