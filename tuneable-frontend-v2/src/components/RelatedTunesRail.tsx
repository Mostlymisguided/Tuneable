import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Loader2, Play, Plus } from 'lucide-react';
import { toast } from '../utils/toast';
import { DEFAULT_COVER_ART } from '../constants';
import { userAPI } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { getCreatorDisplay } from '../utils/creatorDisplay';
import { getMediaProfileUrl } from '../utils/mediaNavigation';
import { buildLoginUrl, getCurrentReturnPath } from '../utils/authHelpers';

/** A related tune only needs enough fields to render art, a label, and a profile link. */
export interface RelatedTuneCard {
  _id: string;
  uuid?: string;
  title: string;
  artist?: unknown;
  creatorDisplay?: string | null;
  coverArt?: string | null;
  contentForm?: string[] | string;
  contentType?: string[] | string;
}

interface RelatedTunesRailProps<T extends RelatedTuneCard> {
  items: T[];
  isPlayable: (item: T) => boolean;
  onPlay: (item: T) => void;
}

const FOCUSED_RATIO = 0.9;

function itemKey(item: RelatedTuneCard) {
  return item.uuid || item._id;
}

/**
 * Horizontal artwork rail. One cover is in focus on a phone, two from the
 * tablet breakpoint, three on a wide screen. Play and add-to-queue fade in
 * only on covers that are almost fully inside the rail.
 */
function RelatedTunesRail<T extends RelatedTuneCard>({
  items,
  isPlayable,
  onPlay,
}: RelatedTunesRailProps<T>) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [focusedIds, setFocusedIds] = useState<Set<string>>(() => new Set());
  const [busyId, setBusyId] = useState<string | null>(null);

  const updateFocused = useCallback(() => {
    const root = scrollerRef.current;
    if (!root) return;
    const railBox = root.getBoundingClientRect();
    const next = new Set<string>();
    root.querySelectorAll<HTMLElement>('[data-related-id]').forEach((card) => {
      const box = card.getBoundingClientRect();
      if (box.width <= 0) return;
      const visible = Math.max(0, Math.min(box.right, railBox.right) - Math.max(box.left, railBox.left));
      const id = card.dataset.relatedId;
      if (id && visible / box.width >= FOCUSED_RATIO) next.add(id);
    });
    setFocusedIds((prev) => {
      if (prev.size === next.size && [...next].every((id) => prev.has(id))) return prev;
      return next;
    });
  }, []);

  useEffect(() => {
    const root = scrollerRef.current;
    if (!root) return;
    updateFocused();
    const onScroll = () => updateFocused();
    const onResize = () => requestAnimationFrame(updateFocused);
    root.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize);
    const resizeObserver = new ResizeObserver(onResize);
    resizeObserver.observe(root);
    return () => {
      root.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
      resizeObserver.disconnect();
    };
  }, [items, updateFocused]);

  const addToQueue = async (item: T) => {
    if (!user) {
      toast.info('Please sign in to queue a tune');
      navigate(buildLoginUrl(getCurrentReturnPath()));
      return;
    }
    const mediaKey = item.uuid || item._id;
    if (!mediaKey) return;
    setBusyId(mediaKey);
    try {
      await userAPI.addToPlaybackQueue({
        mediaId: mediaKey,
        sourceType: 'related',
        position: 'start',
      });
      toast.success(`Added "${item.title}" to your queue`);
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Failed to add to your queue');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div
      ref={scrollerRef}
      className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory"
    >
      {items.map((item) => {
        const key = itemKey(item);
        const focused = focusedIds.has(key);
        const playable = isPlayable(item);
        const busy = busyId === key;
        const artist = getCreatorDisplay(item);
        const href = getMediaProfileUrl(item);
        const controlClass = `transition-opacity duration-200 motion-reduce:transition-none ${
          focused ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`;

        return (
          <article
            key={key}
            data-related-id={key}
            className="w-[78%] shrink-0 snap-center first:ml-[11%] last:mr-[11%] md:w-[calc((100%-0.75rem)/2)] md:snap-start md:first:ml-0 md:last:mr-0 lg:w-[calc((100%-1.5rem)/3)]"
          >
            <div className="relative aspect-square">
              <Link to={href} className="block h-full w-full">
                <img
                  src={item.coverArt || DEFAULT_COVER_ART}
                  alt=""
                  className="h-full w-full rounded-lg object-cover shadow-md bg-black/30"
                />
              </Link>
              {playable ? (
                <div
                  className={`pointer-events-none absolute inset-0 rounded-lg bg-black/40 ${controlClass}`}
                  aria-hidden={!focused}
                />
              ) : null}
              <button
                type="button"
                onClick={() => void addToQueue(item)}
                disabled={busy}
                tabIndex={focused ? 0 : -1}
                aria-hidden={!focused}
                aria-label={`Add ${item.title} to queue`}
                className={`absolute top-2 right-2 z-10 flex h-8 w-8 items-center justify-center rounded-full border border-white/25 bg-black/70 text-white shadow-lg hover:bg-purple-600 disabled:opacity-70 ${controlClass}`}
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              </button>
              {playable ? (
                <button
                  type="button"
                  onClick={() => onPlay(item)}
                  tabIndex={focused ? 0 : -1}
                  aria-hidden={!focused}
                  aria-label={`Play ${item.title}`}
                  className={`absolute left-1/2 top-1/2 z-10 flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-purple-600 text-white shadow-2xl hover:bg-purple-500 md:h-16 md:w-16 ${controlClass}`}
                >
                  <Play className="h-7 w-7 ml-0.5 md:h-8 md:w-8" fill="currentColor" />
                </button>
              ) : null}
            </div>
            <Link to={href} className="mt-2 block min-w-0">
              <div className="truncate text-sm font-semibold text-white hover:text-purple-300">
                {item.title || 'Untitled'}
              </div>
              <div className="truncate text-xs text-gray-400">{artist}</div>
            </Link>
          </article>
        );
      })}
    </div>
  );
}

export default RelatedTunesRail;
