import React, { useEffect, useState } from 'react';
import { useParams, useSearchParams, useNavigate, Link } from 'react-router-dom';
import { SlidersHorizontal, Loader2, Disc3, Cpu, Piano, Music } from 'lucide-react';
import { mediaAPI } from '../lib/api';
import { getMediaCoverArt } from '../utils/coverArt';
import { getCreatorDisplay } from '../utils/creatorDisplay';
import { getMediaProfileUrl } from '../utils/mediaNavigation';
import { penceToPounds } from '../utils/currency';

type GearType = 'daw' | 'plugin' | 'hardware';

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

const GEAR_TYPE_META: Record<GearType, { label: string; Icon: React.ComponentType<{ className?: string }> }> = {
  daw: { label: 'DAW', Icon: Disc3 },
  plugin: { label: 'Plugin', Icon: Cpu },
  hardware: { label: 'Hardware', Icon: Piano },
};

const GearProfile: React.FC = () => {
  const { gearName } = useParams<{ gearName: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const decodedName = gearName ? decodeURIComponent(gearName) : '';
  const gearType = (searchParams.get('type') as GearType | null) || undefined;

  const [media, setMedia] = useState<GearMediaItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!decodedName) return;
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await mediaAPI.getMediaByGear({
          gear: decodedName,
          gearType: gearType,
          limit: 50,
          sortBy: 'globalMediaAggregate',
          sortOrder: 'desc',
        });
        if (!cancelled) {
          setMedia(data.media || []);
          setTotal(data.pagination?.total ?? (data.media?.length || 0));
        }
      } catch (err) {
        console.error('Error loading gear media:', err);
        if (!cancelled) setError('Failed to load tracks for this gear.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [decodedName, gearType]);

  const typeMeta = gearType ? GEAR_TYPE_META[gearType] : null;
  const HeaderIcon = typeMeta?.Icon || SlidersHorizontal;

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900">
      <div className="container mx-auto px-2 md:px-4 py-4 md:py-8 max-w-4xl">
        <button
          onClick={() => navigate(-1)}
          className="px-3 md:px-4 py-2 rounded-lg font-medium transition-colors bg-black/20 border border-gray-500 text-white hover:bg-gray-700/30 text-sm md:text-base mb-6"
        >
          Back
        </button>

        {/* Header */}
        <div className="flex items-center gap-4 mb-6 px-2 md:px-0">
          <div className="w-14 h-14 rounded-2xl bg-purple-600/30 border border-purple-500/40 flex items-center justify-center flex-shrink-0">
            <HeaderIcon className="h-7 w-7 text-purple-300" />
          </div>
          <div>
            {typeMeta && (
              <div className="text-xs uppercase tracking-wide text-purple-300 font-semibold mb-0.5">
                {typeMeta.label}
              </div>
            )}
            <h1 className="text-2xl md:text-3xl font-bold text-white">{decodedName}</h1>
            <p className="text-sm text-gray-300 mt-1">
              {loading ? 'Loading…' : `${total} ${total === 1 ? 'track' : 'tracks'} made with this gear`}
            </p>
          </div>
        </div>

        {/* Results */}
        <div className="card bg-black/20 rounded-lg p-4 md:p-6">
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
              No tracks credit <span className="text-white font-medium">{decodedName}</span> yet.
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
      </div>
    </div>
  );
};

export default GearProfile;
