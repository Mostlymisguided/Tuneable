import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { Minus, Plus } from 'lucide-react';
import { useCoarsePointer } from './TipAmountWheel';
import {
  BPM_FILTER_ALL,
  BPM_FILTER_MAX,
  BPM_FILTER_MIN,
  bpmFilterWithMax,
  bpmFilterWithMin,
  clampBpmBound,
  isBpmFilterActive,
  type BpmFilterRange,
} from '../utils/bpm';

const ITEM_HEIGHT = 36;
const PAD = 2;
const VIEW_HEIGHT = ITEM_HEIGHT * (PAD * 2 + 1);
const BPM_COUNT = BPM_FILTER_MAX - BPM_FILTER_MIN + 1;

type Props = {
  value: BpmFilterRange;
  onChange: (range: BpmFilterRange) => void;
};

function BpmColumn({
  selectedBpm,
  onSelect,
  label,
}: {
  selectedBpm: number;
  onSelect: (bpm: number) => void;
  label: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const selected = selectedBpm - BPM_FILTER_MIN;
  const selectedRef = useRef(selected);
  const lastEmitted = useRef(selected);
  const programmatic = useRef(false);
  const settleTimer = useRef<number | null>(null);
  const onSelectRef = useRef(onSelect);
  selectedRef.current = selected;
  onSelectRef.current = onSelect;

  const jumpTo = (index: number) => {
    const el = ref.current;
    if (!el) return;
    programmatic.current = true;
    el.scrollTop = index * ITEM_HEIGHT;
    window.setTimeout(() => {
      programmatic.current = false;
    }, 60);
  };

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const top = selected * ITEM_HEIGHT;
    if (lastEmitted.current === selected && Math.abs(el.scrollTop - top) <= 1) return;
    lastEmitted.current = selected;
    jumpTo(selected);
  }, [selected]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const settle = () => {
      if (programmatic.current) return;
      const index = Math.max(0, Math.min(BPM_COUNT - 1, Math.round(el.scrollTop / ITEM_HEIGHT)));
      const top = index * ITEM_HEIGHT;
      if (Math.abs(el.scrollTop - top) > 1) {
        programmatic.current = true;
        el.scrollTop = top;
        window.setTimeout(() => {
          programmatic.current = false;
        }, 60);
      }
      if (index !== selectedRef.current) {
        lastEmitted.current = index;
        onSelectRef.current(BPM_FILTER_MIN + index);
      }
    };

    const onScroll = () => {
      if (programmatic.current) return;
      if (settleTimer.current) window.clearTimeout(settleTimer.current);
      settleTimer.current = window.setTimeout(settle, 90);
    };

    const onScrollEnd = () => {
      if (settleTimer.current) window.clearTimeout(settleTimer.current);
      settle();
    };

    el.addEventListener('scroll', onScroll, { passive: true });
    el.addEventListener('scrollend', onScrollEnd);
    return () => {
      el.removeEventListener('scroll', onScroll);
      el.removeEventListener('scrollend', onScrollEnd);
      if (settleTimer.current) window.clearTimeout(settleTimer.current);
    };
  }, []);

  const nudge = (delta: number) => {
    const next = Math.max(0, Math.min(BPM_COUNT - 1, selectedRef.current + delta));
    if (next === selectedRef.current) return;
    lastEmitted.current = next;
    onSelectRef.current(BPM_FILTER_MIN + next);
  };

  const items = useMemo(() => {
    const nodes = [];
    for (let index = 0; index < BPM_COUNT; index += 1) {
      nodes.push(
        <div
          key={index}
          className="flex snap-center items-center justify-center text-xl font-semibold tabular-nums text-white"
          style={{ height: ITEM_HEIGHT }}
        >
          {BPM_FILTER_MIN + index}
        </div>
      );
    }
    return nodes;
  }, []);

  return (
    <div
      ref={ref}
      role="spinbutton"
      aria-label={label}
      aria-valuenow={selectedBpm}
      aria-valuemin={BPM_FILTER_MIN}
      aria-valuemax={BPM_FILTER_MAX}
      aria-valuetext={`${selectedBpm} BPM`}
      tabIndex={0}
      className="h-[180px] w-16 overflow-y-scroll overscroll-y-contain snap-y snap-mandatory touch-pan-y [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      style={{
        WebkitMaskImage:
          'linear-gradient(to bottom, transparent, #000 28%, #000 72%, transparent)',
        maskImage: 'linear-gradient(to bottom, transparent, #000 28%, #000 72%, transparent)',
      }}
      onKeyDown={(event) => {
        if (event.key === 'ArrowUp') {
          event.preventDefault();
          nudge(-1);
        } else if (event.key === 'ArrowDown') {
          event.preventDefault();
          nudge(1);
        }
      }}
    >
      <div style={{ height: ITEM_HEIGHT * PAD }} aria-hidden />
      {items}
      <div style={{ height: ITEM_HEIGHT * PAD }} aria-hidden />
    </div>
  );
}

function TouchWheels({ value, onChange }: Props) {
  const valueRef = useRef(value);
  const onChangeRef = useRef(onChange);
  valueRef.current = value;
  onChangeRef.current = onChange;

  return (
    <div className="mx-auto max-w-xs">
      <div className="mb-1 flex items-center justify-center">
        <span className="w-16 text-center text-xs font-semibold uppercase tracking-wide text-purple-300">
          From
        </span>
        <span className="w-8" />
        <span className="w-16 text-center text-xs font-semibold uppercase tracking-wide text-purple-300">
          To
        </span>
      </div>
      <div className="relative" style={{ height: VIEW_HEIGHT }}>
        <div className="pointer-events-none absolute inset-x-1 top-1/2 z-0 h-9 -translate-y-1/2 rounded-lg bg-white/15" />
        <div className="relative z-10 flex h-full items-stretch justify-center">
          <BpmColumn
            selectedBpm={value.min}
            label="From BPM"
            onSelect={(min) => onChangeRef.current(bpmFilterWithMin(valueRef.current, min))}
          />
          <div className="flex w-8 items-center justify-center text-xl font-semibold text-white/80">
            –
          </div>
          <BpmColumn
            selectedBpm={value.max}
            label="To BPM"
            onSelect={(max) => onChangeRef.current(bpmFilterWithMax(valueRef.current, max))}
          />
        </div>
      </div>
    </div>
  );
}

function NumberField({
  label,
  value,
  onCommit,
}: {
  label: string;
  value: number;
  onCommit: (next: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));

  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  const commit = (raw: string, delta = 0) => {
    const parsed = Number.parseInt(raw, 10);
    const base = Number.isFinite(parsed) ? parsed : value;
    onCommit(base + delta);
  };

  return (
    <div className="flex flex-col items-center gap-1.5">
      <span className="text-xs font-semibold uppercase tracking-wide text-purple-300">{label}</span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label={`Decrease ${label} BPM`}
          onPointerDown={(event) => event.preventDefault()}
          onClick={() => commit(draft, -1)}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-black transition-colors hover:bg-gray-200"
        >
          <Minus className="h-4 w-4" />
        </button>
        <input
          type="number"
          inputMode="numeric"
          aria-label={`${label} BPM`}
          min={BPM_FILTER_MIN}
          max={BPM_FILTER_MAX}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => commit(draft)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              commit(draft);
            } else if (event.key === 'ArrowUp') {
              event.preventDefault();
              commit(draft, 1);
            } else if (event.key === 'ArrowDown') {
              event.preventDefault();
              commit(draft, -1);
            }
          }}
          className="w-20 bg-transparent text-center text-2xl font-bold tabular-nums text-white focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
        <button
          type="button"
          aria-label={`Increase ${label} BPM`}
          onPointerDown={(event) => event.preventDefault()}
          onClick={() => commit(draft, 1)}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-black transition-colors hover:bg-gray-200"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function FineRange({ value, onChange }: Props) {
  const span = BPM_FILTER_MAX - BPM_FILTER_MIN;
  const leftPct = ((value.min - BPM_FILTER_MIN) / span) * 100;
  const rightPct = ((BPM_FILTER_MAX - value.max) / span) * 100;
  const midpoint = (BPM_FILTER_MIN + BPM_FILTER_MAX) / 2;
  const fromOnTop = value.max - value.min <= 0 && value.min >= midpoint;

  const onTrackPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).tagName === 'INPUT') return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) return;
    const ratio = (event.clientX - rect.left) / rect.width;
    const bpm = clampBpmBound(BPM_FILTER_MIN + ratio * span);
    const middle = (value.min + value.max) / 2;
    if (bpm <= middle) onChange(bpmFilterWithMin(value, bpm));
    else onChange(bpmFilterWithMax(value, bpm));
  };

  return (
    <div className="mx-auto max-w-md">
      <div className="mb-4 flex flex-wrap items-center justify-center gap-x-8 gap-y-4">
        <NumberField
          label="From"
          value={value.min}
          onCommit={(next) => onChange(bpmFilterWithMin(value, next))}
        />
        <NumberField
          label="To"
          value={value.max}
          onCommit={(next) => onChange(bpmFilterWithMax(value, next))}
        />
      </div>
      <div className="relative h-8 cursor-pointer" onPointerDown={onTrackPointerDown}>
        <div className="pointer-events-none absolute left-0 right-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-gray-700" />
        <div
          className="pointer-events-none absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-purple-500"
          style={{ left: `${leftPct}%`, right: `${rightPct}%` }}
        />
        <input
          className="bpm-range"
          type="range"
          min={BPM_FILTER_MIN}
          max={BPM_FILTER_MAX}
          step={1}
          value={value.min}
          aria-label="From BPM"
          style={{ zIndex: fromOnTop ? 5 : 3 }}
          onChange={(event) => onChange(bpmFilterWithMin(value, Number(event.target.value)))}
        />
        <input
          className="bpm-range"
          type="range"
          min={BPM_FILTER_MIN}
          max={BPM_FILTER_MAX}
          step={1}
          value={value.max}
          aria-label="To BPM"
          style={{ zIndex: fromOnTop ? 4 : 5 }}
          onChange={(event) => onChange(bpmFilterWithMax(value, Number(event.target.value)))}
        />
      </div>
      <div className="mt-1 flex justify-between text-[11px] tabular-nums text-gray-500">
        <span>{BPM_FILTER_MIN}</span>
        <span>{BPM_FILTER_MAX}</span>
      </div>
      <style>{`
        .bpm-range {
          -webkit-appearance: none;
          appearance: none;
          pointer-events: none;
          position: absolute;
          left: 0;
          top: 0;
          width: 100%;
          height: 32px;
          margin: 0;
          background: transparent;
        }
        .bpm-range:focus {
          outline: none;
        }
        .bpm-range::-webkit-slider-runnable-track {
          height: 32px;
          background: transparent;
        }
        .bpm-range::-webkit-slider-thumb {
          -webkit-appearance: none;
          pointer-events: auto;
          height: 22px;
          width: 22px;
          margin-top: 5px;
          border-radius: 999px;
          background: white;
          border: 2px solid #7e22ce;
          box-shadow: 0 1px 4px rgba(0, 0, 0, 0.35);
          cursor: grab;
        }
        .bpm-range:focus-visible::-webkit-slider-thumb {
          box-shadow: 0 0 0 3px rgba(168, 85, 247, 0.55);
        }
        .bpm-range::-moz-range-track {
          height: 32px;
          background: transparent;
          border: none;
        }
        .bpm-range::-moz-range-thumb {
          pointer-events: auto;
          height: 22px;
          width: 22px;
          border-radius: 999px;
          background: white;
          border: 2px solid #7e22ce;
          cursor: grab;
        }
      `}</style>
    </div>
  );
}

function RangeNote({ value, onChange }: Props) {
  const active = isBpmFilterActive(value);
  return (
    <div className="mt-3 flex flex-col items-center gap-2">
      <p className="text-center text-xs text-gray-400">
        {active ? 'Tunes without a BPM are hidden.' : 'The full range includes every tune.'}
      </p>
      {active ? (
        <button
          type="button"
          onClick={() => onChange(BPM_FILTER_ALL)}
          className="text-sm font-medium text-purple-300 hover:text-white"
        >
          Any BPM
        </button>
      ) : null}
    </div>
  );
}

export function BpmRangePicker({ value, onChange }: Props) {
  const coarse = useCoarsePointer();
  return (
    <div role="group" aria-label="BPM range">
      {coarse ? (
        <TouchWheels value={value} onChange={onChange} />
      ) : (
        <FineRange value={value} onChange={onChange} />
      )}
      <RangeNote value={value} onChange={onChange} />
    </div>
  );
}
