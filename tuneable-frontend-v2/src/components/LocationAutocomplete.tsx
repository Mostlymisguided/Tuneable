import React, { useEffect, useId, useRef, useState } from 'react';
import { Loader2, MapPin, X } from 'lucide-react';
import { locationAPI } from '../lib/api';
import { formatLocation, type ResolvedLocation } from '../utils/locationHelpers';

type Suggestion = {
  mapboxId: string;
  label: string;
  placeFormatted: string | null;
  featureType: string | null;
};

export interface LocationAutocompleteProps {
  value: ResolvedLocation | null | undefined;
  onChange: (location: ResolvedLocation | null) => void;
  label?: string;
  description?: string;
  placeholder?: string;
  country?: string;
  worldview?: string;
  className?: string;
  inputClassName?: string;
  disabled?: boolean;
  variant?: 'light' | 'dark';
  id?: string;
  autoFocus?: boolean;
  showIcon?: boolean;
}

const MIN_QUERY_LENGTH = 2;
const DEBOUNCE_MS = 300;

function getDisplayText(location: ResolvedLocation | null | undefined): string {
  if (!location) return '';
  if (location.display) return location.display;
  if (location.city || location.country || location.region) {
    const formatted = formatLocation(location);
    return formatted === 'Unknown Location' ? '' : formatted;
  }
  return '';
}

function hasLocationValue(location: ResolvedLocation | null | undefined): boolean {
  if (!location) return false;
  return !!(location.placeId || location.city || location.country || location.display);
}

const LocationAutocomplete: React.FC<LocationAutocompleteProps> = ({
  value,
  onChange,
  label,
  description,
  placeholder = 'Search city, town, or region…',
  country,
  worldview,
  className = '',
  inputClassName,
  disabled = false,
  variant = 'dark',
  id,
  autoFocus = false,
  showIcon = true,
}) => {
  const generatedId = useId();
  const inputId = id || generatedId;
  const listboxId = `${inputId}-listbox`;

  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [isResolving, setIsResolving] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [isFocused, setIsFocused] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const selectingRef = useRef(false);

  const resolvedDisplay = getDisplayText(value);
  const inputValue = isFocused ? query : resolvedDisplay;

  const defaultInputClass =
    variant === 'light'
      ? 'block w-full rounded-lg border border-gray-300 px-3 py-2 pr-10 shadow-sm outline-none text-gray-900 placeholder:text-gray-400 focus:ring-2 focus:ring-black focus:ring-offset-1'
      : 'input w-full pr-10';

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  useEffect(() => {
    if (!isFocused) {
      setQuery(resolvedDisplay);
    }
  }, [resolvedDisplay, isFocused]);

  const runSuggest = (searchText: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (searchText.trim().length < MIN_QUERY_LENGTH) {
      setSuggestions([]);
      setIsOpen(false);
      setIsSearching(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setIsSearching(true);
      try {
        const response = await locationAPI.suggest(searchText.trim(), {
          country,
          worldview,
          limit: 6,
        });
        const next = response.suggestions || [];
        setSuggestions(next);
        setIsOpen(next.length > 0);
        setActiveIndex(-1);
      } catch (error) {
        console.error('Location suggest failed:', error);
        setSuggestions([]);
        setIsOpen(false);
      } finally {
        setIsSearching(false);
      }
    }, DEBOUNCE_MS);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = e.target.value;
    setQuery(next);
    setIsFocused(true);
    if (value?.placeId) {
      onChange({ city: '', region: '', country: '' });
    }
    runSuggest(next);
  };

  const handleSelect = async (suggestion: Suggestion) => {
    selectingRef.current = true;
    setIsOpen(false);
    setSuggestions([]);
    setIsResolving(true);

    try {
      const response = await locationAPI.resolve(suggestion.mapboxId);
      const location = response.location as ResolvedLocation;
      onChange(location);
      setQuery(getDisplayText(location));
    } catch (error) {
      console.error('Location resolve failed:', error);
      setQuery(suggestion.label);
    } finally {
      setIsResolving(false);
      setIsFocused(false);
      selectingRef.current = false;
    }
  };

  const handleClear = () => {
    onChange(null);
    setQuery('');
    setSuggestions([]);
    setIsOpen(false);
  };

  const handleFocus = () => {
    setIsFocused(true);
    setQuery(resolvedDisplay || query);
  };

  const handleBlur = () => {
    setTimeout(() => {
      if (selectingRef.current) return;
      setIsFocused(false);
      setIsOpen(false);
      setActiveIndex(-1);
      if (!hasLocationValue(value)) {
        setQuery('');
      }
    }, 150);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen || suggestions.length === 0) {
      if (e.key === 'Escape') {
        setIsOpen(false);
        setActiveIndex(-1);
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((prev) => (prev + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((prev) => (prev <= 0 ? suggestions.length - 1 : prev - 1));
    } else if (e.key === 'Enter' && activeIndex >= 0) {
      e.preventDefault();
      void handleSelect(suggestions[activeIndex]);
    } else if (e.key === 'Escape') {
      setIsOpen(false);
      setActiveIndex(-1);
    }
  };

  const showClear = hasLocationValue(value) && !disabled && !isResolving;
  const showSpinner = isSearching || isResolving;

  return (
    <div className={className} ref={containerRef}>
      {label && (
        <label htmlFor={inputId} className={variant === 'light' ? 'block text-sm font-medium text-gray-700 mb-1' : 'block text-white font-medium mb-2'}>
          {label}
        </label>
      )}
      {description && (
        <p className={variant === 'light' ? 'text-xs text-gray-500 mb-1' : 'text-xs text-gray-400 mb-2'}>
          {description}
        </p>
      )}

      <div className="relative">
        {showIcon && (
          <MapPin
            className={`pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 ${
              variant === 'light' ? 'text-gray-400' : 'text-gray-500'
            }`}
          />
        )}
        <input
          id={inputId}
          type="text"
          role="combobox"
          aria-expanded={isOpen}
          aria-controls={listboxId}
          aria-autocomplete="list"
          autoComplete="off"
          autoFocus={autoFocus}
          disabled={disabled || isResolving}
          value={inputValue}
          onChange={handleInputChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className={`${inputClassName || defaultInputClass}${showIcon ? ' pl-9' : ''}`}
        />

        <div className="absolute inset-y-0 right-2 flex items-center gap-1">
          {showSpinner && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}
          {showClear && (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={handleClear}
              className={variant === 'light' ? 'text-gray-400 hover:text-gray-600' : 'text-gray-500 hover:text-gray-300'}
              aria-label="Clear location"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {isOpen && suggestions.length > 0 && (
          <ul
            id={listboxId}
            role="listbox"
            className={`absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-lg border shadow-lg ${
              variant === 'light'
                ? 'border-gray-200 bg-white'
                : 'border-gray-700 bg-gray-900'
            }`}
          >
            {suggestions.map((suggestion, index) => (
              <li
                key={suggestion.mapboxId}
                role="option"
                aria-selected={index === activeIndex}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => void handleSelect(suggestion)}
                className={`cursor-pointer px-3 py-2 text-sm ${
                  index === activeIndex
                    ? variant === 'light'
                      ? 'bg-gray-100 text-gray-900'
                      : 'bg-purple-900/40 text-white'
                    : variant === 'light'
                      ? 'text-gray-900 hover:bg-gray-50'
                      : 'text-gray-200 hover:bg-gray-800'
                }`}
              >
                <span className="block font-medium">{suggestion.label}</span>
                {suggestion.placeFormatted && suggestion.placeFormatted !== suggestion.label && (
                  <span className={`block text-xs ${variant === 'light' ? 'text-gray-500' : 'text-gray-400'}`}>
                    {suggestion.placeFormatted}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default LocationAutocomplete;
