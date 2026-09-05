import { Headphones } from 'lucide-react';
import { catalogHiddenLabel } from '../utils/playableFilterPref';

type TriggerProps = {
  playableOnly: boolean;
  onToggle: () => void;
  hiddenCount?: number;
};

export function PlayableFilterTrigger({
  playableOnly,
  onToggle,
  hiddenCount = 0,
}: TriggerProps) {
  const detail = playableOnly
    ? hiddenCount > 0
      ? `−${hiddenCount}`
      : undefined
    : 'All';

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
      aria-label={playableOnly ? 'Playable only, on' : 'Playable only, off'}
      className={`px-3 sm:px-4 py-2 rounded-lg hover:bg-gray-700 text-gray-200 font-medium transition-colors text-xs sm:text-sm flex items-center gap-1.5 sm:gap-2 ${
        playableOnly ? 'bg-gray-700 ring-1 ring-purple-500/50' : 'bg-gray-800'
      }`}
    >
      <Headphones className="h-4 w-4 text-purple-400 flex-shrink-0" />
      Playable
      {detail ? (
        <span className="text-xs text-purple-300 font-normal">{detail}</span>
      ) : null}
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
