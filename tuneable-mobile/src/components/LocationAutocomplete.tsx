import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  locationAPI,
  type LocationSuggestion,
} from '@/src/api/locations';
import { formatLocationLabel } from '@/src/lib/location';
import { colors } from '@/src/theme/colors';
import type { ResolvedLocation } from '@/src/types/user';

type Props = {
  value: ResolvedLocation | null;
  onChange: (location: ResolvedLocation | null) => void;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
};

const MIN_QUERY_LENGTH = 2;
const DEBOUNCE_MS = 300;

function displayText(location: ResolvedLocation | null): string {
  if (!location) return '';
  return formatLocationLabel(location) || location.display || location.country || '';
}

export function LocationAutocomplete({
  value,
  onChange,
  label = 'Home location',
  placeholder = 'Search city, town, or region…',
  disabled = false,
}: Props) {
  const [query, setQuery] = useState(displayText(value));
  const [suggestions, setSuggestions] = useState<LocationSuggestion[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isResolving, setIsResolving] = useState(false);
  const [focused, setFocused] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!focused) {
      setQuery(displayText(value));
    }
  }, [value, focused]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const runSuggest = (searchText: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (searchText.trim().length < MIN_QUERY_LENGTH) {
      setSuggestions([]);
      setIsSearching(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setIsSearching(true);
      try {
        const response = await locationAPI.suggest(searchText.trim(), { limit: 6 });
        setSuggestions(response.suggestions || []);
      } catch {
        setSuggestions([]);
      } finally {
        setIsSearching(false);
      }
    }, DEBOUNCE_MS);
  };

  const onSelect = async (suggestion: LocationSuggestion) => {
    setIsResolving(true);
    setSuggestions([]);
    try {
      const response = await locationAPI.resolve(suggestion.mapboxId);
      onChange(response.location);
      setQuery(displayText(response.location) || suggestion.label);
      setFocused(false);
    } catch {
      setQuery(suggestion.label);
    } finally {
      setIsResolving(false);
    }
  };

  const onClear = () => {
    onChange(null);
    setQuery('');
    setSuggestions([]);
  };

  return (
    <View style={styles.wrap}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={styles.inputRow}>
        <Ionicons name="location-outline" size={18} color={colors.textMuted} />
        <TextInput
          style={styles.input}
          value={query}
          editable={!disabled && !isResolving}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          autoCorrect={false}
          autoCapitalize="words"
          onFocus={() => setFocused(true)}
          onBlur={() => {
            // Delay so suggestion presses register
            setTimeout(() => setFocused(false), 180);
          }}
          onChangeText={(text) => {
            setQuery(text);
            setFocused(true);
            if (value?.placeId) {
              onChange(null);
            }
            runSuggest(text);
          }}
        />
        {(isSearching || isResolving) && (
          <ActivityIndicator size="small" color={colors.accentLight} />
        )}
        {!isSearching && !isResolving && (query.length > 0 || value) ? (
          <Pressable onPress={onClear} hitSlop={8}>
            <Ionicons name="close-circle" size={18} color={colors.textMuted} />
          </Pressable>
        ) : null}
      </View>

      {focused && suggestions.length > 0 ? (
        <View style={styles.dropdown}>
          {suggestions.map((item) => (
            <Pressable
              key={item.mapboxId}
              style={styles.suggestion}
              onPress={() => void onSelect(item)}>
              <Text style={styles.suggestionTitle}>{item.label}</Text>
              {item.placeFormatted ? (
                <Text style={styles.suggestionSub}>{item.placeFormatted}</Text>
              ) : null}
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 8,
  },
  label: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.inputBg,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 12,
    paddingHorizontal: 12,
    minHeight: 48,
  },
  input: {
    flex: 1,
    color: colors.text,
    fontSize: 16,
    paddingVertical: 10,
  },
  dropdown: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.background,
    overflow: 'hidden',
  },
  suggestion: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.cardBorder,
  },
  suggestionTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '500',
  },
  suggestionSub: {
    marginTop: 2,
    color: colors.textMuted,
    fontSize: 12,
  },
});
