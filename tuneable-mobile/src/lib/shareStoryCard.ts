import { Share } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { API_ORIGIN } from '@/src/api/client';

export type StoryCardFormat = 'story' | 'og';

export function getStoryCardUrl(
  mediaId: string,
  format: StoryCardFormat = 'story'
): string {
  return `${API_ORIGIN}/api/media/story-card/${encodeURIComponent(mediaId)}?format=${format}`;
}

export function buildStoryShareCaption(options: {
  title: string;
  artist?: string;
  url: string;
}): string {
  const who = options.artist ? `${options.title} — ${options.artist}` : options.title;
  return `${who}\n${options.url}`;
}

export async function shareStoryCard(options: {
  mediaId: string;
  title: string;
  artist?: string;
  url: string;
}): Promise<void> {
  const caption = buildStoryShareCaption(options);
  await Clipboard.setStringAsync(caption).catch(() => undefined);

  const remoteUrl = getStoryCardUrl(options.mediaId, 'story');
  const dest = new File(Paths.cache, `tuneable-story-${options.mediaId}.png`);
  try {
    if (dest.exists) dest.delete();
  } catch {
    // ignore stale cache file
  }

  const downloaded = await File.downloadFileAsync(remoteUrl, dest);
  const canShareFile = await Sharing.isAvailableAsync();
  if (canShareFile) {
    try {
      await Sharing.shareAsync(downloaded.uri, {
        mimeType: 'image/png',
        UTI: 'public.png',
        dialogTitle: 'Share on Tuneable',
      });
    } catch {
      // User dismissed the sheet, or the target app declined.
    }
    return;
  }

  await Share.share({
    message: caption,
    url: options.url,
  });
}
