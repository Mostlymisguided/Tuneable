const axios = require('axios');

const MUSICBRAINZ_API = 'https://musicbrainz.org/ws/2';
const USER_AGENT = 'TuneableLocal/1.0 ( https://tuneable.stream )';

function normalizeDuration(ms) {
  if (!Number.isFinite(ms) || ms <= 0) {
    return 0;
  }
  return Math.round(ms / 1000);
}

function getArtistCredit(recording) {
  if (!Array.isArray(recording?.['artist-credit'])) {
    return 'Unknown Artist';
  }

  const parts = recording['artist-credit']
    .map((entry) => {
      if (typeof entry === 'string') return entry;
      return entry?.name || entry?.artist?.name || '';
    })
    .filter(Boolean);

  return parts.join('') || 'Unknown Artist';
}

function buildReleaseLabel(recording) {
  const release = Array.isArray(recording?.releases) ? recording.releases[0] : null;
  if (!release) return null;

  if (release.title && release.date) {
    return `${release.title} (${release.date.slice(0, 4)})`;
  }

  return release.title || null;
}

async function searchRecordings(query, offset = 0, limit = 20) {
  const trimmedQuery = String(query || '').trim();
  if (!trimmedQuery) {
    return { nextOffset: null, tracks: [] };
  }

  const cappedLimit = Math.max(1, Math.min(limit, 100));
  const response = await axios.get(`${MUSICBRAINZ_API}/recording`, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'application/json',
    },
    params: {
      query: trimmedQuery,
      dismax: true,
      fmt: 'json',
      limit: cappedLimit,
      offset: Math.max(0, Number(offset) || 0),
    },
    timeout: 15000,
  });

  const recordings = Array.isArray(response.data?.recordings)
    ? response.data.recordings
    : [];

  const tracks = recordings.map((recording) => {
    const release = Array.isArray(recording.releases) ? recording.releases[0] : null;
    const releaseDate = release?.date || null;
    const releaseYear = releaseDate ? Number.parseInt(releaseDate.slice(0, 4), 10) : null;

    return {
      id: recording.id,
      title: recording.title || 'Unknown Title',
      artist: getArtistCredit(recording),
      duration: normalizeDuration(recording.length),
      coverArt: null,
      category: 'Music',
      album: buildReleaseLabel(recording),
      releaseDate,
      releaseYear: Number.isFinite(releaseYear) ? releaseYear : null,
      externalIds: {
        musicbrainz: recording.id,
        ...(release?.id ? { musicbrainzRelease: release.id } : {}),
      },
      sources: {},
      isLocal: false,
      isPlayable: false,
      supportMode: 'tip',
      awaitingUpload: true,
      sourceLabel: 'MusicBrainz',
    };
  });

  const count = Number(response.data?.count) || 0;
  const nextOffset = offset + tracks.length < count ? offset + tracks.length : null;

  return {
    nextOffset,
    tracks,
  };
}

module.exports = {
  searchRecordings,
};
