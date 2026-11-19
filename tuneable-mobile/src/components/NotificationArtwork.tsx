import { useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { UserAvatar } from '@/src/components/UserAvatar';
import {
  notificationArtwork,
  notificationSparkles,
  type NotificationVisualSource,
} from '@/src/lib/notificationArtwork';
import { colors } from '@/src/theme/colors';

const SIZE = 44;

type NotificationArtworkProps = {
  notification: NotificationVisualSource;
  unread?: boolean;
};

export function NotificationArtworkView({ notification, unread = false }: NotificationArtworkProps) {
  const art = notificationArtwork(notification);
  const sparkle = notificationSparkles(notification.type);
  const [coverFailed, setCoverFailed] = useState(false);
  const showCover = art?.kind === 'cover' && !coverFailed;
  const frame = unread ? styles.frameUnread : styles.frame;

  return (
    <View style={styles.wrap} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {showCover ? (
        <Image
          source={{ uri: art.src }}
          style={[styles.cover, frame]}
          onError={() => setCoverFailed(true)}
          accessibilityIgnoresInvertColors
        />
      ) : art?.kind === 'profile' ? (
        <UserAvatar
          profilePic={art.src}
          username={art.label}
          name={art.label}
          style={[styles.avatar, frame]}
        />
      ) : (
        <View style={[styles.fallback, frame, sparkle && styles.fallbackSparkle]}>
          {sparkle ? (
            <Text style={styles.fallbackStar}>✨</Text>
          ) : (
            <Ionicons name="notifications-outline" size={18} color={colors.textMuted} />
          )}
        </View>
      )}
      {sparkle && (showCover || art?.kind === 'profile') ? (
        <>
          <View style={styles.starBadge}>
            <Text style={styles.star}>✨</Text>
          </View>
          <Text style={styles.starSmall}>✦</Text>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: SIZE,
    height: SIZE,
  },
  cover: {
    width: SIZE,
    height: SIZE,
    borderRadius: 10,
    backgroundColor: 'rgba(31, 41, 55, 0.9)',
  },
  avatar: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
  },
  fallback: {
    width: SIZE,
    height: SIZE,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(31, 41, 55, 0.9)',
  },
  fallbackSparkle: {
    backgroundColor: 'rgba(147, 51, 234, 0.45)',
  },
  fallbackStar: {
    fontSize: 18,
    lineHeight: 22,
  },
  frame: {
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.14)',
  },
  frameUnread: {
    borderWidth: 2,
    borderColor: colors.accentLight,
  },
  starBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0b1020',
    borderWidth: 1,
    borderColor: 'rgba(253, 230, 138, 0.85)',
  },
  star: {
    fontSize: 9,
    lineHeight: 12,
  },
  starSmall: {
    position: 'absolute',
    left: -2,
    bottom: -3,
    fontSize: 9,
    lineHeight: 11,
    color: '#fde68a',
  },
});
