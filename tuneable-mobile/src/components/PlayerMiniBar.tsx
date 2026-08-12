import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { TipSheet } from '@/src/components/TipSheet';
import { mediaAPI } from '@/src/api/media';
import { useAuth } from '@/src/auth/AuthContext';
import { colors } from '@/src/theme/colors';
import { DEFAULT_COVER_ART } from '@/src/types/media';
import { DEFAULT_PODCAST_COVER } from '@/src/types/podcast';
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

/** Shows music or podcast — podcast wins if both somehow set (shouldn't happen). */
export function PlayerMiniBar() {
  const { user, updateBalance } = useAuth();
  const [tipOpen, setTipOpen] = useState(false);
  const episode = useCurrentEpisode();
  const track = useCurrentTrack();

  const musicPlaying = useMusicPlayerStore((s) => s.isPlaying);
  const musicLoading = useMusicPlayerStore((s) => s.isLoading);
  const musicToggle = useMusicPlayerStore((s) => s.togglePlayPause);
  const musicNext = useMusicPlayerStore((s) => s.next);

  const podPlaying = usePodcastPlayerStore((s) => s.isPlaying);
  const podLoading = usePodcastPlayerStore((s) => s.isLoading);
  const podToggle = usePodcastPlayerStore((s) => s.togglePlayPause);
  const podNext = usePodcastPlayerStore((s) => s.next);

  const openNowPlaying = () => router.push('/now-playing');

  const tipTitle = episode?.title || track?.title || 'Untitled';
  const tipSubtitle = episode
    ? seriesTitle(episode)
    : track
      ? formatArtist(track.artist)
      : undefined;
  const tipMedia = episode ?? track ?? undefined;
  const defaultTip = user?.preferences?.defaultTip ?? 1.11;

  const onConfirmTip = async (amountPounds: number, tags: string[]) => {
    const id = episode
      ? episodeId(episode)
      : track
        ? mediaId(track)
        : '';
    if (!id) throw new Error('Missing media id');
    const res = await mediaAPI.placeGlobalBid(id, amountPounds, { tags });
    if (typeof res.updatedBalance === 'number') {
      updateBalance(res.updatedBalance);
    }
    return res;
  };

  const chrome = episode ? (
    <MiniBarChrome
      coverUri={
        episode.coverArt ||
        episode.podcastSeries?.coverArt ||
        DEFAULT_PODCAST_COVER
      }
      title={episode.title || 'Episode'}
      subtitle={seriesTitle(episode)}
      isPlaying={podPlaying}
      isLoading={podLoading}
      onToggle={() => void podToggle()}
      onNext={() => void podNext()}
      onTip={() => setTipOpen(true)}
      onOpen={openNowPlaying}
    />
  ) : track ? (
    <MiniBarChrome
      coverUri={track.coverArt || DEFAULT_COVER_ART}
      title={track.title || 'Untitled'}
      subtitle={formatArtist(track.artist)}
      isPlaying={musicPlaying}
      isLoading={musicLoading}
      onToggle={() => void musicToggle()}
      onNext={() => void musicNext()}
      onTip={() => setTipOpen(true)}
      onOpen={openNowPlaying}
    />
  ) : null;

  if (!chrome) return null;

  return (
    <>
      {chrome}
      {user ? (
        <TipSheet
          visible={tipOpen}
          title={tipTitle}
          subtitle={tipSubtitle}
          balancePence={user.balance ?? 0}
          defaultTipPounds={defaultTip}
          tipMedia={tipMedia}
          onClose={() => setTipOpen(false)}
          onConfirm={onConfirmTip}
        />
      ) : null}
    </>
  );
}

function MiniBarChrome({
  coverUri,
  title,
  subtitle,
  isPlaying,
  isLoading,
  onToggle,
  onNext,
  onTip,
  onOpen,
}: {
  coverUri: string;
  title: string;
  subtitle: string;
  isPlaying: boolean;
  isLoading: boolean;
  onToggle: () => void;
  onNext: () => void;
  onTip: () => void;
  onOpen?: () => void;
}) {
  return (
    <View style={styles.bar}>
      <Pressable
        style={styles.metaPress}
        onPress={onOpen}
        disabled={!onOpen}>
        <Image source={{ uri: coverUri }} style={styles.cover} />
        <View style={styles.meta}>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          <Text style={styles.artist} numberOfLines={1}>
            {subtitle}
          </Text>
        </View>
      </Pressable>
      <Pressable
        onPress={onTip}
        hitSlop={12}
        style={styles.iconBtn}
        accessibilityLabel="Send a tip">
        <Ionicons name="heart" size={22} color="#f472b6" />
      </Pressable>
      <Pressable onPress={onToggle} hitSlop={12} style={styles.iconBtn}>
        {isLoading ? (
          <ActivityIndicator color={colors.text} size="small" />
        ) : (
          <Ionicons
            name={isPlaying ? 'pause' : 'play'}
            size={26}
            color={colors.text}
          />
        )}
      </Pressable>
      <Pressable onPress={onNext} hitSlop={12} style={styles.iconBtn}>
        <Ionicons name="play-skip-forward" size={24} color={colors.text} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: 'rgba(26, 26, 46, 0.96)',
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
  },
  metaPress: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minWidth: 0,
  },
  cover: {
    width: 44,
    height: 44,
    borderRadius: 6,
    backgroundColor: colors.card,
  },
  meta: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  artist: {
    marginTop: 2,
    color: colors.textMuted,
    fontSize: 12,
  },
  iconBtn: {
    padding: 4,
  },
});
