import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Tag, Loader2, Music, Users, Crown, Minus, Plus } from 'lucide-react';
import { tagAPI } from '../lib/api';
import MediaChampions from '../components/MediaChampions';
import { getMediaCoverArt } from '../utils/coverArt';
import { getCreatorDisplay } from '../utils/creatorDisplay';
import { getMediaProfileUrl } from '../utils/mediaNavigation';
import { penceToPounds } from '../utils/currency';

interface TagEntity {
  name: string;
  slug: string;
  canonicalTag?: string;
}

interface TagStats {
  mediaCount?: number;
  globalTagAggregate?: number;
}

interface RelatedParty {
  _id: string;
  name: string;
  slug?: string;
  description?: string;
  tags?: string[];
}

interface TagMediaItem {
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

const TagProfile: React.FC = () => {
  const { slug: slugParam } = useParams<{ slug: string }>();
  const navigate = useNavigate();

  const slug = slugParam ? decodeURIComponent(slugParam) : '';

  const [tag, setTag] = useState<TagEntity | null>(null);
  const [stats, setStats] = useState<TagStats | null>(null);
  const [relatedParty, setRelatedParty] = useState<RelatedParty | null>(null);
  const [media, setMedia] = useState<TagMediaItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showChampions, setShowChampions] = useState(false);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await tagAPI.getProfile(slug, { limit: 50 });
        if (cancelled) return;
        setTag(data.tag);
        setStats(data.stats || null);
        setRelatedParty(data.relatedParty || null);
        setMedia(data.media || []);
        setTotal(data.pagination?.total ?? (data.media?.length || 0));
      } catch (err: unknown) {
        console.error('Error loading tag profile:', err);
        if (!cancelled) setError('Tag not found or failed to load.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const displayName = tag?.name || slug.replace(/-/g, ' ');
  const tipTotal = stats?.globalTagAggregate ?? 0;

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
            <Tag className="h-7 w-7 text-purple-300" />
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-purple-300 font-semibold mb-0.5">
              Tag
            </div>
            <h1 className="text-2xl md:text-3xl font-bold text-white">{displayName}</h1>
            <p className="text-sm text-gray-400 mt-1">
              {loading
                ? 'Loading…'
                : `${total} ${total === 1 ? 'track' : 'tracks'} tagged`}
              {!loading && tipTotal > 0 ? ` · ${penceToPounds(tipTotal)} total support` : ''}
            </p>
          </div>
        </div>

        {relatedParty && (
          <div className="px-2 md:px-0 mb-6">
            <Link
              to={relatedParty.slug ? `/party/${relatedParty.slug}` : `/party/${relatedParty._id}`}
              className="flex items-center gap-3 p-4 rounded-lg bg-black/20 border border-purple-500/30 hover:border-purple-500/60 transition-colors no-underline"
            >
              <div className="w-10 h-10 rounded-full bg-purple-600/40 flex items-center justify-center flex-shrink-0">
                <Users className="h-5 w-5 text-purple-200" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-white font-semibold truncate">{relatedParty.name}</div>
                <div className="text-sm text-gray-400 truncate">
                  {relatedParty.description || 'Open the live tip chart for this tag'}
                </div>
              </div>
              <span className="text-sm text-purple-300 font-medium flex-shrink-0">Open party →</span>
            </Link>
          </div>
        )}

        {!loading && !error && (
          <div className="mb-6 px-2 md:px-0 flex flex-col items-center">
            <button
              type="button"
              onClick={() => setShowChampions(!showChampions)}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-black/20 hover:bg-black/30 transition-colors"
            >
              <span className="flex items-center text-lg md:text-xl font-bold text-white">
                <Crown className="h-5 w-5 md:h-6 md:w-6 mr-2 text-amber-400 flex-shrink-0" />
                {showChampions ? 'Champions' : 'Show Champions'}
              </span>
              {showChampions ? <Minus className="h-5 w-5 text-gray-400" /> : <Plus className="h-5 w-5 text-gray-400" />}
            </button>
            {showChampions && slug && (
              <div className="mt-3 w-full card bg-black/20 rounded-lg p-4 md:p-6">
                <MediaChampions
                  tagSlug={slug}
                  entityLabel={`#${displayName}`}
                  maxDisplay={10}
                />
              </div>
            )}
          </div>
        )}

        <div className="card bg-black/20 rounded-lg p-4 md:p-6 mb-8">
          <h2 className="text-lg font-bold text-white mb-4">Most tipped</h2>
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
              No tracks tagged <span className="text-white font-medium">{displayName}</span> yet.
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

export default TagProfile;
