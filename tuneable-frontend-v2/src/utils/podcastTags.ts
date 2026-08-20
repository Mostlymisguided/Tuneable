import { generateTagSlug, getCanonicalTag, tagsMatch } from './tagNormalizer';

export type PodcastTagSource = {
  tags?: string[];
  genres?: string[];
  category?: string;
  podcastSeries?: {
    genres?: string[];
    tags?: string[];
  } | string | null;
};

function asStringLabels(values: unknown[] | undefined): string[] {
  if (!Array.isArray(values)) return [];
  return values.filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
}

export function getEpisodeDisplayTags(episode: PodcastTagSource): string[] {
  const series =
    episode.podcastSeries && typeof episode.podcastSeries === 'object'
      ? episode.podcastSeries
      : undefined;
  const candidates = [
    ...asStringLabels(episode.genres),
    ...asStringLabels(series?.genres),
    ...(episode.category ? [episode.category] : []),
    ...asStringLabels(episode.tags),
    ...asStringLabels(series?.tags),
  ];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of candidates) {
    const tag = raw.trim();
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
  }
  return out;
}

export function episodeMatchesTag(episode: PodcastTagSource, tagName: string): boolean {
  if (!tagName) return false;
  return getEpisodeDisplayTags(episode).some((tag) => tagsMatch(tag, tagName));
}

export function relatedPodcastTags(
  episodes: Array<PodcastTagSource & { globalMediaAggregate?: number }>,
  currentTag: string,
  limit = 8
): Array<{ name: string; slug: string }> {
  const byKey = new Map<string, { name: string; total: number; count: number }>();

  for (const episode of episodes) {
    const value =
      typeof episode.globalMediaAggregate === 'number' ? episode.globalMediaAggregate : 0;
    const seen = new Set<string>();
    for (const raw of getEpisodeDisplayTags(episode)) {
      if (!raw || tagsMatch(raw, currentTag)) continue;
      const key = getCanonicalTag(raw) || raw.toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      const existing = byKey.get(key);
      if (existing) {
        existing.total += value;
        existing.count += 1;
      } else {
        byKey.set(key, { name: raw, total: value, count: 1 });
      }
    }
  }

  return [...byKey.values()]
    .sort((a, b) => b.total - a.total || b.count - a.count)
    .slice(0, limit)
    .map(({ name }) => ({
      name,
      slug: generateTagSlug(name),
    }))
    .filter((tag) => tag.slug);
}
