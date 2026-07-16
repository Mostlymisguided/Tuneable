import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/src/theme/colors';
import { formatPoundsFromPence } from '@/src/lib/format';
import {
  formatLocation,
  type LocationQuickPick,
} from '@/src/lib/location';
import type { ResolvedLocation } from '@/src/types/user';

type Props = {
  selectedLocation: ResolvedLocation | null;
  showLocationFilter: boolean;
  onToggleLocationFilter: () => void;
  onLocationChange: (location: ResolvedLocation | null) => void;
  locationQuickPicks: LocationQuickPick[];
};

export function GlobalChartHero({
  selectedLocation,
  showLocationFilter,
  onToggleLocationFilter,
  onLocationChange,
  locationQuickPicks,
}: Props) {
  const locationLabel = selectedLocation?.placeId
    ? formatLocation(selectedLocation)
    : 'Earth';

  return (
    <View style={styles.wrap}>
      <Text style={styles.eyebrow}>The World&apos;s Best Music</Text>
      <Text style={styles.votedFrom}>Voted From</Text>

      <Pressable onPress={onToggleLocationFilter} style={styles.locationBtn}>
        <Text style={styles.locationTitle}>{locationLabel}</Text>
        <View style={styles.locationHint}>
          <Ionicons name="location-outline" size={14} color={colors.accentLight} />
          <Text style={styles.locationHintText}>
            {selectedLocation?.placeId ? 'Change location' : 'Choose a location'}
          </Text>
          <Ionicons
            name={showLocationFilter ? 'chevron-up' : 'chevron-down'}
            size={14}
            color={colors.textMuted}
          />
        </View>
      </Pressable>

      {(showLocationFilter || locationQuickPicks.length > 0) && (
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
                subtitle={loc.total > 0 ? formatPoundsFromPence(loc.total) : undefined}
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
      )}

      {selectedLocation?.placeId ? (
        <Text style={styles.filterNote}>
          Tips from {formatLocation(selectedLocation)} and below
        </Text>
      ) : null}
    </View>
  );
}

function LocationChip({
  label,
  subtitle,
  active,
  onPress,
}: {
  label: string;
  subtitle?: string;
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
      {subtitle ? (
        <Text style={[styles.chipSub, active && styles.chipTextActive]}>
          {subtitle}
        </Text>
      ) : null}
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
  locationBtn: {
    alignItems: 'center',
  },
  locationTitle: {
    fontSize: 32,
    fontWeight: '900',
    color: '#f3e8ff',
    textAlign: 'center',
  },
  locationHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 8,
  },
  locationHintText: {
    color: colors.textMuted,
    fontSize: 13,
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
  chipSub: {
    color: colors.textMuted,
    fontSize: 10,
  },
  filterNote: {
    marginTop: 10,
    color: '#c4b5fd',
    fontSize: 12,
    textAlign: 'center',
  },
});
