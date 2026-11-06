import React from 'react';

export interface TipMoment {
  timestampSeconds: number;
  note: string;
}

export function waveformPeaksOf(value: unknown): number[] | null {
  if (!Array.isArray(value) || value.length < 8) return null;
  const peaks = value.filter((peak) => typeof peak === 'number' && Number.isFinite(peak));
  return peaks.length >= 8 ? peaks : null;
}

interface WaveformBarsProps {
  peaks: number[];
  /** 0–1, colours bars up to the playhead. */
  progress?: number;
  onSelect?: (ratio: number) => void;
  className?: string;
}

const WaveformBars: React.FC<WaveformBarsProps> = ({
  peaks,
  progress = 0,
  onSelect,
  className = '',
}) => {
  const selectAt = (clientX: number, element: HTMLDivElement) => {
    if (!onSelect) return;
    const rect = element.getBoundingClientRect();
    if (!rect.width) return;
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    onSelect(ratio);
  };

  return (
    <div
      className={`flex h-7 items-center gap-px ${onSelect ? 'cursor-pointer' : ''} ${className}`}
      onClick={onSelect ? (event) => selectAt(event.clientX, event.currentTarget) : undefined}
      role={onSelect ? 'slider' : 'img'}
      aria-label={onSelect ? 'Choose a moment' : 'Waveform'}
    >
      {peaks.map((peak, index) => {
        const played = progress > 0 && (index + 0.5) / peaks.length <= progress;
        const height = Math.max(12, Math.round(Math.min(1, peak) * 100));
        return (
          <div
            key={index}
            className={`min-w-0 flex-1 rounded-sm ${played ? 'bg-white' : 'bg-purple-300/40'}`}
            style={{ height: `${height}%` }}
          />
        );
      })}
    </div>
  );
};

export default WaveformBars;
