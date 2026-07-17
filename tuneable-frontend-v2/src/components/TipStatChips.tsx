import React from 'react';
import { buildTipStatChips, type TipStatChip } from '../utils/tipStats';

export interface TipStatChipsProps {
  minTip: number;
  avgTip?: number;
  championAggregate?: number;
  viewerAggregate?: number;
  viewerIsChampion?: boolean;
  disabled?: boolean;
  onSelect: (amount: number) => void;
  className?: string;
}

const TipStatChips: React.FC<TipStatChipsProps> = ({
  minTip,
  avgTip,
  championAggregate,
  viewerAggregate = 0,
  viewerIsChampion = false,
  disabled = false,
  onSelect,
  className = 'flex flex-wrap justify-center gap-2',
}) => {
  const chips = buildTipStatChips({
    minTip,
    avgTip,
    championAggregate,
    viewerAggregate,
    viewerIsChampion,
  });

  if (chips.length === 0) return null;

  return (
    <div className={className}>
      {chips.map((chip) => (
        <TipStatChipButton
          key={chip.label}
          chip={chip}
          disabled={disabled}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
};

function TipStatChipButton({
  chip,
  disabled,
  onSelect,
}: {
  chip: TipStatChip;
  disabled: boolean;
  onSelect: (amount: number) => void;
}) {
  const isChampion = chip.kind === 'champion';
  const isDisabled = disabled || Boolean(isChampion && chip.disabled);
  const buttonLabel =
    isChampion && chip.disabled
      ? chip.label
      : isChampion && chip.displayValue != null
        ? `${chip.label} £${chip.displayValue.toFixed(2)}`
        : `${chip.label} £${chip.value.toFixed(2)}`;

  return (
    <button
      type="button"
      onClick={() => {
        if (isDisabled) return;
        onSelect(chip.value);
      }}
      disabled={isDisabled}
      title={chip.title}
      className={`px-3 py-1 rounded-full border text-xs transition-colors disabled:cursor-not-allowed ${
          isChampion
          ? chip.disabled
            ? 'bg-amber-900/30 border-amber-500/30 text-amber-200/70'
            : 'bg-amber-900/40 border-amber-400/50 text-amber-100 hover:bg-amber-600 hover:text-white disabled:opacity-50'
          : 'bg-purple-800/50 border-purple-500/40 text-purple-200 hover:bg-purple-600 hover:text-white disabled:opacity-50'
      }`}
    >
      {buttonLabel}
    </button>
  );
}

export default TipStatChips;
