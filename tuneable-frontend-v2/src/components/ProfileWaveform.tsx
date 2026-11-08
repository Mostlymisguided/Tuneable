import React from 'react';
import WaveformBars, { placeholderWaveformPeaks, waveformPeaksOf } from './WaveformBars';
import { usePodcastPlayerStore } from '../stores/podcastPlayerStore';
import { useWebPlayerStore } from '../stores/webPlayerStore';

function formatClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function sameMedia(activeId: string, keys: string[]): boolean {
  return Boolean(activeId) && keys.some((key) => key && key === activeId);
}

interface ProfileWaveformProps {
  peaks: unknown;
  mediaKeys: Array<string | null | undefined>;
  duration?: number | null;
  player: 'web' | 'podcast';
  onSeek?: (seconds: number) => void;
  caption?: string | null;
}

const ProfileWaveform: React.FC<ProfileWaveformProps> = ({
  peaks,
  mediaKeys,
  duration,
  player,
  onSeek,
  caption,
}) => {
  const keys = mediaKeys.map((key) => (key ? String(key) : '')).filter(Boolean);

  const webId = useWebPlayerStore((state) => String(state.currentMedia?._id || state.currentMedia?.id || ''));
  const webTime = useWebPlayerStore((state) => state.currentTime);
  const webDuration = useWebPlayerStore((state) => state.duration);
  const podcastId = usePodcastPlayerStore((state) => String(state.currentEpisode?._id || state.currentEpisode?.id || ''));
  const podcastTime = usePodcastPlayerStore((state) => state.currentTime);
  const podcastDuration = usePodcastPlayerStore((state) => state.duration);

  const activeId = player === 'podcast' ? podcastId : webId;
  const elapsedLive = player === 'podcast' ? podcastTime : webTime;
  const liveDuration = player === 'podcast' ? podcastDuration : webDuration;
  const active = sameMedia(activeId, keys);
  const elapsed = active ? elapsedLive || 0 : 0;
  const durationSeconds = active ? liveDuration || 0 : 0;
  const progress = durationSeconds > 0 ? Math.max(0, Math.min(1, elapsed / durationSeconds)) : 0;
  const bars = waveformPeaksOf(peaks) || placeholderWaveformPeaks(keys.join(':') || 'tuneable');
  const total = durationSeconds > 0
    ? durationSeconds
    : (typeof duration === 'number' && duration > 0 ? duration : 0);

  const selectAt = onSeek
    ? (ratio: number) => {
        if (!total) return;
        onSeek(Math.max(0, ratio * total));
      }
    : undefined;

  return (
    <div className="mb-6 px-2 md:px-0">
      <div className="max-w-2xl mx-auto rounded-lg border border-white/10 bg-black/25 px-3 py-4 md:px-5 md:py-5">
        <WaveformBars
          peaks={bars}
          progress={progress}
          onSelect={selectAt}
          heightClass="h-20 md:h-28"
        />
        <div className="mt-2 flex items-center justify-between text-xs tabular-nums text-gray-400">
          <span>{formatClock(elapsed)}</span>
          <span>{total ? formatClock(total) : ''}</span>
        </div>
        {caption ? (
          <p className="mt-2 text-center text-xs text-purple-200/90">{caption}</p>
        ) : null}
      </div>
    </div>
  );
};

export default ProfileWaveform;
