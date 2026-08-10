import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '@/src/theme/colors';
import {
  formatLocation,
  type LocationQuickPick,
} from '@/src/lib/location';
import type { ResolvedLocation } from '@/src/types/user';

type Props = {
  chartLabel?: string;
  contentNoun?: string;
  selectedLocation: ResolvedLocation | null;
  onLocationChange: (location: ResolvedLocation | null) => void;
  locationQuickPicks: LocationQuickPick[];
};

export function GlobalChartHero({
  chartLabel = "The World's Best Music",
  contentNoun = 'Music',
  selectedLocation,
  onLocationChange,
  locationQuickPicks,
}: Props) {
  const locationLabel = selectedLocation?.placeId
    ? formatLocation(selectedLocation)
    : 'Earth';

  return (
    <View style={styles.wrap}>
      <Text style={styles.eyebrow}>{chartLabel}</Text>
      <Text style={styles.votedFrom}>In</Text>
      <Text style={styles.locationTitle}>{locationLabel}</Text>

      {locationQuickPicks.length > 0 ? (
        <View style={styles.chips}>
          <LocationChip
            label="Earth"
            active={!selectedLocation?.placeId}
            onPress={() => onLocationChange(null)}
          />
          {locationQuickPicks.map((loc) => {
            const selected = selectedLocation?.placeId === loc.placeId;
            const label = loc.isUser ? `${loc.country} (you)` : loc.country;
            return (
              <LocationChip
                key={loc.placeId}
                label={label}
                active={selected}
                onPress={() =>
                  onLocationChange(
                    selected
                      ? null
                      : {
                          placeId: loc.placeId,
                          country: loc.country,
                          countryCode: loc.countryCode,
                          display: loc.display,
                          featureType: 'country',
                        }
                  )
                }
              />
            );
          })}
        </View>
      ) : null}

      {selectedLocation?.placeId ? (
        <Text style={styles.filterNote}>
          {contentNoun} in {formatLocation(selectedLocation)} and below
        </Text>
      ) : null}
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
  locationTitle: {
    fontSize: 32,
    fontWeight: '900',
    color: '#f3e8ff',
    textAlign: 'center',
  },
  chips: {
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
    backgroundColor: 'rgba(255,255,255,0.1)',
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
  filterNote: {
    marginTop: 10,
    color: '#c4b5fd',
    fontSize: 12,
    textAlign: 'center',
  },
});
