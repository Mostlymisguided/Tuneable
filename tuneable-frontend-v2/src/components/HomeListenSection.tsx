import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ListMusic, Loader2, Play, Plus, X } from 'lucide-react';
import TipHeartButton from './TipHeartButton';
import { partyAPI, userAPI, type HomeListenQueueItem } from '../lib/api';
import { useWebPlayerStore } from '../stores/webPlayerStore';
import { usePodcastPlayerStore } from '../stores/podcastPlayerStore';
import { toast } from '../utils/toast';
import { DEFAULT_COVER_ART } from '../constants';
import { penceToPounds } from '../utils/currency';
import { getMediaProfileUrl } from '../utils/mediaNavigation';
import { isMediaPlayable, normalizeSources, playerPlayabilityFields } from '../utils/mediaPlayability';
import { requireAuthToPlay } from '../utils/playAuth';

type FilterKey = 'unheard' | 'heard' | 'tipped';

type Props = {
  refreshKey?: number;
  tippedCount: number;
  tippedLoading?: boolean;
  onTip: (item: HomeListenQueueItem) => void;
  tippedActions?: React.ReactNode;
  tipped: React.ReactNode;
};

type RisingItem = {
  _id?: string;
  id?: string;
  uuid?: string;
  title?: string;
  artist?: unknown;
  creatorDisplay?: string;
  coverArt?: string;
  duration?: number;
  sources?: Record<string, string>;
  globalMediaAggregate?: number;
  isPlayable?: boolean;
  hasHostedAudio?: boolean;
  rightsStatus?: 'cleared' | 'pending' | 'permitted' | 'disputed';
  rightsCleared?: boolean;
  playabilityBlockReason?: 'rights' | 'audio' | 'disputed' | null;
};

function artistLabel(artist: unknown, creatorDisplay?: string): string {
  if (creatorDisplay && creatorDisplay.trim()) return creatorDisplay.trim();
  if (!artist) return 'Unknown Artist';
  if (typeof artist === 'string') return artist || 'Unknown Artist';
  if (Array.isArray(artist)) {
    const names = artist
      .map((entry) => (typeof entry === 'string' ? entry : entry?.name))
      .filter(Boolean);
    return names.length ? names.join(', ') : 'Unknown Artist';
  }
  if (typeof artist === 'object' && artist && 'name' in artist) {
    return String((artist as { name?: string }).name || 'Unknown Artist');
  }
  return 'Unknown Artist';
}

function mediaKey(item: { mediaId?: string; mediaUuid?: string; _id?: string; uuid?: string; id?: string }) {
  return item.mediaUuid || item.uuid || item.mediaId || item._id || item.id || '';
}

function toPlayerMedia(item: HomeListenQueueItem | RisingItem, sourceType: 'user_queue' | 'direct') {
  const queueItem = item as HomeListenQueueItem;
  const rising = item as RisingItem;
  const id = mediaKey(item);
  return {
    id,
    _id: queueItem.mediaId || rising._id || id,
    title: item.title || 'Untitled',
    artist: typeof item.artist === 'string' ? item.artist : artistLabel(item.artist, rising.creatorDisplay),
    duration: item.duration,
    coverArt: item.coverArt,
    sources: normalizeSources(item.sources),
    globalMediaAggregate: rising.globalMediaAggregate || 0,
    bids: [],
    addedBy: null,
    totalBidValue: rising.globalMediaAggregate || 0,
    sourceType,
    ...playerPlayabilityFields(item),
  };
}

const HomeListenSection: React.FC<Props> = ({
  refreshKey = 0,
  tippedCount,
  tippedLoading = false,
  onTip,
  tippedActions,
  tipped,
}) => {
  const { setCurrentMedia, setQueue, setGlobalPlayerActive, play } = useWebPlayerStore();
  const [filter, setFilter] = useState<FilterKey>('unheard');
  const [unheard, setUnheard] = useState<HomeListenQueueItem[]>([]);
  const [heard, setHeard] = useState<HomeListenQueueItem[]>([]);
  const [counts, setCounts] = useState({ unheard: 0, heard: 0, tipped: 0 });
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rising, setRising] = useState<RisingItem[]>([]);
  const [risingLoading, setRisingLoading] = useState(true);

  const loadQueue = useCallback(async () => {
    try {
      setLoading(true);
      const data = await userAPI.getHomeListenQueue();
      setUnheard(data.unheard || []);
      setHeard(data.heard || []);
      setCounts(data.counts || { unheard: 0, heard: 0, tipped: 0 });
    } catch (error) {
      console.error('Failed to load home queue:', error);
      toast.error('Failed to load your queue');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadQueue();
  }, [loadQueue, refreshKey]);

  useEffect(() => {
    let cancelled = false;
    const loadRising = async () => {
      try {
        setRisingLoading(true);
        const response = await partyAPI.getMediaSortedByTime('global', 'today');
        if (!cancelled) setRising((response.media || []).slice(0, 10));
      } catch (error) {
        console.error('Failed to load rising today:', error);
        if (!cancelled) setRising([]);
      } finally {
        if (!cancelled) setRisingLoading(false);
      }
    };
    void loadRising();
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const playItems = (items: Array<HomeListenQueueItem | RisingItem>, start: HomeListenQueueItem | RisingItem, sourceType: 'user_queue' | 'direct') => {
    if (!requireAuthToPlay()) return;
    const formatted = items
      .map((item) => toPlayerMedia(item, sourceType))
      .filter((media) => isMediaPlayable(media));
    if (formatted.length === 0) {
      toast.info('Nothing here is playable yet.');
      return;
    }
    const startId = mediaKey(start);
    const index = formatted.findIndex((media) => media.id === startId || media._id === startId || media._id === (start as HomeListenQueueItem).mediaId);
    if (index < 0) {
      toast.info('This tune is not playable yet.');
      return;
    }
    usePodcastPlayerStore.getState().clear();
    setQueue(formatted as any);
    setCurrentMedia(formatted[index] as any, index);
    play();
    setGlobalPlayerActive(true);
    toast.success(`Now playing: ${formatted[index].title}`);
  };

  const addRising = async (item: RisingItem) => {
    const id = item.uuid || item._id || item.id;
    if (!id) return;
    setBusyId(String(id));
    try {
      await userAPI.addToPlaybackQueue({
        mediaId: String(id),
        sourceType: 'direct',
        position: 'start',
      });
      toast.success(`Added "${item.title || 'tune'}" to Unheard`);
      setFilter('unheard');
      await loadQueue();
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Failed to add to your queue');
    } finally {
      setBusyId(null);
    }
  };

  const removeQueued = async (item: HomeListenQueueItem) => {
    setBusyId(item.mediaId);
    try {
      await userAPI.removeFromPlaybackQueue(item.mediaUuid || item.mediaId);
      toast.success(`Removed "${item.title}" from your queue`);
      await loadQueue();
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Failed to remove from your queue');
    } finally {
      setBusyId(null);
    }
  };

  const activeItems = filter === 'heard' ? heard : unheard;
  const activeCount = filter === 'tipped' ? tippedCount : filter === 'heard' ? counts.heard : counts.unheard;
  const filters: { key: FilterKey; label: string; count: number }[] = [
    { key: 'unheard', label: 'Unheard', count: counts.unheard },
    { key: 'heard', label: 'Heard', count: counts.heard },
    { key: 'tipped', label: 'Tipped', count: tippedCount },
  ];

  return (
    <div className="flex flex-col">
      <div className="card mb-8 order-2">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-semibold text-white">Rising today</h2>
          <Link to="/party/global" className="text-sm text-purple-300 hover:text-white">
            Full chart
          </Link>
        </div>
        {risingLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-6 w-6 text-purple-400 animate-spin" />
          </div>
        ) : rising.length === 0 ? (
          <p className="text-gray-400 text-sm py-4">Nothing rising yet. Be the first to tip the global chart today.</p>
        ) : (
          <div className="flex gap-3 overflow-x-auto pb-2">
            {rising.map((item, index) => {
              const id = String(item.uuid || item._id || item.id || index);
              const pathId = item.uuid || item._id || item.id;
              return (
                <div key={id} className="w-28 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => playItems(rising, item, 'direct')}
                    className="relative block w-full"
                    aria-label={`Play ${item.title || 'tune'}`}
                  >
                    <img
                      src={item.coverArt || DEFAULT_COVER_ART}
                      alt=""
                      className="w-28 h-28 rounded-lg object-cover"
                    />
                    <span className="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-black/70 text-xs text-white">
                      {index + 1}
                    </span>
                  </button>
                  {pathId ? (
                    <Link
                      to={getMediaProfileUrl({ _id: item._id || item.id, uuid: item.uuid })}
                      className="mt-2 block text-sm text-white truncate hover:text-purple-300"
                    >
                      {item.title || 'Untitled'}
                    </Link>
                  ) : (
                    <div className="mt-2 text-sm text-white truncate">{item.title || 'Untitled'}</div>
                  )}
                  <div className="text-xs text-gray-400 truncate">{artistLabel(item.artist, item.creatorDisplay)}</div>
                  <button
                    type="button"
                    onClick={() => void addRising(item)}
                    disabled={busyId === id}
                    className="mt-1 inline-flex items-center gap-1 text-xs text-purple-300 hover:text-white disabled:opacity-50"
                  >
                    <Plus className="h-3 w-3" />
                    Queue
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="card mb-8 order-1">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-4">
          <div className="flex items-center">
            <ListMusic className="h-6 w-6 text-purple-400 mr-2" />
            <h2 className="text-2xl font-semibold text-white">Your queue</h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-lg bg-black/40 p-1">
              {filters.map((entry) => (
                <button
                  key={entry.key}
                  type="button"
                  onClick={() => setFilter(entry.key)}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    filter === entry.key ? 'bg-purple-600 text-white' : 'text-gray-300 hover:text-white'
                  }`}
                >
                  {entry.label}
                  <span className="ml-1.5 text-xs opacity-80">{entry.count}</span>
                </button>
              ))}
            </div>
            {filter === 'tipped' ? tippedActions : null}
            {filter !== 'tipped' && activeItems.length > 0 && (
              <button
                type="button"
                onClick={() => playItems(activeItems, activeItems[0], 'user_queue')}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-sm font-medium"
              >
                <Play className="h-4 w-4" fill="currentColor" />
                Play
              </button>
            )}
          </div>
        </div>

        {filter === 'tipped' ? (
          tippedLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 text-purple-400 animate-spin" />
            </div>
          ) : (
            tipped
          )
        ) : loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 text-purple-400 animate-spin" />
          </div>
        ) : activeItems.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            <ListMusic className="h-12 w-12 mx-auto mb-4 text-gray-500" />
            {filter === 'unheard' ? (
              <>
                <p>Nothing waiting.</p>
                <p className="text-sm mt-2">Add a tune from Rising today or a tune page. A tip you have not heard stays here too.</p>
              </>
            ) : (
              <>
                <p>Nothing heard yet.</p>
                <p className="text-sm mt-2">A tune moves here after you listen for 30 seconds, or half the track.</p>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {activeCount > activeItems.length && (
              <p className="text-xs text-gray-500">Showing {activeItems.length} of {activeCount}.</p>
            )}
            {activeItems.map((item) => (
              <div key={item.mediaId} className="flex items-center gap-3 bg-black/20 rounded-lg px-3 py-3">
                <Link to={getMediaProfileUrl({ _id: item.mediaId, uuid: item.mediaUuid, slug: item.slug || undefined })} className="flex-shrink-0">
                  <img
                    src={item.coverArt || DEFAULT_COVER_ART}
                    alt=""
                    className="w-14 h-14 rounded-lg object-cover"
                  />
                </Link>
                <div className="min-w-0 flex-1">
                  <Link
                    to={getMediaProfileUrl({ _id: item.mediaId, uuid: item.mediaUuid, slug: item.slug || undefined })}
                    className="text-white font-medium truncate block hover:text-purple-300"
                  >
                    {item.title}
                  </Link>
                  <p className="text-sm text-gray-400 truncate">{item.artist}</p>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {item.tipped && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-purple-900/70 text-purple-100">
                        Tipped {penceToPounds(item.userBidTotal)}
                      </span>
                    )}
                    {item.queued && filter === 'heard' && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-gray-800 text-gray-200">In queue</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => playItems(activeItems, item, 'user_queue')}
                    className="px-3 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-sm font-medium"
                  >
                    Play
                  </button>
                  <TipHeartButton
                    tipped={item.tipped}
                    size="compact"
                    heartClassName="h-4 w-4"
                    title={item.tipped ? `You tipped ${item.title}. Send another tip` : `Tip ${item.title}`}
                    onClick={() => onTip(item)}
                  />
                  {item.queued && (
                    <button
                      type="button"
                      onClick={() => void removeQueued(item)}
                      disabled={busyId === item.mediaId}
                      className="w-10 h-10 rounded-full bg-gray-800 hover:bg-red-600/80 text-gray-300 hover:text-white flex items-center justify-center disabled:opacity-50"
                      aria-label={`Remove ${item.title} from your queue`}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default HomeListenSection;
