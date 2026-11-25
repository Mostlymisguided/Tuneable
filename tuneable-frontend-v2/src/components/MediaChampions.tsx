import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronUp, Crown, Loader2, MapPin } from 'lucide-react';
import { mediaAPI, tagAPI, artistAPI, locationAPI } from '../lib/api';
import { penceToPounds } from '../utils/currency';
import {
  championPickToResolvedLocation,
  formatLocation,
  getChampionScopePicksFromLocation,
  type ResolvedLocation,
} from '../utils/locationHelpers';
import LocationAutocomplete from './LocationAutocomplete';
import UserAvatar from './UserAvatar';
import { useAuth } from '../contexts/AuthContext';
import { getUserProfileUrl } from '../utils/profileNavigation';

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
  entityType?: 'media' | 'tag' | 'artist' | 'place';
  tag?: { name: string; slug: string; canonicalTag?: string };
  artist?: { userId?: string | null; name?: string };
  place?: { placeId: string; name: string; featureType?: string | null };
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
  /** Places where this creator charts best. Artist champions only. */
  bestPlaces?: Array<{
    placeId: string;
    label: string;
    rank?: number | null;
    placetype?: string | null;
  }>;
}

interface MediaChampionsProps {
  /** Media UUID or ObjectId */
  mediaId?: string;
  /** Tag profile slug for tag-scoped champions */
  tagSlug?: string;
  /** Place profile Mapbox id — champions of media originating from this place */
  originPlaceId?: string;
  /** Verified artist user id/uuid */
  artistUserId?: string;
  /** Artist display name when no userId */
  artistName?: string;
  maxDisplay?: number;
  /** Seed place scope from a parent chart filter (e.g. Party Tunefeed location). */
  seedLocation?: ResolvedLocation | null;
  /** Tighter layout for side panels / chart embeds. */
  compact?: boolean;
  /**
   * `strip` — compact #1–#3 avatar row (party now-playing). Renders nothing until
   * there is a podium; tap expands to the full panel.
   */
  variant?: 'default' | 'strip';
  /** Optional subject label (track, tag, or artist name). */
  entityLabel?: string;
  /** @deprecated Use entityLabel */
  mediaTitle?: string;
}

const MEDAL_STYLES: Record<
  ChampionMedal,
  {
    border: string;
    surface: string;
    crownWrap: string;
    crown: string;
    amount: string;
  }
> = {
  gold: {
    border: 'border-amber-300/40',
    surface: 'bg-gradient-to-r from-amber-400/10 to-transparent',
    crownWrap: 'bg-amber-400/15 border-amber-300/40 text-amber-200',
    crown: 'text-amber-200',
    amount: 'text-amber-200',
  },
  silver: {
    border: 'border-slate-300/30',
    surface: 'bg-gradient-to-r from-slate-300/10 to-transparent',
    crownWrap: 'bg-slate-300/10 border-slate-300/30 text-slate-200',
    crown: 'text-slate-200',
    amount: 'text-slate-200',
  },
  bronze: {
    border: 'border-orange-400/35',
    surface: 'bg-gradient-to-r from-orange-400/10 to-transparent',
    crownWrap: 'bg-orange-400/15 border-orange-400/35 text-orange-200',
    crown: 'text-orange-200',
    amount: 'text-orange-200',
  },
};

function scopePillClass(selected: boolean) {
  return `inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium border transition-colors ${
    selected
      ? 'bg-purple-600 text-white border-purple-300/50'
      : 'bg-white/[0.04] text-gray-200 border-white/10 hover:bg-white/[0.08] hover:border-white/20'
  }`;
}

function medalForRank(rank: number, isChampion: boolean, medal?: ChampionMedal | null): ChampionMedal | null {
  if (medal) return medal;
  if (!isChampion || rank > 3) return null;
  return (['gold', 'silver', 'bronze'] as ChampionMedal[])[rank - 1] || null;
}

const MediaChampions: React.FC<MediaChampionsProps> = ({
  mediaId,
  tagSlug,
  originPlaceId,
  artistUserId,
  artistName,
  maxDisplay = 10,
  seedLocation = null,
  compact = false,
  variant = 'default',
}) => {
  const { user } = useAuth();
  const [selectedLocation, setSelectedLocation] = useState<ResolvedLocation | null>(seedLocation);
  const [showLocationSearch, setShowLocationSearch] = useState(false);
  const [stripExpanded, setStripExpanded] = useState(false);
  const [data, setData] = useState<MediaChampionsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revealedIds, setRevealedIds] = useState<Set<string>>(() => new Set());
  const isStrip = variant === 'strip';

  const toggleRevealed = (id: string) => {
    setRevealedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const homeScopePicks = useMemo(
    () => getChampionScopePicksFromLocation(user?.homeLocation || null),
    [user?.homeLocation]
  );

  // Keep in sync when parent chart location changes
  useEffect(() => {
    setSelectedLocation(seedLocation ?? null);
  }, [seedLocation?.placeId]);

  // Collapse strip when the subject track/tag/artist/place changes
  useEffect(() => {
    setStripExpanded(false);
  }, [mediaId, tagSlug, originPlaceId, artistUserId, artistName]);

  const scopeLabel = selectedLocation?.placeId
    ? formatLocation(selectedLocation)
    : 'Earth';

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!mediaId && !tagSlug && !originPlaceId && !artistUserId && !artistName) {
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
        } else if (originPlaceId) {
          response = await locationAPI.getChampions(originPlaceId, params);
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
  }, [mediaId, tagSlug, originPlaceId, artistUserId, artistName, selectedLocation?.placeId, maxDisplay]);

  const profilePath = (ranking: MediaChampionRanking) => {
    return ranking.user ? getUserProfileUrl(ranking.user) : undefined;
  };

  const creatorScoped = Boolean(artistUserId || artistName);
  const scopePills = creatorScoped ? (data?.bestPlaces || []) : homeScopePicks;
  const customScope = Boolean(
    selectedLocation?.placeId
    && !scopePills.some((pick) => pick.placeId === selectedLocation.placeId)
  );

  const podiumChampions = useMemo(() => {
    if (!data) return [];
    if (data.champions?.length) return data.champions.slice(0, 3);
    return data.rankings.filter((r) => r.isChampion).slice(0, 3);
  }, [data]);

  const hasPodium = podiumChampions.length > 0;
  const rankings = data?.rankings ?? [];
  const listScrollable = rankings.length > 3;

  // Strip: no chrome until there is a podium (or user already expanded)
  if (isStrip && !stripExpanded) {
    if (loading || error || !hasPodium) return null;

    // Rank order #1 · #2 · #3 for a compact now-playing strip
    const stripOrder = [1, 2, 3]
      .map((r) => podiumChampions.find((c) => c.rank === r))
      .filter(Boolean) as MediaChampionRanking[];

    return (
      <div className="flex justify-center mt-3 mb-2">
        <button
          type="button"
          onClick={() => setStripExpanded(true)}
          className="inline-flex items-center gap-2.5 rounded-full bg-black/30 hover:bg-black/45 border border-white/10 px-3 py-1.5 transition-colors group"
          aria-label="Show Champions details"
        >
          <Crown className="h-3.5 w-3.5 text-amber-400 flex-shrink-0" />
          <div className="flex items-center -space-x-2">
            {stripOrder.map((ranking) => {
              const medal = medalForRank(ranking.rank, ranking.isChampion, ranking.medal) || 'gold';
              const styles = MEDAL_STYLES[medal];
              return (
                <div
                  key={ranking.user._id || ranking.user.uuid || ranking.rank}
                  className={`relative rounded-full overflow-hidden bg-gray-800 border-2 ${styles.border} ${
                    ranking.rank === 1 ? 'w-8 h-8 z-10' : 'w-7 h-7'
                  }`}
                  title={`#${ranking.rank}`}
                >
                  <UserAvatar
                    username={ranking.user.username}
                    profilePic={ranking.user.profilePic}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                </div>
              );
            })}
          </div>
          <span className="text-xs text-gray-300 group-hover:text-white hidden sm:inline">
            Champions
          </span>
          <ChevronDown className="h-3.5 w-3.5 text-gray-500 group-hover:text-gray-300" />
        </button>
      </div>
    );
  }

  return (
    <div className={`${compact || isStrip ? 'space-y-3' : 'space-y-4'}${isStrip ? ' mt-3 mb-2' : ''}`}>
      {isStrip && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => setStripExpanded(false)}
            className="inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-200 transition-colors"
          >
            <ChevronUp className="h-3.5 w-3.5" />
            Hide Champions
          </button>
        </div>
      )}
      <div
        className={
          isStrip
            ? 'card bg-black/20 rounded-lg p-3 md:p-4 max-h-[28rem] overflow-y-auto space-y-3'
            : 'contents'
        }
      >
      <div className="flex items-center gap-2.5 min-w-0">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-amber-400/15 border border-amber-300/30 flex-shrink-0">
          <Crown className="h-3.5 w-3.5 text-amber-200" />
        </span>
        <h3 className={`font-semibold tracking-tight text-white truncate ${compact || isStrip ? 'text-base' : 'text-lg'}`}>
          Champions
        </h3>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => {
            setSelectedLocation(null);
            setShowLocationSearch(false);
          }}
          className={scopePillClass(!selectedLocation?.placeId)}
        >
          Earth
        </button>
        {scopePills.map((pick) => {
          const selected = selectedLocation?.placeId === pick.placeId;
          return (
            <button
              key={pick.placeId}
              type="button"
              onClick={() =>
                setSelectedLocation(
                  selected
                    ? null
                    : championPickToResolvedLocation({
                        placeId: pick.placeId,
                        label: pick.label,
                        placetype: pick.placetype || undefined,
                      })
                )
              }
              className={scopePillClass(selected)}
              title={pick.rank ? `Best rank #${pick.rank}` : pick.placetype || undefined}
            >
              {pick.label}
            </button>
          );
        })}
        {customScope && (
          <button
            type="button"
            onClick={() => setSelectedLocation(null)}
            className={scopePillClass(true)}
          >
            {scopeLabel}
          </button>
        )}
        <button
          type="button"
          onClick={() => setShowLocationSearch((v) => !v)}
          className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium text-purple-200 hover:text-white border border-transparent hover:border-white/10 hover:bg-white/[0.04] transition-colors whitespace-nowrap ml-auto"
        >
          <MapPin className="h-3.5 w-3.5" />
          {showLocationSearch ? 'Hide search' : 'Search place'}
        </button>
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
          label="Place"
          description="Show champions whose home is in this place."
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
        <div className="text-center py-6 px-4 rounded-xl bg-white/[0.03] border border-dashed border-white/10">
          <MapPin className="h-5 w-5 text-gray-500 mx-auto mb-2" />
          <p className="text-sm text-gray-300">
            No champions in <span className="text-white font-medium">{scopeLabel}</span> yet.
          </p>
        </div>
      )}

      {/* Ranked tipper chips — scrolls when more than three */}
      {!loading && rankings.length > 0 && (
        <div className="space-y-2">
          <div
            className={`space-y-1.5 ${
              listScrollable
                ? 'max-h-[8.75rem] md:max-h-[10.5rem] overflow-y-auto overscroll-contain pr-0.5'
                : ''
            }`}
          >
            {rankings.map((ranking) => {
              const medal = medalForRank(ranking.rank, ranking.isChampion, ranking.medal);
              const styles = medal ? MEDAL_STYLES[medal] : null;
              const path = profilePath(ranking);
              const tipLabel = `${ranking.bidCount} ${ranking.bidCount === 1 ? 'tip' : 'tips'}`;
              const key = String(ranking.user._id || ranking.user.uuid || ranking.rank);
              const revealed = revealedIds.has(key);
              const chipClassName = `flex items-center gap-2 w-full px-2 py-1.5 rounded-xl border transition-colors hover:brightness-110 ${
                styles ? `${styles.border} ${styles.surface}` : 'border-white/10 bg-white/[0.03]'
              }`;
              const nameClass = 'flex-1 min-w-0 text-xs md:text-sm text-white truncate hover:underline';
              return (
                <div key={key} className={chipClassName} title={tipLabel}>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleRevealed(key);
                    }}
                    className="inline-flex items-center gap-1.5 md:gap-2 flex-shrink-0 rounded-full cursor-pointer focus-visible:outline focus-visible:outline-1 focus-visible:outline-purple-300"
                    aria-pressed={revealed}
                    aria-label={
                      revealed
                        ? 'Hide name'
                        : styles
                          ? `Show #${ranking.rank} champion`
                          : `Show #${ranking.rank}`
                    }
                  >
                    <UserAvatar
                      username={ranking.user.username}
                      profilePic={ranking.user.profilePic}
                      alt=""
                      className="h-6 w-6 md:h-7 md:w-7 object-cover flex-shrink-0"
                    />
                    {styles ? (
                      <span
                        className={`inline-flex items-center justify-center h-5 w-5 rounded-full border flex-shrink-0 ${styles.crownWrap}`}
                        title={`#${ranking.rank} Champion`}
                      >
                        <Crown className={`h-2.5 w-2.5 ${styles.crown}`} />
                      </span>
                    ) : (
                      <span
                        className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1 rounded-full bg-black/30 border border-white/10 text-[10px] font-semibold text-gray-300 tabular-nums flex-shrink-0"
                        title={`#${ranking.rank}`}
                      >
                        #{ranking.rank}
                      </span>
                    )}
                  </button>
                  {revealed && path ? (
                    <Link to={path} className={nameClass} onClick={(e) => e.stopPropagation()}>
                      {ranking.user.username}
                    </Link>
                  ) : revealed ? (
                    <span className="flex-1 min-w-0 text-xs md:text-sm text-white truncate">
                      {ranking.user.username}
                    </span>
                  ) : (
                    <span className="flex-1" />
                  )}
                  <span
                    className={`text-xs md:text-sm font-medium flex-shrink-0 tabular-nums ${
                      styles ? styles.amount : 'text-green-300'
                    }`}
                    title={tipLabel}
                  >
                    {penceToPounds(ranking.totalAmount)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
      </div>
    </div>
  );
};

export default MediaChampions;
