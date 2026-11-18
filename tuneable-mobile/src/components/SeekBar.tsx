import { useEffect, useRef, useState } from 'react';
import {
  LayoutChangeEvent,
  PanResponder,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { colors } from '@/src/theme/colors';
import { formatPlaybackMs } from '@/src/lib/format';

type Props = {
  positionMs: number;
  durationMs: number;
  onSeek: (positionMs: number) => void;
  /** Fired when a drag starts and ends so a parent scroller can lock. */
  onScrubbingChange?: (scrubbing: boolean) => void;
};

const THUMB = 16;
/** Hide the held position once playback reports something this close. */
const SEEK_SETTLE_MS = 600;
/** Safety net if a seek never reports back. */
const SEEK_SETTLE_TIMEOUT_MS = 1200;

export function SeekBar({
  positionMs,
  durationMs,
  onSeek,
  onScrubbingChange,
}: Props) {
  const [trackWidth, setTrackWidth] = useState(1);
  const [dragMs, setDragMs] = useState<number | null>(null);
  const [pinnedMs, setPinnedMs] = useState<number | null>(null);

  const widthRef = useRef(1);
  const durationRef = useRef(durationMs);
  const onSeekRef = useRef(onSeek);
  const onScrubbingChangeRef = useRef(onScrubbingChange);
  const grantXRef = useRef(0);

  durationRef.current = durationMs;
  widthRef.current = trackWidth;
  onSeekRef.current = onSeek;
  onScrubbingChangeRef.current = onScrubbingChange;

  const displayMs = dragMs ?? pinnedMs ?? positionMs;
  const safeDuration = durationMs > 0 ? durationMs : 1;
  const ratio = Math.max(0, Math.min(1, displayMs / safeDuration));

  const msFromX = (x: number) => {
    const w = widthRef.current || 1;
    const r = Math.max(0, Math.min(1, x / w));
    return r * (durationRef.current || 0);
  };

  useEffect(() => {
    if (pinnedMs == null) return;
    const timer = setTimeout(() => setPinnedMs(null), SEEK_SETTLE_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [pinnedMs]);

  useEffect(() => {
    if (pinnedMs == null || dragMs != null) return;
    if (Math.abs(positionMs - pinnedMs) <= SEEK_SETTLE_MS) {
      setPinnedMs(null);
    }
  }, [pinnedMs, dragMs, positionMs]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponderCapture: () => true,
      // The now-playing screen is a ScrollView. Letting it take the touch
      // cancels the drag and the thumb snaps back to the playhead.
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
      onPanResponderGrant: (evt) => {
        // locationX is only trustworthy at grant, and only because the
        // fill/thumb ignore touches so the target is the track itself.
        // Move events report locationX against whichever child is under
        // the finger, which makes the thumb jump. Track the finger with
        // the grant position plus the gesture translation instead.
        const x = evt.nativeEvent.locationX;
        grantXRef.current = x;
        onScrubbingChangeRef.current?.(true);
        setPinnedMs(null);
        setDragMs(msFromX(x));
      },
      onPanResponderMove: (_evt, gesture) => {
        setDragMs(msFromX(grantXRef.current + gesture.dx));
      },
      onPanResponderRelease: (_evt, gesture) => {
        const next = msFromX(grantXRef.current + gesture.dx);
        setDragMs(null);
        setPinnedMs(next);
        onScrubbingChangeRef.current?.(false);
        onSeekRef.current(next);
      },
      onPanResponderTerminate: (_evt, gesture) => {
        const next = msFromX(grantXRef.current + gesture.dx);
        setDragMs(null);
        setPinnedMs(next);
        onScrubbingChangeRef.current?.(false);
        onSeekRef.current(next);
      },
    })
  ).current;

  const onLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w > 0) setTrackWidth(w);
  };

  return (
    <View style={styles.wrap}>
      <View
        style={styles.trackHit}
        onLayout={onLayout}
        collapsable={false}
        hitSlop={{ top: 14, bottom: 14 }}
        {...panResponder.panHandlers}>
        <View pointerEvents="none" style={styles.track}>
          <View
            pointerEvents="none"
            style={[styles.fill, { width: `${ratio * 100}%` }]}
          />
          <View
            pointerEvents="none"
            style={[
              styles.thumb,
              { transform: [{ translateX: ratio * trackWidth - THUMB / 2 }] },
            ]}
          />
        </View>
      </View>
      <View style={styles.times}>
        <Text style={styles.time}>{formatPlaybackMs(displayMs)}</Text>
        <Text style={styles.time}>{formatPlaybackMs(durationMs)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
  },
  trackHit: {
    height: 36,
    justifyContent: 'center',
  },
  track: {
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.2)',
    overflow: 'visible',
  },
  fill: {
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.accentLight,
  },
  thumb: {
    position: 'absolute',
    left: 0,
    top: -6,
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    backgroundColor: '#fff',
  },
  times: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  time: {
    color: colors.textMuted,
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },
});
