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

const POUND_ITEMS = withPads(MAX_TIP_POUNDS + 1);
const PENCE_ITEMS = withPads(100);

function keyOf(item: WheelItem, index: number): string {
  return item == null ? `pad-${index}` : `v-${item}`;
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
  accessibilityLabel,
}: WheelProps) {
  const listRef = useRef<FlatList<WheelItem>>(null);
  const selectedRef = useRef(selected);
  const lastEmitted = useRef(selected);
  const animateChanges = useRef(false);
  const dragging = useRef(false);
  selectedRef.current = selected;

  useEffect(() => {
    const timer = setTimeout(() => {
      animateChanges.current = true;
    }, 400);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (dragging.current) return;
    if (lastEmitted.current === selected) return;
    lastEmitted.current = selected;
    listRef.current?.scrollToOffset({
      offset: selected * ITEM_HEIGHT,
      animated: animateChanges.current,
    });
  }, [selected]);

  const settle = (offsetY: number) => {
    const index = Math.max(0, Math.min(count - 1, Math.round(offsetY / ITEM_HEIGHT)));
    const aligned = index * ITEM_HEIGHT;
    if (Math.abs(offsetY - aligned) > 0.5) {
      listRef.current?.scrollToOffset({ offset: aligned, animated: true });
    }
    if (index !== selectedRef.current) {
      lastEmitted.current = index;
      onSelect(index);
    }
  };

  const onScrollEndDrag = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const velocity = event.nativeEvent.velocity?.y ?? 0;
    if (Math.abs(velocity) > 0.05) return;
    dragging.current = false;
    settle(event.nativeEvent.contentOffset.y);
  };

  const onMomentumScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    dragging.current = false;
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
      initialScrollIndex={Math.min(selected, data.length - 1)}
      snapToInterval={ITEM_HEIGHT}
      snapToAlignment="start"
      decelerationRate="fast"
      showsVerticalScrollIndicator={false}
      scrollEnabled={!disabled}
      nestedScrollEnabled
      bounces
      overScrollMode="never"
      removeClippedSubviews={false}
      initialNumToRender={11}
      maxToRenderPerBatch={16}
      windowSize={7}
      accessibilityLabel={accessibilityLabel}
      onLayout={() => {
        if (dragging.current) return;
        listRef.current?.scrollToOffset({
          offset: selectedRef.current * ITEM_HEIGHT,
          animated: false,
        });
      }}
      onScrollBeginDrag={() => {
        dragging.current = true;
      }}
      onScrollEndDrag={onScrollEndDrag}
      onMomentumScrollEnd={onMomentumScrollEnd}
      onScrollToIndexFailed={(info) => {
        listRef.current?.scrollToOffset({
          offset: info.index * ITEM_HEIGHT,
          animated: false,
        });
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
