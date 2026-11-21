import { useEffect, useState } from 'react';
import api from './api';

/** Used until the platform average has loaded, or when there are no tips yet. */
export const FALLBACK_TIP_POUNDS = 1.11;

let cached: number | null = null;
let inflight: Promise<number> | null = null;
const listeners = new Set<(value: number) => void>();

function publish(value: number) {
  cached = value;
  listeners.forEach((listener) => listener(value));
}

export function getGlobalAverageTipPounds(): number {
  return cached ?? FALLBACK_TIP_POUNDS;
}

export function loadGlobalAverageTip(): Promise<number> {
  if (cached != null) return Promise.resolve(cached);
  if (!inflight) {
    inflight = api
      .get('/bid-metrics/global-average')
      .then((res) => {
        const n = Number(res.data?.averageTipPounds);
        const next =
          Number.isFinite(n) && n >= 0.01
            ? Math.round(n * 100) / 100
            : FALLBACK_TIP_POUNDS;
        publish(next);
        return next;
      })
      .catch(() => {
        if (cached == null) publish(FALLBACK_TIP_POUNDS);
        return getGlobalAverageTipPounds();
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

export function useGlobalAverageTip(): number {
  const [value, setValue] = useState(getGlobalAverageTipPounds);
  useEffect(() => {
    listeners.add(setValue);
    void loadGlobalAverageTip();
    return () => {
      listeners.delete(setValue);
    };
  }, []);
  return value;
}

if (typeof window !== 'undefined') {
  void loadGlobalAverageTip();
}
