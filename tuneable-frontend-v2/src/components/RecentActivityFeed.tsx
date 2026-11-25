import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Heart, Loader2, Play, Sparkles, Trophy } from 'lucide-react';
import { mediaAPI, userAPI } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import BidConfirmationModal from './BidConfirmationModal';
import { DEFAULT_COVER_ART } from '../constants';
import { getMediaProfileUrl } from '../utils/mediaNavigation';
import { getCreatorDisplay } from '../utils/creatorDisplay';
import { penceToPounds, penceToPoundsNumber, poundsToPence } from '../utils/currency';
import { formatTuneBytes } from '../utils/formatTuneBytes';
import { ensureSpendableBalance } from '../utils/spendableBalance';
import { toast } from '../utils/toast';

const PAGE_SIZE = 30;

type ActivityKind = 'earned' | 'tip' | 'play' | 'took' | 'lost';

type ActivityMediaRef = {
  _id?: string;
  uuid?: string | null;
  slug?: string | null;
  title?: string;
  artist?: unknown;
  coverArt?: string | null;
  contentForm?: string[];
};

type ActivityPageInfo = {
  page?: number;
  limit?: number;
  total?: number;
  totalPages?: number;
  offset?: number;
  hasMore?: boolean;
};

type ActivityRow = {
  id: string;
  kind: ActivityKind;
  occurredAt: number;
  title: string;
  artist: string;
  detail: string;
  coverArt: string | null;
  href: string | null;
  mediaId?: string | null;
  regainPence?: number | null;
  rank?: number | null;
};

type SourceCursor = {
  tipsPage: number;
  playsPage: number;
  earnedOffset: number;
  championOffset: number;
  tipsMore: boolean;
  playsMore: boolean;
  earnedMore: boolean;
  championMore: boolean;
};

type SourceName = 'tips' | 'plays' | 'earned' | 'champion';

const SOURCE_NAMES: SourceName[] = ['tips', 'plays', 'earned', 'champion'];

type Props = {
  refreshKey?: number;
};

function mediaRecord(media: ActivityMediaRef | string | null | undefined): ActivityMediaRef | null {
  if (!media || typeof media === 'string') return null;
  return media;
}

function mediaKey(
  media: ActivityMediaRef | string | null | undefined,
  fallback?: string | null
): string | null {
  const record = mediaRecord(media);
  if (record?.uuid) return record.uuid;
  if (record?._id) return String(record._id);
  if (typeof media === 'string' && media) return media;
  return fallback || null;
}

function activityHref(media: ActivityMediaRef | null, fallbackId?: string | null): string | null {
  const id = media?.slug || media?.uuid || media?._id || fallbackId;
  if (!id) return null;
  return getMediaProfileUrl({
    slug: media?.slug || undefined,
    uuid: media?.uuid || fallbackId || undefined,
    _id: media?._id,
    contentForm: media?.contentForm,
  });
}

function artistLabel(value: unknown, fallback?: string | null): string {
  const named = getCreatorDisplay({ artist: value });
  if (named !== 'Unknown Artist') return named;
  const text = fallback?.trim();
  return text || 'Unknown Artist';
}

function formatWhen(occurredAt: number): string {
  const delta = Date.now() - occurredAt;
  const minutes = Math.round(delta / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(occurredAt).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

function kindMeta(kind: ActivityKind): {
  icon: React.ComponentType<{ className?: string }>;
  className: string;
  label: string;
} {
  if (kind === 'earned') {
    return { icon: Sparkles, className: 'text-purple-400', label: 'TuneBytes' };
  }
  if (kind === 'tip') {
    return { icon: Heart, className: 'text-rose-400', label: 'Tip' };
  }
  if (kind === 'took') {
    return { icon: Trophy, className: 'text-amber-400', label: 'Champion' };
  }
  if (kind === 'lost') {
    return { icon: Trophy, className: 'text-rose-400', label: 'Champion' };
  }
  return { icon: Play, className: 'text-gray-200', label: 'Played' };
}

function freshCursor(): SourceCursor {
  return {
    tipsPage: 1,
    playsPage: 1,
    earnedOffset: 0,
    championOffset: 0,
    tipsMore: true,
    playsMore: true,
    earnedMore: true,
    championMore: true,
  };
}

function sourceHasMore(cursor: SourceCursor) {
  return cursor.tipsMore || cursor.playsMore || cursor.earnedMore || cursor.championMore;
}

function pageHasMore(pagination: ActivityPageInfo | undefined, count: number, limit: number) {
  if (typeof pagination?.hasMore === 'boolean') return pagination.hasMore;
  if (typeof pagination?.page === 'number' && typeof pagination?.totalPages === 'number') {
    return pagination.page < pagination.totalPages;
  }
  return count >= limit;
}

function mergeRows(current: ActivityRow[], extra: ActivityRow[]) {
  if (!extra.length) return current;
  const seen = new Set(current.map((row) => row.id));
  const next = current.slice();
  for (const row of extra) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    next.push(row);
  }
  next.sort((a, b) => b.occurredAt - a.occurredAt || (a.id < b.id ? 1 : -1));
  return next;
}

function mapTips(res: { tips?: Array<Record<string, any>> }): ActivityRow[] {
  const rows: ActivityRow[] = [];
  for (const tip of res.tips || []) {
    if ((tip.status || 'active') !== 'active') continue;
    const occurredAt = tip.createdAt ? new Date(tip.createdAt).getTime() : 0;
    if (!occurredAt) continue;
    const media = mediaRecord(tip.media);
    const id = mediaKey(media);
    rows.push({
      id: `tip-${tip._id}`,
      kind: 'tip',
      occurredAt,
      title: media?.title || tip.mediaTitle || 'Untitled',
      artist: artistLabel(media?.artist, tip.mediaArtist),
      detail: `Tipped ${penceToPounds(tip.amount)}`,
      coverArt: media?.coverArt || tip.mediaCoverArt || null,
      href: activityHref(media, id),
    });
  }
  return rows;
}

function mapPlays(res: { history?: Array<Record<string, any>> }): ActivityRow[] {
  const rows: ActivityRow[] = [];
  for (const play of res.history || []) {
    if (!play.countedAsPlay) continue;
    const stamp = play.qualifiedAt || play.lastPlayedAt;
    const occurredAt = stamp ? new Date(stamp).getTime() : 0;
    if (!occurredAt) continue;
    const media = mediaRecord(play.media);
    const id = mediaKey(media);
    rows.push({
      id: `play-${play._id}`,
      kind: 'play',
      occurredAt,
      title: media?.title || 'Untitled',
      artist: artistLabel(media?.artist),
      detail: 'Played',
      coverArt: media?.coverArt || null,
      href: activityHref(media, id),
    });
  }
  return rows;
}

function mapEarnings(res: { transactions?: Array<Record<string, any>> }): ActivityRow[] {
  const rows: ActivityRow[] = [];
  for (const entry of res.transactions || []) {
    const earned = Number(entry.tuneBytesEarned);
    if (!Number.isFinite(earned) || earned <= 0) continue;
    const stamp = entry.updatedAt || entry.createdAt;
    const occurredAt = stamp ? new Date(stamp).getTime() : 0;
    if (!occurredAt) continue;
    const media = mediaRecord(entry.mediaId);
    const id = mediaKey(entry.mediaId, entry.media_uuid);
    rows.push({
      id: `earned-${entry._id}`,
      kind: 'earned',
      occurredAt,
      title: media?.title || entry.mediaTitle || 'Untitled',
      artist: artistLabel(media?.artist, entry.mediaArtist),
      detail: `Earned ${formatTuneBytes(earned)} TuneBytes`,
      coverArt: media?.coverArt || entry.mediaCoverArt || null,
      href: activityHref(media, id),
    });
  }
  return rows;
}

function mapChampions(res: { events?: Array<Record<string, any>> }): ActivityRow[] {
  const rows: ActivityRow[] = [];
  for (const event of res.events || []) {
    const occurredAt = event.occurredAt ? new Date(event.occurredAt).getTime() : 0;
    if (!occurredAt || (event.kind !== 'earned' && event.kind !== 'lost')) continue;
    const media = mediaRecord(event.media);
    const id = mediaKey(media);
    const rank = event.rank;
    rows.push({
      id: `champion-${event._id}`,
      kind: event.kind === 'earned' ? 'took' : 'lost',
      occurredAt,
      title: media?.title || 'Untitled',
      artist: artistLabel(media?.artist),
      detail: event.kind === 'earned' ? `Took #${rank}` : `Lost #${rank}`,
      coverArt: media?.coverArt || null,
      href: activityHref(media, id),
      mediaId: id,
      regainPence: event.kind === 'lost' ? event.regainPence : null,
      rank,
    });
  }
  return rows;
}

function emptyBuffers(): Record<SourceName, ActivityRow[]> {
  return { tips: [], plays: [], earned: [], champion: [] };
}

function sourceStillHasMore(cursor: SourceCursor, name: SourceName) {
  if (name === 'tips') return cursor.tipsMore;
  if (name === 'plays') return cursor.playsMore;
  if (name === 'earned') return cursor.earnedMore;
  return cursor.championMore;
}

function oldestAt(rows: ActivityRow[]) {
  return rows.length ? rows[rows.length - 1].occurredAt : null;
}

function activityHorizon(buffers: Record<SourceName, ActivityRow[]>, cursor: SourceCursor) {
  let horizon: number | null = null;
  for (const name of SOURCE_NAMES) {
    if (!sourceStillHasMore(cursor, name)) continue;
    const oldest = oldestAt(buffers[name]);
    if (oldest == null) continue;
    horizon = horizon == null ? oldest : Math.max(horizon, oldest);
  }
  return horizon;
}

function visibleActivity(buffers: Record<SourceName, ActivityRow[]>, cursor: SourceCursor) {
  const horizon = activityHorizon(buffers, cursor);
  const all = SOURCE_NAMES.flatMap((name) => buffers[name]);
  const visible = horizon == null ? all : all.filter((row) => row.occurredAt >= horizon);
  return mergeRows([], visible);
}

function sourcesForNextPage(buffers: Record<SourceName, ActivityRow[]>, cursor: SourceCursor) {
  const horizon = activityHorizon(buffers, cursor);
  return SOURCE_NAMES.filter((name) => {
    if (!sourceStillHasMore(cursor, name)) return false;
    if (horizon == null) return true;
    const oldest = oldestAt(buffers[name]);
    return oldest == null || oldest >= horizon;
  });
}

async function fetchActivityPage(userId: string, cursor: SourceCursor, sources: SourceName[]) {
  const next: SourceCursor = { ...cursor };
  const bySource = emptyBuffers();
  let ok = 0;
  let failed = 0;
  const jobs: Array<Promise<void>> = [];
  const wanted = new Set(sources);

  if (wanted.has('tips') && cursor.tipsMore) {
    jobs.push((async () => {
      try {
        const res = await userAPI.getTipHistory({
          limit: PAGE_SIZE,
          page: cursor.tipsPage,
          status: 'active',
          sortBy: 'createdAt',
          sortOrder: 'desc',
        });
        bySource.tips = mapTips(res);
        next.tipsPage = cursor.tipsPage + 1;
        next.tipsMore = pageHasMore(res.pagination, res.tips?.length || 0, PAGE_SIZE);
        ok += 1;
      } catch {
        failed += 1;
      }
    })());
  }

  if (wanted.has('plays') && cursor.playsMore) {
    jobs.push((async () => {
      try {
        const res = await userAPI.getListeningHistory({
          limit: PAGE_SIZE,
          page: cursor.playsPage,
          countedAsPlay: true,
        });
        bySource.plays = mapPlays(res);
        next.playsPage = cursor.playsPage + 1;
        next.playsMore = pageHasMore(res.pagination, res.history?.length || 0, PAGE_SIZE);
        ok += 1;
      } catch {
        failed += 1;
      }
    })());
  }

  if (wanted.has('earned') && cursor.earnedMore) {
    jobs.push((async () => {
      try {
        const res = await userAPI.getTuneBytesHistory(userId, {
          limit: PAGE_SIZE,
          offset: cursor.earnedOffset,
        });
        bySource.earned = mapEarnings(res);
        const count = res.transactions?.length || 0;
        next.earnedOffset = cursor.earnedOffset + count;
        next.earnedMore = pageHasMore(res.pagination, count, PAGE_SIZE);
        ok += 1;
      } catch {
        failed += 1;
      }
    })());
  }

  if (wanted.has('champion') && cursor.championMore) {
    jobs.push((async () => {
      try {
        const res = await userAPI.getChampionPodiumEvents({
          limit: PAGE_SIZE,
          offset: cursor.championOffset,
        });
        bySource.champion = mapChampions(res);
        const count = res.events?.length || 0;
        next.championOffset = cursor.championOffset + count;
        next.championMore = typeof res.hasMore === 'boolean' ? res.hasMore : count >= PAGE_SIZE;
        ok += 1;
      } catch {
        failed += 1;
      }
    })());
  }

  await Promise.all(jobs);
  return { bySource, cursor: next, ok, failed };
}

function ActivitySkeleton() {
  return (
    <div className="space-y-3" role="status" aria-label="Loading recent activity">
      {[0, 1, 2].map((index) => (
        <div key={index} className="flex items-center gap-3 animate-pulse">
          <div className="h-14 w-14 rounded-lg bg-gray-700/80" />
          <div className="flex-1 space-y-2">
            <div className="h-2.5 w-1/3 rounded bg-gray-700/80" />
            <div className="h-3.5 w-4/5 rounded bg-gray-700/80" />
            <div className="h-2.5 w-2/5 rounded bg-gray-700/80" />
          </div>
          <div className="h-2.5 w-10 rounded bg-gray-700/80" />
        </div>
      ))}
    </div>
  );
}

function ActivityItem({
  row,
  onRegain,
}: {
  row: ActivityRow;
  onRegain: (row: ActivityRow) => void;
}) {
  const meta = kindMeta(row.kind);
  const Icon = meta.icon;
  const regainPence = row.kind === 'lost' ? row.regainPence : null;
  const label = `${meta.label}. ${row.detail}. ${row.title} by ${row.artist}. ${formatWhen(row.occurredAt)}`;
  const body = (
    <>
      <img
        src={row.coverArt || DEFAULT_COVER_ART}
        alt=""
        className="h-14 w-14 flex-shrink-0 rounded-lg object-cover bg-white/5"
      />
      <div className="min-w-0 flex-1">
        <div className={`flex items-center gap-1.5 text-xs font-semibold ${meta.className}`}>
          <Icon className={`h-3.5 w-3.5 flex-shrink-0 ${row.kind === 'tip' || row.kind === 'play' ? 'fill-current' : ''}`} />
          <span className="truncate">{row.detail}</span>
        </div>
        <div className="truncate font-medium text-white">{row.title}</div>
        <div className="truncate text-sm text-gray-400">{row.artist}</div>
      </div>
      <span className="flex-shrink-0 text-xs font-semibold text-gray-400">{formatWhen(row.occurredAt)}</span>
    </>
  );

  return (
    <div className="space-y-1.5">
      {row.href ? (
        <Link
          to={row.href}
          className="flex items-center gap-3 rounded-lg bg-black/20 px-3 py-3 hover:bg-black/30"
          aria-label={label}
        >
          {body}
        </Link>
      ) : (
        <div className="flex items-center gap-3 rounded-lg bg-black/20 px-3 py-3" aria-label={label}>
          {body}
        </div>
      )}
      {regainPence && row.mediaId && row.rank ? (
        <button
          type="button"
          onClick={() => onRegain(row)}
          className="ml-20 inline-flex rounded-full border border-amber-400/70 bg-amber-500/15 px-3 py-1.5 text-xs font-semibold text-amber-200 hover:bg-amber-500/25"
        >
          Tip {penceToPounds(regainPence)} to take #{row.rank} back
        </button>
      ) : null}
    </div>
  );
}

const RecentActivityFeed: React.FC<Props> = ({ refreshKey = 0 }) => {
  const { user, updateBalance, refreshUser } = useAuth();
  const userId = user?.uuid || user?._id || user?.id || null;
  const [rows, setRows] = useState<ActivityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tipTarget, setTipTarget] = useState<ActivityRow | null>(null);
  const [placingTip, setPlacingTip] = useState(false);
  const cursors = useRef(freshCursor());
  const buffers = useRef(emptyBuffers());
  const generation = useRef(0);
  const loadingGuard = useRef(false);
  const pauseAutoLoad = useRef(false);
  const listRef = useRef<HTMLDivElement | null>(null);

  const loadEarlier = useCallback(async (mode: 'replace' | 'append') => {
    if (!userId) {
      setRows([]);
      setLoading(false);
      return;
    }
    if (loadingGuard.current) return;
    if (mode === 'append' && !sourceHasMore(cursors.current)) return;

    const token = generation.current;
    loadingGuard.current = true;
    if (mode === 'append') setLoadingMore(true);
    else setLoading(true);

    const target = mode === 'replace' ? 12 : 8;
    let added = 0;
    let rounds = 0;
    let failedAll = false;

    try {
      while (rounds < 8 && sourceHasMore(cursors.current) && added < target) {
        const sources = sourcesForNextPage(buffers.current, cursors.current);
        if (!sources.length) break;
        rounds += 1;
        const beforeCount = visibleActivity(buffers.current, cursors.current).length;
        const before = cursors.current;
        const page = await fetchActivityPage(userId, before, sources);
        if (token !== generation.current) return;
        cursors.current = page.cursor;
        for (const name of SOURCE_NAMES) {
          if (!page.bySource[name].length) continue;
          buffers.current[name] = mergeRows(buffers.current[name], page.bySource[name]);
        }
        const visible = visibleActivity(buffers.current, cursors.current);
        const advanced = before.tipsPage !== page.cursor.tipsPage
          || before.playsPage !== page.cursor.playsPage
          || before.earnedOffset !== page.cursor.earnedOffset
          || before.championOffset !== page.cursor.championOffset;
        if (page.ok === 0 && page.failed > 0) {
          failedAll = true;
          pauseAutoLoad.current = true;
          break;
        }
        pauseAutoLoad.current = false;
        added += Math.max(0, visible.length - beforeCount);
        setRows(visible);
        if (!advanced || !sourceHasMore(page.cursor)) break;
      }
      if (token !== generation.current) return;
      if (failedAll) {
        setError(mode === 'replace' && added === 0
          ? 'Could not load recent activity'
          : 'Could not load earlier activity');
      } else {
        setError(null);
      }
    } finally {
      if (token === generation.current) {
        loadingGuard.current = false;
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, [userId]);

  useEffect(() => {
    generation.current += 1;
    loadingGuard.current = false;
    pauseAutoLoad.current = false;
    cursors.current = freshCursor();
    buffers.current = emptyBuffers();
    setRows([]);
    setError(null);
    if (!userId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    void loadEarlier('replace');
  }, [loadEarlier, refreshKey, userId]);

  const onScroll = () => {
    const node = listRef.current;
    if (!node || pauseAutoLoad.current || loadingGuard.current) return;
    if (node.scrollTop + node.clientHeight < node.scrollHeight - 80) return;
    void loadEarlier('append');
  };

  const placeRegainTip = async (tags: string[], amount: number) => {
    if (!tipTarget?.mediaId || !user) return;
    if (!(await ensureSpendableBalance(user.balance, poundsToPence(amount), refreshUser))) {
      toast.error('Insufficient balance');
      return;
    }
    setPlacingTip(true);
    try {
      const result = await mediaAPI.placeGlobalBid(tipTarget.mediaId, amount, undefined, tags);
      if (typeof result.updatedBalance === 'number') updateBalance(result.updatedBalance);
      toast.success(`Tip of £${amount.toFixed(2)} placed successfully!`);
      setTipTarget(null);
      generation.current += 1;
      loadingGuard.current = false;
      cursors.current = freshCursor();
      buffers.current = emptyBuffers();
      setRows([]);
      setLoading(true);
      void loadEarlier('replace');
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to place tip');
    } finally {
      setPlacingTip(false);
    }
  };

  return (
    <div className="order-2">
      <section className="card mb-8" aria-label="Recent activity">
        <h2 className="mb-4 text-2xl font-semibold text-white">Recent activity</h2>
        {loading && rows.length === 0 ? (
          <ActivitySkeleton />
        ) : error && rows.length === 0 ? (
          <p className="text-sm text-gray-400">{error}</p>
        ) : rows.length === 0 ? (
          <div>
            <p className="text-sm text-gray-400">Check out the charts.</p>
            <Link
              to="/party/global"
              className="mt-3 inline-flex rounded-lg border border-purple-500/40 bg-purple-900/40 px-3.5 py-2.5 text-sm font-semibold text-purple-100 hover:bg-purple-800/50"
            >
              Global chart
            </Link>
          </div>
        ) : (
          <div
            ref={listRef}
            onScroll={onScroll}
            className="max-h-[32rem] space-y-3 overflow-y-auto pr-1"
          >
            {rows.map((row) => (
              <ActivityItem key={row.id} row={row} onRegain={setTipTarget} />
            ))}
            {(loadingMore || (error && rows.length > 0)) && (
              <div className="pt-1">
                {loadingMore ? (
                  <Loader2 className="h-5 w-5 animate-spin text-purple-400" aria-label="Loading earlier activity" />
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      pauseAutoLoad.current = false;
                      void loadEarlier('append');
                    }}
                    className="text-sm font-semibold text-purple-300 hover:text-white"
                  >
                    {error}
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </section>
      <BidConfirmationModal
        isOpen={Boolean(tipTarget)}
        onClose={() => setTipTarget(null)}
        onConfirm={(tags, amount) => {
          void placeRegainTip(tags, amount);
        }}
        bidAmount={tipTarget?.regainPence ? tipTarget.regainPence / 100 : 0.01}
        minTip={0.01}
        mediaTitle={tipTarget?.title || 'Untitled'}
        mediaArtist={tipTarget?.artist}
        userBalance={penceToPoundsNumber(user?.balance)}
        isLoading={placingTip}
      />
    </div>
  );
};

export default RecentActivityFeed;
