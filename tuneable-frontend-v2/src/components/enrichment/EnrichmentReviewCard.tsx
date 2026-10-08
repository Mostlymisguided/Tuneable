import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, ChevronDown, ChevronRight, ExternalLink, Loader2, X } from 'lucide-react';
import {
  REVIEWABLE_STATUSES,
  formatDuration,
  formatRelease,
  formatSuggestionArtist,
  type EnrichmentItem,
} from './types';

const STATUS_LABELS: Record<string, string> = {
  needs_review: 'needs review',
  pending: 'waiting',
  processing: 'processing',
  failed: 'failed',
  auto_applied: 'auto-applied',
  applied: 'applied',
  dismissed: 'dismissed',
  skipped: 'skipped',
};

function importSourceLinkLabel(url: string, importSource?: string) {
  if (importSource === 'soundcloud_likes' || url.includes('soundcloud.com')) return 'View on SoundCloud';
  if (importSource === 'spotify_likes' || url.includes('spotify.com')) return 'View on Spotify';
  if (importSource?.startsWith('youtube') || url.includes('youtube.com')) return 'View on YouTube';
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
        <span key={tag} className={`px-2 py-0.5 rounded text-[11px] border ${toneClass}`}>
          {tag}
        </span>
      ))}
    </div>
  );
}

const EnrichmentReviewCard: React.FC<{
  item: EnrichmentItem;
  selected: boolean;
  busy: boolean;
  onToggleSelect: () => void;
  onApply: () => void;
  onDismiss: () => void;
  onChoose: (candidateIndex: number) => void;
  onPreviewCandidate: (candidateIndex: number) => Promise<void>;
}> = ({ item, selected, busy, onToggleSelect, onApply, onDismiss, onChoose, onPreviewCandidate }) => {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [previewing, setPreviewing] = useState<number | null>(null);

  const suggestion = item.suggestion;
  const suggestedTags = suggestion?.tags?.length ? suggestion.tags : suggestion?.genres;
  const originalTags = item.original?.tags?.length ? item.original.tags : item.currentTags;
  const newTags = item.newTags?.length
    ? item.newTags
    : (item.enrichTagsOnly ? suggestedTags : undefined);
  const canReview = REVIEWABLE_STATUSES.includes(item.status);

  const currentRelease = formatRelease(
    item.currentReleaseDate,
    item.currentReleaseDatePrecision,
    item.original?.releaseYear || item.currentReleaseYear
  );
  const suggestedRelease = formatRelease(
    suggestion?.releaseDate,
    suggestion?.releaseDatePrecision,
    suggestion?.releaseYear
  );
  const releaseChanges = Boolean(suggestedRelease && suggestedRelease !== currentRelease);

  const toggleCandidate = async (index: number, alreadyFetched?: boolean) => {
    const willExpand = !expanded.has(index);
    setExpanded((prev) => {
      const next = new Set(prev);
      if (willExpand) next.add(index);
      else next.delete(index);
      return next;
    });
    if (!willExpand || alreadyFetched) return;
    setPreviewing(index);
    try {
      await onPreviewCandidate(index);
    } finally {
      setPreviewing(null);
    }
  };

  return (
    <div className={`bg-gray-800 border rounded-lg p-4 space-y-3 ${selected ? 'border-teal-600' : 'border-gray-700'}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex gap-3">
          {canReview && suggestion?.title ? (
            <input
              type="checkbox"
              checked={selected}
              onChange={onToggleSelect}
              className="mt-1 rounded border-gray-600"
              aria-label={`Select ${item.original?.title || item._id}`}
            />
          ) : null}
          <div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-gray-400 mb-1">
              <span className="px-2 py-0.5 rounded border border-gray-600">
                {STATUS_LABELS[item.status] || item.status}
              </span>
              {item.confidence ? (
                <span className="px-2 py-0.5 rounded border border-amber-700 text-amber-200">
                  {item.confidence}
                  {suggestion?.score != null ? ` · ${(suggestion.score * 100).toFixed(0)}%` : ''}
                </span>
              ) : null}
              {item.enrichTagsOnly ? (
                <span className="px-2 py-0.5 rounded border border-teal-800 text-teal-200">tags only</span>
              ) : null}
              {item.importSource ? (
                <span className="text-gray-500">{item.importSource.replace(/_/g, ' ')}</span>
              ) : null}
              {item.importedBy?.username ? <span>by @{item.importedBy.username}</span> : null}
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
            {suggestion?.title ? (
              <button
                type="button"
                disabled={busy}
                onClick={onApply}
                className="px-3 py-1.5 bg-green-700 hover:bg-green-600 disabled:opacity-50 rounded text-sm flex items-center gap-1"
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                Apply
              </button>
            ) : null}
            <button
              type="button"
              disabled={busy}
              onClick={onDismiss}
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
            {currentRelease ? ` · ${currentRelease}` : ' · no release date'}
            {item.original?.isrc || item.currentIsrc ? ` · ${item.original?.isrc || item.currentIsrc}` : ''}
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
          {suggestion?.title ? (
            <>
              <div className="font-medium text-white">{suggestion.title}</div>
              <div className="text-gray-400">{formatSuggestionArtist(suggestion)}</div>
              <div className="text-xs text-gray-500 mt-1">
                {suggestion.album || 'No album'} · {formatDuration(suggestion.duration)}
                {suggestion.isrc ? ` · ${suggestion.isrc}` : ''}
                {suggestion.matchType ? ` · matched by ${suggestion.matchType}` : ''}
              </div>
              {releaseChanges ? (
                <div className="text-xs mt-1 text-amber-200">
                  Release date: {currentRelease || 'none'} → {suggestedRelease}
                </div>
              ) : null}
              {newTags && newTags.length > 0 ? (
                <div className="mt-2">
                  <div className="text-[11px] text-amber-400/90 uppercase tracking-wide">New tags to add</div>
                  <TagChips labels={newTags} tone="amber" />
                </div>
              ) : null}
              <div className="mt-2">
                <div className="text-[11px] text-gray-500 uppercase tracking-wide">Suggested tags</div>
                <TagChips labels={suggestedTags} empty="No MB tags found" tone="green" />
              </div>
              {suggestion.musicbrainzId ? (
                <a
                  href={`https://musicbrainz.org/recording/${suggestion.musicbrainzId}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-purple-300 hover:underline mt-2 inline-block"
                >
                  View on MusicBrainz
                </a>
              ) : null}
            </>
          ) : (
            <div className="text-gray-500">{item.error || 'No suggestion'}</div>
          )}
        </div>
      </div>

      {item.candidates && item.candidates.length > 1 && item.status === 'needs_review' ? (
        <div className="space-y-2">
          <div className="text-xs text-gray-400">Other candidates</div>
          {item.candidates.slice(1).map((c, offset) => {
            const idx = offset + 1;
            const isExpanded = expanded.has(idx);
            const candidateTags = c.tags?.length ? c.tags : c.genres;
            const candidateRelease = formatRelease(c.releaseDate, c.releaseDatePrecision, c.releaseYear);

            return (
              <div
                key={`${c.musicbrainzId || idx}`}
                className="bg-gray-900/50 border border-gray-700 rounded px-3 py-2 space-y-2"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => void toggleCandidate(idx, c.detailsFetched)}
                    className="min-w-0 flex-1 text-left flex items-start gap-1.5 group"
                    aria-expanded={isExpanded}
                  >
                    <span className="mt-0.5 text-gray-500 group-hover:text-gray-300 shrink-0">
                      {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                    </span>
                    <span className="min-w-0 text-sm">
                      <span className="text-white">{c.title}</span>
                      <span className="text-gray-400"> — {formatSuggestionArtist(c)}</span>
                      <span className="text-gray-500 text-xs ml-2">
                        {c.score != null ? `${(c.score * 100).toFixed(0)}%` : ''}
                        {c.matchType ? ` · ${c.matchType}` : ''}
                        {candidateRelease ? ` · ${candidateRelease}` : ''}
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onChoose(idx)}
                    className="text-xs px-2 py-1 bg-purple-800 hover:bg-purple-700 rounded shrink-0"
                  >
                    Use this
                  </button>
                </div>

                {isExpanded ? (
                  <div className="pl-5 space-y-2 text-sm border-t border-gray-700/80 pt-2">
                    <div className="text-xs text-gray-500">
                      {c.album || 'No album'} · {formatDuration(c.duration)}
                      {candidateRelease ? ` · ${candidateRelease}` : ''}
                      {c.isrc ? ` · ${c.isrc}` : ''}
                    </div>
                    <div>
                      <div className="text-[11px] text-gray-500 uppercase tracking-wide">Tags</div>
                      {previewing === idx ? (
                        <div className="flex items-center gap-1.5 text-xs text-gray-500 mt-1">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          Loading MusicBrainz details…
                        </div>
                      ) : (
                        <TagChips labels={candidateTags} empty="No MB tags found" tone="amber" />
                      )}
                    </div>
                    {c.musicbrainzId ? (
                      <a
                        href={`https://musicbrainz.org/recording/${c.musicbrainzId}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-purple-300 hover:underline inline-block"
                      >
                        View on MusicBrainz
                      </a>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
};

export default EnrichmentReviewCard;
