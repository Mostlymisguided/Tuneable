import React, { useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import {
  LOCATION_SCOPE_OPTIONS,
  locationScopeLabel,
  type LocationScope,
} from '../utils/locationHelpers';

interface ChartLocationScopeToggleProps {
  value: LocationScope;
  onChange: (scope: LocationScope) => void;
}

const ChartLocationScopeToggle: React.FC<ChartLocationScopeToggleProps> = ({
  value,
  onChange,
}) => {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  if (open) {
    return (
      <div
        className="flex w-full flex-wrap justify-center gap-x-3 gap-y-1 mb-3"
        role="radiogroup"
        aria-label="Location chart scope"
      >
        {LOCATION_SCOPE_OPTIONS.map((option) => {
          const selected = option.id === value;
          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => {
                onChange(option.id);
                setOpen(false);
              }}
              className={`text-[10px] sm:text-xs font-semibold tracking-[0.18em] uppercase transition-colors ${
                selected
                  ? 'text-purple-200'
                  : 'text-purple-300/50 hover:text-purple-200'
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="group flex w-full items-center justify-center gap-1 mb-3 text-[10px] sm:text-xs font-semibold tracking-[0.2em] uppercase text-purple-300/80 hover:text-purple-200 transition-colors"
      aria-haspopup="true"
      aria-expanded={false}
      aria-label={`Chart scope ${locationScopeLabel(value)}. Change to In, From, or Supported by.`}
    >
      {locationScopeLabel(value)}
      <ChevronDown className="h-3 w-3 opacity-50 group-hover:opacity-90 transition-opacity" />
    </button>
  );
};

export default ChartLocationScopeToggle;
