/**
 * Soft identity cross-ref for library imports (esp. SoundCloud).
 * Uses ISRC → Spotify / MusicBrainz when available; never blocks import.
 */

const spotifyService = require('./spotifyService');
const musicbrainzService = require('./musicbrainzService');
const { normalizeIsrc } = require('../utils/mediaMatchUtils');

const MB_GAP_MS = 1100;

let lastMbCallAt = 0;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function throttleMusicBrainz() {
  const wait = Math.max(0, MB_GAP_MS - (Date.now() - lastMbCallAt));
  if (wait > 0) await sleep(wait);
  lastMbCallAt = Date.now();
}

/**
 * @typedef {'verified'|'catalog'|'likely'|'unverified'} IdentityConfidence
 * @typedef {'isrc_verified'|'isrc_unmatched'|'none'} CrossRefStatus
 */

/**
 * Resolve a single track via ISRC against Spotify then (optionally) MusicBrainz.
 * Prefers cleaner Spotify/MB metadata when an ISRC hit exists; keeps SC permalink.
 *
 * @param {object} track Tuneable import track shape
 * @param {{ skipMusicBrainz?: boolean }} [opts]
 * @returns {Promise<{ track: object, crossRef: object }>}
 */
async function enrichTrackViaIsrc(track, opts = {}) {
  const skipMusicBrainz = opts.skipMusicBrainz === true;
  const isrc = normalizeIsrc(track?.externalIds?.isrc);
  if (!isrc) {
    return {
      track,
      crossRef: {
        status: 'none',
        identityConfidence: 'unverified',
        sources: [],
      },
    };
  }

  let spotifyTrack = null;
  try {
    spotifyTrack = await spotifyService.searchTrackByIsrc(isrc);
  } catch (err) {
    console.warn('ISRC Spotify lookup failed:', err.message);
  }

  // MusicBrainz is rate-limited (~1 req/s) — only hit when Spotify misses and allowed
  let mbTrack = null;
  if (!spotifyTrack && !skipMusicBrainz) {
    try {
      await throttleMusicBrainz();
      const mbHits = await musicbrainzService.searchByIsrc(isrc, 3);
      mbTrack = Array.isArray(mbHits) && mbHits.length > 0 ? mbHits[0] : null;
    } catch (err) {
      console.warn('ISRC MusicBrainz lookup failed:', err.message);
    }
  }

  if (!spotifyTrack && !mbTrack) {
    return {
      track: {
        ...track,
        externalIds: { ...(track.externalIds || {}), isrc },
      },
      crossRef: {
        status: 'isrc_unmatched',
        identityConfidence: 'unverified',
        isrc,
        sources: [],
      },
    };
  }

  const sources = [];
  const enriched = {
    ...track,
    externalIds: { ...(track.externalIds || {}), isrc },
    sources: { ...(track.sources || {}) },
  };
  const originalTitle = track.title;
  const originalArtist = track.artist;

  if (spotifyTrack) {
    sources.push('spotify');
    if (spotifyTrack.id) enriched.externalIds.spotify = String(spotifyTrack.id);
    if (spotifyTrack.external_urls?.spotify) {
      enriched.sources.spotify = spotifyTrack.external_urls.spotify;
    }
    if (spotifyTrack.name) enriched.title = spotifyTrack.name;
    const artistNames = Array.isArray(spotifyTrack.artists)
      ? spotifyTrack.artists.map((a) => a?.name).filter(Boolean)
      : [];
    if (artistNames[0]) {
      enriched.artist = artistNames[0];
      enriched.artists = artistNames;
    }
    if (spotifyTrack.album?.name) enriched.album = spotifyTrack.album.name;
    if (spotifyTrack.album?.images?.[0]?.url) {
      enriched.coverArt = spotifyTrack.album.images[0].url;
    }
    if (spotifyTrack.duration_ms) {
      enriched.duration = Math.floor(Number(spotifyTrack.duration_ms) / 1000);
    }
    const release = spotifyService.releaseFieldsFromTrack(spotifyTrack);
    if (release) {
      if (release.releaseDate) enriched.releaseDate = release.releaseDate;
      if (release.releaseYear) enriched.releaseYear = release.releaseYear;
      if (release.releaseDatePrecision) {
        enriched.releaseDatePrecision = release.releaseDatePrecision;
      }
    }
  }

  if (mbTrack) {
    sources.push('musicbrainz');
    const mbid = mbTrack.id || mbTrack.externalIds?.musicbrainz;
    if (mbid) enriched.externalIds.musicbrainz = String(mbid);
    // Prefer Spotify identity when both exist; fill gaps from MB otherwise
    if (!spotifyTrack) {
      if (mbTrack.title) enriched.title = mbTrack.title;
      if (mbTrack.artist) {
        enriched.artist = mbTrack.artist;
        enriched.artists = [mbTrack.artist];
      }
      if (mbTrack.album) enriched.album = mbTrack.album;
      if (mbTrack.duration) enriched.duration = mbTrack.duration;
      if (mbTrack.releaseDate) enriched.releaseDate = mbTrack.releaseDate;
      if (mbTrack.releaseYear) enriched.releaseYear = mbTrack.releaseYear;
    }
  }

  return {
    track: enriched,
    crossRef: {
      status: 'isrc_verified',
      identityConfidence: 'verified',
      isrc,
      sources,
      originalTitle,
      originalArtist,
      titleChanged: enriched.title !== originalTitle,
      artistChanged: enriched.artist !== originalArtist,
    },
  };
}

/**
 * Batch-enrich tracks that carry an ISRC. Tracks without ISRC pass through unverified.
 * @param {object[]} tracks
 * @param {{
 *   skipMusicBrainz?: boolean,
 *   onProgress?: (update: { current: number, total: number, message?: string }) => void,
 * }} [opts]
 * @returns {Promise<{ tracks: object[], stats: object }>}
 */
async function enrichTracksViaIsrc(tracks, opts = {}) {
  const list = tracks || [];
  const out = [];
  const stats = {
    withIsrc: 0,
    verified: 0,
    isrcUnmatched: 0,
    noIsrc: 0,
  };
  const total = list.length;
  const skipMusicBrainz = opts.skipMusicBrainz === true;
  const onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : null;

  for (let i = 0; i < list.length; i += 1) {
    const track = list[i];
    const isrc = normalizeIsrc(track?.externalIds?.isrc);
    if (!isrc) {
      stats.noIsrc += 1;
      out.push({
        ...track,
        crossRef: {
          status: 'none',
          identityConfidence: 'unverified',
          sources: [],
        },
      });
    } else {
      stats.withIsrc += 1;
      const { track: enriched, crossRef } = await enrichTrackViaIsrc(track, { skipMusicBrainz });
      if (crossRef.status === 'isrc_verified') stats.verified += 1;
      else if (crossRef.status === 'isrc_unmatched') stats.isrcUnmatched += 1;
      out.push({ ...enriched, crossRef });
    }

    if (onProgress) {
      onProgress({
        current: i + 1,
        total,
        message: `Cross-referencing identities (${i + 1}/${total})…`,
      });
    }
  }

  return { tracks: out, stats };
}

/**
 * Resolve final identityConfidence after catalog matching.
 * @param {{ matchStatus: string, crossRef?: object }} item
 * @returns {IdentityConfidence}
 */
function resolveIdentityConfidence({ matchStatus, crossRef }) {
  if (crossRef?.identityConfidence === 'verified' || crossRef?.status === 'isrc_verified' || crossRef?.status === 'musicbrainz_verified') {
    return 'verified';
  }
  if (matchStatus === 'on_catalog' || matchStatus === 'in_library') {
    return 'catalog';
  }
  if (matchStatus === 'possible_match') {
    return 'likely';
  }
  return 'unverified';
}

module.exports = {
  enrichTrackViaIsrc,
  enrichTracksViaIsrc,
  resolveIdentityConfidence,
  throttleMusicBrainz,
};
