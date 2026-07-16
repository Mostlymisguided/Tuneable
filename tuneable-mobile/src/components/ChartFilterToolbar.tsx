import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/src/theme/colors';
import {
  BPM_FILTER_OPTIONS,
  type BpmFilterRange,
  type TopTagEntry,
  formatBpmFilterLabel,
  getSelectedTagFilters,
} from '@/src/lib/chartFilters';
import { TIME_PERIODS, type TimePeriodKey } from '@/src/types/media';

type Props = {
  period: TimePeriodKey;
  onPeriodChange: (period: TimePeriodKey) => void;
  selectedTagTerms: string[];
  onTagTermsChange: (terms: string[]) => void;
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  bpmFilterRange: BpmFilterRange;
  onBpmFilterChange: (range: BpmFilterRange) => void;
  topTags: TopTagEntry[];
  showTagPanel: boolean;
  showTimePanel: boolean;
  showBpmPanel: boolean;
  showSearchPanel: boolean;
  onToggleTagPanel: () => void;
  onToggleTimePanel: () => void;
  onToggleBpmPanel: () => void;
  onToggleSearchPanel: () => void;
  onClearFilters: () => void;
  hasActiveFilters: boolean;
};

export function ChartFilterToolbar({
  period,
  onPeriodChange,
  selectedTagTerms,
  onTagTermsChange,
  searchQuery,
  onSearchQueryChange,
  bpmFilterRange,
  onBpmFilterChange,
  topTags,
  showTagPanel,
  showTimePanel,
  showBpmPanel,
  showSearchPanel,
  onToggleTagPanel,
  onToggleTimePanel,
  onToggleBpmPanel,
  onToggleSearchPanel,
  onClearFilters,
  hasActiveFilters,
}: Props) {
  const selectedTags = getSelectedTagFilters(selectedTagTerms);
  const topTagsPreview = topTags.slice(0, 8);

  const toggleTag = (tag: string) => {
    const hash = `#${tag}`;
    const exists = selectedTagTerms.some(
      (t) => t.toLowerCase() === hash.toLowerCase()
    );
    if (exists) {
      onTagTermsChange(
        selectedTagTerms.filter((t) => t.toLowerCase() !== hash.toLowerCase())
      );
    } else {
      onTagTermsChange([...selectedTagTerms, hash]);
    }
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.triggers}>
        <FilterTrigger
          icon="pricetag-outline"
          label="Tag"
          active={showTagPanel || selectedTags.length > 0}
          detail={
            selectedTags.length > 0
              ? selectedTags.map((t) => `#${t}`).join(', ')
              : undefined
          }
          onPress={onToggleTagPanel}
        />
        <FilterTrigger
          icon="time-outline"
          label="Time"
          active={showTimePanel}
          detail={TIME_PERIODS.find((p) => p.key === period)?.label}
          onPress={onToggleTimePanel}
        />
        <FilterTrigger
          icon="speedometer-outline"
          label="BPM"
          active={showBpmPanel || bpmFilterRange !== 'all'}
          detail={formatBpmFilterLabel(bpmFilterRange)}
          onPress={onToggleBpmPanel}
        />
        <FilterTrigger
          icon="search-outline"
          label="Search"
          active={showSearchPanel || searchQuery.trim().length > 0}
          detail={searchQuery.trim() || undefined}
          onPress={onToggleSearchPanel}
        />
      </View>

      {hasActiveFilters ? (
        <Pressable style={styles.clearBtn} onPress={onClearFilters}>
          <Text style={styles.clearText}>Clear filters</Text>
        </Pressable>
      ) : null}

      {showTagPanel ? (
        <FilterPanel title="Top Tags" onHide={onToggleTagPanel}>
          {selectedTags.length > 0 ? (
            <Pressable
              style={styles.panelAction}
              onPress={() =>
                onTagTermsChange(selectedTagTerms.filter((t) => !t.startsWith('#')))
              }>
              <Text style={styles.panelActionText}>Clear tag filters</Text>
            </Pressable>
          ) : null}
          {topTagsPreview.length > 0 ? (
            <View style={styles.chips}>
              {topTagsPreview.map(({ tag }) => {
                const hash = `#${tag}`;
                const selected = selectedTagTerms.some(
                  (t) => t.toLowerCase() === hash.toLowerCase()
                );
                return (
                  <Pressable
                    key={tag}
                    onPress={() => toggleTag(tag)}
                    style={[styles.chip, selected && styles.chipActive]}>
                    <Text
                      style={[styles.chipText, selected && styles.chipTextActive]}>
                      #{tag}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : (
            <Text style={styles.panelEmpty}>No tags in this chart yet.</Text>
          )}
        </FilterPanel>
      ) : null}

      {showTimePanel ? (
        <FilterPanel title="Time Period" onHide={onToggleTimePanel}>
          <View style={styles.chips}>
            {TIME_PERIODS.map((p) => {
              const active = period === p.key;
              return (
                <Pressable
                  key={p.key}
                  onPress={() => onPeriodChange(p.key)}
                  style={[styles.chip, active && styles.chipActive]}>
                  <Text
                    style={[styles.chipText, active && styles.chipTextActive]}>
                    {p.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </FilterPanel>
      ) : null}

      {showBpmPanel ? (
        <FilterPanel title="Filter by BPM" onHide={onToggleBpmPanel}>
          <View style={styles.chips}>
            {BPM_FILTER_OPTIONS.map((option) => {
              const active = bpmFilterRange === option.key;
              return (
                <Pressable
                  key={option.key}
                  onPress={() => onBpmFilterChange(option.key)}
                  style={[styles.chip, active && styles.chipActive]}>
                  <Text
                    style={[styles.chipText, active && styles.chipTextActive]}>
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </FilterPanel>
      ) : null}

      {showSearchPanel ? (
        <FilterPanel title="Search chart" onHide={onToggleSearchPanel}>
          <TextInput
            value={searchQuery}
            onChangeText={onSearchQueryChange}
            placeholder="Title, artist, or tag…"
            placeholderTextColor={colors.textMuted}
            style={styles.searchInput}
            autoCapitalize="none"
            autoCorrect={false}
            clearButtonMode="while-editing"
          />
          <Text style={styles.searchHint}>
            Filters the current chart. Use Add tunes for MusicBrainz search.
          </Text>
        </FilterPanel>
      ) : null}
    </View>
  );
}

function FilterTrigger({
  icon,
  label,
  detail,
  active,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  detail?: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.trigger, active && styles.triggerActive]}>
      <Ionicons name={icon} size={14} color={colors.accentLight} />
      <Text style={styles.triggerLabel}>{label}</Text>
      {detail ? (
        <Text style={styles.triggerDetail} numberOfLines={1}>
          ({detail})
        </Text>
      ) : null}
    </Pressable>
  );
}

function FilterPanel({
  title,
  onHide,
  children,
}: {
  title: string;
  onHide: () => void;
  children: ReactNode;
}) {
  return (
    <View style={styles.panel}>
      <View style={styles.panelHeader}>
        <Text style={styles.panelTitle}>{title}</Text>
        <Pressable onPress={onHide} hitSlop={8}>
          <Text style={styles.panelHide}>Hide</Text>
        </Pressable>
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: 14,
  },
  triggers: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
  },
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.08)',
    maxWidth: '48%',
  },
  triggerActive: {
    backgroundColor: 'rgba(55, 65, 81, 0.95)',
    borderWidth: 1,
    borderColor: 'rgba(168, 85, 247, 0.45)',
  },
  triggerLabel: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '600',
  },
  triggerDetail: {
    color: '#c4b5fd',
    fontSize: 11,
    maxWidth: 72,
  },
  clearBtn: {
    alignSelf: 'center',
    marginTop: 8,
  },
  clearText: {
    color: '#c4b5fd',
    fontSize: 13,
    fontWeight: '500',
  },
  panel: {
    marginTop: 10,
    padding: 12,
    borderRadius: 12,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  panelTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  panelHide: {
    color: colors.textMuted,
    fontSize: 13,
  },
  panelAction: {
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  panelActionText: {
    color: '#c4b5fd',
    fontSize: 13,
  },
  panelEmpty: {
    color: colors.textMuted,
    fontSize: 13,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
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
  searchInput: {
    backgroundColor: colors.inputBg,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.text,
    fontSize: 15,
  },
  searchHint: {
    marginTop: 8,
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 17,
  },
});
