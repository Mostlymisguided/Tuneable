import type { MediaSources } from '@/src/types/media';
import { normalizeSources } from '@/src/lib/media';
import { getCanonicalTag } from '@/src/lib/tagNormalizer';
import type { TopTagEntry } from '@/src/lib/chartFilters';
import { getSelectedTagFilters } from '@/src/lib/chartFilters';
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

/** Map a media profile payload into a PodcastEpisode for the player / rails. */
export function mediaToPodcastEpisode(
  media: {
    id?: string;
    _id?: string;
    uuid?: string;
    title?: string;
    description?: string | null;
    coverArt?: string;
    duration?: number;
    globalMediaAggregate?: number;
    releaseDate?: string | null;
    podcastSeries?:
      | string
      | {
          _id?: string;
          title?: string;
          coverArt?: string;
          genres?: string[];
          tags?: string[];
        }
      | null;
    podcastTitle?: string;
    genres?: string[];
    tags?: string[];
    category?: string;
    sources?: MediaSources;
    audioUrl?: string;
    enclosure?: { url?: string; type?: string };
    bids?: PodcastEpisode['bids'];
  }
): PodcastEpisode {
  const series =
    media.podcastSeries && typeof media.podcastSeries === 'object'
      ? media.podcastSeries
      : undefined;

  return {
    id: media.id,
    _id: media._id,
    uuid: media.uuid,
    title: media.title,
    description: media.description ?? undefined,
    coverArt: media.coverArt,
    duration: media.duration,
    globalMediaAggregate: media.globalMediaAggregate,
    releaseDate: media.releaseDate ?? undefined,
    podcastSeries: series,
    podcastTitle: media.podcastTitle || series?.title,
    genres: media.genres,
    tags: media.tags,
    category: media.category,
    sources: media.sources as PodcastEpisode['sources'],
    audioUrl: media.audioUrl,
    enclosure: media.enclosure,
    bids: media.bids,
  };
}

/** Category/genre tags first, then tip tags — deduped. */
export function getEpisodeDisplayTags(episode: PodcastEpisode): string[] {
  const candidates = [
    ...(episode.genres ?? []),
    ...(episode.podcastSeries?.genres ?? []),
    ...(episode.category ? [episode.category] : []),
    ...(episode.tags ?? []),
    ...(episode.podcastSeries?.tags ?? []),
  ];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of candidates) {
    const tag = typeof raw === 'string' ? raw.trim() : '';
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
  }
  return out;
}

export function computePodcastTopTags(
  episodes: PodcastEpisode[],
  limit = 30
): TopTagEntry[] {
  const counts: Record<string, { total: number; count: number }> = {};

  for (const episode of episodes) {
    const tags = getEpisodeDisplayTags(episode);
    const value =
      typeof episode.globalMediaAggregate === 'number'
        ? episode.globalMediaAggregate
        : 0;

    for (const raw of tags) {
      const t = raw.trim().toLowerCase();
      if (!t) continue;
      if (!counts[t]) counts[t] = { total: 0, count: 0 };
      counts[t].total += value;
      counts[t].count += 1;
    }
  }

  return Object.entries(counts)
    .map(([tag, v]) => ({ tag, total: v.total, count: v.count }))
    .sort((a, b) => b.total - a.total || b.count - a.count)
    .slice(0, limit);
}

export function filterPodcastEpisodes(
  episodes: PodcastEpisode[],
  filters: { selectedTagTerms: string[]; searchQuery: string }
): PodcastEpisode[] {
  const { selectedTagTerms, searchQuery } = filters;
  const liveTerm = searchQuery.trim();
  const allTerms = liveTerm ? [...selectedTagTerms, liveTerm] : selectedTagTerms;

  if (allTerms.length === 0) return episodes;

  return episodes.filter((episode) => {
    const regularTerms = allTerms.filter((term) => !term.startsWith('#'));
    const tagTerms = allTerms
      .filter((term) => term.startsWith('#'))
      .map((term) => term.slice(1));

    const matchesRegularSearch =
      regularTerms.length === 0 ||
      regularTerms.some((term) => {
        const lowerTerm = term.toLowerCase();
        const title = (episode.title || '').toLowerCase();
        const series = seriesTitle(episode).toLowerCase();
        const category = (episode.category || '').toLowerCase();
        const tagHaystack = getEpisodeDisplayTags(episode).join(' ').toLowerCase();
        return (
          title.includes(lowerTerm) ||
          series.includes(lowerTerm) ||
          category.includes(lowerTerm) ||
          tagHaystack.includes(lowerTerm)
        );
      });

    const tags = getEpisodeDisplayTags(episode)
      .map((tag) => (tag ? getCanonicalTag(tag) : ''))
      .filter(Boolean);

    const matchesTagSearch =
      tagTerms.length === 0 ||
      tagTerms.some((tagTerm) => {
        const canonicalSearchTag = getCanonicalTag(tagTerm);
        return tags.some((tag) => tag === canonicalSearchTag);
      });

    return matchesRegularSearch && matchesTagSearch;
  });
}

export function hasActivePodcastFilters(filters: {
  selectedTagTerms: string[];
  searchQuery: string;
}): boolean {
  return (
    getSelectedTagFilters(filters.selectedTagTerms).length > 0 ||
    filters.searchQuery.trim().length > 0
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
