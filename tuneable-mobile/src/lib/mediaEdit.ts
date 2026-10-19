import { isWrittenMedia, normalizeSources } from '@/src/lib/media';
import { formatDuration } from '@/src/lib/format';
import type { ChartMediaItem } from '@/src/types/media';
import type { ResolvedLocation } from '@/src/types/user';

export type MediaEditKind = 'tune' | 'podcast' | 'book';

export type CreditField = 'artist' | 'author' | 'host';

export type MediaEditForm = {
  title: string;
  creator: string;
  creditField: CreditField;
  producer: string;
  album: string;
  featuring: string;
  tags: string;
  elements: string;
  encodedBy: string;
  daws: string;
  plugins: string;
  hardware: string;
  aiUsed: boolean;
  aiTools: string;
  aiNotes: string;
  releaseYearOnly: boolean;
  releaseDate: string;
  releaseYear: string;
  duration: string;
  explicit: boolean;
  description: string;
  lyrics: string;
  composer: string;
  label: string;
  language: string;
  pitch: string;
  bpm: string;
  key: string;
  timeSignature: string;
  isrc: string;
  upc: string;
  isbn: string;
  copySharePercent: string;
  primaryLocation: ResolvedLocation | null;
  secondaryLocation: ResolvedLocation | null;
  /** Editable listen / catalog links. Hosted audio keys stay out of this map. */
  sources: Record<string, string>;
  rightsStatus: string;
};

export const LINK_FIELDS: Array<{ key: string; label: string; placeholder: string }> = [
  { key: 'youtube', label: 'YouTube', placeholder: 'https://youtube.com/watch?v=…' },
  { key: 'spotify', label: 'Spotify', placeholder: 'https://open.spotify.com/track/…' },
  { key: 'apple', label: 'Apple Music', placeholder: 'https://music.apple.com/…' },
  { key: 'soundcloud', label: 'SoundCloud', placeholder: 'https://soundcloud.com/…' },
  { key: 'bandcamp', label: 'Bandcamp', placeholder: 'https://artist.bandcamp.com/track/…' },
  { key: 'openLibrary', label: 'Open Library', placeholder: 'https://openlibrary.org/works/…' },
  { key: 'googleBooks', label: 'Google Books', placeholder: 'https://books.google.com/…' },
];

/** Source keys that are the hosted file, not a public link. */
const PROTECTED_SOURCE_KEYS = new Set(['upload', 'audio', 'audio_direct', 'enclosure']);

const RIGHTS = new Set(['cleared', 'pending', 'permitted', 'disputed']);

type NamedGear = {
  name?: string;
  version?: string;
  role?: string | null;
  manufacturer?: string;
  category?: string;
  gearId?: string | { _id?: string };
};

type AiTool = {
  name?: string;
  category?: string;
  provider?: string;
};

type CreatorDoc = {
  name?: string;
  userId?: string | { _id?: string; id?: string } | null;
  collectiveId?: string | { _id?: string; id?: string } | null;
  verified?: boolean;
  relationToNext?: string | null;
};

export function mediaEditKind(media: ChartMediaItem): MediaEditKind {
  if (isWrittenMedia(media)) return 'book';
  const forms = media.contentForm || [];
  const types = media.contentType || [];
  if (
    types.includes('spoken') ||
    forms.some((form) =>
      ['podcast', 'podcastseries', 'episode', 'podcastepisode'].includes(form)
    )
  ) {
    return 'podcast';
  }
  return 'tune';
}

export function copyShareLabel(percent: number): string {
  if (percent >= 100) return 'Everyone who tips';
  return `Top ${percent}%`;
}

export function creatorFieldLabel(kind: MediaEditKind, field: CreditField): string {
  if (field === 'author' || kind === 'book') return 'Author';
  if (field === 'host') return 'Host';
  return 'Artist';
}

function splitList(value: string): string[] {
  return value
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function joinNames(value: unknown): string {
  if (!value) return '';
  if (typeof value === 'string') {
    return /^unknown(\s+(artist|author|podcast))?$/i.test(value.trim()) ? '' : value.trim();
  }
  if (!Array.isArray(value)) return '';
  return value
    .map((entry) => (typeof entry === 'string' ? entry : (entry as { name?: string })?.name))
    .map((name) => (typeof name === 'string' ? name.trim() : ''))
    .filter((name) => name && !/^unknown(\s+(artist|author|podcast))?$/i.test(name))
    .join(', ');
}

function creatorDocs(value: unknown): CreatorDoc[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry) => entry && typeof entry === 'object') as CreatorDoc[];
}

function refId(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'object') {
    const record = value as { _id?: string; id?: string };
    if (record._id) return String(record._id);
    if (record.id) return String(record.id);
  }
  return null;
}

function creditFieldFor(media: ChartMediaItem, kind: MediaEditKind): CreditField {
  if (kind === 'book') return 'author';
  const artists = joinNames(media.artists) || joinNames(media.artist);
  if (artists) return 'artist';
  if (kind === 'podcast' && joinNames(media.host)) return 'host';
  if (joinNames(media.author) || (media.authors || []).length) return 'author';
  return 'artist';
}

function creatorText(media: ChartMediaItem, field: CreditField): string {
  if (field === 'author') {
    return joinNames(media.author) || (media.authors || []).filter(Boolean).join(', ');
  }
  if (field === 'host') return joinNames(media.host);
  return joinNames(media.artists) || joinNames(media.artist);
}

function labelText(media: ChartMediaItem): string {
  const label = media.label;
  if (!label) return '';
  if (typeof label === 'string') return label;
  if (Array.isArray(label) && label.length > 0) {
    const first = label[0];
    if (typeof first === 'string') return first;
    return first?.name || '';
  }
  return '';
}

function gearNames(entries: NamedGear[] | undefined): string {
  return (entries || [])
    .map((entry) => entry?.name?.trim() || '')
    .filter(Boolean)
    .join(', ');
}

function dateInputValue(value: string | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function locationOrNull(
  location: ChartMediaItem['primaryLocation']
): ResolvedLocation | null {
  if (!location) return null;
  if (location.placeId || location.city || location.region || location.country || location.display) {
    return location;
  }
  return null;
}

export function editableLinkFields(
  sources: Record<string, string>,
  kind: MediaEditKind = 'tune'
) {
  const base = LINK_FIELDS.filter((field) =>
    kind === 'book'
      ? field.key === 'openLibrary' || field.key === 'googleBooks'
      : field.key !== 'openLibrary' && field.key !== 'googleBooks'
  );
  const known = new Set(LINK_FIELDS.map((field) => field.key));
  const extra = Object.keys(sources)
    .filter((key) => !known.has(key) && !PROTECTED_SOURCE_KEYS.has(key) && sources[key])
    .map((key) => ({
      key,
      label: key.charAt(0).toUpperCase() + key.slice(1),
      placeholder: 'https://…',
    }));
  // Keep a filled link visible even when it belongs to another kind.
  const filledOther = LINK_FIELDS.filter(
    (field) => !base.some((item) => item.key === field.key) && sources[field.key]
  );
  return [...base, ...filledOther, ...extra];
}

export function formFromMedia(media: ChartMediaItem): MediaEditForm {
  const kind = mediaEditKind(media);
  const creditField = creditFieldFor(media, kind);
  const sources = normalizeSources(media.sources);
  const linkSources: Record<string, string> = {};
  for (const field of editableLinkFields(sources, kind)) {
    linkSources[field.key] = sources[field.key] || '';
  }
  const releaseDate = dateInputValue(media.releaseDate);
  const releaseYear =
    media.releaseYear != null ? String(media.releaseYear) : '';
  const stack = media.productionStack;
  return {
    title: media.title || '',
    creator: creatorText(media, creditField),
    creditField,
    producer: joinNames(media.producer),
    album: media.album || '',
    featuring: joinNames(media.featuring),
    tags: (media.tags || []).join(', '),
    elements: (media.elements || []).join(', '),
    encodedBy: media.encodedBy || '',
    daws: gearNames(stack?.daws),
    plugins: gearNames(stack?.plugins),
    hardware: gearNames(stack?.hardware),
    aiUsed: Boolean(media.aiUsage?.used),
    aiTools: (media.aiUsage?.tools || [])
      .map((tool) => tool?.name?.trim() || '')
      .filter(Boolean)
      .join(', '),
    aiNotes: media.aiUsage?.notes || '',
    releaseYearOnly: !releaseDate && Boolean(releaseYear),
    releaseDate,
    releaseYear,
    duration: formatDuration(media.duration) || '',
    explicit: Boolean(media.explicit),
    description: media.description || '',
    lyrics: media.lyrics || '',
    composer: joinNames(media.composer),
    label: labelText(media),
    language: media.language || '',
    pitch: media.pitch != null ? String(media.pitch) : '',
    bpm: media.bpm != null ? String(Math.round(media.bpm)) : '',
    key: media.key || '',
    timeSignature: media.timeSignature || '',
    isrc: media.isrc || '',
    upc: media.upc || '',
    isbn: media.isbn || '',
    copySharePercent: String(
      media.copySharePercent != null ? Math.round(media.copySharePercent) : 50
    ),
    primaryLocation: locationOrNull(media.primaryLocation),
    secondaryLocation: locationOrNull(media.secondaryLocation),
    sources: linkSources,
    rightsStatus: RIGHTS.has(media.rightsStatus || '') ? media.rightsStatus || 'pending' : 'pending',
  };
}

function parseDuration(value: string): { seconds: number | null; error?: string } {
  const trimmed = value.trim();
  if (!trimmed) return { seconds: null };
  const parts = trimmed.split(':');
  if (parts.length < 2 || parts.length > 3 || parts.some((part) => part.trim() === '' || Number.isNaN(Number(part)))) {
    return { seconds: null, error: 'Duration must look like 3:45' };
  }
  const nums = parts.map((part) => Number(part));
  if (nums.some((n) => n < 0 || !Number.isInteger(n))) {
    return { seconds: null, error: 'Duration must look like 3:45' };
  }
  if (parts.length === 2) {
    const [mins, secs] = nums;
    if (secs >= 60) return { seconds: null, error: 'Seconds must be under 60' };
    return { seconds: mins * 60 + secs };
  }
  const [hours, mins, secs] = nums;
  if (mins >= 60 || secs >= 60) {
    return { seconds: null, error: 'Duration must look like 1:03:45' };
  }
  return { seconds: hours * 3600 + mins * 60 + secs };
}

function optionalNumber(value: string, label: string): { value: number | null; error?: string } {
  const trimmed = value.trim();
  if (!trimmed) return { value: null };
  const num = Number(trimmed);
  if (!Number.isFinite(num)) return { value: null, error: `${label} must be a number` };
  return { value: num };
}

function preserveNamed<T extends { name?: string }>(text: string, existing: T[] | undefined): T[] {
  const names = splitList(text);
  return names.map((name) => {
    const match = (existing || []).find(
      (entry) => entry?.name?.trim().toLowerCase() === name.toLowerCase()
    );
    if (match) return { ...match, name: match.name?.trim() || name };
    return { name } as T;
  });
}

function creditDocs(text: string, existing: CreatorDoc[]): Array<Record<string, unknown>> {
  const names = splitList(text);
  return names.map((name, index) => {
    const match = existing.find(
      (entry) => entry.name?.trim().toLowerCase() === name.toLowerCase()
    );
    return {
      name,
      userId: refId(match?.userId),
      collectiveId: refId(match?.collectiveId),
      relationToNext: index === names.length - 1 ? null : '&',
      verified: Boolean(match?.verified),
    };
  });
}

function buildSources(
  original: Record<string, string>,
  edited: Record<string, string>
): Record<string, string> {
  const next: Record<string, string> = {};
  for (const [key, value] of Object.entries(original)) {
    if (PROTECTED_SOURCE_KEYS.has(key) && value) next[key] = value;
  }
  for (const [key, value] of Object.entries(edited)) {
    if (PROTECTED_SOURCE_KEYS.has(key)) continue;
    const trimmed = value.trim();
    if (trimmed) next[key] = trimmed;
  }
  return next;
}

export function buildMediaUpdate(
  form: MediaEditForm,
  media: ChartMediaItem
): { error?: string; updates?: Record<string, unknown> } {
  const title = form.title.trim();
  if (!title) return { error: 'Title is required' };

  const kind = mediaEditKind(media);
  const duration = parseDuration(form.duration);
  if (duration.error) return { error: duration.error };

  let releaseDate: string | null = null;
  let releaseYear: number | null = null;
  if (form.releaseYearOnly) {
    const yearText = form.releaseYear.trim();
    if (yearText) {
      const year = Number(yearText);
      if (!Number.isInteger(year) || year < 1900 || year > 2100) {
        return { error: 'Release year must be between 1900 and 2100' };
      }
      releaseYear = year;
    }
  } else if (form.releaseDate.trim()) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.releaseDate.trim())) {
      return { error: 'Release date must look like 2024-05-01' };
    }
    releaseDate = form.releaseDate.trim();
  }

  const share = Math.round(Number(form.copySharePercent));
  if (!Number.isFinite(share) || share < 1 || share > 100) {
    return { error: 'Copy share must be between 1 and 100' };
  }

  const bpm = optionalNumber(form.bpm, 'BPM');
  if (bpm.error) return { error: bpm.error };
  const pitch = optionalNumber(form.pitch, 'Pitch');
  if (pitch.error) return { error: pitch.error };

  const updates: Record<string, unknown> = {
    title,
    tags: splitList(form.tags),
    description: form.description.trim(),
    explicit: form.explicit,
    language: form.language.trim(),
    releaseDate,
    releaseYear,
    copySharePercent: share,
    primaryLocation: form.primaryLocation,
    secondaryLocation: form.secondaryLocation,
    sources: buildSources(normalizeSources(media.sources), form.sources),
  };

  const creditExisting =
    form.creditField === 'author'
      ? creatorDocs(media.author)
      : form.creditField === 'host'
        ? creatorDocs(media.host)
        : creatorDocs(media.artists).length
          ? creatorDocs(media.artists)
          : creatorDocs(media.artist);
  const credits = creditDocs(form.creator, creditExisting);
  if (form.creditField === 'artist') {
    updates.artist = credits.length ? credits : '';
    updates.featuring = splitList(form.featuring).map((name) => {
      const match = creatorDocs(media.featuring).find(
        (entry) => entry.name?.trim().toLowerCase() === name.toLowerCase()
      );
      return {
        name,
        userId: refId(match?.userId),
        verified: Boolean(match?.verified),
      };
    });
  } else {
    updates[form.creditField] = credits.length ? credits : '';
  }

  if (kind !== 'book') {
    updates.duration = duration.seconds;
  }

  if (kind === 'book') {
    updates.isbn = form.isbn.trim();
  }

  if (kind === 'tune') {
    updates.producer = form.producer.trim();
    updates.album = form.album.trim();
    updates.composer = form.composer.trim();
    updates.label = form.label.trim();
    updates.encodedBy = form.encodedBy.trim();
    updates.elements = splitList(form.elements);
    updates.lyrics = form.lyrics;
    updates.bpm = bpm.value == null ? null : Math.round(bpm.value);
    updates.key = form.key.trim();
    updates.pitch = pitch.value == null ? null : Math.round(pitch.value);
    updates.timeSignature = form.timeSignature.trim();
    updates.isrc = form.isrc.trim();
    updates.upc = form.upc.trim();
    updates.productionStack = {
      daws: preserveNamed(form.daws, media.productionStack?.daws),
      plugins: preserveNamed(form.plugins, media.productionStack?.plugins),
      hardware: preserveNamed(form.hardware, media.productionStack?.hardware),
    };
    updates.aiUsage = {
      used: form.aiUsed,
      tools: preserveNamed(form.aiTools, media.aiUsage?.tools).map((tool) => ({
        name: tool.name,
        category: (tool as AiTool).category || 'other',
        provider: (tool as AiTool).provider || '',
      })),
      notes: form.aiNotes.trim(),
    };
  }

  return { updates };
}
