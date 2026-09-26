/**
 * Utility function to get creator display string
 * Music uses artist/featuring; podcast episodes prefer the show title;
 * books use author. Treats "Unknown Artist" as missing so those fallbacks run.
 */

const PLACEHOLDER_CREATOR = /^unknown(\s+(artist|author|podcast))?$/i;

function isPlaceholderCreatorLabel(value: unknown): boolean {
  if (value == null) return true;
  const text = String(value).trim();
  if (!text) return true;
  return PLACEHOLDER_CREATOR.test(text);
}

function namesFromCreators(creators: unknown): string[] {
  if (!creators) return [];
  if (typeof creators === 'string') {
    const name = creators.trim();
    return name && !isPlaceholderCreatorLabel(name) ? [name] : [];
  }
  if (!Array.isArray(creators)) return [];
  return creators
    .map((creator: any) => (typeof creator === 'string' ? creator : creator?.name))
    .map((name: unknown) => (typeof name === 'string' ? name.trim() : ''))
    .filter((name: string) => name && !isPlaceholderCreatorLabel(name));
}

function seriesTitleFromMedia(media: any): string {
  const series = media?.podcastSeries;
  if (series && typeof series === 'object' && typeof series.title === 'string' && series.title.trim()) {
    return series.title.trim();
  }
  if (typeof media?.podcastTitle === 'string' && media.podcastTitle.trim()) {
    return media.podcastTitle.trim();
  }
  return '';
}

function isPodcastEpisode(media: any): boolean {
  const forms = Array.isArray(media?.contentForm) ? media.contentForm : [];
  return forms.some((form: string) =>
    ['podcastepisode', 'episode', 'podcast'].includes(form)
  );
}

export function getCreatorDisplay(media: any): string {
  if (!media) {
    return 'Unknown Artist';
  }

  if (!isPlaceholderCreatorLabel(media.creatorDisplay)) {
    return String(media.creatorDisplay).trim();
  }

  const artistEntries: Array<{ name: string; relationToNext?: string | null }> = [];

  if (Array.isArray(media.artist)) {
    media.artist.forEach((artist: any) => {
      if (!artist) return;
      if (typeof artist === 'string') {
        if (!isPlaceholderCreatorLabel(artist)) {
          artistEntries.push({ name: artist, relationToNext: null });
        }
      } else if (artist.name && !isPlaceholderCreatorLabel(artist.name)) {
        artistEntries.push({
          name: artist.name,
          relationToNext: artist.relationToNext || null
        });
      }
    });
  } else if (media.artist && !isPlaceholderCreatorLabel(media.artist)) {
    artistEntries.push({ name: media.artist, relationToNext: null });
  }

  if (artistEntries.length > 0) {
    let display = '';
    artistEntries.forEach((artist, index) => {
      display += artist.name;
      const isLast = index === artistEntries.length - 1;
      if (!isLast) {
        const relation = artist.relationToNext || '&';
        if (relation === ',') {
          display += ', ';
        } else {
          display += ` ${relation.trim()} `;
        }
      }
    });

    if (media.featuring && Array.isArray(media.featuring) && media.featuring.length > 0) {
      const featNames = media.featuring.map((f: any) => f.name || f).filter(Boolean);
      if (featNames.length > 0) {
        display += ` ft. ${featNames.join(', ')}`;
      }
    }

    return display;
  }

  if (isPodcastEpisode(media)) {
    const showTitle = seriesTitleFromMedia(media);
    if (showTitle) return showTitle;
  }

  const hosts = namesFromCreators(media.host);
  if (hosts.length) return hosts.join(', ');

  const authors = namesFromCreators(media.author);
  if (authors.length) return authors.join(', ');

  return 'Unknown Artist';
}
