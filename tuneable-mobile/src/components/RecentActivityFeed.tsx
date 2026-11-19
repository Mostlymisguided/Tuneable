import { useCallback, useEffect, useState } from 'react';
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import { mediaAPI } from '@/src/api/media';
import { userAPI, type ActivityMediaRef } from '@/src/api/user';
import { ArtworkLoader } from '@/src/components/ArtworkCube';
import { TipSheet } from '@/src/components/TipSheet';
import { formatPoundsFromPence, formatTuneBytes } from '@/src/lib/format';
import { formatArtist } from '@/src/lib/media';
import { colors } from '@/src/theme/colors';
import { DEFAULT_COVER_ART, type ChartMediaItem } from '@/src/types/media';
import { promoteCoverArt, RememberCover } from '@/src/lib/coverMemory';

const PREVIEW_LIMIT = 6;

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

type Props = {
  userId?: string | null;
  revision: number;
  balancePence?: number;
  defaultTipPounds?: number;
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

export function RecentActivityFeed({
  userId,
  revision,
  balancePence = 0,
  defaultTipPounds = 1,
  onBalanceUpdate,
}: Props) {
  const [rows, setRows] = useState<ActivityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tipTarget, setTipTarget] = useState<ActivityRow | null>(null);

  const load = useCallback(async () => {
    if (!userId) {
      setRows([]);
      setLoading(false);
      return;
    }
    setError(null);
    const [tipsResult, playsResult, earnedResult, championResult] = await Promise.allSettled([
      userAPI.getTipHistory(20),
      userAPI.getListeningHistory(40),
      userAPI.getTuneBytesHistory(userId, 20),
      userAPI.getChampionPodiumEvents(20),
    ]);

    const next: ActivityRow[] = [];

    if (tipsResult.status === 'fulfilled') {
      for (const tip of tipsResult.value.tips || []) {
        if ((tip.status || 'active') !== 'active') continue;
        const occurredAt = tip.createdAt ? new Date(tip.createdAt).getTime() : 0;
        if (!occurredAt) continue;
        const media = tip.media;
        const id = mediaKey(media);
        next.push({
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
    }

    if (playsResult.status === 'fulfilled') {
      for (const play of playsResult.value.history || []) {
        if (!play.countedAsPlay) continue;
        const stamp = play.qualifiedAt || play.lastPlayedAt;
        const occurredAt = stamp ? new Date(stamp).getTime() : 0;
        if (!occurredAt) continue;
        const media = play.media;
        const id = mediaKey(media);
        next.push({
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
    }

    if (earnedResult.status === 'fulfilled') {
      for (const entry of earnedResult.value.transactions || []) {
        const earned = Number(entry.tuneBytesEarned);
        if (!Number.isFinite(earned) || earned <= 0) continue;
        const stamp = entry.updatedAt || entry.createdAt;
        const occurredAt = stamp ? new Date(stamp).getTime() : 0;
        if (!occurredAt) continue;
        const media = mediaRecord(entry.mediaId);
        const id = mediaKey(entry.mediaId, entry.media_uuid);
        next.push({
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
    }

    if (championResult.status === 'fulfilled') {
      for (const event of championResult.value.events || []) {
        const occurredAt = event.occurredAt ? new Date(event.occurredAt).getTime() : 0;
        if (!occurredAt || (event.kind !== 'earned' && event.kind !== 'lost')) continue;
        const media = event.media;
        const id = mediaKey(media);
        const rank = event.rank;
        next.push({
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
    }

    next.sort((a, b) => b.occurredAt - a.occurredAt);
    setRows(next.slice(0, PREVIEW_LIMIT));

    if (
      tipsResult.status === 'rejected' &&
      playsResult.status === 'rejected' &&
      earnedResult.status === 'rejected' &&
      championResult.status === 'rejected'
    ) {
      setError('Could not load recent activity');
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    if (revision === 0) return;
    setLoading(true);
    void load();
  }, [load, revision]);

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Recent activity</Text>
      {loading && rows.length === 0 ? (
        <ArtworkLoader size="section" style={styles.loader} />
      ) : error && rows.length === 0 ? (
        <Text style={styles.emptyBody}>{error}</Text>
      ) : rows.length === 0 ? (
        <Text style={styles.emptyBody}>
          Tips, plays, TuneBytes, and champion titles will show up here.
        </Text>
      ) : (
        <View style={styles.list}>
          {rows.map((row) => {
            const meta = kindMeta(row.kind);
            const regainPence = row.kind === 'lost' ? row.regainPence : null;
            return (
              <View key={row.id} style={styles.item}>
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
                    onPress={() => setTipTarget(row)}
                    accessibilityRole="button"
                    accessibilityLabel={`Tip ${formatPoundsFromPence(regainPence)} to take number ${row.rank} back on ${row.title}`}>
                    <Text style={styles.regainText}>
                      Tip {formatPoundsFromPence(regainPence)} to take #{row.rank} back
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            );
          })}
        </View>
      )}
      <TipSheet
        visible={Boolean(tipTarget)}
        title={tipTarget?.title || 'Untitled'}
        subtitle={tipTarget?.artist}
        balancePence={balancePence}
        defaultTipPounds={defaultTipPounds}
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
  emptyBody: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  list: {
    gap: 12,
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
