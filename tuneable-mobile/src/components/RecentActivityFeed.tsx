import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import { mediaAPI } from '@/src/api/media';
import {
  userAPI,
  type ActivityMediaRef,
  type ActivityPageInfo,
  type ChampionPodiumEventsResponse,
  type ListeningHistoryResponse,
  type TipHistoryResponse,
  type TuneBytesHistoryResponse,
} from '@/src/api/user';
import { ArtworkLoader } from '@/src/components/ArtworkCube';
import { TipSheet } from '@/src/components/TipSheet';
import { formatPoundsFromPence, formatTuneBytes } from '@/src/lib/format';
import { formatArtist } from '@/src/lib/media';
import { colors } from '@/src/theme/colors';
import { DEFAULT_COVER_ART, type ChartMediaItem } from '@/src/types/media';
import { promoteCoverArt, RememberCover } from '@/src/lib/coverMemory';

const PAGE_SIZE = 30;

type ActivityKind = 'earned' | 'tip' | 'play' | 'took' | 'lost';

type ActivityRow = {
  id: string;
  kind: ActivityKind;
  occurredAt: number;
  title: string;
  artist: string;
  detail: string;
  coverArt: string | null;
  href: Href | null;
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

type Props = {
  userId?: string | null;
  revision: number;
  balancePence?: number;
  onBalanceUpdate?: (balancePence: number) => void;
};

function mediaRecord(
  media: ActivityMediaRef | string | null | undefined
): ActivityMediaRef | null {
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

function activityHref(
  id: string | null,
  contentForm?: string[]
): Href | null {
  if (!id) return null;
  const forms = contentForm || [];
  if (forms.some((form) => form === 'book' || form === 'article')) {
    return `/book/${id}`;
  }
  if (forms.includes('podcastseries')) return `/show/${id}`;
  if (
    forms.some((form) =>
      ['podcast', 'podcastepisode', 'episode'].includes(form)
    )
  ) {
    return `/podcast/${id}`;
  }
  return `/tune/${id}`;
}

function artistLabel(value: unknown, fallback?: string | null): string {
  const named = formatArtist(value as ChartMediaItem['artist']);
  if (named !== 'Unknown artist') return named;
  const text = fallback?.trim();
  return text || 'Unknown artist';
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
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  label: string;
} {
  if (kind === 'earned') {
    return { icon: 'sparkles', color: colors.accentLight, label: 'TuneBytes' };
  }
  if (kind === 'tip') {
    return { icon: 'heart', color: colors.tipHeartTipped, label: 'Tip' };
  }
  if (kind === 'took') {
    return { icon: 'trophy', color: '#fbbf24', label: 'Champion' };
  }
  if (kind === 'lost') {
    return { icon: 'trophy-outline', color: '#fb7185', label: 'Champion' };
  }
  return { icon: 'play', color: colors.text, label: 'Played' };
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

function mapTips(res: TipHistoryResponse): ActivityRow[] {
  const rows: ActivityRow[] = [];
  for (const tip of res.tips || []) {
    if ((tip.status || 'active') !== 'active') continue;
    const occurredAt = tip.createdAt ? new Date(tip.createdAt).getTime() : 0;
    if (!occurredAt) continue;
    const media = tip.media;
    const id = mediaKey(media);
    rows.push({
      id: `tip-${tip._id}`,
      kind: 'tip',
      occurredAt,
      title: media?.title || tip.mediaTitle || 'Untitled',
      artist: artistLabel(media?.artist, tip.mediaArtist),
      detail: `Tipped ${formatPoundsFromPence(tip.amount)}`,
      coverArt: media?.coverArt || tip.mediaCoverArt || null,
      href: activityHref(id, media?.contentForm),
    });
  }
  return rows;
}

function mapPlays(res: ListeningHistoryResponse): ActivityRow[] {
  const rows: ActivityRow[] = [];
  for (const play of res.history || []) {
    if (!play.countedAsPlay) continue;
    const stamp = play.qualifiedAt || play.lastPlayedAt;
    const occurredAt = stamp ? new Date(stamp).getTime() : 0;
    if (!occurredAt) continue;
    const media = play.media;
    const id = mediaKey(media);
    rows.push({
      id: `play-${play._id}`,
      kind: 'play',
      occurredAt,
      title: media?.title || 'Untitled',
      artist: artistLabel(media?.artist),
      detail: 'Played',
      coverArt: media?.coverArt || null,
      href: activityHref(id, media?.contentForm),
    });
  }
  return rows;
}

function mapEarnings(res: TuneBytesHistoryResponse): ActivityRow[] {
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
      href: activityHref(id, media?.contentForm),
    });
  }
  return rows;
}

function mapChampions(res: ChampionPodiumEventsResponse): ActivityRow[] {
  const rows: ActivityRow[] = [];
  for (const event of res.events || []) {
    const occurredAt = event.occurredAt ? new Date(event.occurredAt).getTime() : 0;
    if (!occurredAt || (event.kind !== 'earned' && event.kind !== 'lost')) continue;
    const media = event.media;
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
      href: activityHref(id, media?.contentForm),
      mediaId: id,
      regainPence: event.kind === 'lost' ? event.regainPence : null,
      rank,
    });
  }
  return rows;
}

type SourceName = 'tips' | 'plays' | 'earned' | 'champion';

const SOURCE_NAMES: SourceName[] = ['tips', 'plays', 'earned', 'champion'];

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

async function fetchActivityPage(
  userId: string,
  cursor: SourceCursor,
  sources: SourceName[]
) {
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

function ItemSeparator() {
  return <View style={styles.separator} />;
}

function ActivityItem({
  row,
  onRegain,
}: {
  row: ActivityRow;
  onRegain: (row: ActivityRow) => void;
}) {
  const meta = kindMeta(row.kind);
  const regainPence = row.kind === 'lost' ? row.regainPence : null;
  return (
    <View style={styles.item}>
      <RememberCover uri={row.coverArt} />
      <Pressable
        style={styles.row}
        disabled={!row.href}
        onPress={() => {
          promoteCoverArt(row.coverArt);
          if (row.href) router.push(row.href);
        }}
        accessibilityRole="button"
        accessibilityLabel={`${meta.label}. ${row.detail}. ${row.title} by ${row.artist}. ${formatWhen(row.occurredAt)}`}>
        <Image
          source={{ uri: row.coverArt || DEFAULT_COVER_ART }}
          style={styles.cover}
        />
        <View style={styles.meta}>
          <View style={styles.detailRow}>
            <Ionicons name={meta.icon} size={12} color={meta.color} />
            <Text style={[styles.detail, { color: meta.color }]} numberOfLines={1}>
              {row.detail}
            </Text>
          </View>
          <Text style={styles.track} numberOfLines={1}>
            {row.title}
          </Text>
          <Text style={styles.artist} numberOfLines={1}>
            {row.artist}
          </Text>
        </View>
        <Text style={styles.when}>{formatWhen(row.occurredAt)}</Text>
      </Pressable>
      {regainPence && row.mediaId && row.rank ? (
        <Pressable
          style={styles.regain}
          onPress={() => onRegain(row)}
          accessibilityRole="button"
          accessibilityLabel={`Tip ${formatPoundsFromPence(regainPence)} to take number ${row.rank} back on ${row.title}`}>
          <Text style={styles.regainText}>
            Tip {formatPoundsFromPence(regainPence)} to take #{row.rank} back
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function RecentActivityFeed({
  userId,
  revision,
  balancePence = 0,
  onBalanceUpdate,
}: Props) {
  const { height: windowHeight } = useWindowDimensions();
  const maxListHeight = Math.min(560, Math.round(windowHeight * 0.62));
  const [rows, setRows] = useState<ActivityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [contentHeight, setContentHeight] = useState(0);
  const [tipTarget, setTipTarget] = useState<ActivityRow | null>(null);
  const cursors = useRef(freshCursor());
  const buffers = useRef(emptyBuffers());
  const generation = useRef(0);
  const loadingGuard = useRef(false);
  const pauseAutoLoad = useRef(false);
  const userScrolled = useRef(false);
  const listFilled = useRef(false);

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

    const target = mode === 'replace' ? Math.ceil(maxListHeight / 68) + 2 : 8;
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
  }, [maxListHeight, userId]);

  useEffect(() => {
    if (revision === 0) return;
    generation.current += 1;
    loadingGuard.current = false;
    pauseAutoLoad.current = false;
    userScrolled.current = false;
    cursors.current = freshCursor();
    buffers.current = emptyBuffers();
    setRows([]);
    setContentHeight(0);
    setError(null);
    if (!userId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    void loadEarlier('replace');
  }, [loadEarlier, revision, userId]);

  const loadEarlierRef = useRef(loadEarlier);
  loadEarlierRef.current = loadEarlier;
  const onEndReached = useCallback(() => {
    if (pauseAutoLoad.current) return;
    if (listFilled.current && !userScrolled.current) return;
    void loadEarlierRef.current('append');
  }, []);

  const listOverflows = Math.max(contentHeight, rows.length * 64) > maxListHeight;
  listFilled.current = listOverflows;

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Recent activity</Text>
      {loading && rows.length === 0 ? (
        <ArtworkLoader size="section" style={styles.loader} />
      ) : error && rows.length === 0 ? (
        <Text style={styles.emptyBody}>{error}</Text>
      ) : rows.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyBody}>Check out the charts.</Text>
          <Pressable
            style={styles.emptyBtn}
            onPress={() =>
              router.push({ pathname: '/(tabs)/charts', params: { kind: 'music' } })
            }
            accessibilityRole="button"
            accessibilityLabel="Open the global chart">
            <Text style={styles.emptyBtnText}>Global chart</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(row) => row.id}
          renderItem={({ item }) => (
            <ActivityItem row={item} onRegain={(row) => setTipTarget(row)} />
          )}
          style={{
            height: listOverflows
              ? maxListHeight
              : (contentHeight || rows.length * 76),
          }}
          scrollEnabled={listOverflows}
          nestedScrollEnabled
          onScrollBeginDrag={() => {
            userScrolled.current = true;
          }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator
          initialNumToRender={12}
          maxToRenderPerBatch={10}
          windowSize={7}
          onEndReached={onEndReached}
          onEndReachedThreshold={0.4}
          onContentSizeChange={(_, height) => {
            setContentHeight((current) => (Math.abs(current - height) < 1 ? current : height));
          }}
          ItemSeparatorComponent={ItemSeparator}
          ListFooterComponent={
            loadingMore || (error && rows.length > 0) ? (
              <View style={styles.footer}>
                {loadingMore ? (
                  <ActivityIndicator color={colors.accentLight} />
                ) : (
                  <Pressable
                    onPress={() => {
                      pauseAutoLoad.current = false;
                      void loadEarlier('append');
                    }}
                    accessibilityRole="button"
                    accessibilityLabel="Load earlier activity">
                    <Text style={styles.retry}>{error}</Text>
                  </Pressable>
                )}
              </View>
            ) : null
          }
        />
      )}
      <TipSheet
        visible={Boolean(tipTarget)}
        title={tipTarget?.title || 'Untitled'}
        subtitle={tipTarget?.artist}
        balancePence={balancePence}
        initialAmountPounds={
          tipTarget?.regainPence ? tipTarget.regainPence / 100 : null
        }
        onClose={() => setTipTarget(null)}
        onConfirm={async (amountPounds, tags) => {
          if (!tipTarget?.mediaId) return;
          const res = await mediaAPI.placeGlobalBid(tipTarget.mediaId, amountPounds, { tags });
          if (typeof res.updatedBalance === 'number') onBalanceUpdate?.(res.updatedBalance);
          return res;
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 4,
    marginBottom: 8,
  },
  title: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 10,
  },
  loader: {
    marginVertical: 16,
  },
  empty: {
    alignItems: 'flex-start',
  },
  emptyBody: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  emptyBtn: {
    alignSelf: 'flex-start',
    marginTop: 12,
    backgroundColor: 'rgba(126, 34, 206, 0.35)',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: 'rgba(168, 85, 247, 0.4)',
  },
  emptyBtnText: {
    color: '#e9d5ff',
    fontWeight: '600',
    fontSize: 13,
  },
  separator: {
    height: 12,
  },
  footer: {
    marginTop: 12,
    alignItems: 'flex-start',
  },
  retry: {
    color: colors.accentLight,
    fontSize: 13,
    fontWeight: '700',
  },
  item: {
    gap: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  cover: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  meta: {
    flex: 1,
    minWidth: 0,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  detail: {
    flexShrink: 1,
    fontSize: 12,
    fontWeight: '700',
  },
  track: {
    marginTop: 1,
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  artist: {
    color: colors.textMuted,
    fontSize: 13,
    marginTop: 1,
  },
  when: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  regain: {
    marginLeft: 58,
    alignSelf: 'flex-start',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(251, 191, 36, 0.7)',
    backgroundColor: 'rgba(245, 158, 11, 0.16)',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  regainText: {
    color: '#fde68a',
    fontSize: 12,
    fontWeight: '700',
  },
});
