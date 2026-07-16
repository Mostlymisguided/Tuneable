import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Crown, Loader2, MapPin, TrendingUp } from 'lucide-react';
import { DEFAULT_PROFILE_PIC } from '../constants';
import { mediaAPI, tagAPI, artistAPI } from '../lib/api';
import { penceToPounds } from '../utils/currency';
import {
  championPickToResolvedLocation,
  formatLocation,
  getChampionScopePicksFromLocation,
  type ResolvedLocation,
} from '../utils/locationHelpers';
import LocationAutocomplete from './LocationAutocomplete';
import { useAuth } from '../contexts/AuthContext';

export type ChampionMedal = 'gold' | 'silver' | 'bronze';

export interface MediaChampionRanking {
  rank: number;
  totalAmount: number;
  bidCount: number;
  locationDisplay?: string | null;
  isChampion: boolean;
  medal?: ChampionMedal | null;
  user: {
    _id: string;
    uuid?: string;
    username: string;
    profilePic?: string | null;
  };
}

export interface MediaChampionsResponse {
  entityType?: 'media' | 'tag' | 'artist';
  tag?: { name: string; slug: string; canonicalTag?: string };
  artist?: { userId?: string | null; name?: string };
  scope: 'global' | 'place';
  locationPlaceId: string | null;
  tipperCount: number;
  totalAmount: number;
  bidCount: number;
  hasChampions?: boolean;
  hasChampion?: boolean;
  champions?: MediaChampionRanking[];
  champion: MediaChampionRanking | null;
  rankings: MediaChampionRanking[];
  podiumSize?: number;
  minTippersForChampion: number;
}

interface MediaChampionsProps {
  /** Media UUID or ObjectId */
  mediaId?: string;
  /** Tag profile slug for tag-scoped champions */
  tagSlug?: string;
  /** Verified artist user id/uuid */
  artistUserId?: string;
  /** Artist display name when no userId */
  artistName?: string;
  maxDisplay?: number;
  /** Seed place scope from a parent chart filter (e.g. Party Tunefeed location). */
  seedLocation?: ResolvedLocation | null;
  /** Tighter layout for side panels / chart embeds. */
  compact?: boolean;
  /** Optional subject label (track, tag, or artist name). */
  entityLabel?: string;
  /** @deprecated Use entityLabel */
  mediaTitle?: string;
}

const MEDAL_STYLES: Record<
  ChampionMedal,
  {
    label: string;
    border: string;
    badge: string;
    amount: string;
    ring: string;
    bar: string;
    barHeight: string;
  }
> = {
  gold: {
    label: 'text-amber-300',
    border: 'border-amber-400',
    badge: 'bg-gradient-to-br from-amber-400 to-yellow-600 text-black',
    amount: 'text-amber-300',
    ring: 'ring-amber-400/40',
    bar: 'bg-gradient-to-t from-amber-700/80 to-amber-400/50 border-amber-500/40',
    barHeight: 'h-16 md:h-20',
  },
  silver: {
    label: 'text-slate-300',
    border: 'border-slate-300',
    badge: 'bg-gradient-to-br from-slate-200 to-slate-400 text-slate-900',
    amount: 'text-slate-200',
    ring: 'ring-slate-300/40',
    bar: 'bg-gradient-to-t from-slate-600/70 to-slate-300/40 border-slate-400/40',
    barHeight: 'h-12 md:h-14',
  },
  bronze: {
    label: 'text-orange-300',
    border: 'border-orange-400',
    badge: 'bg-gradient-to-br from-orange-400 to-amber-700 text-black',
    amount: 'text-orange-300',
    ring: 'ring-orange-400/40',
    bar: 'bg-gradient-to-t from-orange-800/70 to-orange-500/40 border-orange-500/40',
    barHeight: 'h-9 md:h-11',
  },
};

function medalForRank(rank: number, isChampion: boolean, medal?: ChampionMedal | null): ChampionMedal | null {
  if (medal) return medal;
  if (!isChampion || rank > 3) return null;
  return (['gold', 'silver', 'bronze'] as ChampionMedal[])[rank - 1] || null;
}

const MediaChampions: React.FC<MediaChampionsProps> = ({
  mediaId,
  tagSlug,
  artistUserId,
  artistName,
  maxDisplay = 10,
  seedLocation = null,
  compact = false,
  entityLabel,
  mediaTitle,
}) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [selectedLocation, setSelectedLocation] = useState<ResolvedLocation | null>(seedLocation);
  const [showLocationSearch, setShowLocationSearch] = useState(false);
  const [data, setData] = useState<MediaChampionsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const homeScopePicks = useMemo(
    () => getChampionScopePicksFromLocation(user?.homeLocation || null),
    [user?.homeLocation]
  );

  // Keep in sync when parent chart location changes
  useEffect(() => {
    setSelectedLocation(seedLocation ?? null);
  }, [seedLocation?.placeId]);

  const scopeLabel = selectedLocation?.placeId
    ? formatLocation(selectedLocation)
    : 'Earth';

  const subjectLabel = useMemo(() => {
    if (entityLabel) return entityLabel;
    if (mediaTitle) return mediaTitle;
    if (data?.tag?.name) return `#${data.tag.name}`;
    if (data?.artist?.name) return data.artist.name;
    if (tagSlug) return `#${tagSlug.replace(/-/g, ' ')}`;
    if (artistName) return artistName;
    return null;
  }, [entityLabel, mediaTitle, data, tagSlug, artistName]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!mediaId && !tagSlug && !artistUserId && !artistName) {
        setData(null);
        setLoading(false);
        setError('No champions target specified');
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const params = {
          locationPlaceId: selectedLocation?.placeId,
          limit: maxDisplay,
        };
        let response;
        if (mediaId) {
          response = await mediaAPI.getChampions(mediaId, params);
        } else if (tagSlug) {
          response = await tagAPI.getChampions(tagSlug, params);
        } else {
          response = await artistAPI.getChampions({
            userId: artistUserId,
            name: artistName,
            ...params,
          });
        }
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
  }, [mediaId, tagSlug, artistUserId, artistName, selectedLocation?.placeId, maxDisplay]);

  const openProfile = (ranking: MediaChampionRanking) => {
    const id = ranking.user.uuid || ranking.user._id;
    if (id) navigate(`/user/${id}`);
  };

  const podiumChampions = useMemo(() => {
    if (!data) return [];
    if (data.champions?.length) return data.champions.slice(0, 3);
    return data.rankings.filter((r) => r.isChampion).slice(0, 3);
  }, [data]);

  const hasPodium = podiumChampions.length > 0;
  // Visual podium order: silver (#2), gold (#1), bronze (#3)
  const podiumOrder = useMemo(() => {
    const byRank = (r: number) => podiumChampions.find((c) => c.rank === r);
    return [byRank(2), byRank(1), byRank(3)].filter(Boolean) as MediaChampionRanking[];
  }, [podiumChampions]);

  const restRankings = useMemo(() => {
    if (!data?.rankings) return [];
    return data.rankings.filter((r) => !r.isChampion && r.rank > 3);
  }, [data]);

  return (
    <div className={compact ? 'space-y-3' : 'space-y-4'}>
      {/* Scope header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-white">
            <Crown className={`text-amber-400 flex-shrink-0 ${compact ? 'h-4 w-4' : 'h-5 w-5'}`} />
            <h3 className={`font-bold ${compact ? 'text-base md:text-lg' : 'text-lg md:text-xl'}`}>
              Champions of{' '}
              {subjectLabel ? (
                <span className="text-amber-300">{subjectLabel}</span>
              ) : (
                <span className="text-amber-300">{scopeLabel}</span>
              )}
              {subjectLabel && (
                <span className="text-gray-400 font-normal text-sm md:text-base">
                  {' '}
                  · {scopeLabel}
                </span>
              )}
            </h3>
          </div>
          <p className={`text-gray-400 mt-1 ${compact ? 'text-[11px]' : 'text-xs md:text-sm'}`}>
            #1 · #2 · #3 Champions by tip total from tippers based here. Social status only — not ownership rights.
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
            Be the first tipper based here to claim a podium spot.
          </p>
        </div>
      )}

      {/* Podium: #2 · #1 · #3 */}
      {!loading && hasPodium && (
        <div className="rounded-lg border border-white/10 bg-black/20 px-2 pt-5 pb-2 md:px-4 md:pt-6">
          <div className="flex items-end justify-center gap-2 md:gap-4">
            {podiumOrder.map((ranking) => {
              const medal = medalForRank(ranking.rank, ranking.isChampion, ranking.medal) || 'gold';
              const styles = MEDAL_STYLES[medal];
              const isGold = ranking.rank === 1;
              return (
                <button
                  key={ranking.user._id || ranking.user.uuid || ranking.rank}
                  type="button"
                  onClick={() => openProfile(ranking)}
                  className={`flex flex-col items-center flex-1 max-w-[9rem] md:max-w-[11rem] group ${
                    isGold ? '-mt-2' : ''
                  }`}
                >
                  <div className={`relative ${isGold ? 'scale-110' : ''}`}>
                    <div
                      className={`rounded-full overflow-hidden bg-gray-800 border-2 ${styles.border} ring-2 ${styles.ring} ${
                        isGold ? 'w-16 h-16 md:w-20 md:h-20' : 'w-12 h-12 md:w-14 md:h-14'
                      }`}
                    >
                      <img
                        src={ranking.user.profilePic || DEFAULT_PROFILE_PIC}
                        alt={ranking.user.username}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          e.currentTarget.src = DEFAULT_PROFILE_PIC;
                        }}
                      />
                    </div>
                    <div
                      className={`absolute -bottom-1 left-1/2 -translate-x-1/2 w-6 h-6 md:w-7 md:h-7 rounded-full flex items-center justify-center text-[10px] md:text-xs font-bold shadow ${styles.badge}`}
                    >
                      #{ranking.rank}
                    </div>
                  </div>

                  <div className="mt-3 text-center w-full px-0.5">
                    <div className={`text-[10px] md:text-xs font-semibold uppercase tracking-wider ${styles.label}`}>
                      #{ranking.rank} Champion
                    </div>
                    <div className="text-white font-semibold text-xs md:text-sm truncate mt-0.5 group-hover:underline">
                      {ranking.user.username}
                    </div>
                    <div className={`text-sm md:text-base font-bold mt-0.5 ${styles.amount}`}>
                      {penceToPounds(ranking.totalAmount)}
                    </div>
                  </div>

                  <div
                    className={`mt-2 w-full rounded-t-md border ${styles.bar} ${styles.barHeight}`}
                    aria-hidden
                  />
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Ranked list (#4+) */}
      {!loading && data && (hasPodium || restRankings.length > 0) && (
        <div className="space-y-2 md:space-y-3">
          {hasPodium && restRankings.length > 0 && (
            <p className="text-xs text-gray-500 uppercase tracking-wider">Also tipped</p>
          )}

          {/* Compact podium rows for mobile clarity / plus full list from #4 */}
          {(hasPodium ? restRankings : data.rankings).map((ranking) => {
            const medal = medalForRank(ranking.rank, ranking.isChampion, ranking.medal);
            const styles = medal ? MEDAL_STYLES[medal] : null;
            return (
              <div
                key={ranking.user._id || ranking.user.uuid || ranking.rank}
                className={`flex flex-row md:items-center md:justify-between p-1.5 md:p-4 rounded-lg hover:bg-purple-500/40 transition-all cursor-pointer ${
                  styles
                    ? `bg-black/20 border ${styles.border}/30`
                    : 'bg-purple-900/20'
                }`}
                onClick={() => openProfile(ranking)}
              >
                <div className="flex items-center space-x-2 md:space-x-4 flex-1 min-w-0">
                  <div
                    className={`w-6 h-6 md:w-8 md:h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                      styles
                        ? styles.badge
                        : 'bg-gradient-to-br from-purple-600 to-pink-600 text-white'
                    }`}
                  >
                    {styles ? (
                      <Crown className="h-3.5 w-3.5 md:h-4 md:w-4" />
                    ) : (
                      <span className="font-bold text-xs md:text-sm">#{ranking.rank}</span>
                    )}
                  </div>

                  <div
                    className={`w-10 h-10 md:w-12 md:h-12 rounded-full overflow-hidden bg-gray-800 border-2 flex-shrink-0 ${
                      styles ? styles.border : 'border-purple-500'
                    }`}
                  >
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
                      {styles ? (
                        <span className={`text-[10px] md:text-xs font-semibold uppercase ${styles.label}`}>
                          #{ranking.rank} Champion
                        </span>
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
                      styles ? styles.amount : 'text-green-400'
                    }`}
                  >
                    {penceToPounds(ranking.totalAmount)}
                  </div>
                  <div className="text-xs text-gray-400">
                    avg {penceToPounds(ranking.totalAmount / Math.max(ranking.bidCount, 1))}
                  </div>
                </div>
              </div>
            );
          })}

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
