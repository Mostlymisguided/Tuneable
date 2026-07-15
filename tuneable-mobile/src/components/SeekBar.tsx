import { useRef, useState } from 'react';
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
};

export function SeekBar({ positionMs, durationMs, onSeek }: Props) {
  const [trackWidth, setTrackWidth] = useState(1);
  const [dragging, setDragging] = useState(false);
  const [dragMs, setDragMs] = useState(0);
  const widthRef = useRef(1);
  const durationRef = useRef(durationMs);
  durationRef.current = durationMs;
  widthRef.current = trackWidth;

  const displayMs = dragging ? dragMs : positionMs;
  const safeDuration = durationMs > 0 ? durationMs : 1;
  const ratio = Math.max(0, Math.min(1, displayMs / safeDuration));

  const msFromX = (x: number) => {
    const w = widthRef.current || 1;
    const r = Math.max(0, Math.min(1, x / w));
    return r * (durationRef.current || 0);
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        const next = msFromX(evt.nativeEvent.locationX);
        setDragging(true);
        setDragMs(next);
      },
      onPanResponderMove: (evt) => {
        setDragMs(msFromX(evt.nativeEvent.locationX));
      },
      onPanResponderRelease: (evt) => {
        const next = msFromX(evt.nativeEvent.locationX);
        setDragging(false);
        setDragMs(next);
        onSeek(next);
      },
      onPanResponderTerminate: () => {
        setDragging(false);
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
        {...panResponder.panHandlers}>
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${ratio * 100}%` }]} />
          <View style={[styles.thumb, { left: `${ratio * 100}%` }]} />
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
    height: 28,
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
    top: -6,
    marginLeft: -8,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#fff',
  },
  times: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  time: {
    color: colors.textMuted,
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },
});
