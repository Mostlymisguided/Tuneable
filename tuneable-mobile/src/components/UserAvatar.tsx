import { useState } from 'react';
import { Image, StyleSheet, Text, View, type ImageStyle, type StyleProp, type ViewStyle } from 'react-native';
import { ANONYMOUS_AVATAR_COLOR, avatarColor, avatarLetter } from '@/src/lib/avatar';
import { hasCustomProfilePic } from '@/src/types/user';

type UserAvatarProps = {
  username?: string | null;
  /** Organisation name. Used for the initial when this is not a person. */
  name?: string | null;
  profilePic?: string | null;
  style?: StyleProp<ViewStyle>;
  /** Blocked or otherwise unnamed. A plain circle, with no initial. */
  anonymous?: boolean;
};

/**
 * A photo, or a coloured circle with the first letter of the name when none
 * is set (including the stored Tuneable logo default).
 */
export function UserAvatar({
  username,
  name,
  profilePic,
  style,
  anonymous = false,
}: UserAvatarProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const displayName = name || username;
  const showPhoto =
    !anonymous && hasCustomProfilePic(profilePic) && failedSrc !== profilePic;

  if (showPhoto && profilePic) {
    return (
      <Image
        source={{ uri: profilePic }}
        style={style as StyleProp<ImageStyle>}
        onError={() => setFailedSrc(profilePic)}
        accessibilityIgnoresInvertColors
      />
    );
  }

  const flat = StyleSheet.flatten(style) || {};
  const width = typeof flat.width === 'number' ? flat.width : 40;
  const height = typeof flat.height === 'number' ? flat.height : width;
  const letter = anonymous ? '' : avatarLetter(displayName);

  return (
    <View
      style={[
        style,
        {
          backgroundColor: anonymous ? ANONYMOUS_AVATAR_COLOR : avatarColor(displayName),
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        },
      ]}
      accessibilityRole="image"
      accessibilityLabel={anonymous ? 'Anonymous' : displayName || 'Profile'}>
      {letter ? (
        <Text
          style={{
            color: '#fff',
            fontWeight: '600',
            fontSize: Math.max(8, Math.round(Math.min(width, height) * 0.46)),
          }}>
          {letter}
        </Text>
      ) : null}
    </View>
  );
}
