import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Award, Crown, Loader2, MapPin, TrendingUp } from 'lucide-react';
import { DEFAULT_PROFILE_PIC } from '../constants';
import { mediaAPI } from '../lib/api';
import { penceToPounds } from '../utils/currency';
import {
  championPickToResolvedLocation,
  formatLocation,
  getChampionScopePicksFromLocation,
  type ResolvedLocation,
} from '../utils/locationHelpers';
import LocationAutocomplete from './LocationAutocomplete';
import { useAuth } from '../contexts/AuthContext';

export interface MediaChampionRanking {
  rank: number;
  totalAmount: number;
  bidCount: number;
  locationDisplay?: string | null;
  isChampion: boolean;
  user: {
    _id: string;
    uuid?: string;
    username: string;
    profilePic?: string | null;
  };
}

export interface MediaChampionsResponse {
  scope: 'global' | 'place';
  locationPlaceId: string | null;
  tipperCount: number;
  totalAmount: number;
  bidCount: number;
  hasChampion: boolean;
  champion: MediaChampionRanking | null;
  rankings: MediaChampionRanking[];
  minTippersForChampion: number;
}

interface MediaChampionsProps {
  mediaId: string;
  maxDisplay?: number;
}

const MediaChampions: React.FC<MediaChampionsProps> = ({ mediaId, maxDisplay = 10 }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [selectedLocation, setSelectedLocation] = useState<ResolvedLocation | null>(null);
  const [showLocationSearch, setShowLocationSearch] = useState(false);
  const [data, setData] = useState<MediaChampionsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const homeScopePicks = useMemo(
    () => getChampionScopePicksFromLocation(user?.homeLocation || null),
    [user?.homeLocation]
  );

  const scopeLabel = selectedLocation?.placeId
    ? formatLocation(selectedLocation)
    : 'Earth';

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await mediaAPI.getChampions(mediaId, {
          locationPlaceId: selectedLocation?.placeId,
          limit: maxDisplay,
        });
        if (!cancelled) {
          setData(response);
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.response?.data?.error || 'Failed to load champions');
          setData(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [mediaId, selectedLocation?.placeId, maxDisplay]);

  const openProfile = (ranking: MediaChampionRanking) => {
    const id = ranking.user.uuid || ranking.user._id;
    if (id) navigate(`/user/${id}`);
  };

  return (
    <div className="space-y-4">
      {/* Scope header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-white">
            <Crown className="h-5 w-5 text-amber-400 flex-shrink-0" />
            <h3 className="text-lg md:text-xl font-bold">
              {data?.hasChampion ? (
                <>
                  Champion of{' '}
                  <span className="text-amber-300">{scopeLabel}</span>
                </>
              ) : (
                <>
                  Champions ·{' '}
                  <span className="text-purple-300">{scopeLabel}</span>
                </>
              )}
            </h3>
          </div>
          <p className="text-xs md:text-sm text-gray-400 mt-1">
            Ranked by tip total from tippers based in this place. Social status only — not ownership rights.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowLocationSearch((v) => !v)}
          className="inline-flex items-center gap-1.5 self-start text-xs sm:text-sm text-purple-300 hover:text-white transition-colors"
        >
          <MapPin className="h-3.5 w-3.5" />
          {showLocationSearch ? 'Hide search' : 'Search place'}
        </button>
      </div>

      {/* Scope chips */}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => {
            setSelectedLocation(null);
            setShowLocationSearch(false);
          }}
          className={`rounded-full px-3 py-1 text-xs transition-colors ${
            !selectedLocation?.placeId
              ? 'bg-purple-600 text-white ring-1 ring-purple-400/50'
              : 'bg-gray-800 text-gray-200 hover:bg-gray-700'
          }`}
        >
          Earth
        </button>
        {homeScopePicks.map((pick) => {
          const selected = selectedLocation?.placeId === pick.placeId;
          return (
            <button
              key={pick.placeId}
              type="button"
              onClick={() =>
                setSelectedLocation(selected ? null : championPickToResolvedLocation(pick))
              }
              className={`rounded-full px-3 py-1 text-xs transition-colors ${
                selected
                  ? 'bg-purple-600 text-white ring-1 ring-purple-400/50'
                  : 'bg-gray-800 text-gray-200 hover:bg-gray-700'
              }`}
              title={pick.placetype ? `${pick.placetype}` : undefined}
            >
              {pick.label}
            </button>
          );
        })}
      </div>

      {showLocationSearch && (
        <LocationAutocomplete
          value={selectedLocation}
          onChange={(loc) => {
            setSelectedLocation(loc);
            if (loc?.placeId) setShowLocationSearch(false);
          }}
          placeholder="Search country, city, or neighborhood…"
          variant="dark"
          label="Champion scope"
          description="Titles use the tipper’s home location hierarchy."
        />
      )}

      {/* Champion highlight */}
      {!loading && data?.champion && (
        <button
          type="button"
          onClick={() => openProfile(data.champion!)}
          className="w-full text-left flex items-center gap-3 md:gap-4 p-3 md:p-4 rounded-lg bg-gradient-to-r from-amber-900/40 via-purple-900/30 to-pink-900/20 border border-amber-500/30 hover:border-amber-400/50 transition-all"
        >
          <div className="relative flex-shrink-0">
            <div className="w-14 h-14 md:w-16 md:h-16 rounded-full overflow-hidden border-2 border-amber-400">
              <img
                src={data.champion.user.profilePic || DEFAULT_PROFILE_PIC}
                alt={data.champion.user.username}
                className="w-full h-full object-cover"
                onError={(e) => {
                  e.currentTarget.src = DEFAULT_PROFILE_PIC;
                }}
              />
            </div>
            <div className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-amber-500 flex items-center justify-center shadow">
              <Crown className="h-3.5 w-3.5 text-black" />
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <Award className="h-4 w-4 text-amber-400 flex-shrink-0" />
              <span className="text-xs font-semibold uppercase tracking-wider text-amber-300">
                Champion of {scopeLabel}
              </span>
            </div>
            <div className="text-white font-bold text-base md:text-lg truncate mt-0.5">
              {data.champion.user.username}
            </div>
            <div className="text-xs text-gray-400 mt-0.5">
              {data.champion.bidCount} {data.champion.bidCount === 1 ? 'tip' : 'tips'}
              {data.champion.locationDisplay ? ` · ${data.champion.locationDisplay}` : ''}
            </div>
          </div>
          <div className="text-right flex-shrink-0">
            <div className="text-lg md:text-xl font-bold text-amber-300">
              {penceToPounds(data.champion.totalAmount)}
            </div>
            <div className="text-[10px] text-gray-500 uppercase tracking-wide">tipped</div>
          </div>
        </button>
      )}

      {loading && (
        <div className="flex items-center justify-center gap-2 py-8 text-gray-400">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">Loading champions…</span>
        </div>
      )}

      {error && !loading && (
        <div className="text-sm text-red-400 py-4 text-center">{error}</div>
      )}

      {!loading && !error && data && data.rankings.length === 0 && (
        <div className="text-center py-6 px-4 rounded-lg bg-black/20 border border-dashed border-gray-700">
          <MapPin className="h-6 w-6 text-gray-500 mx-auto mb-2" />
          <p className="text-sm text-gray-300">
            No champions yet in <span className="text-white font-medium">{scopeLabel}</span>.
          </p>
          <p className="text-xs text-gray-500 mt-1">
            Be the first tipper based here to claim the title.
          </p>
        </div>
      )}

      {/* Ranked list */}
      {!loading && data && data.rankings.length > 0 && (
        <div className="space-y-2 md:space-y-3">
          {data.rankings.map((ranking) => (
            <div
              key={ranking.user._id || ranking.user.uuid || ranking.rank}
              className={`flex flex-row md:items-center md:justify-between p-1.5 md:p-4 rounded-lg hover:bg-purple-500/40 transition-all cursor-pointer ${
                ranking.isChampion
                  ? 'bg-amber-900/20 border border-amber-500/20'
                  : 'bg-purple-900/20'
              }`}
              onClick={() => openProfile(ranking)}
            >
              <div className="flex items-center space-x-2 md:space-x-4 flex-1 min-w-0">
                <div
                  className={`w-6 h-6 md:w-8 md:h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                    ranking.isChampion
                      ? 'bg-gradient-to-br from-amber-500 to-orange-600'
                      : 'bg-gradient-to-br from-purple-600 to-pink-600'
                  }`}
                >
                  {ranking.isChampion ? (
                    <Crown className="h-3.5 w-3.5 md:h-4 md:w-4 text-white" />
                  ) : (
                    <span className="text-white font-bold text-xs md:text-sm">#{ranking.rank}</span>
                  )}
                </div>

                <div className="w-10 h-10 md:w-12 md:h-12 rounded-full overflow-hidden bg-gray-800 border-2 border-purple-500 flex-shrink-0">
                  <img
                    src={ranking.user.profilePic || DEFAULT_PROFILE_PIC}
                    alt={ranking.user.username}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      e.currentTarget.src = DEFAULT_PROFILE_PIC;
                    }}
                  />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center space-x-1 md:space-x-2">
                    <h4 className="text-white font-semibold text-sm md:text-lg truncate">
                      {ranking.user.username}
                    </h4>
                    {ranking.isChampion ? (
                      <Crown className="h-3 w-3 md:h-4 md:w-4 text-amber-400 flex-shrink-0" />
                    ) : (
                      <TrendingUp className="h-3 w-3 md:h-4 md:w-4 text-green-400 flex-shrink-0" />
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-1.5 md:gap-x-3 text-xs md:text-sm text-gray-400 mt-0.5">
                    {ranking.locationDisplay && (
                      <>
                        <div className="flex items-center space-x-1">
                          <MapPin className="h-2.5 w-2.5 md:h-3 md:w-3" />
                          <span className="truncate">{ranking.locationDisplay}</span>
                        </div>
                        <span className="hidden md:inline">•</span>
                      </>
                    )}
                    <span>
                      {ranking.bidCount} {ranking.bidCount === 1 ? 'Tip' : 'Tips'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="text-right md:ml-4">
                <div
                  className={`text-sm md:text-xl font-bold ${
                    ranking.isChampion ? 'text-amber-300' : 'text-green-400'
                  }`}
                >
                  {penceToPounds(ranking.totalAmount)}
                </div>
                <div className="text-xs text-gray-400">
                  avg {penceToPounds(ranking.totalAmount / Math.max(ranking.bidCount, 1))}
                </div>
              </div>
            </div>
          ))}

          {data.tipperCount > 0 && (
            <p className="text-[11px] text-gray-500 text-center pt-1">
              {data.tipperCount} tipper{data.tipperCount === 1 ? '' : 's'} ·{' '}
              {penceToPounds(data.totalAmount)} in this scope
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default MediaChampions;
