import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Redirect, router } from 'expo-router';
import { Screen } from '@/src/components/Screen';
import { SeekBar } from '@/src/components/SeekBar';
import { TipSheet } from '@/src/components/TipSheet';
import { MiniSupportersBar } from '@/src/components/MiniSupportersBar';
import { mediaAPI } from '@/src/api/media';
import { useAuth } from '@/src/auth/AuthContext';
import { formatArtist, mediaId } from '@/src/lib/media';
import { formatPlaybackSpeed } from '@/src/lib/playbackAudio';
import { episodeId, seriesId, seriesTitle } from '@/src/lib/podcast';
import {
  useCurrentTrack,
  useMusicPlayerStore,
} from '@/src/stores/musicPlayerStore';
import {
  useCurrentEpisode,
  usePodcastPlayerStore,
} from '@/src/stores/podcastPlayerStore';
import { colors } from '@/src/theme/colors';
import { DEFAULT_COVER_ART, type MediaChampion } from '@/src/types/media';
import { DEFAULT_PODCAST_COVER } from '@/src/types/podcast';

export default function NowPlayingScreen() {
  const { user, updateBalance } = useAuth();
  const [tipOpen, setTipOpen] = useState(false);
  const [champions, setChampions] = useState<MediaChampion[]>([]);
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
  const playbackRate = podcast.playbackRate;

  const tuneId = track && !episode ? mediaId(track) : '';
  const podcastId = episode ? episodeId(episode) : '';
  const showId = episode ? seriesId(episode) : '';
  const profileHref = podcastId
    ? (`/podcast/${podcastId}` as const)
    : tuneId
      ? (`/tune/${tuneId}` as const)
      : null;
  const showHref = showId ? (`/show/${showId}` as const) : null;
  const tipMedia = episode ?? track ?? undefined;
  const defaultTip = user?.preferences?.defaultTip ?? 1.11;
  const championsMediaId = podcastId || tuneId;

  useEffect(() => {
    if (!championsMediaId) {
      setChampions([]);
      return;
    }
    let cancelled = false;
    mediaAPI
      .getChampions(championsMediaId, { limit: 5 })
      .then((res) => {
        if (cancelled) return;
        setChampions(res.champions?.length ? res.champions : res.rankings || []);
      })
      .catch(() => {
        if (!cancelled) setChampions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [championsMediaId]);

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

  const onConfirmTip = async (amountPounds: number, tags: string[]) => {
    const id = podcastId || tuneId;
    if (!id) throw new Error('Missing media id');
    const res = await mediaAPI.placeGlobalBid(id, amountPounds, { tags });
    if (typeof res.updatedBalance === 'number') {
      updateBalance(res.updatedBalance);
    }
    mediaAPI
      .getChampions(id, { limit: 5 })
      .then((champRes) => {
        setChampions(
          champRes.champions?.length ? champRes.champions : champRes.rankings || []
        );
      })
      .catch(() => {});
    return res;
  };

  const onOpenShow = () => {
    if (showHref) router.push(showHref);
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

      <ScrollView
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}>
        <Image source={{ uri: coverUri }} style={styles.cover} />

        <Text style={styles.title} numberOfLines={2}>
          {title}
        </Text>
        {active === 'podcast' && showHref ? (
          <Pressable onPress={onOpenShow} hitSlop={8} accessibilityRole="link">
            <Text style={styles.subtitleLink} numberOfLines={1}>
              {subtitle}
            </Text>
          </Pressable>
        ) : (
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        )}

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

        {active === 'podcast' ? (
          <>
            <View style={styles.controls}>
              <SkipChip
                label="−15"
                accessibilityLabel="Back 15 seconds"
                onPress={() => void podcast.skipBack()}
              />

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

              <SkipChip
                label="+30"
                accessibilityLabel="Forward 30 seconds"
                onPress={() => void podcast.skipForward()}
              />
            </View>

            <View style={styles.secondaryRow}>
              <Pressable
                onPress={onPrev}
                hitSlop={12}
                style={styles.iconBtn}
                accessibilityLabel="Previous episode">
                <Ionicons name="play-skip-back" size={22} color={colors.textSecondary} />
              </Pressable>
              <Pressable
                onPress={() => void podcast.cyclePlaybackRate()}
                style={styles.speedBtn}
                accessibilityLabel="Playback speed">
                <Text style={styles.speedText}>
                  {formatPlaybackSpeed(playbackRate)}
                </Text>
              </Pressable>
              <Pressable
                onPress={onNext}
                hitSlop={12}
                style={styles.iconBtn}
                accessibilityLabel="Next episode">
                <Ionicons
                  name="play-skip-forward"
                  size={22}
                  color={colors.textSecondary}
                />
              </Pressable>
            </View>
          </>
        ) : (
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
        )}

        {champions.length > 0 ? (
          <View style={styles.championsWrap}>
            <MiniSupportersBar
              champions={champions}
              maxVisible={5}
              variant="chips"
            />
          </View>
        ) : null}

        <Pressable
          style={styles.heartBtn}
          onPress={() => setTipOpen(true)}
          accessibilityLabel="Send a tip">
          <Ionicons name="heart" size={22} color={colors.tipHeart} />
          <Text style={styles.heartLabel}>Tip</Text>
        </Pressable>
      </ScrollView>

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

function SkipChip({
  label,
  accessibilityLabel,
  onPress,
}: {
  label: string;
  accessibilityLabel: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={12}
      style={styles.skipBtn}
      accessibilityLabel={accessibilityLabel}>
      <Text style={styles.skipText}>{label}</Text>
    </Pressable>
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
    flexGrow: 1,
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
  subtitleLink: {
    marginTop: 8,
    color: colors.accentLight,
    fontSize: 16,
    textAlign: 'center',
    textDecorationLine: 'underline',
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
  secondaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 28,
    marginTop: 18,
  },
  sideBtn: {
    padding: 8,
  },
  iconBtn: {
    padding: 8,
  },
  skipBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 1.5,
    borderColor: colors.textSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skipText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  speedBtn: {
    minWidth: 64,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    alignItems: 'center',
  },
  speedText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  playBtn: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  championsWrap: {
    width: '100%',
    marginTop: 22,
    alignItems: 'center',
  },
  heartBtn: {
    marginTop: 22,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 22,
    backgroundColor: colors.tipHeartBg,
    borderWidth: 1,
    borderColor: colors.tipHeartBorder,
  },
  heartLabel: {
    color: colors.tipHeart,
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
