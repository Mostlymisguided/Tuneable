import { useEffect, useState } from 'react';
import { Headphones, Loader2 } from 'lucide-react';
import { catalogHiddenLabel } from '../utils/playableFilterPref';

/** True only after `pending` has lasted long enough to be worth a progress bar. */
export function useChartLag(pending: boolean, delay = 200) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!pending) {
      setVisible(false);
      return;
    }
    const id = window.setTimeout(() => setVisible(true), delay);
    return () => window.clearTimeout(id);
  }, [pending, delay]);
  return visible;
}

export function ChartRefreshBar({ label = 'Updating the chart…' }: { label?: string }) {
  return (
    <div className="mb-3" role="status" aria-live="polite">
      <div
        className="h-1 w-full overflow-hidden rounded-full bg-gray-800"
        role="progressbar"
        aria-label={label}
      >
        <div className="h-full w-full bg-gradient-to-r from-purple-600 via-pink-400 to-purple-600 bg-[length:200%_100%] animate-upload-shimmer" />
      </div>
      <p className="mt-1.5 text-center text-xs text-purple-300/90">{label}</p>
    </div>
  );
}

type TriggerProps = {
  playableOnly: boolean;
  onToggle: () => void;
  busy?: boolean;
};

export function PlayableFilterTrigger({
  playableOnly,
  onToggle,
  busy = false,
}: TriggerProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      title={
        playableOnly
          ? 'Showing playable tunes. Click to include catalog tracks awaiting rights.'
          : 'Showing all tunes, including catalog tracks awaiting rights.'
      }
      aria-pressed={playableOnly}
      aria-busy={busy}
      aria-label={playableOnly ? 'Showing playable. Click to show all.' : 'Showing all. Click to show playable only.'}
      className={`px-3 sm:px-4 py-2 rounded-lg hover:bg-gray-700 text-gray-200 font-medium transition-colors text-xs sm:text-sm flex items-center gap-1.5 sm:gap-2 ${
        playableOnly || busy ? 'bg-gray-700 ring-1 ring-purple-500/50' : 'bg-gray-800'
      }`}
    >
      <Headphones className="h-4 w-4 text-purple-400 flex-shrink-0" />
      {playableOnly ? 'Playable' : 'All'}
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin text-purple-300" /> : null}
    </button>
  );
}

type HintProps = {
  playableOnly: boolean;
  hiddenCount: number;
  onShowAll: () => void;
};

export function PlayableFilterHint({
  playableOnly,
  hiddenCount,
  onShowAll,
}: HintProps) {
  if (!playableOnly || hiddenCount <= 0) return null;
  return (
    <p className="text-center text-xs text-gray-400 mt-2">
      Showing playable only ·{' '}
      <button
        type="button"
        onClick={onShowAll}
        className="text-purple-300 hover:text-white underline-offset-2 hover:underline"
      >
        {catalogHiddenLabel(hiddenCount)}
      </button>
    </p>
  );
}

type EmptyProps = {
  hiddenCount: number;
  onShowAll: () => void;
  className?: string;
};

export function PlayableEmptyState({
  hiddenCount,
  onShowAll,
  className = '',
}: EmptyProps) {
  return (
    <div className={`text-center py-8 ${className}`}>
      <p className="text-gray-300 font-medium">No playable audio here yet</p>
      {hiddenCount > 0 ? (
        <button
          type="button"
          onClick={onShowAll}
          className="mt-3 px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-purple-200 text-sm font-medium transition-colors"
        >
          Show catalog ({hiddenCount})
        </button>
      ) : null}
    </div>
  );
}
