import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';

type LockableScroll = {
  setNativeProps?: (props: { scrollEnabled: boolean }) => void;
  scrollTo?: (options: { y?: number; animated?: boolean }) => void;
  scrollToOffset?: (options: { offset: number; animated?: boolean }) => void;
};

const ParentScrollLockContext = createContext<(locked: boolean) => void>(() => {});

/** Ask the nearest list to stop scrolling. No-op when nothing provides a lock. */
export function useLockParentScroll(): (locked: boolean) => void {
  return useContext(ParentScrollLockContext);
}

function pin(node: LockableScroll | null, y: number) {
  if (!node) return;
  if (node.scrollToOffset) {
    node.scrollToOffset({ offset: y, animated: false });
    return;
  }
  node.scrollTo?.({ y, animated: false });
}

/**
 * Keeps a parent FlatList or ScrollView still while a child drag (the BPM
 * wheel) is active. The native list claims vertical pans even when a child
 * is the JS responder, so the list has to be turned off for the gesture.
 */
export function useParentScrollLock<T extends LockableScroll>(): {
  scrollRef: RefObject<T | null>;
  scrollEnabled: boolean;
  onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  setLocked: (locked: boolean) => void;
} {
  const scrollRef = useRef<T>(null);
  const anchorY = useRef(0);
  const depth = useRef(0);
  const hold = useRef(false);
  const pinning = useRef(false);
  const [scrollEnabled, setScrollEnabled] = useState(true);

  const setLocked = useCallback((locked: boolean) => {
    const next = Math.max(0, depth.current + (locked ? 1 : -1));
    if (next === depth.current) return;
    const wasLocked = depth.current > 0;
    depth.current = next;
    if (wasLocked === next > 0) return;

    const node = scrollRef.current;
    if (next > 0) {
      const y = anchorY.current;
      node?.setNativeProps?.({ scrollEnabled: false });
      pin(node, y);
      setScrollEnabled(false);
      requestAnimationFrame(() => {
        if (depth.current === 0) return;
        pin(scrollRef.current, y);
      });
      return;
    }

    hold.current = true;
    node?.setNativeProps?.({ scrollEnabled: true });
    pin(node, anchorY.current);
    setScrollEnabled(true);
    requestAnimationFrame(() => {
      hold.current = false;
    });
  }, []);

  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = event.nativeEvent.contentOffset.y;
    if (depth.current > 0) {
      if (pinning.current || Math.abs(y - anchorY.current) <= 0.5) return;
      pinning.current = true;
      pin(scrollRef.current, anchorY.current);
      pinning.current = false;
      return;
    }
    if (hold.current) return;
    anchorY.current = y;
  }, []);

  return { scrollRef, scrollEnabled, onScroll, setLocked };
}

export function ParentScrollLock({
  lock,
  children,
}: {
  lock: (locked: boolean) => void;
  children: ReactNode;
}) {
  return (
    <ParentScrollLockContext.Provider value={lock}>{children}</ParentScrollLockContext.Provider>
  );
}
