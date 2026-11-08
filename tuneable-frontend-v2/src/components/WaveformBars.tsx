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

/** Stable bar heights when a tune has not been scanned yet. */
export function placeholderWaveformPeaks(seed: string, bars = 96): number[] {
  let hash = 2166136261;
  const source = seed || 'tuneable';
  for (let i = 0; i < source.length; i += 1) {
    hash ^= source.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const peaks: number[] = [];
  for (let i = 0; i < bars; i += 1) {
    hash = Math.imul(hash ^ (hash >>> 16), 2246822519);
    const noise = (hash >>> 0) / 4294967295;
    const envelope = 0.35 + 0.65 * Math.abs(Math.sin((i / bars) * Math.PI * 5 + noise * 0.4));
    peaks.push(Math.round(Math.min(1, 0.18 + envelope * (0.42 + noise * 0.4)) * 100) / 100);
  }
  return peaks;
}

interface WaveformBarsProps {
  peaks: number[];
  /** 0–1, colours bars up to the playhead. */
  progress?: number;
  onSelect?: (ratio: number) => void;
  className?: string;
  /** Tailwind height for the bar row. Defaults to the compact queue size. */
  heightClass?: string;
}

const WaveformBars: React.FC<WaveformBarsProps> = ({
  peaks,
  progress = 0,
  onSelect,
  className = '',
  heightClass = 'h-7',
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
      className={`flex ${heightClass} items-center gap-px ${onSelect ? 'cursor-pointer' : ''} ${className}`}
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
