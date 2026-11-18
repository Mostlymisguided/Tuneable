import { useState, type CSSProperties, type MouseEventHandler } from 'react';
import { hasCustomProfilePic } from '../constants';
import { ANONYMOUS_AVATAR_COLOR, avatarColor, avatarLetter } from '../utils/avatar';

type UserAvatarProps = {
  username?: string | null;
  /** Organisation name. Used for the initial when this is not a person. */
  name?: string | null;
  profilePic?: string | null;
  alt?: string;
  className?: string;
  style?: CSSProperties;
  title?: string;
  onClick?: MouseEventHandler<HTMLElement>;
  /** Blocked or otherwise unnamed. A plain circle, with no initial. */
  anonymous?: boolean;
  /** Match an existing rounded-square frame. People stay circles. */
  shape?: 'circle' | 'rounded';
};

/**
 * A photo, or a coloured shape with the first letter of the name when none
 * is set (including the stored Tuneable logo default).
 */
export default function UserAvatar({
  username,
  name,
  profilePic,
  alt,
  className = '',
  style,
  title,
  onClick,
  anonymous = false,
  shape = 'circle',
}: UserAvatarProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const showPhoto =
    !anonymous && hasCustomProfilePic(profilePic) && failedSrc !== profilePic;
  const displayName = name || username;
  const label = alt ?? (displayName ? `${displayName} profile` : 'Profile');
  const decorative = alt === '';
  const radius = shape === 'rounded' ? 'rounded-lg' : 'rounded-full';

  if (showPhoto && profilePic) {
    return (
      <img
        src={profilePic}
        alt={decorative ? '' : label}
        title={title}
        className={`${radius} object-cover ${className}`}
        style={style}
        onClick={onClick}
        onError={() => setFailedSrc(profilePic)}
      />
    );
  }

  const letter = anonymous ? '' : avatarLetter(displayName);
  return (
    <span
      role={decorative ? undefined : 'img'}
      aria-hidden={decorative ? true : undefined}
      aria-label={decorative ? undefined : anonymous ? 'Anonymous' : label}
      title={title}
      onClick={onClick}
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden select-none ${radius} ${className}`}
      style={{
        ...style,
        backgroundColor: anonymous ? ANONYMOUS_AVATAR_COLOR : avatarColor(displayName),
      }}
    >
      {letter ? (
        <svg viewBox="0 0 100 100" className="h-full w-full" aria-hidden="true">
          <text
            x="50"
            y="50"
            textAnchor="middle"
            dominantBaseline="central"
            fill="#ffffff"
            fontSize="46"
            fontWeight="600"
            fontFamily="inherit"
          >
            {letter}
          </text>
        </svg>
      ) : null}
    </span>
  );
}
