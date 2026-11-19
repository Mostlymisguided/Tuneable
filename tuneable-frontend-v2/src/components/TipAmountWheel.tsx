import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

/** Same ceiling as a wallet top-up (£1,111.00). */
const MAX_TIP_POUNDS = 1111;
const ITEM_HEIGHT = 36;
const PAD = 2;
const VIEW_HEIGHT = ITEM_HEIGHT * (PAD * 2 + 1);

const POUND_COUNT = MAX_TIP_POUNDS + 1;
const PENCE_COUNT = 100;
/** Odd so the pence column has a middle copy to rest in. Outer copies are the loop buffer. */
const LOOP_REPEATS = 9;

function mod(value: number, count: number): number {
  return ((value % count) + count) % count;
}

/** Move a scroll offset by whole cycles until it sits in [min, max). */
function shiftOffsetInto(offset: number, min: number, max: number, cycle: number): number {
  if (cycle <= 0) return offset;
  let next = offset;
  let guard = 0;
  while (next < min && guard < LOOP_REPEATS) {
    next += cycle;
    guard += 1;
  }
  guard = 0;
  while (next >= max && guard < LOOP_REPEATS) {
    next -= cycle;
    guard += 1;
  }
  return next;
}

function formatPounds(value: number): string {
  return String(value);
}

function formatPence(value: number): string {
  return String(value).padStart(2, '0');
}

function useCoarsePointer(): boolean {
  const query = '(hover: none), (pointer: coarse)';
  const [coarse, setCoarse] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(query).matches
  );

  useEffect(() => {
    const media = window.matchMedia(query);
    const onChange = () => setCoarse(media.matches);
    onChange();
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  return coarse;
}

type ColumnProps = {
  count: number;
  selected: number;
  format: (value: number) => string;
  onSelect: (value: number) => void;
  align: 'left' | 'right';
  widthClass: string;
  label: string;
  disabled?: boolean;
  /** Repeat the values so the column rolls from the last item back to the first. */
  loop?: boolean;
};

function AmountColumn({
  count,
  selected,
  format,
  onSelect,
  align,
  widthClass,
  label,
  disabled,
  loop = false,
}: ColumnProps) {
  const ref = useRef<HTMLDivElement>(null);
  const selectedRef = useRef(selected);
  const lastEmitted = useRef(selected);
  const programmatic = useRef(false);
  const settleTimer = useRef<number | null>(null);
  const onSelectRef = useRef(onSelect);
  selectedRef.current = selected;
  onSelectRef.current = onSelect;

  const repeats = loop ? LOOP_REPEATS : 1;
  const loopBase = loop ? count * Math.floor(LOOP_REPEATS / 2) : 0;
  const itemCount = count * repeats;
  const cycle = count * ITEM_HEIGHT;

  const jumpTo = (index: number) => {
    const el = ref.current;
    if (!el) return;
    programmatic.current = true;
    el.scrollTop = index * ITEM_HEIGHT;
    window.setTimeout(() => {
      programmatic.current = false;
    }, 60);
  };

  // Keep a long drag or trackpad scroll off the real ends. Shifting by a whole
  // cycle shows the same numbers, so the column can keep rolling.
  const holdAwayFromEnds = (el: HTMLDivElement) => {
    if (!loop) return;
    const next = shiftOffsetInto(el.scrollTop, cycle, cycle * (LOOP_REPEATS - 1), cycle);
    if (Math.abs(next - el.scrollTop) <= 1) return;
    programmatic.current = true;
    el.scrollTop = next;
    programmatic.current = false;
  };

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!loop) {
      const top = selected * ITEM_HEIGHT;
      if (lastEmitted.current === selected && Math.abs(el.scrollTop - top) <= 1) return;
      lastEmitted.current = selected;
      jumpTo(selected);
      return;
    }
    const shown = mod(Math.round(el.scrollTop / ITEM_HEIGHT), count);
    // A one-step wrap already scrolled onto the repeated neighbour. Keep that
    // row. scrollTop 0 is the initial position, which has no room above it.
    if (shown === selected && el.scrollTop > ITEM_HEIGHT) {
      lastEmitted.current = selected;
      holdAwayFromEnds(el);
      return;
    }
    lastEmitted.current = selected;
    jumpTo(loopBase + selected);
  }, [count, loop, loopBase, selected]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const settle = () => {
      if (programmatic.current) return;
      const maxIndex = itemCount - 1;
      const index = Math.max(0, Math.min(maxIndex, Math.round(el.scrollTop / ITEM_HEIGHT)));
      const value = loop ? mod(index, count) : index;
      // Looping columns always rest in the middle copy, on the same numbers.
      const top = (loop ? loopBase + value : index) * ITEM_HEIGHT;
      if (Math.abs(el.scrollTop - top) > 1) {
        programmatic.current = true;
        el.scrollTop = top;
        window.setTimeout(() => {
          programmatic.current = false;
        }, 60);
      }
      if (value !== selectedRef.current) {
        lastEmitted.current = value;
        onSelectRef.current(value);
      }
    };

    const onScroll = () => {
      if (programmatic.current) return;
      holdAwayFromEnds(el);
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
  }, [count, itemCount, loop, loopBase]);

  const nudge = (delta: number) => {
    const next = loop
      ? mod(selectedRef.current + delta, count)
      : Math.max(0, Math.min(count - 1, selectedRef.current + delta));
    if (next === selectedRef.current) return;
    lastEmitted.current = next;
    const el = ref.current;
    if (loop && el) {
      programmatic.current = true;
      el.scrollTop += delta * ITEM_HEIGHT;
      programmatic.current = false;
      holdAwayFromEnds(el);
    }
    onSelectRef.current(next);
  };

  const items = useMemo(() => {
    const nodes = [];
    for (let index = 0; index < itemCount; index += 1) {
      const value = loop ? index % count : index;
      nodes.push(
        <div
          key={index}
          className={`flex snap-center items-center text-xl font-semibold tabular-nums text-white ${
            align === 'right' ? 'justify-end pr-1' : 'justify-start pl-1'
          }`}
          style={{ height: ITEM_HEIGHT }}
        >
          {format(value)}
        </div>
      );
    }
    return nodes;
  }, [align, count, format, itemCount, loop]);

  return (
    <div
      ref={ref}
      role="spinbutton"
      aria-label={label}
      aria-valuenow={selected}
      aria-valuemin={0}
      aria-valuemax={count - 1}
      aria-valuetext={format(selected)}
      tabIndex={disabled ? -1 : 0}
      className={`${widthClass} h-[180px] overflow-y-scroll overscroll-y-contain snap-y snap-mandatory touch-pan-y [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${
        disabled ? 'pointer-events-none opacity-60' : ''
      }`}
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

type Props = {
  value: number;
  min?: number;
  disabled?: boolean;
  onChange: (pounds: number) => void;
};

export function TipAmountWheel({ value, min = 0.01, disabled, onChange }: Props) {
  const minCents = Math.max(1, Math.round(min * 100));
  const cents = Math.min(MAX_TIP_POUNDS * 100, Math.max(minCents, Math.round(value * 100)));
  const pounds = Math.floor(cents / 100);
  const pence = cents % 100;
  const poundsRef = useRef(pounds);
  const penceRef = useRef(pence);
  const onChangeRef = useRef(onChange);
  poundsRef.current = pounds;
  penceRef.current = pence;
  onChangeRef.current = onChange;

  const emit = (nextPounds: number, nextPence: number) => {
    const nextCents = Math.min(
      MAX_TIP_POUNDS * 100,
      Math.max(minCents, nextPounds * 100 + nextPence)
    );
    onChangeRef.current(nextCents / 100);
  };

  return (
    <div
      className="relative mx-auto mt-2 h-[180px] w-full max-w-[16rem]"
      style={{ height: VIEW_HEIGHT }}
    >
      <div className="pointer-events-none absolute inset-x-1 top-1/2 z-0 h-9 -translate-y-1/2 rounded-lg bg-white/15" />
      <div className="relative z-10 flex h-full items-stretch justify-center">
        <div className="flex w-7 items-center justify-end text-xl font-semibold text-white">£</div>
        <AmountColumn
          count={POUND_COUNT}
          selected={pounds}
          format={formatPounds}
          onSelect={(next) => emit(next, penceRef.current)}
          align="right"
          widthClass="w-16"
          label="Pounds"
          disabled={disabled}
        />
        <div className="flex w-4 items-center justify-center text-xl font-semibold text-white">.</div>
        <AmountColumn
          count={PENCE_COUNT}
          selected={pence}
          format={formatPence}
          onSelect={(next) => emit(poundsRef.current, next)}
          align="left"
          widthClass="w-12"
          label="Pence"
          disabled={disabled}
          loop
        />
      </div>
    </div>
  );
}

export { useCoarsePointer };
