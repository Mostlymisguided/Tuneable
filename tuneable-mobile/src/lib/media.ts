import type { ChartMediaItem, MediaSources, TimePeriodKey } from '@/src/types/media';

export function normalizeSources(sources: MediaSources): Record<string, string> {
  if (!sources) return {};

  if (Array.isArray(sources)) {
    const obj: Record<string, string> = {};
    for (const source of sources) {
      if (source?.platform && source.url) {
        obj[source.platform] = source.url;
      }
    }
    return obj;
  }

  if (typeof sources === 'object') {
    const obj: Record<string, string> = {};
    for (const [key, value] of Object.entries(sources)) {
      if (typeof value === 'string' && value) obj[key] = value;
    }
    return obj;
  }

  return {};
}

/** Direct upload / MP3 URL only — YouTube is catalog-only in mobile P0. */
export function getUploadUrl(media: ChartMediaItem | null | undefined): string | null {
  if (!media) return null;
  if (media.rightsStatus === 'disputed' || media.rightsStatus === 'pending') return null;
  if (media.rightsStatus !== 'permitted' && media.rightsCleared === false) return null;
  const sources = normalizeSources(media.sources);
  const url = sources.upload || sources.audio_direct || sources.audio || null;
  return url || null;
}

export function isWrittenMedia(
  media: { contentForm?: string[]; contentType?: string[] } | null | undefined
): boolean {
  if (!media) return false;
  if (media.contentType?.includes('written')) return true;
  return (media.contentForm || []).some((form) => form === 'book' || form === 'article');
}

export function isUploadPlayable(media: ChartMediaItem | null | undefined): boolean {
  if (!media) return false;
  if (isWrittenMedia(media)) return false;
  // API may strip stream URLs for guests while still marking the track playable.
  if (media.isPlayable === true) return true;
  if (media.isPlayable === false) return false;
  if (media.rightsStatus === 'disputed' || media.rightsStatus === 'pending') {
    return false;
  }
  const sources = normalizeSources(media.sources);
  const hasAudio = Boolean(
    sources.upload || sources.audio_direct || sources.audio || sources.enclosure
  );
  if (media.rightsStatus === 'permitted') return hasAudio;
  // Match web: a remaining hosted URL is enough unless rights were explicitly denied.
  return hasAudio && media.rightsCleared !== false;
}

export function isRightsPendingClaimable(
  media: ChartMediaItem | null | undefined
): boolean {
  if (!media) return false;
  return media.rightsStatus === 'pending' || media.rightsStatus === 'permitted'
    ? !media.rightsCleared
    : false;
}

/** Why a track cannot play on mobile (null when playable). */
export function getPlayabilityBlockReason(
  media: ChartMediaItem | null | undefined
): 'rights' | 'audio' | 'disputed' | null {
  if (!media || isUploadPlayable(media)) return null;
  if (media.rightsStatus === 'disputed') return 'disputed';
  if (media.rightsStatus === 'pending') return 'rights';
  if (media.hasHostedAudio && media.rightsCleared === false) return 'rights';
  return 'audio';
}

export type CoverOverlayKind =
  | 'play'
  | 'play_permitted'
  | 'pending'
  | 'disputed'
  | 'audio';

export function getCoverOverlayKind(
  media: ChartMediaItem | null | undefined
): CoverOverlayKind {
  if (isUploadPlayable(media)) {
    return media?.rightsStatus === 'permitted' ? 'play_permitted' : 'play';
  }
  if (media?.rightsStatus === 'disputed') return 'disputed';
  if (media?.rightsStatus === 'pending') return 'pending';
  return 'audio';
}

export function getBlockedCoverCopy(kind: CoverOverlayKind): {
  title: string;
  hint: string;
  showClaim: boolean;
} | null {
  if (kind === 'play' || kind === 'play_permitted') return null;
  if (kind === 'disputed') {
    return {
      title: 'Rights disputed',
      hint: 'Playback is paused while ownership is resolved',
      showClaim: false,
    };
  }
  if (kind === 'pending') {
    return {
      title: 'Awaiting Rights',
      hint: 'Claim ownership to receive tips held in escrow',
      showClaim: true,
    };
  }
  return {
    title: 'Awaiting audio',
    hint: 'This tune does not have audio on Tuneable yet',
    showClaim: true,
  };
}

export function mediaId(media: ChartMediaItem): string {
  return media.id || media._id || media.uuid || '';
}

const PLACEHOLDER_CREATOR = /^unknown(\s+(artist|author|podcast))?$/i;

function isPlaceholderCreatorLabel(value?: string | null): boolean {
  if (!value) return true;
  return PLACEHOLDER_CREATOR.test(value.trim());
}

function namesFromCreators(creators: unknown): string[] {
  if (!creators) return [];
  if (typeof creators === 'string') {
    const name = creators.trim();
    return name && !isPlaceholderCreatorLabel(name) ? [name] : [];
  }
  if (!Array.isArray(creators)) return [];
  return creators
    .map((entry) => (typeof entry === 'string' ? entry : (entry as { name?: string })?.name))
    .map((name) => (typeof name === 'string' ? name.trim() : ''))
    .filter((name) => name && !isPlaceholderCreatorLabel(name));
}

export function formatArtist(
  artist: ChartMediaItem['artist'] | undefined
): string {
  if (!artist) return 'Unknown artist';
  if (typeof artist === 'string') {
    return isPlaceholderCreatorLabel(artist) ? 'Unknown artist' : artist;
  }
  if (Array.isArray(artist)) {
    const names = namesFromCreators(artist);
    return names.length ? names.join(', ') : 'Unknown artist';
  }
  return 'Unknown artist';
}

function seriesTitleFromMedia(media: ChartMediaItem): string {
  const series = media.podcastSeries;
  if (series && typeof series === 'object' && series.title?.trim()) {
    return series.title.trim();
  }
  if (media.podcastTitle?.trim()) return media.podcastTitle.trim();
  return '';
}

function isPodcastEpisode(media: ChartMediaItem): boolean {
  return (media.contentForm || []).some((form) =>
    ['podcastepisode', 'episode', 'podcast'].includes(form)
  );
}

/** Subtitle for mixed lists: artist, show title, or author. */
export function getCreatorDisplay(
  media: ChartMediaItem | null | undefined
): string {
  if (!media) return 'Unknown artist';
  if (!isPlaceholderCreatorLabel(media.creatorDisplay)) {
    return media.creatorDisplay!.trim();
  }

  const fromArtist = formatArtist(media.artist);
  if (!isPlaceholderCreatorLabel(fromArtist)) return fromArtist;

  if (isPodcastEpisode(media)) {
    const showTitle = seriesTitleFromMedia(media);
    if (showTitle) return showTitle;
  }

  const hosts = namesFromCreators(media.host);
  if (hosts.length) return hosts.join(', ');

  const authors = namesFromCreators(media.author);
  if (authors.length) return authors.join(', ');

  return 'Unknown artist';
}

export type CreatorLinkPart = {
  text: string;
  /** Profile route when this name can be opened. Separators stay null. */
  href: string | null;
};

type CreatorCredit = {
  name: string;
  userId?: unknown;
  collectiveId?: unknown;
  relationToNext?: string | null;
};

const OBJECT_ID = /^[a-f\d]{24}$/i;

function creatorCredits(value: unknown): CreatorCredit[] {
  if (!Array.isArray(value)) return [];
  const credits: CreatorCredit[] = [];
  for (const entry of value) {
    if (!entry) continue;
    if (typeof entry === 'string') {
      const name = entry.trim();
      if (name && !isPlaceholderCreatorLabel(name)) credits.push({ name });
      continue;
    }
    if (typeof entry !== 'object') continue;
    const record = entry as {
      name?: string;
      userId?: unknown;
      collectiveId?: unknown;
      relationToNext?: string | null;
    };
    const name = record.name?.trim() || '';
    if (!name || isPlaceholderCreatorLabel(name)) continue;
    credits.push({
      name,
      userId: record.userId,
      collectiveId: record.collectiveId,
      relationToNext: record.relationToNext,
    });
  }
  return credits;
}

function userProfileHref(userId: unknown): string | null {
  if (!userId) return null;
  if (typeof userId === 'string') {
    const id = userId.trim();
    return id ? `/user/${encodeURIComponent(id)}` : null;
  }
  if (typeof userId === 'object') {
    const user = userId as {
      username?: string;
      uuid?: string;
      _id?: string;
      id?: string;
    };
    const id = user.username || user.uuid || user._id || user.id;
    return id ? `/user/${encodeURIComponent(String(id))}` : null;
  }
  return null;
}

function collectiveProfileHref(collectiveId: unknown): string | null {
  if (!collectiveId) return null;
  if (typeof collectiveId === 'string') {
    const id = collectiveId.trim();
    if (!id || OBJECT_ID.test(id)) return null;
    return `/collective/${encodeURIComponent(id)}`;
  }
  if (typeof collectiveId === 'object') {
    const slug = (collectiveId as { slug?: string }).slug?.trim();
    return slug ? `/collective/${encodeURIComponent(slug)}` : null;
  }
  return null;
}

function creditHref(credit: CreatorCredit): string | null {
  return userProfileHref(credit.userId) || collectiveProfileHref(credit.collectiveId);
}

function relationBetween(relation?: string | null): string {
  if (!relation || relation === '&') return ' & ';
  if (relation === ',') return ', ';
  return ` ${relation.trim()} `;
}

/**
 * Artist / host / author names with a profile route when one exists.
 * Returns null when nothing in the line can be opened, so callers keep the plain label.
 */
export function creatorLinkParts(
  media: ChartMediaItem | null | undefined
): CreatorLinkPart[] | null {
  if (!media) return null;

  const fromArtists = creatorCredits(media.artists);
  let primary = fromArtists.length ? fromArtists : creatorCredits(media.artist);
  let extra = creatorCredits(media.featuring);
  if (!primary.length) {
    primary = creatorCredits(media.host);
    extra = [];
  }
  if (!primary.length) {
    primary = creatorCredits(media.author);
    extra = [];
  }
  if (!primary.length) return null;

  const parts: CreatorLinkPart[] = [];
  primary.forEach((credit, index) => {
    parts.push({ text: credit.name, href: creditHref(credit) });
    if (index < primary.length - 1) {
      parts.push({ text: relationBetween(credit.relationToNext), href: null });
    }
  });
  if (extra.length) {
    parts.push({ text: ' ft. ', href: null });
    extra.forEach((credit, index) => {
      parts.push({ text: credit.name, href: creditHref(credit) });
      if (index < extra.length - 1) parts.push({ text: ', ', href: null });
    });
  }

  return parts.some((part) => part.href) ? parts : null;
}

/** Tip value shown/sorted for chart rows — period tips when not all-time. */
export function getChartTipPence(
  item: ChartMediaItem,
  period: TimePeriodKey
): number {
  if (period !== 'all-time' && typeof item.timePeriodBidValue === 'number') {
    return item.timePeriodBidValue;
  }
  return item.partyMediaAggregate ?? 0;
}
