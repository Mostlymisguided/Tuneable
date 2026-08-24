/**
 * Strong identity for library import / global bid catalog matching.
 * Only platform track IDs, ISRC, and source URLs — never album IDs.
 */

const { normalizeIsrc, mediaPrimaryArtistName } = require('./mediaMatchUtils');

const IDENTITY_EXTERNAL_KEYS = ['spotify', 'soundcloud', 'youtube', 'musicbrainz', 'rekordbox'];

function asObject(value) {
  if (!value) return {};
  if (value instanceof Map) return Object.fromEntries(value);
  if (typeof value === 'object') return value;
  return {};
}

function firstNonEmpty(...vals) {
  for (const v of vals) {
    if (v == null) continue;
    const s = String(v).trim();
    if (s) return s;
  }
  return null;
}

function normalizePermalink(url) {
  if (!url || typeof url !== 'string') return null;
  try {
    const u = new URL(url);
    u.hash = '';
    u.search = '';
    const path = u.pathname.replace(/\/+$/, '');
    return `${u.origin}${path}`.toLowerCase();
  } catch {
    return url.trim().toLowerCase().replace(/\/+$/, '');
  }
}

function spotifyTrackIdFromUrl(url) {
  if (!url || typeof url !== 'string') return null;
  const m = url.match(/open\.spotify\.com\/track\/([a-zA-Z0-9]+)/i)
    || url.match(/spotify:track:([a-zA-Z0-9]+)/i);
  return m ? m[1] : null;
}

function sourceLooksLike(source, needle) {
  return String(source || '').toLowerCase().includes(needle);
}

/**
 * Collect identity fields from a track, import item, externalMedia blob, or Media doc.
 */
function collectIdentity(input = {}, sourceHint = null) {
  const ids = asObject(input.externalIds);
  const sources = asObject(input.sources);
  const source = sourceHint
    || input.sourceLabel
    || input.importSource
    || '';

  let spotify = firstNonEmpty(ids.spotify);
  let soundcloud = firstNonEmpty(ids.soundcloud);
  let youtube = firstNonEmpty(ids.youtube);
  const musicbrainz = firstNonEmpty(ids.musicbrainz);
  const rekordbox = firstNonEmpty(ids.rekordbox);

  if (!spotify && sourceLooksLike(source, 'spotify')) {
    const candidate = firstNonEmpty(input.id, input.key);
    if (candidate && /^[0-9A-Za-z]{22}$/.test(candidate)) spotify = candidate;
  }
  if (!soundcloud && sourceLooksLike(source, 'soundcloud')) {
    const candidate = firstNonEmpty(input.id, input.key);
    if (candidate && /^\d+$/.test(candidate)) soundcloud = candidate;
  }
  if (!youtube && sourceLooksLike(source, 'youtube')) {
    youtube = firstNonEmpty(input.id, input.key);
  }
  if (!spotify) spotify = spotifyTrackIdFromUrl(sources.spotify);

  const artist = typeof input.artist === 'string'
    ? input.artist
    : mediaPrimaryArtistName(input);

  return {
    spotify,
    soundcloud,
    youtube,
    musicbrainz,
    rekordbox,
    isrc: normalizeIsrc(input.isrc || ids.isrc),
    spotifyUrl: firstNonEmpty(sources.spotify),
    soundcloudUrl: firstNonEmpty(sources.soundcloud),
    youtubeUrl: firstNonEmpty(sources.youtube),
    title: input.title || null,
    artist: artist || null,
    duration: Number(input.duration) || 0,
  };
}

function identityTokens(identity) {
  const tokens = [];
  if (!identity) return tokens;
  for (const key of IDENTITY_EXTERNAL_KEYS) {
    if (identity[key]) tokens.push(`${key}:${identity[key]}`);
  }
  if (identity.isrc) tokens.push(`isrc:${identity.isrc}`);
  const scUrl = identity.soundcloudUrl ? normalizePermalink(identity.soundcloudUrl) : null;
  if (scUrl) tokens.push(`scurl:${scUrl}`);
  if (identity.youtubeUrl) tokens.push(`yturl:${String(identity.youtubeUrl).trim()}`);
  if (identity.spotifyUrl) {
    const fromUrl = spotifyTrackIdFromUrl(identity.spotifyUrl);
    if (fromUrl) tokens.push(`spotify:${fromUrl}`);
  }
  return [...new Set(tokens)];
}

function tokensOverlap(a, b) {
  if (!a?.length || !b?.length) return false;
  const setB = new Set(b);
  return a.some((t) => setB.has(t));
}

function buildIdentityOrQuery(identity) {
  const or = [];
  if (!identity) return or;

  if (identity.spotify) or.push({ 'externalIds.spotify': identity.spotify });
  if (identity.soundcloud) or.push({ 'externalIds.soundcloud': String(identity.soundcloud) });
  if (identity.youtube) or.push({ 'externalIds.youtube': identity.youtube });
  if (identity.musicbrainz) or.push({ 'externalIds.musicbrainz': identity.musicbrainz });
  if (identity.rekordbox) or.push({ 'externalIds.rekordbox': identity.rekordbox });
  if (identity.isrc) {
    or.push({ isrc: identity.isrc });
    or.push({ 'externalIds.isrc': identity.isrc });
  }
  if (identity.spotifyUrl) or.push({ 'sources.spotify': identity.spotifyUrl });
  if (identity.soundcloudUrl) {
    or.push({ 'sources.soundcloud': identity.soundcloudUrl });
    const normalized = normalizePermalink(identity.soundcloudUrl);
    if (normalized && normalized !== identity.soundcloudUrl) {
      or.push({ 'sources.soundcloud': normalized });
    }
  }
  if (identity.youtubeUrl) or.push({ 'sources.youtube': identity.youtubeUrl });
  return or;
}

function trackFromImportItem(item = {}) {
  const ext = item.externalMedia && typeof item.externalMedia === 'object'
    ? item.externalMedia
    : {};
  return {
    title: ext.title || item.title,
    artist: ext.artist || item.artist,
    duration: ext.duration || item.duration || 0,
    externalIds: ext.externalIds || {},
    sources: ext.sources || {},
    isrc: ext.isrc,
    id: item.key,
    sourceLabel: ext.importSource || ext.sourceLabel,
    importSource: ext.importSource,
  };
}

function createIdentitySeenSet() {
  return {
    tokens: new Set(),
    mediaIds: new Set(),
  };
}

function rememberIdentity(seen, identity, mediaId) {
  if (!seen) return;
  for (const token of identityTokens(identity)) seen.tokens.add(token);
  if (mediaId) seen.mediaIds.add(String(mediaId));
}

function identityAlreadySeen(seen, identity, mediaId) {
  if (!seen) return false;
  if (mediaId && seen.mediaIds.has(String(mediaId))) return true;
  return identityTokens(identity).some((token) => seen.tokens.has(token));
}

module.exports = {
  IDENTITY_EXTERNAL_KEYS,
  asObject,
  normalizePermalink,
  spotifyTrackIdFromUrl,
  collectIdentity,
  identityTokens,
  tokensOverlap,
  buildIdentityOrQuery,
  trackFromImportItem,
  createIdentitySeenSet,
  rememberIdentity,
  identityAlreadySeen,
};
