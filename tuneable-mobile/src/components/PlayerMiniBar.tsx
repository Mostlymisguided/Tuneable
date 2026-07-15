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
import { colors } from '@/src/theme/colors';
import { DEFAULT_COVER_ART } from '@/src/types/media';
import { DEFAULT_PODCAST_COVER } from '@/src/types/podcast';
import { formatArtist, mediaId } from '@/src/lib/media';
import { seriesTitle } from '@/src/lib/podcast';
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

  if (episode) {
    return (
      <MiniBarChrome
        coverUri={episode.coverArt || episode.podcastSeries?.coverArt || DEFAULT_PODCAST_COVER}
        title={episode.title || 'Episode'}
        subtitle={seriesTitle(episode)}
        isPlaying={podPlaying}
        isLoading={podLoading}
        onToggle={() => void podToggle()}
        onNext={() => void podNext()}
      />
    );
  }

  if (track) {
    const id = mediaId(track);
    return (
      <MiniBarChrome
        coverUri={track.coverArt || DEFAULT_COVER_ART}
        title={track.title || 'Untitled'}
        subtitle={formatArtist(track.artist)}
        isPlaying={musicPlaying}
        isLoading={musicLoading}
        onToggle={() => void musicToggle()}
        onNext={() => void musicNext()}
        onOpen={id ? () => router.push(`/tune/${id}`) : undefined}
      />
    );
  }

  return null;
}

function MiniBarChrome({
  coverUri,
  title,
  subtitle,
  isPlaying,
  isLoading,
  onToggle,
  onNext,
  onOpen,
}: {
  coverUri: string;
  title: string;
  subtitle: string;
  isPlaying: boolean;
  isLoading: boolean;
  onToggle: () => void;
  onNext: () => void;
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
