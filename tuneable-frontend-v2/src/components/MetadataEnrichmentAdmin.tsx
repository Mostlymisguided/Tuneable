import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Loader2,
  RefreshCw,
  Check,
  X,
  Sparkles,
  ExternalLink,
  Tags,
  CheckCheck,
} from 'lucide-react';
import { toast } from 'react-toastify';
import { mediaAPI } from '../lib/api';

interface EnrichmentItem {
  _id: string;
  mediaId: string;
  mediaUuid?: string;
  importSource?: string;
  importSourceUrl?: string | null;
  status: string;
  confidence?: string | null;
  enrichTagsOnly?: boolean;
  original?: {
    title?: string;
    artist?: string;
    album?: string | null;
    duration?: number;
    releaseYear?: number | null;
    isrc?: string | null;
    tags?: string[];
    genres?: string[];
  };
  suggestion?: {
    title?: string;
    artist?: string;
    album?: string | null;
    duration?: number;
    releaseYear?: number | null;
    isrc?: string | null;
    tags?: string[];
    genres?: string[];
    musicbrainzId?: string;
    score?: number;
    matchType?: string;
  } | null;
  candidates?: Array<{
    musicbrainzId?: string;
    title?: string;
    artist?: string;
    album?: string | null;
    duration?: number;
    releaseYear?: number | null;
    tags?: string[];
    score?: number;
    matchType?: string;
  }>;
  currentTags?: string[];
  currentGenres?: string[];
  currentReleaseYear?: number | null;
  currentIsrc?: string | null;
  newTags?: string[];
  error?: string | null;
  importedBy?: { username?: string; uuid?: string } | null;
  createdAt?: string;
  processedAt?: string;
}

const STATUS_OPTIONS = [
  { value: 'needs_review', label: 'Needs review' },
  { value: 'pending', label: 'Pending' },
  { value: 'auto_applied', label: 'Auto-applied' },
  { value: 'applied', label: 'Applied' },
  { value: 'dismissed', label: 'Dismissed' },
  { value: 'skipped', label: 'Skipped' },
  { value: 'failed', label: 'Failed' },
  { value: 'all', label: 'All' },
];

function formatDuration(sec?: number) {
  if (!sec) return '—';
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function importSourceLinkLabel(url: string, importSource?: string) {
  if (importSource === 'soundcloud_likes' || url.includes('soundcloud.com')) {
    return 'View on SoundCloud';
  }
  if (importSource === 'spotify_likes' || url.includes('spotify.com')) {
    return 'View on Spotify';
  }
  return 'View source';
}

function TagChips({
  labels,
  empty = 'No tags',
  tone = 'neutral',
}: {
  labels?: string[] | null;
  empty?: string;
  tone?: 'neutral' | 'green' | 'amber';
}) {
  if (!labels || labels.length === 0) {
    return <span className="text-xs text-gray-600">{empty}</span>;
  }
  const toneClass =
    tone === 'green'
      ? 'border-green-800/80 bg-green-950/40 text-green-200'
      : tone === 'amber'
        ? 'border-amber-800/80 bg-amber-950/40 text-amber-200'
        : 'border-gray-600 bg-gray-800 text-gray-300';
  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {labels.map((tag) => (
        <span
          key={tag}
          className={`px-2 py-0.5 rounded text-[11px] border ${toneClass}`}
        >
          {tag}
        </span>
      ))}
    </div>
  );
}

const MetadataEnrichmentAdmin: React.FC = () => {
  const [status, setStatus] = useState('needs_review');
  const [items, setItems] = useState<EnrichmentItem[]>([]);
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [backfilling, setBackfilling] = useState(false);
  const [batchBusy, setBatchBusy] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await mediaAPI.getEnrichments({ status, page, limit: 25 });
      setItems(data.items || []);
      setStatusCounts(data.statusCounts || {});
      setPages(data.pagination?.pages || 1);
      setTotal(data.pagination?.total || 0);
      setSelected(new Set());
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Failed to load enrichment queue');
    } finally {
      setLoading(false);
    }
  }, [status, page]);

  useEffect(() => {
    void load();
  }, [load]);

  const reviewableIds = useMemo(
    () => items
      .filter((item) => ['needs_review', 'skipped', 'failed'].includes(item.status) && item.suggestion?.title)
      .map((item) => item._id),
    [items]
  );

  const allReviewableSelected = reviewableIds.length > 0
    && reviewableIds.every((id) => selected.has(id));

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAllReviewable = () => {
    if (allReviewableSelected) {
      setSelected(new Set());
      return;
    }
    setSelected(new Set(reviewableIds));
  };

  const handleProcess = async () => {
    setProcessing(true);
    try {
      const result = await mediaAPI.processEnrichmentQueue(25);
      if (result.skipped) {
        toast.info('Queue already processing');
      } else {
        toast.success(
          `Processed ${result.processed}: ${result.autoApplied} auto, ${result.needsReview} review, ${result.skipped} skipped`
        );
      }
      await load();
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Process failed');
    } finally {
      setProcessing(false);
    }
  };

  const handleBackfill = async (
    mode: 'supplement' | 'untagged',
    linkage: 'linked' | 'unlinked' | 'any' = 'linked'
  ) => {
    setBackfilling(true);
    try {
      const result = await mediaAPI.enqueueEnrichmentBackfill({
        limit: linkage === 'unlinked' ? 40 : mode === 'supplement' ? 100 : 50,
        linkage,
        processImmediately: true,
        mode,
      });
      const label = linkage === 'unlinked'
        ? 'Unlinked match'
        : mode === 'supplement'
          ? 'Supplement'
          : 'Untagged';
      toast.success(
        `${label} queued ${result.enqueued}`
          + ` (scanned ${result.scanned}`
          + `${result.skippedOpen ? `, ${result.skippedOpen} already open` : ''})`
      );
      setPage(1);
      setStatus('pending');
      // load() will re-run via useEffect when status/page change
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Backfill failed');
    } finally {
      setBackfilling(false);
    }
  };

  const handleApply = async (id: string) => {
    setBusyId(id);
    try {
      await mediaAPI.applyEnrichment(id);
      toast.success('Metadata applied');
      await load();
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Apply failed');
    } finally {
      setBusyId(null);
    }
  };

  const handleDismiss = async (id: string) => {
    setBusyId(id);
    try {
      await mediaAPI.dismissEnrichment(id);
      toast.success('Dismissed');
      await load();
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Dismiss failed');
    } finally {
      setBusyId(null);
    }
  };

  const handleChoose = async (id: string, candidateIndex: number) => {
    setBusyId(id);
    try {
      await mediaAPI.chooseEnrichmentCandidate(id, candidateIndex);
      toast.success('Candidate applied');
      await load();
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Failed to apply candidate');
    } finally {
      setBusyId(null);
    }
  };

  const handleBatchApply = async () => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    setBatchBusy(true);
    try {
      const result = await mediaAPI.batchApplyEnrichments(ids);
      toast.success(`Applied ${result.applied}${result.failed ? `, ${result.failed} failed` : ''}`);
      await load();
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Batch apply failed');
    } finally {
      setBatchBusy(false);
    }
  };

  const handleBatchDismiss = async () => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    setBatchBusy(true);
    try {
      const result = await mediaAPI.batchDismissEnrichments(ids);
      toast.success(`Dismissed ${result.dismissed}${result.failed ? `, ${result.failed} failed` : ''}`);
      await load();
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Batch dismiss failed');
    } finally {
      setBatchBusy(false);
    }
  };

  const reviewCount = statusCounts.needs_review || 0;
  const pendingCount = (statusCounts.pending || 0) + (statusCounts.failed || 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-amber-400" />
            Imported — to review
          </h2>
          <p className="text-sm text-gray-400 mt-1">
            Linked tracks: fast tag lookup. Unlinked tracks: search MusicBrainz by title/artist,
            then approve match + tags (batch apply supported).
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm flex items-center gap-2"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Refresh
          </button>
          <button
            type="button"
            onClick={() => void handleBackfill('supplement', 'linked')}
            disabled={backfilling}
            className="px-3 py-2 bg-teal-800 hover:bg-teal-700 disabled:opacity-50 rounded-lg text-sm flex items-center gap-2"
            title="Queue MB-linked tracks to suggest additional tags (admin approval)"
          >
            {backfilling ? <Loader2 className="h-4 w-4 animate-spin" /> : <Tags className="h-4 w-4" />}
            Supplement linked (100)
          </button>
          <button
            type="button"
            onClick={() => void handleBackfill('supplement', 'unlinked')}
            disabled={backfilling}
            className="px-3 py-2 bg-cyan-900 hover:bg-cyan-800 disabled:opacity-50 rounded-lg text-sm flex items-center gap-2"
            title="Search MusicBrainz for tracks with no MBID, then review match + tags"
          >
            {backfilling ? <Loader2 className="h-4 w-4 animate-spin" /> : <Tags className="h-4 w-4" />}
            Match unlinked (40)
          </button>
          <button
            type="button"
            onClick={() => void handleBackfill('untagged', 'linked')}
            disabled={backfilling}
            className="px-3 py-2 bg-amber-900/80 hover:bg-amber-800 disabled:opacity-50 rounded-lg text-sm flex items-center gap-2"
            title="Only linked media with empty tags"
          >
            {backfilling ? <Loader2 className="h-4 w-4 animate-spin" /> : <Tags className="h-4 w-4" />}
            Untagged linked
          </button>
          <button
            type="button"
            onClick={() => void handleProcess()}
            disabled={processing}
            className="px-3 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 rounded-lg text-sm flex items-center gap-2"
          >
            {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Process queue{pendingCount ? ` (${pendingCount})` : ''}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 text-xs">
        {STATUS_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => {
              setStatus(opt.value);
              setPage(1);
            }}
            className={`px-3 py-1.5 rounded-full border ${
              status === opt.value
                ? 'bg-purple-700/50 border-purple-500 text-white'
                : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-500'
            }`}
          >
            {opt.label}
            {opt.value !== 'all' && statusCounts[opt.value] != null
              ? ` · ${statusCounts[opt.value]}`
              : ''}
            {opt.value === 'needs_review' && reviewCount > 0 && status !== 'needs_review'
              ? ` · ${reviewCount}`
              : ''}
          </button>
        ))}
      </div>

      {reviewableIds.length > 0 ? (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-gray-700 bg-gray-900/60 px-3 py-2">
          <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
            <input
              type="checkbox"
              checked={allReviewableSelected}
              onChange={toggleSelectAllReviewable}
              className="rounded border-gray-600"
            />
            Select all on page ({reviewableIds.length})
          </label>
          <span className="text-xs text-gray-500">{selected.size} selected</span>
          <button
            type="button"
            disabled={selected.size === 0 || batchBusy}
            onClick={() => void handleBatchApply()}
            className="px-3 py-1.5 bg-green-700 hover:bg-green-600 disabled:opacity-40 rounded text-sm flex items-center gap-1"
          >
            {batchBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCheck className="h-3.5 w-3.5" />}
            Apply selected
          </button>
          <button
            type="button"
            disabled={selected.size === 0 || batchBusy}
            onClick={() => void handleBatchDismiss()}
            className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 disabled:opacity-40 rounded text-sm flex items-center gap-1"
          >
            <X className="h-3.5 w-3.5" />
            Dismiss selected
          </button>
        </div>
      ) : null}

      {loading && items.length === 0 ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-purple-400" />
        </div>
      ) : items.length === 0 ? (
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-8 text-center text-gray-400">
          No items in this queue status.
        </div>
      ) : (
        <div className="space-y-4">
          {items.map((item) => {
            const suggestedTags = item.suggestion?.tags?.length
              ? item.suggestion.tags
              : item.suggestion?.genres;
            const originalTags = item.original?.tags?.length
              ? item.original.tags
              : item.currentTags;
            const newTags = item.newTags?.length
              ? item.newTags
              : (item.enrichTagsOnly ? suggestedTags : undefined);
            const canReview = ['needs_review', 'skipped', 'failed'].includes(item.status);

            return (
              <div
                key={item._id}
                className={`bg-gray-800 border rounded-lg p-4 space-y-3 ${
                  selected.has(item._id) ? 'border-teal-600' : 'border-gray-700'
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex gap-3">
                    {canReview && item.suggestion?.title ? (
                      <input
                        type="checkbox"
                        checked={selected.has(item._id)}
                        onChange={() => toggleSelect(item._id)}
                        className="mt-1 rounded border-gray-600"
                        aria-label={`Select ${item.original?.title || item._id}`}
                      />
                    ) : null}
                    <div>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-gray-400 mb-1">
                        <span className="px-2 py-0.5 rounded border border-gray-600">{item.status}</span>
                        {item.confidence ? (
                          <span className="px-2 py-0.5 rounded border border-amber-700 text-amber-200">
                            {item.confidence}
                            {item.suggestion?.score != null
                              ? ` · ${(item.suggestion.score * 100).toFixed(0)}%`
                              : ''}
                          </span>
                        ) : null}
                        {item.enrichTagsOnly ? (
                          <span className="px-2 py-0.5 rounded border border-teal-800 text-teal-200">
                            tag supplement
                          </span>
                        ) : null}
                        {item.importSource ? (
                          <span className="text-gray-500">{item.importSource.replace('_', ' ')}</span>
                        ) : null}
                        {item.importedBy?.username ? (
                          <span>by @{item.importedBy.username}</span>
                        ) : null}
                      </div>
                      {item.mediaUuid ? (
                        <Link
                          to={`/tune/${item.mediaUuid}`}
                          className="text-sm text-purple-300 hover:underline inline-flex items-center gap-1"
                          target="_blank"
                          rel="noreferrer"
                        >
                          Open media <ExternalLink className="h-3 w-3" />
                        </Link>
                      ) : null}
                    </div>
                  </div>
                  {canReview && (
                    <div className="flex gap-2">
                      {item.suggestion?.title ? (
                        <button
                          type="button"
                          disabled={busyId === item._id || batchBusy}
                          onClick={() => void handleApply(item._id)}
                          className="px-3 py-1.5 bg-green-700 hover:bg-green-600 disabled:opacity-50 rounded text-sm flex items-center gap-1"
                        >
                          {busyId === item._id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                          Apply
                        </button>
                      ) : null}
                      <button
                        type="button"
                        disabled={busyId === item._id || batchBusy}
                        onClick={() => void handleDismiss(item._id)}
                        className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 rounded text-sm flex items-center gap-1"
                      >
                        <X className="h-3.5 w-3.5" />
                        Dismiss
                      </button>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                  <div className="bg-gray-900/70 rounded-lg p-3">
                    <div className="text-xs text-red-300 mb-1">Current</div>
                    <div className="font-medium text-white">{item.original?.title || '—'}</div>
                    <div className="text-gray-400">{item.original?.artist || '—'}</div>
                    <div className="text-xs text-gray-500 mt-1">
                      {item.original?.album || 'No album'} · {formatDuration(item.original?.duration)}
                      {item.original?.releaseYear || item.currentReleaseYear
                        ? ` · ${item.original?.releaseYear || item.currentReleaseYear}`
                        : ''}
                      {item.original?.isrc || item.currentIsrc
                        ? ` · ${item.original?.isrc || item.currentIsrc}`
                        : ''}
                    </div>
                    <div className="mt-2">
                      <div className="text-[11px] text-gray-500 uppercase tracking-wide">Tags</div>
                      <TagChips labels={originalTags} empty="No tags yet" />
                    </div>
                    {item.importSourceUrl ? (
                      <a
                        href={item.importSourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-purple-300 hover:underline mt-2 inline-block"
                      >
                        {importSourceLinkLabel(item.importSourceUrl, item.importSource)}
                      </a>
                    ) : null}
                  </div>
                  <div className="bg-gray-900/70 rounded-lg p-3">
                    <div className="text-xs text-green-300 mb-1">Suggestion (MusicBrainz)</div>
                    {item.suggestion?.title ? (
                      <>
                        <div className="font-medium text-white">{item.suggestion.title}</div>
                        <div className="text-gray-400">{item.suggestion.artist}</div>
                        <div className="text-xs text-gray-500 mt-1">
                          {item.suggestion.album || 'No album'} · {formatDuration(item.suggestion.duration)}
                          {item.suggestion.releaseYear ? ` · ${item.suggestion.releaseYear}` : ''}
                          {item.suggestion.isrc ? ` · ${item.suggestion.isrc}` : ''}
                          {item.suggestion.matchType ? ` · ${item.suggestion.matchType}` : ''}
                        </div>
                        {newTags && newTags.length > 0 ? (
                          <div className="mt-2">
                            <div className="text-[11px] text-amber-400/90 uppercase tracking-wide">
                              New tags to add
                            </div>
                            <TagChips labels={newTags} tone="amber" />
                          </div>
                        ) : null}
                        <div className="mt-2">
                          <div className="text-[11px] text-gray-500 uppercase tracking-wide">
                            Suggested tags
                          </div>
                          <TagChips labels={suggestedTags} empty="No MB tags found" tone="green" />
                        </div>
                        {item.suggestion.musicbrainzId ? (
                          <a
                            href={`https://musicbrainz.org/recording/${item.suggestion.musicbrainzId}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs text-purple-300 hover:underline mt-2 inline-block"
                          >
                            View on MusicBrainz
                          </a>
                        ) : null}
                      </>
                    ) : (
                      <div className="text-gray-500">
                        {item.error || 'No suggestion'}
                      </div>
                    )}
                  </div>
                </div>

                {item.candidates && item.candidates.length > 1 && item.status === 'needs_review' ? (
                  <div className="space-y-2">
                    <div className="text-xs text-gray-400">Other candidates</div>
                    {item.candidates.map((c, idx) => (
                      <div
                        key={`${c.musicbrainzId || idx}`}
                        className="flex flex-wrap items-center justify-between gap-2 text-sm bg-gray-900/50 border border-gray-700 rounded px-3 py-2"
                      >
                        <div className="min-w-0">
                          <span className="text-white">{c.title}</span>
                          <span className="text-gray-400"> — {c.artist}</span>
                          <span className="text-gray-500 text-xs ml-2">
                            {(c.score != null ? `${(c.score * 100).toFixed(0)}%` : '')}
                            {c.matchType ? ` · ${c.matchType}` : ''}
                            {c.releaseYear ? ` · ${c.releaseYear}` : ''}
                          </span>
                          {c.tags && c.tags.length > 0 ? (
                            <TagChips labels={c.tags} tone="amber" />
                          ) : null}
                        </div>
                        <button
                          type="button"
                          disabled={busyId === item._id || batchBusy}
                          onClick={() => void handleChoose(item._id, idx)}
                          className="text-xs px-2 py-1 bg-purple-800 hover:bg-purple-700 rounded"
                        >
                          Use this
                        </button>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      {pages > 1 ? (
        <div className="flex items-center justify-between text-sm text-gray-400">
          <span>
            Page {page} of {pages} · {total} items
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="px-3 py-1 bg-gray-700 rounded disabled:opacity-40"
            >
              Prev
            </button>
            <button
              type="button"
              disabled={page >= pages}
              onClick={() => setPage((p) => Math.min(pages, p + 1))}
              className="px-3 py-1 bg-gray-700 rounded disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default MetadataEnrichmentAdmin;
