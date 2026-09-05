import { useCallback, useEffect, useState } from 'react';
import {
  readPlayableOnlyPref,
  readPlayableOnlyPrefSync,
  writePlayableOnlyPref,
  type PlayableOnlyScope,
} from '@/src/lib/playableFilterPref';

export function usePlayableOnly(scope: PlayableOnlyScope) {
  const [playableOnly, setPlayableOnlyState] = useState(() =>
    readPlayableOnlyPrefSync(scope)
  );

  useEffect(() => {
    let cancelled = false;
    void readPlayableOnlyPref(scope).then((value) => {
      if (!cancelled) setPlayableOnlyState(value);
    });
    return () => {
      cancelled = true;
    };
  }, [scope]);

  const setPlayableOnly = useCallback(
    (next: boolean) => {
      setPlayableOnlyState(next);
      void writePlayableOnlyPref(scope, next);
    },
    [scope]
  );

  const togglePlayableOnly = useCallback(() => {
    setPlayableOnly(!playableOnly);
  }, [playableOnly, setPlayableOnly]);

  return { playableOnly, setPlayableOnly, togglePlayableOnly };
}
