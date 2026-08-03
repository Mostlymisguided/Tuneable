import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { MapPin, Tag, Loader2, Music, Coins } from 'lucide-react';
import { locationAPI } from '../lib/api';
import MediaChampions from '../components/MediaChampions';
import TippedMediaQueueList, { type TippedQueueItem } from '../components/TippedMediaQueueList';
import { getMediaCoverArt } from '../utils/coverArt';
import { penceToPounds } from '../utils/currency';
import { getPlaceProfilePath } from '../utils/locationHelpers';
import { getTagProfilePath } from '../utils/tagNormalizer';

interface PlaceEntity {
  placeId: string;
  name: string;
  display?: string;
  featureType?: string | null;
  country?: string | null;
  countryCode?: string | null;
  city?: string | null;
  region?: string | null;
}

interface PlaceStats {
  mediaCount?: number;
  globalPlaceAggregate?: number;
}

interface RelatedPlace {
  placeId: string;
  name: string;
  featureType?: string | null;
}

interface RelatedTag {
  name: string;
  slug: string;
}

type PlaceMediaItem = TippedQueueItem;

const LocationProfile: React.FC = () => {
  const { placeId: placeIdParam } = useParams<{ placeId: string }>();
  const navigate = useNavigate();

  const placeId = placeIdParam ? decodeURIComponent(placeIdParam) : '';

  const [place, setPlace] = useState<PlaceEntity | null>(null);
  const [stats, setStats] = useState<PlaceStats | null>(null);
  const [relatedPlaces, setRelatedPlaces] = useState<RelatedPlace[]>([]);
  const [relatedTags, setRelatedTags] = useState<RelatedTag[]>([]);
  const [media, setMedia] = useState<PlaceMediaItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadProfile = useCallback(
    async ({ silent = false }: { silent?: boolean } = {}) => {
      if (!placeId) return;
      if (!silent) {
        setLoading(true);
        setError(null);
      }
      try {
        const data = await locationAPI.getProfile(placeId, { limit: 50 });
        setPlace(data.place);
        setStats(data.stats || null);
        setRelatedPlaces(data.relatedPlaces || []);
        setRelatedTags(data.relatedTags || []);
        setMedia(data.media || []);
        setTotal(data.pagination?.total ?? (data.media?.length || 0));
      } catch (err: unknown) {
        console.error('Error loading location profile:', err);
        if (!silent) setError('Place not found or failed to load.');
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [placeId]
  );

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const displayName = place?.name || place?.display || placeId;
  const tipTotal = stats?.globalPlaceAggregate ?? 0;
  const mosaicCovers = media.slice(0, 4).map((item) => ({
    id: item._id,
    src: getMediaCoverArt(item),
    title: item.title,
  }));

  const subtitle = useMemo(() => {
    if (!place) return null;
    if (place.featureType === 'country') return null;
    const parts = [place.region, place.country].filter(Boolean);
    return parts.length ? parts.join(', ') : null;
  }, [place]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 pb-24 md:pb-8">
      <div className="container mx-auto px-2 md:px-4 py-4 md:py-8">
        <div className="mb-6">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <button
              onClick={() => navigate(-1)}
              className="px-3 md:px-4 py-2 rounded-lg font-medium transition-colors bg-black/20 border-white/20 border border-gray-500 text-white hover:bg-gray-700/30 text-sm md:text-base"
            >
              Back
            </button>
          </div>

          <div className="card p-4 md:p-6 flex flex-col md:flex-row items-start relative">
            <div className="w-full md:w-auto flex justify-center md:justify-start mb-4 md:mb-0 md:mr-6">
              {mosaicCovers.length >= 4 ? (
                <div className="grid grid-cols-2 gap-1 w-40 h-40 sm:w-48 sm:h-48 rounded-lg overflow-hidden shadow-xl flex-shrink-0">
                  {mosaicCovers.map((cover) => (
                    <img
                      key={cover.id}
                      src={cover.src}
                      alt={cover.title}
                      className="w-full h-full object-cover"
                    />
                  ))}
                </div>
              ) : mosaicCovers.length > 0 ? (
                <div className="relative w-40 h-40 sm:w-48 sm:h-48 rounded-lg overflow-hidden shadow-xl flex-shrink-0">
                  <img
                    src={mosaicCovers[0].src}
                    alt={mosaicCovers[0].title}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-purple-900/80 to-transparent flex items-end justify-center pb-3">
                    <MapPin className="h-8 w-8 text-purple-200" />
                  </div>
                </div>
              ) : (
                <div className="w-40 h-40 sm:w-48 sm:h-48 rounded-lg bg-purple-600/30 border border-purple-500/40 flex items-center justify-center shadow-xl flex-shrink-0">
                  <MapPin className="h-16 w-16 text-purple-300" />
                </div>
              )}
            </div>

            <div className="flex-1 w-full text-white">
              <div className="text-xs uppercase tracking-wide text-purple-300 font-semibold mb-1 text-center md:text-left">
                Location
              </div>
              <h1 className="text-2xl md:text-4xl font-bold mb-1 text-center md:text-left">
                {displayName}
              </h1>
              {subtitle && (
                <p className="text-sm text-purple-200/80 mb-3 text-center md:text-left">{subtitle}</p>
              )}

              <div className="flex flex-wrap items-center justify-center md:justify-start gap-2 mb-3">
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/20 border border-white/10 text-sm text-gray-100 shadow-sm backdrop-blur-sm">
                  <Music className="h-3.5 w-3.5 text-gray-400" />
                  <span className="font-semibold">
                    {loading ? '…' : `${total} ${total === 1 ? 'track' : 'tracks'}`}
                  </span>
                </span>
                {!loading && tipTotal > 0 && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/20 border border-white/10 text-sm text-gray-100 shadow-sm backdrop-blur-sm">
                    <Coins className="h-3.5 w-3.5 text-gray-400" />
                    <span className="font-semibold">{penceToPounds(tipTotal)}</span>
                    <span className="text-gray-400">total support</span>
                  </span>
                )}
              </div>

              {!loading && relatedPlaces.length > 0 && (
                <div className="flex flex-wrap justify-center md:justify-start gap-1.5 mb-3">
                  {relatedPlaces.map((related) => {
                    const path = getPlaceProfilePath(related.placeId);
                    if (!path) return null;
                    return (
                      <Link
                        key={related.placeId}
                        to={path}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-blue-500/15 border border-blue-500/30 text-blue-100 text-xs font-medium hover:bg-blue-500/25 hover:border-blue-400/50 transition-colors no-underline"
                      >
                        <MapPin className="h-3 w-3 text-blue-300" />
                        {related.name}
                      </Link>
                    );
                  })}
                </div>
              )}

              {!loading && relatedTags.length > 0 && (
                <div className="flex flex-wrap justify-center md:justify-start gap-1.5 mb-3">
                  {relatedTags.map((related) => (
                    <Link
                      key={related.slug}
                      to={getTagProfilePath(related.name)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-purple-500/15 border border-purple-500/30 text-purple-200 text-xs font-medium hover:bg-purple-500/25 hover:border-purple-400/50 transition-colors no-underline"
                    >
                      <Tag className="h-3 w-3 text-purple-400" />
                      {related.name}
                    </Link>
                  ))}
                </div>
              )}

              {!loading && !error && placeId && (
                <div className="w-full max-w-lg flex justify-center md:justify-start">
                  <MediaChampions
                    originPlaceId={placeId}
                    entityLabel={displayName}
                    variant="strip"
                    compact
                    maxDisplay={3}
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="mb-8 px-2 md:px-0">
          {(() => {
            const heading = (
              <h2 className="text-xl md:text-2xl font-bold text-white flex items-center">
                <Music className="h-5 w-5 md:h-6 md:w-6 mr-2 text-purple-400" />
                Top Tunes
              </h2>
            );

            if (!loading && !error && media.length > 0) {
              return (
                <TippedMediaQueueList
                  items={media}
                  header={heading}
                  onTipPlaced={() => loadProfile({ silent: true })}
                />
              );
            }

            return (
              <>
                <div className="mb-3 md:mb-4">{heading}</div>
                <div className="card bg-black/20 rounded-lg p-4 md:p-6">
                  {loading ? (
                    <div className="flex items-center justify-center py-16 text-gray-300">
                      <Loader2 className="h-6 w-6 animate-spin mr-2" />
                      Loading tracks…
                    </div>
                  ) : error ? (
                    <div className="text-center py-12 text-red-300">{error}</div>
                  ) : (
                    <div className="text-center py-12 text-gray-400">
                      <Music className="h-10 w-10 mx-auto mb-3 opacity-50" />
                      No tracks from <span className="text-white font-medium">{displayName}</span> yet.
                    </div>
                  )}
                </div>
              </>
            );
          })()}
        </div>
      </div>
    </div>
  );
};

export default LocationProfile;
