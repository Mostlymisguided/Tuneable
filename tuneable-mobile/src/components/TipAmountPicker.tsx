import { memo, useEffect, useRef } from 'react';
import {
  FlatList,
  StyleSheet,
  Text,
  View,
  type ListRenderItem,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

/** Same ceiling as a wallet top-up and the backend tip cap (£1,111.00). */
export const MAX_TIP_POUNDS = 1111;

const ITEM_HEIGHT = 36;
/** Blank rows above and below the values so the selected row can sit in the center. */
const PAD = 2;
const VISIBLE_ROWS = PAD * 2 + 1;
const PICKER_HEIGHT = ITEM_HEIGHT * VISIBLE_ROWS;

const SHEET_RGB = '26, 26, 46';

type WheelItem = number | null;

function withPads(length: number): WheelItem[] {
  const items: WheelItem[] = [null, null];
  for (let i = 0; i < length; i += 1) items.push(i);
  items.push(null, null);
  return items;
}

/** Odd so the pence column has a middle copy to rest in. Outer copies are the loop buffer. */
const LOOP_REPEATS = 9;

function mod(value: number, count: number): number {
  return ((value % count) + count) % count;
}

/** Move a scroll offset by whole cycles until it sits in [min, max). */
function shiftOffsetInto(offset: number, min: number, max: number, cycle: number): number {
  if (cycle <= 0) return offset;
  let next = offset;
  let guard = 0;
  while (next < min && guard < LOOP_REPEATS) {
    next += cycle;
    guard += 1;
  }
  guard = 0;
  while (next >= max && guard < LOOP_REPEATS) {
    next -= cycle;
    guard += 1;
  }
  return next;
}

function withRepeatedPads(length: number, repeats: number): WheelItem[] {
  const items: WheelItem[] = [null, null];
  for (let n = 0; n < length * repeats; n += 1) items.push(n % length);
  items.push(null, null);
  return items;
}

const POUND_ITEMS = withPads(MAX_TIP_POUNDS + 1);
const PENCE_ITEMS = withRepeatedPads(100, LOOP_REPEATS);

function keyOf(item: WheelItem, index: number): string {
  return item == null ? `pad-${index}` : `v-${index}`;
}

const renderPounds: ListRenderItem<WheelItem> = ({ item }) => (
  <View style={[styles.item, styles.itemRight]}>
    <Text style={styles.itemText} allowFontScaling={false}>
      {item == null ? '' : String(item)}
    </Text>
  </View>
);

const renderPence: ListRenderItem<WheelItem> = ({ item }) => (
  <View style={[styles.item, styles.itemLeft]}>
    <Text style={styles.itemText} allowFontScaling={false}>
      {item == null ? '' : String(item).padStart(2, '0')}
    </Text>
  </View>
);

function getItemLayout(_data: ArrayLike<WheelItem> | null | undefined, index: number) {
  return { length: ITEM_HEIGHT, offset: ITEM_HEIGHT * index, index };
}

type WheelProps = {
  data: WheelItem[];
  /** Selected value, not the padded list index. Offset `value * ITEM_HEIGHT` centers it. */
  selected: number;
  count: number;
  width: number;
  renderItem: ListRenderItem<WheelItem>;
  onSelect: (value: number) => void;
  disabled?: boolean;
  /** Repeat the values so the column rolls from the last item back to the first. */
  loop?: boolean;
  accessibilityLabel: string;
};

function Wheel({
  data,
  selected,
  count,
  width,
  renderItem,
  onSelect,
  disabled,
  loop = false,
  accessibilityLabel,
}: WheelProps) {
  const loopBase = loop ? count * Math.floor(LOOP_REPEATS / 2) : 0;
  const listRef = useRef<FlatList<WheelItem>>(null);
  const selectedRef = useRef(selected);
  const lastEmitted = useRef(selected);
  const offsetRef = useRef((loopBase + selected) * ITEM_HEIGHT);
  const dragging = useRef(false);
  const snapping = useRef(false);
  const animateChanges = useRef(false);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const snapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  selectedRef.current = selected;

  const clearSettleTimer = () => {
    if (!settleTimer.current) return;
    clearTimeout(settleTimer.current);
    settleTimer.current = null;
  };

  const scrollToValue = (index: number, animated: boolean) => {
    const value = loop ? mod(index, count) : Math.max(0, Math.min(count - 1, index));
    const offset = (loop ? loopBase + value : value) * ITEM_HEIGHT;
    snapping.current = true;
    if (snapTimer.current) clearTimeout(snapTimer.current);
    listRef.current?.scrollToOffset({ offset, animated });
    // Ignore the scroll events this jump creates. If it does not land, jump once more.
    snapTimer.current = setTimeout(() => {
      snapping.current = false;
      if (Math.abs(offsetRef.current - offset) <= 0.5) return;
      offsetRef.current = offset;
      listRef.current?.scrollToOffset({ offset, animated: false });
    }, animated ? 450 : 80);
  };

  const settle = (offsetY: number) => {
    if (snapping.current) return;
    dragging.current = false;
    const raw = Math.round(offsetY / ITEM_HEIGHT);
    const index = loop ? mod(raw, count) : Math.max(0, Math.min(count - 1, raw));
    const aligned = (loop ? loopBase + index : index) * ITEM_HEIGHT;
    if (index !== selectedRef.current) {
      lastEmitted.current = index;
      onSelect(index);
    }
    if (Math.abs(offsetY - aligned) <= 0.5) return;
    // Snap on the next frame, without animation. An animated correction from
    // inside the scroll callback leaves iOS UIScrollView between rows and
    // ignores later drags until the next layout.
    requestAnimationFrame(() => {
      scrollToValue(index, false);
    });
  };

  const armSettle = () => {
    clearSettleTimer();
    settleTimer.current = setTimeout(() => {
      settleTimer.current = null;
      settle(offsetRef.current);
    }, 140);
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      animateChanges.current = true;
    }, 400);
    return () => {
      clearTimeout(timer);
      clearSettleTimer();
      if (snapTimer.current) clearTimeout(snapTimer.current);
    };
  }, []);

  useEffect(() => {
    if (lastEmitted.current === selected) return;
    lastEmitted.current = selected;
    clearSettleTimer();
    dragging.current = false;
    scrollToValue(selected, animateChanges.current);
  }, [selected]);

  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    let y = event.nativeEvent.contentOffset.y;
    if (loop && !snapping.current) {
      const cycle = count * ITEM_HEIGHT;
      const folded = shiftOffsetInto(y, cycle, cycle * (LOOP_REPEATS - 1), cycle);
      if (Math.abs(folded - y) > 0.5) {
        y = folded;
        snapping.current = true;
        offsetRef.current = y;
        listRef.current?.scrollToOffset({ offset: y, animated: false });
        if (snapTimer.current) clearTimeout(snapTimer.current);
        snapTimer.current = setTimeout(() => {
          snapping.current = false;
          if (!dragging.current) settle(offsetRef.current);
        }, 80);
        return;
      }
    }
    const moved = Math.abs(y - offsetRef.current) > 0.5;
    offsetRef.current = y;
    if (dragging.current || snapping.current || !moved) return;
    armSettle();
  };

  const onScrollBeginDrag = () => {
    dragging.current = true;
    snapping.current = false;
    clearSettleTimer();
  };

  const onScrollEndDrag = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    dragging.current = false;
    offsetRef.current = event.nativeEvent.contentOffset.y;
    const velocity = Math.abs(event.nativeEvent.velocity?.y ?? 0);
    if (velocity < 0.05) {
      clearSettleTimer();
      settle(offsetRef.current);
      return;
    }
    // A flick should end in onMomentumScrollEnd. If that event never arrives,
    // the timer still snaps once the offset stops changing.
    armSettle();
  };

  const onMomentumScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    offsetRef.current = event.nativeEvent.contentOffset.y;
    if (snapping.current) {
      snapping.current = false;
      if (snapTimer.current) clearTimeout(snapTimer.current);
      return;
    }
    clearSettleTimer();
    settle(event.nativeEvent.contentOffset.y);
  };

  return (
    <FlatList
      ref={listRef}
      data={data}
      keyExtractor={keyOf}
      renderItem={renderItem}
      style={{ width, height: PICKER_HEIGHT }}
      getItemLayout={getItemLayout}
      initialScrollIndex={Math.min(loopBase + selected, data.length - 1)}
      snapToInterval={ITEM_HEIGHT}
      snapToAlignment="start"
      decelerationRate="fast"
      showsVerticalScrollIndicator={false}
      scrollEnabled={!disabled}
      nestedScrollEnabled
      bounces={false}
      overScrollMode="never"
      removeClippedSubviews={false}
      initialNumToRender={loop ? 31 : 11}
      maxToRenderPerBatch={loop ? 48 : 16}
      windowSize={loop ? 15 : 7}
      scrollEventThrottle={16}
      accessibilityLabel={accessibilityLabel}
      onScroll={onScroll}
      onScrollBeginDrag={onScrollBeginDrag}
      onScrollEndDrag={onScrollEndDrag}
      onMomentumScrollEnd={onMomentumScrollEnd}
      onScrollToIndexFailed={(info) => {
        if (loop) {
          const offset = info.index * ITEM_HEIGHT;
          offsetRef.current = offset;
          listRef.current?.scrollToOffset({ offset, animated: false });
          return;
        }
        scrollToValue(info.index, false);
      }}
    />
  );
}

type Props = {
  value: number;
  onChange: (pounds: number) => void;
  disabled?: boolean;
};

function TipAmountPickerInner({ value, onChange, disabled }: Props) {
  const cents = Math.max(0, Math.min(MAX_TIP_POUNDS * 100, Math.round(value * 100)));
  const pounds = Math.floor(cents / 100);
  const pence = cents % 100;

  const onChangeRef = useRef(onChange);
  const poundsRef = useRef(pounds);
  const penceRef = useRef(pence);
  onChangeRef.current = onChange;
  poundsRef.current = pounds;
  penceRef.current = pence;

  const selectPounds = (next: number) => {
    onChangeRef.current(next + penceRef.current / 100);
  };
  const selectPence = (next: number) => {
    onChangeRef.current(poundsRef.current + next / 100);
  };

  return (
    <View
      style={styles.wrap}
      accessibilityLabel={`Tip amount £${pounds}.${String(pence).padStart(2, '0')}`}>
      <View pointerEvents="none" style={styles.selection} />
      <View style={styles.row}>
        <View style={styles.side} />
        <View style={styles.affix}>
          <Text style={styles.affixText} allowFontScaling={false}>
            £
          </Text>
        </View>
        <Wheel
          data={POUND_ITEMS}
          selected={pounds}
          count={MAX_TIP_POUNDS + 1}
          width={78}
          renderItem={renderPounds}
          onSelect={selectPounds}
          disabled={disabled}
          accessibilityLabel="Pounds"
        />
        <View style={styles.dotWrap}>
          <Text style={styles.affixText} allowFontScaling={false}>
            .
          </Text>
        </View>
        <Wheel
          data={PENCE_ITEMS}
          selected={pence}
          count={100}
          width={56}
          renderItem={renderPence}
          onSelect={selectPence}
          disabled={disabled}
          accessibilityLabel="Pence"
          loop
        />
        <View style={styles.side} />
      </View>
      <LinearGradient
        pointerEvents="none"
        colors={[`rgba(${SHEET_RGB}, 1)`, `rgba(${SHEET_RGB}, 0)`]}
        style={styles.fadeTop}
      />
      <LinearGradient
        pointerEvents="none"
        colors={[`rgba(${SHEET_RGB}, 0)`, `rgba(${SHEET_RGB}, 1)`]}
        style={styles.fadeBottom}
      />
    </View>
  );
}

export const TipAmountPicker = memo(TipAmountPickerInner);

const styles = StyleSheet.create({
  wrap: {
    height: PICKER_HEIGHT,
    justifyContent: 'center',
    marginTop: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    height: PICKER_HEIGHT,
  },
  side: {
    flex: 1,
  },
  affix: {
    width: 28,
    height: PICKER_HEIGHT,
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingRight: 2,
  },
  dotWrap: {
    width: 16,
    height: PICKER_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  affixText: {
    color: '#fff',
    fontSize: 22,
    lineHeight: 26,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  item: {
    height: ITEM_HEIGHT,
    width: '100%',
    justifyContent: 'center',
  },
  itemRight: {
    alignItems: 'flex-end',
    paddingRight: 2,
  },
  itemLeft: {
    alignItems: 'flex-start',
    paddingLeft: 2,
  },
  itemText: {
    color: '#fff',
    fontSize: 22,
    lineHeight: 26,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
  },
  selection: {
    position: 'absolute',
    left: 8,
    right: 8,
    top: ITEM_HEIGHT * PAD,
    height: ITEM_HEIGHT,
    borderRadius: 10,
    backgroundColor: 'rgba(118, 118, 128, 0.28)',
  },
  fadeTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: ITEM_HEIGHT * PAD,
  },
  fadeBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: ITEM_HEIGHT * PAD,
  },
});
