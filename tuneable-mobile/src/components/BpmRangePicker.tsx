import { useEffect, useRef, useState } from 'react';
import {
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  BPM_FILTER_ALL,
  BPM_FILTER_MAX,
  BPM_FILTER_MIN,
  bpmFilterWithMax,
  bpmFilterWithMin,
  isBpmFilterActive,
  type BpmFilterRange,
} from '@/src/lib/chartFilters';
import { colors } from '@/src/theme/colors';

const ITEM_HEIGHT = 36;
const VISIBLE_ROWS = 5;
const HEIGHT = ITEM_HEIGHT * VISIBLE_ROWS;
const CENTER_TOP = (HEIGHT - ITEM_HEIGHT) / 2;

function clamp(value: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, value));
}

type WheelProps = {
  value: number;
  lo: number;
  hi: number;
  onChange: (value: number) => void;
  label: string;
};

/**
 * Drag wheel, not a nested scroller. Chart filters sit inside a parent list,
 * and a vertical FlatList there loses the gesture to that list.
 */
function BpmWheel({ value, lo, hi, onChange, label }: WheelProps) {
  const [offset, setOffset] = useState(0);
  const offsetRef = useRef(0);
  const grantOffset = useRef(0);
  const valueRef = useRef(value);
  const loRef = useRef(lo);
  const hiRef = useRef(hi);
  const onChangeRef = useRef(onChange);
  const frame = useRef<number | null>(null);

  valueRef.current = value;
  loRef.current = lo;
  hiRef.current = hi;
  onChangeRef.current = onChange;

  const stopAnim = () => {
    if (frame.current == null) return;
    cancelAnimationFrame(frame.current);
    frame.current = null;
  };

  useEffect(() => stopAnim, []);

  const commit = (next: number) => {
    offsetRef.current = 0;
    setOffset(0);
    if (next !== valueRef.current) onChangeRef.current(next);
  };

  const animateTo = (from: number, to: number, done: () => void) => {
    stopAnim();
    const start = Date.now();
    const duration = 220;
    const step = () => {
      const t = Math.min(1, (Date.now() - start) / duration);
      const eased = 1 - (1 - t) ** 3;
      const next = from + (to - from) * eased;
      offsetRef.current = next;
      setOffset(next);
      if (t < 1) {
        frame.current = requestAnimationFrame(step);
      } else {
        frame.current = null;
        done();
      }
    };
    frame.current = requestAnimationFrame(step);
  };

  const settle = (offsetNow: number, velocity: number) => {
    const min = loRef.current;
    const max = hiRef.current;
    const index = valueRef.current - min;
    const glide = clamp(velocity * 0.15, -ITEM_HEIGHT * 30, ITEM_HEIGHT * 30);
    const projected = index - (offsetNow + glide) / ITEM_HEIGHT;
    const nextIndex = clamp(Math.round(projected), 0, max - min);
    const snappedOffset = (index - nextIndex) * ITEM_HEIGHT;
    animateTo(offsetNow, snappedOffset, () => commit(min + nextIndex));
  };

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
      onPanResponderGrant: () => {
        stopAnim();
        grantOffset.current = offsetRef.current;
      },
      onPanResponderMove: (_event, gesture) => {
        const next = grantOffset.current + gesture.dy;
        offsetRef.current = next;
        setOffset(next);
      },
      onPanResponderRelease: (_event, gesture) => {
        settle(grantOffset.current + gesture.dy, gesture.vy);
      },
      onPanResponderTerminate: (_event, gesture) => {
        settle(grantOffset.current + gesture.dy, 0);
      },
    })
  ).current;

  const index = value - lo;
  const visual = index - offset / ITEM_HEIGHT;
  const first = Math.max(0, Math.floor(visual) - 4);
  const last = Math.min(hi - lo, Math.ceil(visual) + 4);
  const rows = [];
  for (let i = first; i <= last; i += 1) {
    const distance = Math.abs(i - visual);
    const opacity = distance < 0.45 ? 1 : distance < 1.45 ? 0.42 : 0.16;
    rows.push(
      <Text
        key={i}
        allowFontScaling={false}
        style={[
          styles.row,
          {
            top: CENTER_TOP + (i - visual) * ITEM_HEIGHT,
            opacity,
          },
        ]}>
        {lo + i}
      </Text>
    );
  }

  const step = (delta: number) => {
    stopAnim();
    offsetRef.current = 0;
    setOffset(0);
    const next = clamp(valueRef.current + delta, loRef.current, hiRef.current);
    if (next !== valueRef.current) onChangeRef.current(next);
  };

  return (
    <View
      style={styles.wheel}
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ min: lo, max: hi, now: value, text: String(value) }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === 'increment') step(1);
        if (event.nativeEvent.actionName === 'decrement') step(-1);
      }}
      {...pan.panHandlers}>
      {rows}
    </View>
  );
}

type Props = {
  value: BpmFilterRange;
  onChange: (range: BpmFilterRange) => void;
};

export function BpmRangePicker({ value, onChange }: Props) {
  const active = isBpmFilterActive(value);
  const onChangeRef = useRef(onChange);
  const valueRef = useRef(value);
  onChangeRef.current = onChange;
  valueRef.current = value;

  return (
    <View>
      <View style={styles.columns}>
        <View pointerEvents="none" style={styles.selection} />
        <View style={styles.column}>
          <Text style={styles.columnLabel}>From</Text>
          <BpmWheel
            value={value.min}
            lo={BPM_FILTER_MIN}
            hi={BPM_FILTER_MAX}
            label="From BPM"
            onChange={(min) => onChangeRef.current(bpmFilterWithMin(valueRef.current, min))}
          />
        </View>
        <Text style={styles.dash} allowFontScaling={false}>
          –
        </Text>
        <View style={styles.column}>
          <Text style={styles.columnLabel}>To</Text>
          <BpmWheel
            value={value.max}
            lo={BPM_FILTER_MIN}
            hi={BPM_FILTER_MAX}
            label="To BPM"
            onChange={(max) => onChangeRef.current(bpmFilterWithMax(valueRef.current, max))}
          />
        </View>
      </View>
      <Text style={styles.note}>
        {active
          ? 'Tunes without a BPM are hidden.'
          : 'The full range includes every tune.'}
      </Text>
      {active ? (
        <Pressable
          style={styles.reset}
          onPress={() => onChange(BPM_FILTER_ALL)}
          accessibilityRole="button"
          accessibilityLabel="Clear BPM filter">
          <Text style={styles.resetText}>Any BPM</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  columns: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 8,
  },
  column: {
    width: 88,
    alignItems: 'center',
  },
  columnLabel: {
    marginBottom: 4,
    color: '#d8b4fe',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  wheel: {
    width: '100%',
    height: HEIGHT,
    overflow: 'hidden',
  },
  row: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: ITEM_HEIGHT,
    lineHeight: ITEM_HEIGHT,
    textAlign: 'center',
    color: '#fff',
    fontSize: 22,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  dash: {
    width: 16,
    marginBottom: CENTER_TOP,
    height: ITEM_HEIGHT,
    lineHeight: ITEM_HEIGHT,
    textAlign: 'center',
    color: 'rgba(255,255,255,0.8)',
    fontSize: 22,
    fontWeight: '600',
  },
  selection: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: CENTER_TOP,
    height: ITEM_HEIGHT,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  note: {
    marginTop: 10,
    textAlign: 'center',
    color: colors.textMuted,
    fontSize: 12,
  },
  reset: {
    alignSelf: 'center',
    marginTop: 8,
  },
  resetText: {
    color: '#c4b5fd',
    fontSize: 13,
    fontWeight: '600',
  },
});
