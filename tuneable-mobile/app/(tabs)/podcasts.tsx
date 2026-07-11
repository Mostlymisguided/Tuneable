import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Screen } from '@/src/components/Screen';
import { PodcastEpisodeRow } from '@/src/components/PodcastEpisodeRow';
import { TipSheet } from '@/src/components/TipSheet';
import { mediaAPI } from '@/src/api/media';
import { podcastsAPI } from '@/src/api/podcasts';
import { useAuth } from '@/src/auth/AuthContext';
import { episodeId, isEpisodePlayable, seriesTitle } from '@/src/lib/podcast';
import { usePodcastPlayerStore } from '@/src/stores/podcastPlayerStore';
import { colors } from '@/src/theme/colors';
import type { PodcastEpisode } from '@/src/types/podcast';

export default function PodcastsScreen() {
  const { user, updateBalance } = useAuth();
  const [episodes, setEpisodes] = useState<PodcastEpisode[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tipTarget, setTipTarget] = useState<PodcastEpisode | null>(null);
  const setQueueAndPlay = usePodcastPlayerStore((s) => s.setQueueAndPlay);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const res = await podcastsAPI.getChart({ limit: 50, timeRange: 'all' });
      setEpisodes(res.episodes ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load podcasts');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const playableCount = useMemo(
    () => episodes.filter(isEpisodePlayable).length,
    [episodes]
  );

  const onPlayItem = (episode: PodcastEpisode) => {
    const index = episodes.findIndex((e) => episodeId(e) === episodeId(episode));
    void setQueueAndPlay(episodes, Math.max(0, index));
  };

  const onPlayQueue = () => {
    const first = episodes.findIndex(isEpisodePlayable);
    if (first < 0) return;
    void setQueueAndPlay(episodes, first);
  };

  const onConfirmTip = async (amountPounds: number) => {
    if (!tipTarget) return;
    const id = episodeId(tipTarget);
    if (!id) throw new Error('Missing episode id');
    const res = await mediaAPI.placeGlobalBid(id, amountPounds);
    const tipPence = Math.round(amountPounds * 100);
    if (typeof res.updatedBalance === 'number') {
      updateBalance(res.updatedBalance);
    }
    setEpisodes((prev) =>
      prev
        .map((e) =>
          episodeId(e) === id
            ? {
                ...e,
                globalMediaAggregate: (e.globalMediaAggregate ?? 0) + tipPence,
              }
            : e
        )
        .sort(
          (a, b) =>
            (b.globalMediaAggregate ?? 0) - (a.globalMediaAggregate ?? 0)
        )
    );
  };

  return (
    <Screen>
      <FlatList
        data={episodes}
        keyExtractor={(item, index) => episodeId(item) || String(index)}
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
            <Text style={styles.title}>Podcasts</Text>
            <Text style={styles.subtitle}>Top tipped episodes</Text>

            <View style={styles.metrics}>
              <View style={[styles.metric, { borderColor: colors.accent }]}>
                <Text style={styles.metricValue}>{episodes.length}</Text>
                <Text style={styles.metricLabel}>Episodes</Text>
              </View>
              <View style={[styles.metric, { borderColor: colors.success }]}>
                <Text style={styles.metricValue}>{playableCount}</Text>
                <Text style={styles.metricLabel}>Playable</Text>
              </View>
            </View>

            {playableCount > 0 ? (
              <Pressable style={styles.playBtn} onPress={onPlayQueue}>
                <Text style={styles.playBtnText}>Play chart</Text>
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
            <Text style={styles.empty}>No podcast episodes yet.</Text>
          )
        }
        renderItem={({ item, index }) => (
          <PodcastEpisodeRow
            rank={index + 1}
            episode={item}
            onPlay={() => onPlayItem(item)}
            onTip={() => setTipTarget(item)}
          />
        )}
      />

      <TipSheet
        visible={Boolean(tipTarget)}
        title={tipTarget?.title || 'Episode'}
        subtitle={tipTarget ? seriesTitle(tipTarget) : undefined}
        balancePence={user?.balance ?? 0}
        defaultTipPounds={user?.preferences?.defaultTip ?? 0.5}
        onClose={() => setTipTarget(null)}
        onConfirm={onConfirmTip}
      />
    </Screen>
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
  },
  empty: {
    textAlign: 'center',
    color: colors.textSecondary,
    marginTop: 32,
  },
});
