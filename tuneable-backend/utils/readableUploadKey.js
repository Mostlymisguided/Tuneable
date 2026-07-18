/**
 * Human-readable, URL-safe R2 object keys for audio/cover uploads.
 * e.g. media-uploads/daft-punk-around-the-world-a1b2c3d4.mp3
 */

function slugifySegment(str) {
  return String(str || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 60);
}

function artistDisplayName(artist) {
  if (Array.isArray(artist)) {
    return artist
      .map((a) => (typeof a === 'string' ? a : a?.name))
      .filter(Boolean)
      .join(', ');
  }
  if (artist && typeof artist === 'object') {
    return artist.name || '';
  }
  return artist || '';
}

function normalizeExt(ext, fallback = '.mp3') {
  const raw = (ext || fallback || '').toString();
  const withDot = raw.startsWith('.') ? raw : `.${raw}`;
  return withDot.toLowerCase() || fallback;
}

function shortUniqueId(uuid) {
  const fromUuid = String(uuid || '').replace(/-/g, '').slice(0, 8);
  if (fromUuid) return fromUuid;
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function buildSlugBase({ title, artist, fallbackBasename }) {
  const artistSlug = slugifySegment(artistDisplayName(artist));
  const titleSlug = slugifySegment(title || fallbackBasename || 'track');
  return [artistSlug, titleSlug].filter(Boolean).join('-') || 'track';
}

/**
 * @param {object} opts
 * @param {string} [opts.title]
 * @param {string|object|Array} [opts.artist]
 * @param {string} [opts.ext] - including leading dot, e.g. '.mp3'
 * @param {string} [opts.uuid] - media uuid when available
 * @param {string} [opts.fallbackBasename] - e.g. original filename without extension
 */
function buildReadableAudioKey(opts = {}) {
  const { title, artist, ext = '.mp3', uuid, fallbackBasename } = opts;
  const base = buildSlugBase({ title, artist, fallbackBasename });
  return `media-uploads/${base}-${shortUniqueId(uuid)}${normalizeExt(ext, '.mp3')}`;
}

/**
 * @param {object} opts - same shape as buildReadableAudioKey
 */
function buildReadableCoverKey(opts = {}) {
  const { title, artist, ext = '.jpg', uuid, fallbackBasename } = opts;
  const base = buildSlugBase({ title, artist, fallbackBasename: fallbackBasename || 'cover' });
  return `cover-art/${base}-${shortUniqueId(uuid)}${normalizeExt(ext, '.jpg')}`;
}

module.exports = {
  slugifySegment,
  artistDisplayName,
  buildReadableAudioKey,
  buildReadableCoverKey,
};
