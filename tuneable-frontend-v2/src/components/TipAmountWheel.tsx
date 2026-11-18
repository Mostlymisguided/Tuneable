import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

/** Same ceiling as a wallet top-up (£1,111.00). */
const MAX_TIP_POUNDS = 1111;
const ITEM_HEIGHT = 36;
const PAD = 2;
const VIEW_HEIGHT = ITEM_HEIGHT * (PAD * 2 + 1);

const POUND_COUNT = MAX_TIP_POUNDS + 1;
const PENCE_COUNT = 100;

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
}: ColumnProps) {
  const ref = useRef<HTMLDivElement>(null);
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
      const index = Math.max(0, Math.min(count - 1, Math.round(el.scrollTop / ITEM_HEIGHT)));
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
        onSelectRef.current(index);
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
  }, [count]);

  const nudge = (delta: number) => {
    const next = Math.max(0, Math.min(count - 1, selectedRef.current + delta));
    if (next === selectedRef.current) return;
    lastEmitted.current = next;
    onSelectRef.current(next);
  };

  const items = useMemo(() => {
    const nodes = [];
    for (let value = 0; value < count; value += 1) {
      nodes.push(
        <div
          key={value}
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
  }, [align, count, format]);

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
        />
      </div>
    </div>
  );
}

export { useCoarsePointer };
