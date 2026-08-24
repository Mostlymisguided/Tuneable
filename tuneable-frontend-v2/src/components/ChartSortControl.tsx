import { ArrowUpDown } from 'lucide-react';
import {
  CHART_SORT_OPTIONS,
  chartSortLabel,
  type ChartSortKey,
} from '../utils/chartSort';

type TriggerProps = {
  sort: ChartSortKey;
  open: boolean;
  onToggle: () => void;
};

export function ChartSortTrigger({ sort, open, onToggle }: TriggerProps) {
  const label = chartSortLabel(sort);
  const active = open || sort !== 'most-tipped';

  return (
    <button
      type="button"
      onClick={onToggle}
      title={`Sort: ${label}`}
      aria-label={`Sort by ${label}`}
      aria-expanded={open}
      className={`p-2 rounded-lg hover:bg-gray-700 text-gray-200 transition-colors flex items-center justify-center ${
        active ? 'bg-gray-700 ring-1 ring-purple-500/50' : 'bg-gray-800'
      }`}
    >
      <ArrowUpDown className="h-4 w-4 text-purple-400" />
    </button>
  );
}

type PanelProps = {
  sort: ChartSortKey;
  onChange: (next: ChartSortKey) => void;
  onHide: () => void;
  hint?: string;
};

export function ChartSortPanel({ sort, onChange, onHide, hint }: PanelProps) {
  return (
    <div className="card p-3 md:p-6 mt-3 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-semibold text-white flex items-center">
          <ArrowUpDown className="h-4 w-4 mr-2 text-purple-400" />
          Sort
        </h3>
        <button
          type="button"
          onClick={onHide}
          className="text-sm text-gray-400 hover:text-white"
        >
          Hide
        </button>
      </div>
      <div className="flex flex-row flex-wrap gap-1 sm:gap-2 justify-center items-center">
        {CHART_SORT_OPTIONS.map((option) => (
          <button
            key={option.key}
            type="button"
            onClick={() => onChange(option.key)}
            className={`px-3 py-1.5 sm:py-2 rounded-md font-medium transition-colors text-xs sm:text-sm ${
              sort === option.key
                ? 'bg-purple-700 text-white'
                : 'bg-gray-800 text-gray-300 hover:bg-gray-600'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
      {hint ? (
        <p className="mt-3 text-center text-[11px] sm:text-xs text-gray-400">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export const CHART_ADDED_SORT_HINT =
  'Newest and oldest are when the tune was added to Tuneable.';

export const CHART_LIBRARY_SORT_HINT =
  'Newest and oldest are when this library last tipped the tune.';

export const CHART_PODCAST_SORT_HINT =
  'Newest and oldest use the episode publish date.';
