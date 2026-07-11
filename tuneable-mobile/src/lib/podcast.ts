import type { MediaSources } from '@/src/types/media';
import { normalizeSources } from '@/src/lib/media';
import type { PodcastEpisode } from '@/src/types/podcast';

export function episodeId(episode: PodcastEpisode): string {
  return episode.id || episode._id || episode.uuid || '';
}

export function seriesTitle(episode: PodcastEpisode): string {
  return (
    episode.podcastSeries?.title ||
    episode.podcastTitle ||
    'Podcast'
  );
}

/** Match web getEpisodeAudioUrl. */
export function getEpisodeAudioUrl(
  episode: PodcastEpisode | null | undefined
): string | null {
  if (!episode) return null;
  if (episode.audioUrl) return episode.audioUrl;
  if (episode.enclosure?.url) return episode.enclosure.url;
  const sources = normalizeSources(episode.sources as MediaSources);
  return sources.audio_direct || sources.audio || sources.enclosure || null;
}

export function isEpisodePlayable(
  episode: PodcastEpisode | null | undefined
): boolean {
  return Boolean(getEpisodeAudioUrl(episode));
}
