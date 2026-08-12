import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Redirect, router } from 'expo-router';
import { Screen } from '@/src/components/Screen';
import { SeekBar } from '@/src/components/SeekBar';
import { TipSheet } from '@/src/components/TipSheet';
import { mediaAPI } from '@/src/api/media';
import { useAuth } from '@/src/auth/AuthContext';
import { formatArtist, mediaId } from '@/src/lib/media';
import { episodeId, seriesTitle } from '@/src/lib/podcast';
import {
  useCurrentTrack,
  useMusicPlayerStore,
} from '@/src/stores/musicPlayerStore';
import {
  useCurrentEpisode,
  usePodcastPlayerStore,
} from '@/src/stores/podcastPlayerStore';
import { colors } from '@/src/theme/colors';
import { DEFAULT_COVER_ART } from '@/src/types/media';
import { DEFAULT_PODCAST_COVER } from '@/src/types/podcast';

export default function NowPlayingScreen() {
  const { user, updateBalance } = useAuth();
  const [tipOpen, setTipOpen] = useState(false);
  const track = useCurrentTrack();
  const episode = useCurrentEpisode();

  const music = useMusicPlayerStore();
  const podcast = usePodcastPlayerStore();

  const active = episode ? 'podcast' : track ? 'music' : null;

  const coverUri = useMemo(() => {
    if (episode) {
      return (
        episode.coverArt ||
        episode.podcastSeries?.coverArt ||
        DEFAULT_PODCAST_COVER
      );
    }
    return track?.coverArt || DEFAULT_COVER_ART;
  }, [episode, track]);

  const title = episode?.title || track?.title || 'Nothing playing';
  const subtitle = episode
    ? seriesTitle(episode)
    : track
      ? formatArtist(track.artist)
      : '';

  const isPlaying = active === 'podcast' ? podcast.isPlaying : music.isPlaying;
  const isLoading = active === 'podcast' ? podcast.isLoading : music.isLoading;
  const positionMs = active === 'podcast' ? podcast.positionMs : music.positionMs;
  const durationMs = active === 'podcast' ? podcast.durationMs : music.durationMs;
  const queueLen =
    active === 'podcast' ? podcast.queue.length : music.queue.length;
  const queueIndex =
    active === 'podcast' ? podcast.currentIndex : music.currentIndex;
  const error = active === 'podcast' ? podcast.error : music.error;

  if (!user) {
    return <Redirect href="/login" />;
  }

  if (!active) {
    return (
      <Screen>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={12} style={styles.back}>
            <Ionicons name="chevron-down" size={28} color={colors.text} />
          </Pressable>
          <Text style={styles.headerTitle}>Now playing</Text>
        </View>
        <View style={styles.empty}>
          <Ionicons name="musical-notes" size={48} color={colors.textMuted} />
          <Text style={styles.emptyText}>Nothing is playing yet.</Text>
          <Pressable
            style={styles.emptyBtn}
            onPress={() => router.replace('/(tabs)/music')}>
            <Text style={styles.emptyBtnText}>Browse music</Text>
          </Pressable>
        </View>
      </Screen>
    );
  }

  const onToggle = () => {
    void (active === 'podcast'
      ? podcast.togglePlayPause()
      : music.togglePlayPause());
  };
  const onPrev = () => {
    void (active === 'podcast' ? podcast.previous() : music.previous());
  };
  const onNext = () => {
    void (active === 'podcast' ? podcast.next() : music.next());
  };
  const onSeek = (ms: number) => {
    void (active === 'podcast' ? podcast.seek(ms) : music.seek(ms));
  };

  const tuneId = track && !episode ? mediaId(track) : '';
  const podcastId = episode ? episodeId(episode) : '';
  const profileHref = podcastId
    ? (`/podcast/${podcastId}` as const)
    : tuneId
      ? (`/tune/${tuneId}` as const)
      : null;
  const tipMedia = episode ?? track ?? undefined;
  const defaultTip = user.preferences?.defaultTip ?? 1.11;

  const onConfirmTip = async (amountPounds: number, tags: string[]) => {
    const id = podcastId || tuneId;
    if (!id) throw new Error('Missing media id');
    const res = await mediaAPI.placeGlobalBid(id, amountPounds, { tags });
    if (typeof res.updatedBalance === 'number') {
      updateBalance(res.updatedBalance);
    }
    return res;
  };

  return (
    <Screen>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.back}>
          <Ionicons name="chevron-down" size={28} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Now playing</Text>
        {profileHref ? (
          <Pressable
            onPress={() => router.push(profileHref)}
            hitSlop={12}
            style={styles.infoBtn}>
            <Ionicons
              name="information-circle-outline"
              size={26}
              color={colors.text}
            />
          </Pressable>
        ) : (
          <View style={styles.infoBtn} />
        )}
      </View>

      <View style={styles.body}>
        <Image source={{ uri: coverUri }} style={styles.cover} />

        <Text style={styles.title} numberOfLines={2}>
          {title}
        </Text>
        <Text style={styles.subtitle} numberOfLines={1}>
          {subtitle}
        </Text>

        {queueLen > 1 ? (
          <Text style={styles.queueHint}>
            {queueIndex + 1} of {queueLen}
          </Text>
        ) : null}

        <View style={styles.seekWrap}>
          <SeekBar
            positionMs={positionMs}
            durationMs={durationMs}
            onSeek={onSeek}
          />
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.controls}>
          <Pressable onPress={onPrev} hitSlop={16} style={styles.sideBtn}>
            <Ionicons name="play-skip-back" size={34} color={colors.text} />
          </Pressable>

          <Pressable onPress={onToggle} style={styles.playBtn}>
            {isLoading ? (
              <ActivityIndicator color="#fff" size="large" />
            ) : (
              <Ionicons
                name={isPlaying ? 'pause' : 'play'}
                size={40}
                color="#fff"
                style={!isPlaying ? { marginLeft: 4 } : undefined}
              />
            )}
          </Pressable>

          <Pressable onPress={onNext} hitSlop={16} style={styles.sideBtn}>
            <Ionicons name="play-skip-forward" size={34} color={colors.text} />
          </Pressable>
        </View>

        <Pressable
          style={styles.heartBtn}
          onPress={() => setTipOpen(true)}
          accessibilityLabel="Send a tip">
          <Ionicons name="heart" size={22} color="#e9d5ff" />
          <Text style={styles.heartLabel}>Tip</Text>
        </Pressable>
      </View>

      <TipSheet
        visible={tipOpen}
        title={title}
        subtitle={subtitle}
        balancePence={user.balance ?? 0}
        defaultTipPounds={defaultTip}
        tipMedia={tipMedia}
        onClose={() => setTipOpen(false)}
        onConfirm={onConfirmTip}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 8,
    marginBottom: 8,
  },
  back: {
    width: 40,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  infoBtn: {
    width: 40,
    alignItems: 'flex-end',
  },
  body: {
    flex: 1,
    paddingHorizontal: 28,
    paddingBottom: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cover: {
    width: '100%',
    aspectRatio: 1,
    maxWidth: 340,
    borderRadius: 18,
    backgroundColor: colors.card,
    marginBottom: 28,
  },
  title: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
  },
  subtitle: {
    marginTop: 8,
    color: colors.textSecondary,
    fontSize: 16,
    textAlign: 'center',
  },
  queueHint: {
    marginTop: 10,
    color: colors.textMuted,
    fontSize: 13,
  },
  seekWrap: {
    width: '100%',
    marginTop: 28,
  },
  error: {
    marginTop: 12,
    color: '#fca5a5',
    textAlign: 'center',
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 28,
    marginTop: 28,
  },
  sideBtn: {
    padding: 8,
  },
  playBtn: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heartBtn: {
    marginTop: 28,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 22,
    backgroundColor: 'rgba(126, 34, 206, 0.35)',
    borderWidth: 1,
    borderColor: 'rgba(168, 85, 247, 0.45)',
  },
  heartLabel: {
    color: '#e9d5ff',
    fontSize: 15,
    fontWeight: '600',
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 12,
  },
  emptyText: {
    color: colors.textSecondary,
    fontSize: 16,
    textAlign: 'center',
  },
  emptyBtn: {
    marginTop: 8,
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  emptyBtnText: {
    color: '#fff',
    fontWeight: '600',
  },
});
