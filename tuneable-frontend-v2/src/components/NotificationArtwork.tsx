import { useState } from 'react';
import { Bell, Sparkles } from 'lucide-react';
import UserAvatar from './UserAvatar';
import {
  notificationArtwork,
  notificationSparkles,
  type NotificationVisualSource,
} from '../utils/notificationVisual';

type NotificationArtworkProps = {
  notification: NotificationVisualSource;
  size?: 'sm' | 'md';
  unread?: boolean;
};

export default function NotificationArtwork({
  notification,
  size = 'md',
  unread = false,
}: NotificationArtworkProps) {
  const art = notificationArtwork(notification);
  const sparkle = notificationSparkles(notification.type);
  const [coverFailed, setCoverFailed] = useState(false);
  const box = size === 'sm' ? 'h-10 w-10' : 'h-11 w-11';
  const ring = unread ? 'ring-2 ring-purple-400' : 'ring-1 ring-white/10';
  const showCover = art?.kind === 'cover' && !coverFailed;

  return (
    <div className={`relative flex-shrink-0 ${box}`}>
      {showCover ? (
        <img
          src={art.src}
          alt=""
          className={`${box} rounded-lg object-cover bg-gray-800 ${ring}`}
          onError={() => setCoverFailed(true)}
        />
      ) : art?.kind === 'profile' ? (
        <UserAvatar
          profilePic={art.src}
          username={art.label}
          name={art.label}
          alt=""
          className={`${box} ${ring}`}
        />
      ) : (
        <div
          className={`${box} rounded-lg flex items-center justify-center ${ring} ${
            sparkle
              ? 'bg-gradient-to-br from-fuchsia-500/40 via-purple-600/35 to-amber-300/25'
              : 'bg-gray-800'
          }`}
          aria-hidden="true"
        >
          {sparkle ? (
            <Sparkles className="h-4 w-4 text-amber-200" />
          ) : (
            <Bell className="h-4 w-4 text-gray-400" />
          )}
        </div>
      )}
      {sparkle && (showCover || art?.kind === 'profile') && (
        <>
          <span
            className="pointer-events-none absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-gray-950 text-[10px] leading-none ring-1 ring-amber-200/80"
            aria-hidden="true"
          >
            ✨
          </span>
          <span
            className="pointer-events-none absolute -bottom-1 -left-1 text-[9px] leading-none text-amber-200 drop-shadow"
            aria-hidden="true"
          >
            ✦
          </span>
        </>
      )}
    </div>
  );
}
