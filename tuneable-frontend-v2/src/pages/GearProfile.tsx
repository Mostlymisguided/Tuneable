import React, { useEffect, useState } from 'react';
import { useParams, useSearchParams, useNavigate, Link } from 'react-router-dom';
import { SlidersHorizontal, Loader2, Disc3, Cpu, Piano, Music, Trophy } from 'lucide-react';
import { gearAPI } from '../lib/api';
import { getMediaCoverArt } from '../utils/coverArt';
import { getCreatorDisplay } from '../utils/creatorDisplay';
import { getMediaProfileUrl } from '../utils/mediaNavigation';
import { penceToPounds } from '../utils/currency';
import {
  PLUGIN_CATEGORY_LABELS,
  HARDWARE_CATEGORY_LABELS,
  type GearType,
  type PluginCategory,
  type HardwareCategory,
} from '../data/gear';

interface GearEntity {
  _id: string;
  name: string;
  slug: string;
  type: GearType;
  manufacturer?: string | null;
  category?: string | null;
  isCatalog?: boolean;
  stats?: {
    mediaCount?: number;
    globalGearAggregate?: number;
  };
}

interface GearMediaItem {
  _id: string;
  title: string;
  contentForm?: string[] | string;
  coverArt?: string;
  sources?: Record<string, string>;
  creatorDisplay?: string;
  artist?: unknown;
  featuring?: unknown;
  globalMediaAggregate?: number;
}

interface RankingGear {
  _id: string;
  name: string;
  slug: string;
  type: GearType;
  manufacturer?: string;
  stats?: { mediaCount?: number; globalGearAggregate?: number };
}

const GEAR_TYPE_META: Record<GearType, { label: string; Icon: React.ComponentType<{ className?: string }> }> = {
  daw: { label: 'DAW', Icon: Disc3 },
  plugin: { label: 'Plugin', Icon: Cpu },
  hardware: { label: 'Hardware', Icon: Piano },
};

const GearProfile: React.FC = () => {
  const { gearName: slugParam } = useParams<{ gearName: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const slug = slugParam ? decodeURIComponent(slugParam) : '';
  const legacyType = (searchParams.get('type') as GearType | null) || undefined;

  const [gear, setGear] = useState<GearEntity | null>(null);
  const [media, setMedia] = useState<GearMediaItem[]>([]);
  const [total, setTotal] = useState(0);
  const [rankings, setRankings] = useState<RankingGear[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await gearAPI.getProfile(slug, {
          type: legacyType,
          limit: 50,
          refresh: true,
        });
        if (cancelled) return;
        setGear(data.gear);
        setMedia(data.media || []);
        setTotal(data.pagination?.total ?? (data.media?.length || 0));

        const gearType = data.gear?.type as GearType | undefined;
        if (gearType) {
          const rankingsData = await gearAPI.getRankings({ type: gearType, limit: 8 });
          if (!cancelled) {
            setRankings(
              (rankingsData.gear || []).filter((g: RankingGear) => g.slug !== data.gear?.slug)
            );
          }
        }
      } catch (err: unknown) {
        console.error('Error loading gear profile:', err);
        if (!cancelled) setError('Gear not found or failed to load.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [slug, legacyType]);

  const typeMeta = gear?.type ? GEAR_TYPE_META[gear.type] : legacyType ? GEAR_TYPE_META[legacyType] : null;
  const HeaderIcon = typeMeta?.Icon || SlidersHorizontal;
  const displayName = gear?.name || slug;

  const categoryLabel =
    gear?.category && gear.type === 'plugin'
      ? PLUGIN_CATEGORY_LABELS[gear.category as PluginCategory] || gear.category
      : gear?.category && gear.type === 'hardware'
        ? HARDWARE_CATEGORY_LABELS[gear.category as HardwareCategory] || gear.category
        : null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900">
      <div className="container mx-auto px-2 md:px-4 py-4 md:py-8 max-w-4xl">
        <button
          onClick={() => navigate(-1)}
          className="px-3 md:px-4 py-2 rounded-lg font-medium transition-colors bg-black/20 border border-gray-500 text-white hover:bg-gray-700/30 text-sm md:text-base mb-6"
        >
          Back
        </button>

        <div className="flex items-center gap-4 mb-6 px-2 md:px-0">
          <div className="w-14 h-14 rounded-2xl bg-purple-600/30 border border-purple-500/40 flex items-center justify-center flex-shrink-0">
            <HeaderIcon className="h-7 w-7 text-purple-300" />
          </div>
          <div>
            {typeMeta && (
              <div className="text-xs uppercase tracking-wide text-purple-300 font-semibold mb-0.5">
                {typeMeta.label}
                {gear?.isCatalog && (
                  <span className="ml-2 px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-200 normal-case">
                    Catalog
                  </span>
                )}
              </div>
            )}
            <h1 className="text-2xl md:text-3xl font-bold text-white">{displayName}</h1>
            <p className="text-sm text-gray-300 mt-1">
              {gear?.manufacturer && <span>{gear.manufacturer}</span>}
              {gear?.manufacturer && categoryLabel && <span> · </span>}
              {categoryLabel && <span>{categoryLabel}</span>}
            </p>
            <p className="text-sm text-gray-400 mt-1">
              {loading
                ? 'Loading…'
                : `${total} ${total === 1 ? 'track' : 'tracks'} made with this gear`}
              {!loading && gear?.stats?.globalGearAggregate
                ? ` · ${penceToPounds(gear.stats.globalGearAggregate)} total support`
                : ''}
            </p>
          </div>
        </div>

        <div className="card bg-black/20 rounded-lg p-4 md:p-6 mb-8">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-gray-300">
              <Loader2 className="h-6 w-6 animate-spin mr-2" />
              Loading tracks…
            </div>
          ) : error ? (
            <div className="text-center py-12 text-red-300">{error}</div>
          ) : media.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <Music className="h-10 w-10 mx-auto mb-3 opacity-50" />
              No tracks credit <span className="text-white font-medium">{displayName}</span> yet.
            </div>
          ) : (
            <div className="space-y-2">
              {media.map((item) => (
                <Link
                  key={item._id}
                  to={getMediaProfileUrl(item)}
                  className="flex items-center gap-3 p-2 md:p-3 rounded-lg hover:bg-purple-900/30 transition-colors no-underline"
                >
                  <img
                    src={getMediaCoverArt(item)}
                    alt={item.title}
                    className="w-12 h-12 rounded-md object-cover flex-shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-white font-medium truncate">{item.title}</div>
                    <div className="text-sm text-gray-400 truncate">{getCreatorDisplay(item)}</div>
                  </div>
                  {typeof item.globalMediaAggregate === 'number' && item.globalMediaAggregate > 0 && (
                    <div className="text-sm font-semibold text-purple-300 flex-shrink-0">
                      {penceToPounds(item.globalMediaAggregate)}
                    </div>
                  )}
                </Link>
              ))}
            </div>
          )}
        </div>

        {rankings.length > 0 && gear?.type && (
          <div className="px-2 md:px-0">
            <h2 className="text-lg font-bold text-white mb-3 flex items-center">
              <Trophy className="h-5 w-5 mr-2 text-purple-400" />
              Popular {typeMeta?.label}s
            </h2>
            <div className="flex flex-wrap gap-2">
              {rankings.map((item) => (
                <Link
                  key={item._id}
                  to={`/gear/${item.slug}`}
                  className="inline-flex items-center gap-2 rounded-full bg-gray-800/80 border border-gray-700 px-3 py-1.5 text-sm text-gray-200 hover:border-purple-500/60 hover:text-purple-200 transition-colors no-underline"
                >
                  <span className="font-medium">{item.name}</span>
                  {item.stats?.mediaCount ? (
                    <span className="text-xs text-gray-400">{item.stats.mediaCount} tracks</span>
                  ) : null}
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default GearProfile;
