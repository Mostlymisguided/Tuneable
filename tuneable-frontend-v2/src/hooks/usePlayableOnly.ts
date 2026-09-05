import { useCallback, useState } from 'react';
import {
  readPlayableOnlyPref,
  writePlayableOnlyPref,
  type PlayableOnlyScope,
} from '../utils/playableFilterPref';

export function usePlayableOnly(scope: PlayableOnlyScope) {
  const [playableOnly, setPlayableOnlyState] = useState(() =>
    readPlayableOnlyPref(scope)
  );

  const setPlayableOnly = useCallback(
    (next: boolean) => {
      setPlayableOnlyState(next);
      writePlayableOnlyPref(scope, next);
    },
    [scope]
  );

  const togglePlayableOnly = useCallback(() => {
    setPlayableOnly(!playableOnly);
  }, [playableOnly, setPlayableOnly]);

  return { playableOnly, setPlayableOnly, togglePlayableOnly };
}
