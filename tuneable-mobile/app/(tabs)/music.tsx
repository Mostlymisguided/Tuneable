import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Screen } from '@/src/components/Screen';
import { ChartTrackRow } from '@/src/components/ChartTrackRow';
import { TipSheet } from '@/src/components/TipSheet';
import { mediaAPI } from '@/src/api/media';
import { partyAPI } from '@/src/api/party';
import { useAuth } from '@/src/auth/AuthContext';
import { formatPoundsFromPence } from '@/src/lib/format';
import { formatArtist, isUploadPlayable, mediaId } from '@/src/lib/media';
import { useMusicPlayerStore } from '@/src/stores/musicPlayerStore';
import { colors } from '@/src/theme/colors';
import {
  GLOBAL_PARTY_ID,
  TIME_PERIODS,
  type ChartMediaItem,
  type TimePeriodKey,
} from '@/src/types/media';

export default function MusicScreen() {
  const { user, updateBalance } = useAuth();
  const [period, setPeriod] = useState<TimePeriodKey>('all-time');
  const [media, setMedia] = useState<ChartMediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tipTarget, setTipTarget] = useState<ChartMediaItem | null>(null);
  const setQueueAndPlay = useMusicPlayerStore((s) => s.setQueueAndPlay);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const res = await partyAPI.getMediaSortedByTime(GLOBAL_PARTY_ID, period);
      setMedia(res.media ?? []);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to load chart';
      setError(message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [period]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const totals = useMemo(() => {
    const tips = media.reduce((sum, m) => sum + (m.partyMediaAggregate ?? 0), 0);
    const playableCount = media.filter(isUploadPlayable).length;
    return { tips, playableCount };
  }, [media]);

  const onPlayItem = (item: ChartMediaItem) => {
    const index = media.findIndex((m) => mediaId(m) === mediaId(item));
    void setQueueAndPlay(media, Math.max(0, index));
  };

  const onPlayQueue = () => {
    const firstPlayable = media.findIndex(isUploadPlayable);
    if (firstPlayable < 0) return;
    void setQueueAndPlay(media, firstPlayable);
  };

  const onConfirmTip = async (amountPounds: number) => {
    if (!tipTarget) return;
    const id = mediaId(tipTarget);
    if (!id) throw new Error('Missing media id');
    const res = await mediaAPI.placeGlobalBid(id, amountPounds);
    const tipPence = Math.round(amountPounds * 100);
    if (typeof res.updatedBalance === 'number') {
      updateBalance(res.updatedBalance);
    }
    setMedia((prev) =>
      prev
        .map((m) =>
          mediaId(m) === id
            ? {
                ...m,
                partyMediaAggregate: (m.partyMediaAggregate ?? 0) + tipPence,
              }
            : m
        )
        .sort(
          (a, b) => (b.partyMediaAggregate ?? 0) - (a.partyMediaAggregate ?? 0)
        )
    );
  };

  return (
    <Screen>
      <FlatList
        data={media}
        keyExtractor={(item, index) => mediaId(item) || String(index)}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void load(true)}
            tintColor={colors.accentLight}
          />
        }
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.title}>Music</Text>
            <Text style={styles.subtitle}>Global chart</Text>

            <Pressable
              style={styles.addTunesBtn}
              onPress={() => router.push('/music-search')}>
              <Text style={styles.addTunesText}>Add tunes</Text>
            </Pressable>

            <View style={styles.periods}>
              {TIME_PERIODS.map((p) => {
                const active = period === p.key;
                return (
                  <Pressable
                    key={p.key}
                    onPress={() => setPeriod(p.key)}
                    style={[styles.periodChip, active && styles.periodChipActive]}>
                    <Text
                      style={[
                        styles.periodText,
                        active && styles.periodTextActive,
                      ]}>
                      {p.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.metrics}>
              <Metric
                label="Tracks"
                value={String(media.length)}
                border={colors.accent}
              />
              <Metric
                label="Total Tips"
                value={formatPoundsFromPence(totals.tips)}
                border="#eab308"
              />
              <Metric
                label="Playable"
                value={String(totals.playableCount)}
                border={colors.success}
              />
            </View>

            {totals.playableCount > 0 ? (
              <Pressable style={styles.playBtn} onPress={onPlayQueue}>
                <Text style={styles.playBtnText}>Play uploads</Text>
              </Pressable>
            ) : null}

            {error ? <Text style={styles.error}>{error}</Text> : null}
          </View>
        }
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator
              color={colors.accentLight}
              style={{ marginTop: 40 }}
            />
          ) : (
            <Text style={styles.empty}>No tunes in this period yet.</Text>
          )
        }
        renderItem={({ item, index }) => (
          <ChartTrackRow
            rank={index + 1}
            item={item}
            onPlay={() => onPlayItem(item)}
            onTip={() => setTipTarget(item)}
          />
        )}
      />

      <TipSheet
        visible={Boolean(tipTarget)}
        title={tipTarget?.title || 'Untitled'}
        subtitle={tipTarget ? formatArtist(tipTarget.artist) : undefined}
        balancePence={user?.balance ?? 0}
        defaultTipPounds={user?.preferences?.defaultTip ?? 0.5}
        onClose={() => setTipTarget(null)}
        onConfirm={onConfirmTip}
      />
    </Screen>
  );
}

function Metric({
  label,
  value,
  border,
}: {
  label: string;
  value: string;
  border: string;
}) {
  return (
    <View style={[styles.metric, { borderColor: border }]}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 96,
  },
  header: {
    paddingTop: 8,
    marginBottom: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.text,
  },
  subtitle: {
    marginTop: 4,
    marginBottom: 14,
    color: colors.textSecondary,
    fontSize: 15,
  },
  addTunesBtn: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 14,
  },
  addTunesText: {
    color: colors.text,
    fontWeight: '600',
    fontSize: 14,
  },
  periods: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  periodChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  periodChipActive: {
    backgroundColor: '#7e22ce',
  },
  periodText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '500',
  },
  periodTextActive: {
    color: '#fff',
  },
  metrics: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  metric: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 8,
    backgroundColor: colors.card,
  },
  metricValue: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  metricLabel: {
    marginTop: 2,
    color: colors.textMuted,
    fontSize: 11,
  },
  playBtn: {
    alignSelf: 'flex-start',
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginBottom: 8,
  },
  playBtnText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  error: {
    color: '#fca5a5',
    marginTop: 8,
    marginBottom: 4,
  },
  empty: {
    textAlign: 'center',
    color: colors.textSecondary,
    marginTop: 32,
  },
});
