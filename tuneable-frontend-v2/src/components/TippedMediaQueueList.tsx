import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { Play } from 'lucide-react';
import { DEFAULT_COVER_ART } from '../constants';
import { mediaAPI, partyAPI } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { useWebPlayerStore } from '../stores/webPlayerStore';
import { usePodcastPlayerStore } from '../stores/podcastPlayerStore';
import { enrichMediaWithPlayability, isMediaPlayable } from '../utils/mediaPlayability';
import { getMediaProfileUrl } from '../utils/mediaNavigation';
import { getCreatorDisplay } from '../utils/creatorDisplay';
import { penceToPoundsNumber } from '../utils/currency';
import { buildLoginUrl, getCurrentReturnPath } from '../utils/authHelpers';
import QueueMediaCard, { normalizeQueueMediaData } from './QueueMediaCard';
import BidConfirmationModal from './BidConfirmationModal';

/** Media shape accepted by the tipped-media queue (tag profiles, related tunes, etc.) */
export interface TippedQueueItem {
  _id: string;
  uuid?: string;
  title: string;
  artist?: unknown;
  featuring?: unknown;
  creatorDisplay?: string | null;
  coverArt?: string | null;
  duration?: number;
  bpm?: number | null;
  releaseDate?: string | Date | null;
  releaseYear?: number | null;
  tags?: string[];
  bids?: Array<{
    amount?: number;
    userId?: {
      _id?: string;
      uuid?: string;
      username: string;
      profilePic?: string;
    };
  }>;
  globalMediaAggregate?: number;
  sources?: Record<string, string>;
  contentType?: string[] | string;
  contentForm?: string[] | string;
}

interface TippedMediaQueueListProps {
  items: TippedQueueItem[];
  /** Rendered left of the Play-all button, above the list (e.g. section heading). */
  header?: React.ReactNode;
  /** Tags pre-selected in the tip modal (e.g. the tag page the list belongs to). */
  defaultTipTags?: string[];
  /** Called after a tip is successfully placed, so the parent can refresh data. */
  onTipPlaced?: () => void | Promise<void>;
}

/**
 * Chart-style list of QueueMediaCards with built-in play-queue and tip flows.
 * Mirrors the Related Tunes rail on TuneProfile / PodcastEpisodeProfile.
 */
const TippedMediaQueueList: React.FC<TippedMediaQueueListProps> = ({
  items,
  header,
  defaultTipTags,
  onTipPlaced,
}) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { setCurrentMedia, setQueue, setGlobalPlayerActive, setCurrentPartyId, play } =
    useWebPlayerStore();

  const [minimumBid, setMinimumBid] = useState<number>(0.01);
  const [itemToTip, setItemToTip] = useState<TippedQueueItem | null>(null);
  const [isPlacingTip, setIsPlacingTip] = useState(false);

  useEffect(() => {
    let cancelled = false;
    partyAPI
      .getParties()
      .then((response) => {
        const globalParty = response.parties.find((p: any) => p.type === 'global');
        if (!cancelled && globalParty?.minimumBid) {
          setMinimumBid(globalParty.minimumBid);
        }
      })
      .catch(() => {
        // Keep the 0.01 default if the fetch fails
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const isItemPlayable = (item: TippedQueueItem) => {
    const enriched = enrichMediaWithPlayability({
      sources: item.sources || {},
      contentForm: item.contentForm,
      contentType: item.contentType,
    } as any);
    return isMediaPlayable(enriched);
  };

  const toQueueShape = (item: TippedQueueItem) => ({
    _id: item._id,
    id: item.uuid || item._id,
    uuid: item.uuid || item._id,
    title: item.title,
    artist: item.artist,
    featuring: item.featuring,
    creatorDisplay: item.creatorDisplay,
    coverArt: item.coverArt || DEFAULT_COVER_ART,
    duration: item.duration || 0,
    bpm: item.bpm ?? null,
    releaseDate: item.releaseDate ?? null,
    releaseYear: item.releaseYear ?? null,
    tags: item.tags || [],
    bids: item.bids || [],
    globalMediaAggregate: item.globalMediaAggregate || 0,
    sources: item.sources || {},
  });

  const formatForPlayer = (item: TippedQueueItem) => ({
    id: item._id || item.uuid,
    _id: item._id,
    title: item.title,
    artist: getCreatorDisplay(item),
    duration: item.duration || 0,
    coverArt: item.coverArt || DEFAULT_COVER_ART,
    sources: item.sources || {},
    globalMediaAggregate: item.globalMediaAggregate || 0,
    bids: [],
    addedBy: null,
    totalBidValue: item.globalMediaAggregate || 0,
  });

  const startQueue = (startItem?: TippedQueueItem) => {
    const playableItems = items.filter(isItemPlayable);

    if (playableItems.length === 0) {
      if (startItem) {
        toast.info('This track is not playable yet — opening its profile instead.');
        navigate(getMediaProfileUrl(startItem));
      } else {
        toast.info('No playable tracks yet.');
      }
      return;
    }

    let startIndex = 0;
    if (startItem) {
      const matchIndex = playableItems.findIndex(
        (item) => item._id === startItem._id || item.uuid === startItem.uuid
      );
      if (matchIndex < 0) {
        toast.info('This track is not playable yet — opening its profile instead.');
        navigate(getMediaProfileUrl(startItem));
        return;
      }
      startIndex = matchIndex;
    }

    usePodcastPlayerStore.getState().clear();

    const queue = playableItems.map(formatForPlayer);
    setQueue(queue as any);
    setCurrentMedia(queue[startIndex] as any, startIndex);
    play();
    setGlobalPlayerActive(true);
    setCurrentPartyId(null);
    toast.success(`Now playing: ${queue[startIndex].title}`);
  };

  const handleOpenTip = (item: TippedQueueItem) => {
    if (!user) {
      toast.info('Please log in to support this tune');
      navigate(buildLoginUrl(getCurrentReturnPath()));
      return;
    }
    setItemToTip(item);
  };

  const handleConfirmTip = async (tags: string[], amount: number) => {
    if (!user || !itemToTip) return;

    const tipAmount =
      Number.isFinite(amount) && amount > 0 ? amount : user?.preferences?.defaultTip || 1.11;
    if (tipAmount < minimumBid) {
      toast.error(`Minimum tip is £${minimumBid.toFixed(2)}`);
      return;
    }

    const balanceInPounds = penceToPoundsNumber((user as any)?.balance);
    if (balanceInPounds < tipAmount) {
      toast.error('Insufficient balance. Please top up your wallet.');
      navigate('/wallet');
      return;
    }

    const tipMediaId = itemToTip._id || itemToTip.uuid;
    if (!tipMediaId) return;

    setIsPlacingTip(true);
    try {
      await mediaAPI.placeGlobalBid(tipMediaId, tipAmount, undefined, tags);
      toast.success(`Placed £${tipAmount.toFixed(2)} tip on "${itemToTip.title}"!`);
      setItemToTip(null);
      await onTipPlaced?.();
    } catch (err: any) {
      console.error('Error placing tip:', err);
      toast.error(err.response?.data?.error || 'Failed to place tip');
    } finally {
      setIsPlacingTip(false);
    }
  };

  const hasPlayable = items.some(isItemPlayable);

  return (
    <>
      {header && (
        <div className="flex items-center justify-between mb-3 md:mb-4">
          {header}
          {hasPlayable && (
            <button
              type="button"
              onClick={() => startQueue()}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-sm font-medium transition-colors flex-shrink-0"
              aria-label="Play all"
            >
              <Play className="h-4 w-4" fill="currentColor" />
              Play
            </button>
          )}
        </div>
      )}

      <div className="space-y-3">
        {items.map((item, index) => {
          const queueShape = toQueueShape(item);
          const mediaData = normalizeQueueMediaData(queueShape);

          return (
            <QueueMediaCard
              key={item._id}
              item={queueShape}
              index={index}
              mediaData={mediaData}
              showActions={false}
              isBidding={isPlacingTip}
              onActionClick={() => {}}
              onPlay={() => startQueue(item)}
              onTip={() => handleOpenTip(item)}
              mediaHref={getMediaProfileUrl(item)}
            />
          );
        })}
      </div>

      <BidConfirmationModal
        isOpen={!!itemToTip}
        onClose={() => setItemToTip(null)}
        onConfirm={handleConfirmTip}
        bidAmount={user?.preferences?.defaultTip || 1.11}
        minTip={minimumBid}
        mediaTitle={itemToTip?.title || 'Unknown'}
        mediaArtist={itemToTip ? getCreatorDisplay(itemToTip) : undefined}
        userBalance={penceToPoundsNumber((user as any)?.balance)}
        isLoading={isPlacingTip}
        isNonPlayable={itemToTip ? !isItemPlayable(itemToTip) : false}
        initialTags={defaultTipTags}
        user={user}
      />
    </>
  );
};

export default TippedMediaQueueList;
