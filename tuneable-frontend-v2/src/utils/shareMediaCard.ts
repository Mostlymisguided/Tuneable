import { toast } from 'react-toastify';
import { getApiBaseUrl } from './platform';

export type StoryCardFormat = 'story' | 'og';

export function getStoryCardUrl(mediaId: string, format: StoryCardFormat = 'story'): string {
  const apiBase = getApiBaseUrl().replace(/\/$/, '');
  return `${apiBase}/media/story-card/${encodeURIComponent(mediaId)}?format=${format}`;
}

function isAbortError(err: unknown): boolean {
  return Boolean(err && typeof err === 'object' && 'name' in err && (err as { name?: string }).name === 'AbortError');
}

async function fetchStoryCardFile(mediaId: string, format: StoryCardFormat = 'story'): Promise<File> {
  const response = await fetch(getStoryCardUrl(mediaId, format));
  if (!response.ok) {
    throw new Error(`Story card failed (${response.status})`);
  }
  const blob = await response.blob();
  const name =
    response.headers.get('Content-Disposition')?.match(/filename="([^"]+)"/)?.[1] ||
    `tuneable-${format}.png`;
  return new File([blob], name, { type: 'image/png' });
}

function triggerDownload(file: File) {
  const objectUrl = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = file.name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1500);
}

async function copyShareCaption(text: string, url: string) {
  const caption = `${text}\n\n${url}`;
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(caption);
    return;
  }
  const textarea = document.createElement('textarea');
  textarea.value = caption;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  textarea.remove();
}

function canShareFiles(file: File): boolean {
  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
  if (typeof nav.share !== 'function' || typeof nav.canShare !== 'function') return false;
  try {
    return nav.canShare({ files: [file] });
  } catch {
    return false;
  }
}

export async function downloadStoryCard(mediaId: string, format: StoryCardFormat = 'story'): Promise<void> {
  const file = await fetchStoryCardFile(mediaId, format);
  triggerDownload(file);
}

type ShareStoryOptions = {
  mediaId: string;
  title: string;
  text: string;
  url: string;
  /** Instagram: prefer download + copy caption so the user can paste into a Story. */
  platform?: 'native' | 'instagram' | 'download';
};

export async function shareStoryCard(options: ShareStoryOptions): Promise<'shared' | 'downloaded' | 'copied' | 'cancelled'> {
  const { mediaId, title, text, url, platform = 'native' } = options;
  const file = await fetchStoryCardFile(mediaId, 'story');

  if (platform === 'download') {
    triggerDownload(file);
    return 'downloaded';
  }

  await copyShareCaption(text, url).catch(() => undefined);

  if (platform === 'instagram') {
    if (canShareFiles(file) && navigator.share) {
      try {
        await navigator.share({ files: [file], title, text: `${text}\n${url}` });
        return 'shared';
      } catch (err) {
        if (isAbortError(err)) return 'cancelled';
      }
    }
    triggerDownload(file);
    return 'downloaded';
  }

  if (canShareFiles(file) && navigator.share) {
    try {
      await navigator.share({ files: [file], title, text: `${text}\n${url}` });
      return 'shared';
    } catch (err) {
      if (isAbortError(err)) return 'cancelled';
    }
  }

  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ title, text, url });
      triggerDownload(file);
      return 'shared';
    } catch (err) {
      if (isAbortError(err)) return 'cancelled';
    }
  }

  triggerDownload(file);
  return 'downloaded';
}

export async function shareStoryCardWithToast(options: ShareStoryOptions): Promise<void> {
  const preparing = toast.info('Preparing your Tuneable story card…', { autoClose: 2500 });
  try {
    const result = await shareStoryCard(options);
    toast.dismiss(preparing);
    if (result === 'cancelled') return;
    if (result === 'shared') {
      toast.success('Story card ready — pick Instagram Stories, WhatsApp, or Messages.');
      return;
    }
    if (options.platform === 'instagram') {
      toast.success('Story image downloaded and caption copied. Add it to your Instagram Story.');
      return;
    }
    toast.success('Story image downloaded and caption copied.');
  } catch (err) {
    toast.dismiss(preparing);
    console.error('Story card share failed:', err);
    toast.error('Could not create the story card. Copying the link instead.');
    try {
      await copyShareCaption(options.text, options.url);
    } catch {
      // ignore
    }
  }
}
