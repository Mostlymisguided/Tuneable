import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { GitMerge, Loader2, AlertTriangle, RefreshCw } from 'lucide-react';
import { toast } from 'react-toastify';
import { mediaAPI } from '../lib/api';

interface MediaSummary {
  _id: string;
  uuid: string;
  title: string;
  artist: string;
  coverArt?: string | null;
  duration?: number;
  isrc?: string | null;
  globalMediaAggregate?: number;
  externalIds?: Record<string, string>;
  sources?: Record<string, string>;
}

interface MergePreview {
  source: MediaSummary;
  keep: MediaSummary;
  willReassign: {
    bids: number;
    comments: number;
    claims: number;
    parties: number;
    reports: number;
  };
  note?: string;
}

interface DuplicateCluster {
  key: string;
  reason: string;
  count: number;
  media: Array<{
    id: string;
    uuid: string;
    title: string;
    artist?: string;
    aggregate?: number;
  }>;
}

interface MediaMergePanelProps {
  initialSourceId?: string;
  onMerged?: () => void;
}

const MediaMergePanel: React.FC<MediaMergePanelProps> = ({ initialSourceId = '', onMerged }) => {
  const [sourceId, setSourceId] = useState(initialSourceId);
  const [keepId, setKeepId] = useState('');
  const [preview, setPreview] = useState<MergePreview | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isMerging, setIsMerging] = useState(false);
  const [duplicates, setDuplicates] = useState<{
    byIsrc: DuplicateCluster[];
    byTitleArtist: DuplicateCluster[];
  } | null>(null);
  const [loadingDupes, setLoadingDupes] = useState(false);

  useEffect(() => {
    if (initialSourceId) setSourceId(initialSourceId);
  }, [initialSourceId]);

  const loadDuplicates = useCallback(async () => {
    setLoadingDupes(true);
    try {
      const data = await mediaAPI.getLikelyDuplicates(40);
      setDuplicates(data);
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Failed to load duplicates');
    } finally {
      setLoadingDupes(false);
    }
  }, []);

  useEffect(() => {
    void loadDuplicates();
  }, [loadDuplicates]);

  const handlePreview = async () => {
    if (!sourceId.trim() || !keepId.trim()) {
      toast.error('Enter both source and keep media IDs (ObjectId or uuid)');
      return;
    }
    setIsPreviewing(true);
    setPreview(null);
    try {
      const data = await mediaAPI.previewMediaMerge(sourceId.trim(), keepId.trim());
      setPreview(data);
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Preview failed');
    } finally {
      setIsPreviewing(false);
    }
  };

  const handleMerge = async () => {
    if (!preview) {
      toast.error('Preview the merge first');
      return;
    }
    const confirmed = window.confirm(
      `Merge "${preview.source.title}" into "${preview.keep.title}"?\n\n`
      + `This moves ${preview.willReassign.bids} bid(s) and soft-deletes the source. This cannot be easily undone.`
    );
    if (!confirmed) return;

    setIsMerging(true);
    try {
      const result = await mediaAPI.mergeMedia(sourceId.trim(), keepId.trim());
      toast.success(result.message || 'Media merged');
      setPreview(null);
      setSourceId('');
      setKeepId('');
      await loadDuplicates();
      onMerged?.();
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Merge failed');
    } finally {
      setIsMerging(false);
    }
  };

  const applyClusterPair = (cluster: DuplicateCluster) => {
    const sorted = [...cluster.media].sort(
      (a, b) => (b.aggregate || 0) - (a.aggregate || 0)
    );
    if (sorted.length < 2) return;
    // Keep highest aggregate; merge the next as source
    setKeepId(sorted[0].uuid || sorted[0].id);
    setSourceId(sorted[1].uuid || sorted[1].id);
    setPreview(null);
    toast.info('Loaded suggested pair — preview before merging');
  };

  const renderClusterList = (clusters: DuplicateCluster[], title: string) => (
    <div className="space-y-2">
      <h4 className="text-sm font-medium text-gray-300">{title}</h4>
      {clusters.length === 0 ? (
        <p className="text-sm text-gray-500">None found</p>
      ) : (
        <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
          {clusters.map((cluster) => (
            <div
              key={`${cluster.reason}-${cluster.key}`}
              className="bg-gray-900/80 border border-gray-700 rounded-lg p-3"
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="min-w-0">
                  <div className="text-sm text-white truncate">{cluster.key}</div>
                  <div className="text-xs text-gray-500">
                    {cluster.count} copies · {cluster.reason}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => applyClusterPair(cluster)}
                  className="text-xs px-2 py-1 bg-purple-700 hover:bg-purple-600 rounded flex-shrink-0"
                >
                  Use pair
                </button>
              </div>
              <ul className="text-xs text-gray-400 space-y-1">
                {cluster.media.map((m) => (
                  <li key={m.id} className="flex justify-between gap-2">
                    <Link
                      to={`/tune/${m.uuid || m.id}`}
                      className="text-purple-300 hover:underline truncate"
                      target="_blank"
                      rel="noreferrer"
                    >
                      {m.title} {m.artist ? `— ${m.artist}` : ''}
                    </Link>
                    <span className="text-gray-500 flex-shrink-0">
                      £{((m.aggregate || 0) / 100).toFixed(2)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="bg-gray-800 rounded-lg p-4 border border-gray-700 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <GitMerge className="h-5 w-5 text-purple-400" />
          <h3 className="text-lg font-semibold text-white">Merge duplicate media</h3>
        </div>
        <button
          type="button"
          onClick={() => void loadDuplicates()}
          disabled={loadingDupes}
          className="text-sm px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded flex items-center gap-1.5"
        >
          {loadingDupes ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Refresh duplicates
        </button>
      </div>

      <p className="text-sm text-gray-400">
        Fold a duplicate (source) into the canonical track (keep). Tips and IDs move to keep;
        source is soft-deleted. Fuzzy import suggestions reduce new dupes — use this for leftovers.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-gray-400 mb-1">Source (duplicate to remove)</label>
          <input
            type="text"
            value={sourceId}
            onChange={(e) => {
              setSourceId(e.target.value);
              setPreview(null);
            }}
            placeholder="ObjectId or uuid"
            className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">Keep (canonical)</label>
          <input
            type="text"
            value={keepId}
            onChange={(e) => {
              setKeepId(e.target.value);
              setPreview(null);
            }}
            placeholder="ObjectId or uuid"
            className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white text-sm"
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void handlePreview()}
          disabled={isPreviewing}
          className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm flex items-center gap-2"
        >
          {isPreviewing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Preview merge
        </button>
        <button
          type="button"
          onClick={() => void handleMerge()}
          disabled={!preview || isMerging}
          className="px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 rounded-lg text-sm flex items-center gap-2"
        >
          {isMerging ? <Loader2 className="h-4 w-4 animate-spin" /> : <GitMerge className="h-4 w-4" />}
          Confirm merge
        </button>
      </div>

      {preview && (
        <div className="bg-amber-950/30 border border-amber-800/60 rounded-lg p-3 space-y-3">
          <div className="flex items-start gap-2 text-amber-200 text-sm">
            <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <span>
              Will reassign {preview.willReassign.bids} bids, {preview.willReassign.parties} parties,
              {' '}{preview.willReassign.comments} comments, {preview.willReassign.claims} claims,
              {' '}{preview.willReassign.reports} reports.
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            <div className="bg-gray-900/70 rounded p-3">
              <div className="text-xs text-red-300 mb-1">Source (removed)</div>
              <div className="font-medium text-white">{preview.source.title}</div>
              <div className="text-gray-400">{preview.source.artist}</div>
              <Link
                to={`/tune/${preview.source.uuid}`}
                className="text-xs text-purple-300 hover:underline"
                target="_blank"
                rel="noreferrer"
              >
                Open
              </Link>
            </div>
            <div className="bg-gray-900/70 rounded p-3">
              <div className="text-xs text-green-300 mb-1">Keep</div>
              <div className="font-medium text-white">{preview.keep.title}</div>
              <div className="text-gray-400">{preview.keep.artist}</div>
              <Link
                to={`/tune/${preview.keep.uuid}`}
                className="text-xs text-purple-300 hover:underline"
                target="_blank"
                rel="noreferrer"
              >
                Open
              </Link>
            </div>
          </div>
        </div>
      )}

      {duplicates && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-2 border-t border-gray-700">
          {renderClusterList(duplicates.byIsrc, 'Same ISRC')}
          {renderClusterList(duplicates.byTitleArtist, 'Exact title + artist')}
        </div>
      )}
    </div>
  );
};

export default MediaMergePanel;
