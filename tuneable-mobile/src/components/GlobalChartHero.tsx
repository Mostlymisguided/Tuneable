import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/src/theme/colors';
import {
  LOCATION_SCOPE_OPTIONS,
  formatLocation,
  locationPickToResolvedLocation,
  locationScopeFilterNote,
  locationScopeLabel,
  type LocationQuickPick,
  type LocationScope,
} from '@/src/lib/location';
import {
  CHART_KIND_OPTIONS,
  chartKindLabel,
  type ChartHeroKind,
  type ChartMediaKind,
} from '@/src/lib/chartKind';
import type { ResolvedLocation } from '@/src/types/user';

type OpenPicker = 'kind' | 'scope' | null;

type Props = {
  chartKind?: ChartHeroKind;
  onChartKindChange?: (kind: ChartMediaKind) => void;
  contentNoun?: string;
  selectedLocation: ResolvedLocation | null;
  locationScope?: LocationScope;
  onLocationScopeChange?: (scope: LocationScope) => void;
  onLocationChange: (location: ResolvedLocation | null) => void;
  locationQuickPicks: LocationQuickPick[];
  showRankedBySupport?: boolean;
};

export function GlobalChartHero({
  chartKind = 'music',
  onChartKindChange,
  contentNoun,
  selectedLocation,
  locationScope = 'in',
  onLocationScopeChange,
  onLocationChange,
  locationQuickPicks,
  showRankedBySupport = true,
}: Props) {
  const [openPicker, setOpenPicker] = useState<OpenPicker>(null);
  const locationLabel = selectedLocation?.placeId
    ? formatLocation(selectedLocation)
    : 'Everywhere';
  const kindLabel = chartKindLabel(chartKind);
  const noun = contentNoun || kindLabel;
  const kindToggleable = Boolean(onChartKindChange) && chartKind !== 'places';

  return (
    <View style={styles.wrap}>
      {kindToggleable ? (
        openPicker === 'kind' ? (
          <View style={styles.scopeRow} accessibilityRole="tablist">
            {CHART_KIND_OPTIONS.map((option) => {
              const selected = option.id === chartKind;
              return (
                <Pressable
                  key={option.id}
                  onPress={() => {
                    onChartKindChange?.(option.id);
                    setOpenPicker(null);
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={option.label}
                  style={styles.scopeOption}
                >
                  <Text
                    style={[
                      styles.votedFrom,
                      styles.scopeOptionText,
                      selected && styles.scopeOptionTextActive,
                    ]}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : (
          <Pressable
            onPress={() => setOpenPicker('kind')}
            style={styles.scopeButton}
            accessibilityRole="button"
            accessibilityLabel={`${kindLabel}. Change to Music, Podcasts, or Books.`}
          >
            <Text style={styles.scopeButtonLabel}>{kindLabel}</Text>
            <Ionicons
              name="chevron-down"
              size={12}
              color="rgba(196, 181, 253, 0.6)"
            />
          </Pressable>
        )
      ) : (
        <Text style={styles.eyebrow}>{kindLabel}</Text>
      )}

      {onLocationScopeChange ? (
        openPicker === 'scope' ? (
          <View style={styles.scopeRow} accessibilityRole="tablist">
            {LOCATION_SCOPE_OPTIONS.map((option) => {
              const selected = option.id === locationScope;
              return (
                <Pressable
                  key={option.id}
                  onPress={() => {
                    onLocationScopeChange(option.id);
                    setOpenPicker(null);
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={option.label}
                  style={styles.scopeOption}
                >
                  <Text
                    style={[
                      styles.votedFrom,
                      styles.scopeOptionText,
                      selected && styles.scopeOptionTextActive,
                    ]}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : (
          <Pressable
            onPress={() => setOpenPicker('scope')}
            style={styles.scopeButton}
            accessibilityRole="button"
            accessibilityLabel={`Chart scope ${locationScopeLabel(locationScope)}. Change to In, From, or Supported by.`}
          >
            <Text style={styles.scopeButtonLabel}>{locationScopeLabel(locationScope)}</Text>
            <Ionicons
              name="chevron-down"
              size={12}
              color="rgba(196, 181, 253, 0.6)"
            />
          </Pressable>
        )
      ) : (
        <Text style={styles.votedFrom}>In</Text>
      )}
      <Text style={styles.locationTitle}>{locationLabel}</Text>

      <LocationChipRow
        picks={locationQuickPicks}
        selectedPlaceId={selectedLocation?.placeId}
        onSelect={onLocationChange}
      />

      {showRankedBySupport ? (
        <Text style={styles.rankedNote}>Ranked by support</Text>
      ) : null}

      {selectedLocation?.placeId ? (
        <Text style={styles.filterNote}>
          {locationScopeFilterNote(
            noun,
            formatLocation(selectedLocation),
            locationScope
          )}
        </Text>
      ) : null}
    </View>
  );
}

const CHIP_GAP = 8;
const MAX_CHIP_ROWS = 2;
const FALLBACK_CHIP_HEIGHT = 32;

function countChipsThatFit(
  widths: number[],
  containerWidth: number,
  maxRows: number,
  gap: number
): number {
  if (containerWidth <= 0) return widths.length;
  let rows = 1;
  let used = 0;
  for (let i = 0; i < widths.length; i += 1) {
    const width = widths[i];
    if (used === 0 || used + gap + width <= containerWidth + 0.5) {
      used = used === 0 ? width : used + gap + width;
      continue;
    }
    rows += 1;
    if (rows > maxRows) return i;
    used = width;
  }
  return widths.length;
}

function chipLabel(loc: LocationQuickPick): string {
  return loc.label || loc.display || loc.country;
}

function LocationChipRow({
  picks,
  selectedPlaceId,
  onSelect,
}: {
  picks: LocationQuickPick[];
  selectedPlaceId?: string | null;
  onSelect: (location: ResolvedLocation | null) => void;
}) {
  const items = [
    {
      key: 'everywhere',
      label: 'Everywhere',
      placeId: null as string | null,
    },
    ...picks.map((loc) => ({
      key: loc.placeId,
      label: chipLabel(loc),
      placeId: loc.placeId,
    })),
  ];
  const [containerWidth, setContainerWidth] = useState(0);
  const [chipHeight, setChipHeight] = useState(0);
  const [chipWidths, setChipWidths] = useState<Record<string, number>>({});
  const measured =
    containerWidth > 0 && items.every((item) => (chipWidths[item.key] ?? 0) > 0);
  const visibleCount = measured
    ? countChipsThatFit(
        items.map((item) => chipWidths[item.key]),
        containerWidth,
        MAX_CHIP_ROWS,
        CHIP_GAP
      )
    : items.length;
  const rowHeight = chipHeight || FALLBACK_CHIP_HEIGHT;

  return (
    <View
      style={[
        styles.chips,
        {
          maxHeight: rowHeight * MAX_CHIP_ROWS + CHIP_GAP,
          overflow: 'hidden',
        },
      ]}
      onLayout={(event) => {
        const next = event.nativeEvent.layout.width;
        setContainerWidth((prev) => (prev === next ? prev : next));
      }}
    >
      {items.slice(0, visibleCount).map((item) => {
        const pick = item.placeId
          ? picks.find((loc) => loc.placeId === item.placeId)
          : null;
        const active = item.placeId
          ? selectedPlaceId === item.placeId
          : !selectedPlaceId;
        return (
          <View
            key={item.key}
            style={styles.chipMeasure}
            onLayout={(event) => {
              const { width, height } = event.nativeEvent.layout;
              setChipHeight((prev) => (prev === height ? prev : height));
              setChipWidths((prev) =>
                prev[item.key] === width ? prev : { ...prev, [item.key]: width }
              );
            }}
          >
            <LocationChip
              label={item.label}
              active={active}
              onPress={() => {
                if (!pick || active) {
                  onSelect(null);
                  return;
                }
                onSelect(locationPickToResolvedLocation(pick));
              }}
            />
          </View>
        );
      })}
    </View>
  );
}

function LocationChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, active && styles.chipActive]}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'column',
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 12,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 2.5,
    textTransform: 'uppercase',
    color: 'rgba(196, 181, 253, 0.85)',
    marginBottom: 6,
  },
  votedFrom: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 2.5,
    textTransform: 'uppercase',
    color: 'rgba(196, 181, 253, 0.85)',
    marginBottom: 8,
  },
  scopeButtonLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 2.5,
    textTransform: 'uppercase',
    color: 'rgba(196, 181, 253, 0.85)',
  },
  scopeButton: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginBottom: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  scopeRow: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 10,
  },
  scopeOption: {
    paddingVertical: 4,
  },
  scopeOptionText: {
    marginBottom: 0,
    letterSpacing: 1.6,
    color: 'rgba(196, 181, 253, 0.45)',
  },
  scopeOptionTextActive: {
    color: 'rgba(221, 214, 254, 1)',
  },
  locationTitle: {
    fontSize: 32,
    fontWeight: '900',
    color: '#f3e8ff',
    textAlign: 'center',
  },
  chipMeasure: {
    alignSelf: 'flex-start',
  },
  chips: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    marginTop: 14,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  chipActive: {
    backgroundColor: '#7e22ce',
  },
  chipText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  chipTextActive: {
    color: '#fff',
  },
  rankedNote: {
    marginTop: 10,
    color: 'rgba(196, 181, 253, 0.55)',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  filterNote: {
    marginTop: 10,
    color: '#c4b5fd',
    fontSize: 12,
    textAlign: 'center',
  },
});
