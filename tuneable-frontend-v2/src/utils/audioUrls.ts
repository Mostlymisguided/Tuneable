/** Resolve uploaded media paths to full HTTPS URLs for playback. */
export function resolveUploadAudioUrl(audioUrl: string): string {
  if (audioUrl.startsWith('http')) {
    return audioUrl;
  }
  if (audioUrl.startsWith('/uploads/media-uploads/')) {
    const r2Key = audioUrl.replace('/uploads/', '');
    return `https://uploads.tuneable.stream/${r2Key}`;
  }
  if (audioUrl.startsWith('/uploads/')) {
    return `https://uploads.tuneable.stream${audioUrl}`;
  }
  if (typeof window !== 'undefined') {
    return `${window.location.origin}${audioUrl}`;
  }
  return audioUrl;
}
