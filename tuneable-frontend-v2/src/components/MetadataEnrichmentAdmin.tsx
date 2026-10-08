import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCheck, Loader2, RefreshCw, Sparkles, X } from 'lucide-react';
import { toast } from '../utils/toast';
import { mediaAPI } from '../lib/api';
import EnrichmentCoverageCard from './enrichment/EnrichmentCoverageCard';
import EnrichNowPanel from './enrichment/EnrichNowPanel';
import EnrichmentReviewCard from './enrichment/EnrichmentReviewCard';
import {
  REVIEWABLE_STATUSES,
  type EnrichmentCoverage,
  type EnrichmentGroup,
  type EnrichmentItem,
} from './enrichment/types';

const GROUP_TABS: Array<{ value: EnrichmentGroup; label: string; empty: string }> = [
  { value: 'review', label: 'Needs review', empty: 'Nothing waiting for review.' },
  { value: 'in_progress', label: 'In progress', empty: 'No tracks waiting to be matched.' },
  { value: 'done', label: 'Done', empty: 'No applied matches yet.' },
  { value: 'ignored', label: 'Ignored', empty: 'No dismissed or skipped tracks.' },
];

const MetadataEnrichmentAdmin: React.FC = () => {
  const [group, setGroup] = useState<EnrichmentGroup>('review');
  const [items, setItems] = useState<EnrichmentItem[]>([]);
  const [groupCounts, setGroupCounts] = useState<Partial<Record<EnrichmentGroup, number>>>({});
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [coverage, setCoverage] = useState<EnrichmentCoverage | null>(null);
  const [coverageLoading, setCoverageLoading] = useState(false);
  const [batchBusy, setBatchBusy] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await mediaAPI.getEnrichments({ group, page, limit: 25 });
      setItems(data.items || []);
      setGroupCounts(data.groupCounts || {});
      setPages(data.pagination?.pages || 1);
      setTotal(data.pagination?.total || 0);
      setSelected(new Set());
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Failed to load enrichment queue');
    } finally {
      setLoading(false);
    }
  }, [group, page]);

  const loadCoverage = useCallback(async () => {
    setCoverageLoading(true);
    try {
      const data = await mediaAPI.getEnrichmentCoverage();
      setCoverage(data.coverage || null);
    } catch {
      setCoverage(null);
    } finally {
      setCoverageLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadCoverage();
  }, [loadCoverage]);

  const refreshAll = useCallback(() => {
    void load();
    void loadCoverage();
  }, [load, loadCoverage]);

  const handleEnrichDone = (switchTo?: EnrichmentGroup) => {
    void loadCoverage();
    if (switchTo && switchTo !== group) {
      setGroup(switchTo);
      setPage(1);
    } else {
      void load();
    }
  };

  const reviewableIds = useMemo(
    () => items
      .filter((item) => REVIEWABLE_STATUSES.includes(item.status) && item.suggestion?.title)
      .map((item) => item._id),
    [items]
  );
  const allReviewableSelected = reviewableIds.length > 0 && reviewableIds.every((id) => selected.has(id));

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const runItemAction = async (id: string, action: () => Promise<unknown>, success: string, failure: string) => {
    setBusyId(id);
    try {
      await action();
      toast.success(success);
      await load();
    } catch (error: any) {
      toast.error(error?.response?.data?.error || failure);
    } finally {
      setBusyId(null);
    }
  };

  const handlePreviewCandidate = async (itemId: string, candidateIndex: number) => {
    try {
      const data = await mediaAPI.previewEnrichmentCandidate(itemId, candidateIndex);
      if (!data?.candidate) return;
      setItems((prev) =>
        prev.map((item) => {
          if (item._id !== itemId || !item.candidates) return item;
          const candidates = item.candidates.map((c, i) =>
            i === candidateIndex ? { ...c, ...data.candidate, detailsFetched: true } : c
          );
          return { ...item, candidates };
        })
      );
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Failed to load candidate details');
    }
  };

  const handleBatch = async (kind: 'apply' | 'dismiss') => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    setBatchBusy(true);
    try {
      if (kind === 'apply') {
        const result = await mediaAPI.batchApplyEnrichments(ids);
        toast.success(`Applied ${result.applied}${result.failed ? `, ${result.failed} failed` : ''}`);
      } else {
        const result = await mediaAPI.batchDismissEnrichments(ids);
        toast.success(`Dismissed ${result.dismissed}${result.failed ? `, ${result.failed} failed` : ''}`);
      }
      await load();
    } catch (error: any) {
      toast.error(error?.response?.data?.error || `Batch ${kind} failed`);
    } finally {
      setBatchBusy(false);
    }
  };

  const activeTab = GROUP_TABS.find((t) => t.value === group) || GROUP_TABS[0];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-amber-400" />
            Metadata enrichment
          </h2>
          <p className="text-sm text-gray-400 mt-1">
            Match tracks to MusicBrainz to fill in tags, release dates and locations.
          </p>
        </div>
        <button
          type="button"
          onClick={refreshAll}
          disabled={loading}
          className="px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm flex items-center gap-2"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Refresh
        </button>
      </div>

      <EnrichmentCoverageCard coverage={coverage} loading={coverageLoading} />

      <EnrichNowPanel onDone={handleEnrichDone} />

      <div className="flex flex-wrap gap-2 text-xs">
        {GROUP_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => {
              setGroup(tab.value);
              setPage(1);
            }}
            className={`px-3 py-1.5 rounded-full border ${
              group === tab.value
                ? 'bg-purple-700/50 border-purple-500 text-white'
                : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-500'
            }`}
          >
            {tab.label}
            {groupCounts[tab.value] != null ? ` · ${groupCounts[tab.value]}` : ''}
          </button>
        ))}
      </div>

      {reviewableIds.length > 0 ? (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-gray-700 bg-gray-900/60 px-3 py-2">
          <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
            <input
              type="checkbox"
              checked={allReviewableSelected}
              onChange={() => setSelected(allReviewableSelected ? new Set() : new Set(reviewableIds))}
              className="rounded border-gray-600"
            />
            Select all on page ({reviewableIds.length})
          </label>
          <span className="text-xs text-gray-500">{selected.size} selected</span>
          <button
            type="button"
            disabled={selected.size === 0 || batchBusy}
            onClick={() => void handleBatch('apply')}
            className="px-3 py-1.5 bg-green-700 hover:bg-green-600 disabled:opacity-40 rounded text-sm flex items-center gap-1"
          >
            {batchBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCheck className="h-3.5 w-3.5" />}
            Apply selected
          </button>
          <button
            type="button"
            disabled={selected.size === 0 || batchBusy}
            onClick={() => void handleBatch('dismiss')}
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
          {activeTab.empty}
        </div>
      ) : (
        <div className="space-y-4">
          {items.map((item) => (
            <EnrichmentReviewCard
              key={item._id}
              item={item}
              selected={selected.has(item._id)}
              busy={busyId === item._id || batchBusy}
              onToggleSelect={() => toggleSelect(item._id)}
              onApply={() => void runItemAction(
                item._id,
                () => mediaAPI.applyEnrichment(item._id),
                'Metadata applied',
                'Apply failed'
              )}
              onDismiss={() => void runItemAction(
                item._id,
                () => mediaAPI.dismissEnrichment(item._id),
                'Dismissed',
                'Dismiss failed'
              )}
              onChoose={(idx) => void runItemAction(
                item._id,
                () => mediaAPI.chooseEnrichmentCandidate(item._id, idx),
                'Candidate applied',
                'Failed to apply candidate'
              )}
              onPreviewCandidate={(idx) => handlePreviewCandidate(item._id, idx)}
            />
          ))}
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
