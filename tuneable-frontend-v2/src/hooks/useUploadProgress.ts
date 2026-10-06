import { useCallback, useEffect, useRef, useState } from 'react';
import type { AxiosProgressEvent } from 'axios';

export type UploadPhase = 'idle' | 'uploading' | 'processing';

export interface UploadProgressState {
  phase: UploadPhase;
  loaded: number;
  total: number;
  percent: number;
  bytesPerSecond: number | null;
  secondsRemaining: number | null;
}

const IDLE: UploadProgressState = {
  phase: 'idle',
  loaded: 0,
  total: 0,
  percent: 0,
  bytesPerSecond: null,
  secondsRemaining: null,
};

// Weight of the newest speed sample; lower is smoother but slower to react.
const SPEED_SMOOTHING = 0.2;

/**
 * Tracks an axios upload: byte progress, smoothed speed and ETA, a
 * "processing" phase once every byte is sent, and an abort signal for cancel.
 * Warns before the tab is closed while an upload is in flight.
 */
export function useUploadProgress() {
  const [state, setState] = useState<UploadProgressState>(IDLE);
  const controllerRef = useRef<AbortController | null>(null);
  const lastSampleRef = useRef<{ time: number; loaded: number } | null>(null);
  const speedRef = useRef<number | null>(null);

  const start = useCallback((totalBytes = 0) => {
    controllerRef.current?.abort();
    controllerRef.current = new AbortController();
    lastSampleRef.current = { time: performance.now(), loaded: 0 };
    speedRef.current = null;
    setState({ ...IDLE, phase: 'uploading', total: totalBytes });
    return controllerRef.current.signal;
  }, []);

  const onUploadProgress = useCallback((event: AxiosProgressEvent) => {
    const now = performance.now();
    const loaded = event.loaded;
    const total = event.total || 0;

    const last = lastSampleRef.current;
    if (last && now - last.time >= 250) {
      const sample = ((loaded - last.loaded) * 1000) / (now - last.time);
      speedRef.current = speedRef.current == null
        ? sample
        : speedRef.current + SPEED_SMOOTHING * (sample - speedRef.current);
      lastSampleRef.current = { time: now, loaded };
    }

    const done = total > 0 && loaded >= total;
    const speed = speedRef.current;
    setState({
      phase: done ? 'processing' : 'uploading',
      loaded,
      total,
      percent: total > 0 ? Math.min(100, Math.round((loaded * 100) / total)) : 0,
      bytesPerSecond: speed,
      secondsRemaining: !done && speed && speed > 0 && total > 0
        ? Math.max(0, Math.round((total - loaded) / speed))
        : null,
    });
  }, []);

  const reset = useCallback(() => {
    controllerRef.current = null;
    lastSampleRef.current = null;
    speedRef.current = null;
    setState(IDLE);
  }, []);

  /** Only aborts the transfer; once processing, the server finishes regardless. */
  const cancel = useCallback(() => {
    controllerRef.current?.abort();
  }, []);

  const active = state.phase !== 'idle';

  useEffect(() => {
    if (!active) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [active]);

  useEffect(() => () => controllerRef.current?.abort(), []);

  return { ...state, active, start, onUploadProgress, reset, cancel };
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 MB';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.max(1, seconds)}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s ? `${m}m ${s}s` : `${m}m`;
}
