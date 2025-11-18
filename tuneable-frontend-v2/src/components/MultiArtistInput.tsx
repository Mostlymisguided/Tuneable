import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Trash2, User } from 'lucide-react';
import { userAPI } from '../lib/api';
import { DEFAULT_PROFILE_PIC } from '../constants';

export type ArtistRelation = ',' | '&' | 'and' | 'with' | 'ft.' | 'feat.' | 'vs.' | 'x' | 'X';

export type ArtistEntry = {
  id: string;
  name: string;
  userId?: string | null;
  userUuid?: string | null;
  profilePic?: string | null;
  relationToNext?: ArtistRelation | null;
};

interface MultiArtistInputProps {
  label?: string;
  description?: string;
  value: ArtistEntry[];
  onChange: (artists: ArtistEntry[]) => void;
  allowEmpty?: boolean;
  disabled?: boolean;
  className?: string;
  maxArtists?: number;
}

interface SearchResult {
  _id: string;
  uuid?: string;
  username: string;
  profilePic?: string;
  artistName?: string;
}

const relationOptions: { value: ArtistRelation; label: string }[] = [
  { value: '&', label: 'Artist A & Artist B' },
  { value: 'and', label: 'Artist A and Artist B' },
  { value: ',', label: 'Artist A, Artist B' },
  { value: 'with', label: 'Artist A with Artist B' },
  { value: 'ft.', label: 'Artist A ft. Artist B' },
  { value: 'feat.', label: 'Artist A feat. Artist B' },
  { value: 'vs.', label: 'Artist A vs. Artist B' },
  { value: 'x', label: 'Artist A x Artist B' },
  { value: 'X', label: 'Artist A X Artist B' }
];

const createEmptyEntry = (): ArtistEntry => ({
  id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2),
  name: '',
  relationToNext: null
});

const MultiArtistInput: React.FC<MultiArtistInputProps> = ({
  label = 'Artists',
  description = 'Add artists in the order they should appear. Choose how each artist connects to the next.',
  value,
  onChange,
  allowEmpty = false,
  disabled = false,
  className = '',
  maxArtists = 6
}) => {
  const [searchResults, setSearchResults] = useState<Record<string, SearchResult[]>>({});
  const [isSearching, setIsSearching] = useState<Record<string, boolean>>({});
  const [showDropdown, setShowDropdown] = useState<Record<string, boolean>>({});
  const debounceRefs = useRef<Record<string, ReturnType<typeof setTimeout> | null>>({});

  const artists = useMemo(() => {
    if (!value || value.length === 0) {
      return [createEmptyEntry()];
    }
    return value;
  }, [value]);

  const updateArtist = (index: number, updates: Partial<ArtistEntry>) => {
    const next = [...artists];
    next[index] = { ...next[index], ...updates };
    onChange(next);
  };

  const handleNameChange = (index: number, name: string) => {
    updateArtist(index, { name, userId: null, userUuid: null });
    if (!name || name.trim().length < 2) {
      setSearchResults(prev => ({ ...prev, [artists[index].id]: [] }));
      setShowDropdown(prev => ({ ...prev, [artists[index].id]: false }));
      return;
    }

    if (debounceRefs.current[artists[index].id]) {
      clearTimeout(debounceRefs.current[artists[index].id]!);
    }

    debounceRefs.current[artists[index].id] = setTimeout(async () => {
      setIsSearching(prev => ({ ...prev, [artists[index].id]: true }));
      try {
        const response = await userAPI.searchUsers({ search: name.trim(), limit: 10 });
        const creators = (response.users || []).filter((user: any) => user.artistName);
        setSearchResults(prev => ({ ...prev, [artists[index].id]: creators }));
        setShowDropdown(prev => ({ ...prev, [artists[index].id]: creators.length > 0 }));
      } catch (error) {
        console.error('Error searching artists:', error);
        setSearchResults(prev => ({ ...prev, [artists[index].id]: [] }));
        setShowDropdown(prev => ({ ...prev, [artists[index].id]: false }));
      } finally {
        setIsSearching(prev => ({ ...prev, [artists[index].id]: false }));
      }
    }, 250);
  };

  const handleSelectArtist = (index: number, artist: SearchResult) => {
    const name = artist.artistName || artist.username;
    updateArtist(index, {
      name,
      userId: artist._id,
      userUuid: artist.uuid || null,
      profilePic: artist.profilePic || null
    });
    setShowDropdown(prev => ({ ...prev, [artists[index].id]: false }));
  };

  const addArtist = () => {
    if (artists.length >= maxArtists) return;
    const next = [...artists];
    const lastIndex = next.length - 1;
    if (lastIndex >= 0 && !next[lastIndex].relationToNext) {
      next[lastIndex] = { ...next[lastIndex], relationToNext: '&' };
    }
    next.push(createEmptyEntry());
    onChange(next);
  };

  const removeArtist = (index: number) => {
    if (!allowEmpty && artists.length <= 1) {
      updateArtist(0, { name: '', userId: null, userUuid: null });
      return;
    }
    const next = [...artists];
    const removed = next.splice(index, 1)[0];
    if (index > 0 && next[index - 1]) {
      next[index - 1] = {
        ...next[index - 1],
        relationToNext: removed?.relationToNext || null
      };
    }
    onChange(next.length === 0 ? [createEmptyEntry()] : next);
  };

  useEffect(() => {
    return () => {
      Object.values(debounceRefs.current).forEach(timeout => {
        if (timeout) clearTimeout(timeout);
      });
    };
  }, []);

  return (
    <div className={`space-y-3 ${className}`}>
      <div>
        <label className="block text-white font-medium mb-1">{label}</label>
        <p className="text-xs text-gray-400">{description}</p>
      </div>

      {artists.map((artist, index) => {
        const artistId = artist.id;
        const relationsDisabled = index === artists.length - 1;
        const dropdownVisible = showDropdown[artistId] && (searchResults[artistId]?.length || 0) > 0;

        return (
          <div
            key={artistId}
            className="flex flex-col gap-2 rounded-lg border border-gray-700/70 p-3 bg-black/30 relative"
          >
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-purple-400" />
              <span className="text-sm text-gray-300">Artist {index + 1}</span>
              {!relationsDisabled && (
                <span className="text-xs text-gray-500">(connects to Artist {index + 2})</span>
              )}
            </div>

            <div className="relative">
              <input
                type="text"
                value={artist.name}
                disabled={disabled}
                onChange={(e) => handleNameChange(index, e.target.value)}
                onFocus={() => {
                  if ((searchResults[artistId] || []).length > 0) {
                    setShowDropdown(prev => ({ ...prev, [artistId]: true }));
                  }
                }}
                className="input pr-10"
                placeholder="Search artist name"
              />
              {isSearching[artistId] && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <div className="h-4 w-4 border-2 border-gray-500 border-t-transparent rounded-full animate-spin" />
                </div>
              )}

              {dropdownVisible && (
                <div className="absolute z-30 mt-1 w-full bg-gray-900 border border-gray-700 rounded-lg shadow-lg max-h-56 overflow-y-auto">
                  {(searchResults[artistId] || []).map(result => (
                    <button
                      key={result._id}
                      type="button"
                      className="w-full px-3 py-2 flex items-center gap-3 hover:bg-gray-800 text-left text-sm"
                      onClick={() => handleSelectArtist(index, result)}
                    >
                      <img
                        src={result.profilePic || DEFAULT_PROFILE_PIC}
                        alt={result.username}
                        className="h-8 w-8 rounded-full object-cover"
                        onError={(e) => {
                          e.currentTarget.src = DEFAULT_PROFILE_PIC;
                        }}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-white truncate">
                          {result.artistName || result.username}
                        </div>
                        <div className="text-xs text-gray-400 truncate">@{result.username}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="flex flex-col gap-2 md:flex-row md:items-center">
              <label className="text-xs uppercase tracking-wide text-gray-500 md:w-32">
                Relation to next
              </label>
              <select
                value={artist.relationToNext || '&'}
                disabled={relationsDisabled || disabled}
                onChange={(e) =>
                  updateArtist(index, {
                    relationToNext: (e.target.value as ArtistRelation) || '&'
                  })
                }
                className="input md:flex-1"
              >
                {relationOptions.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center justify-between">
              {artist.userId && (
                <span className="text-xs text-green-400 flex items-center gap-1">
                  Linked • #{artist.userUuid || artist.userId}
                </span>
              )}
              <button
                type="button"
                className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1"
                onClick={() => removeArtist(index)}
                disabled={disabled || (!allowEmpty && artists.length === 1)}
              >
                <Trash2 className="h-3 w-3" />
                Remove
              </button>
            </div>
          </div>
        );
      })}

      {artists.length < maxArtists && (
        <button
          type="button"
          onClick={addArtist}
          disabled={disabled}
          className="flex items-center gap-2 text-sm text-purple-300 hover:text-white transition-colors"
        >
          <Plus className="h-4 w-4" />
          Add another artist
        </button>
      )}
    </div>
  );
};

export default MultiArtistInput;

