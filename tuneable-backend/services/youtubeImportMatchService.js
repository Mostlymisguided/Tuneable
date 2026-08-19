const musicbrainzService = require('./musicbrainzService');
const importCrossRefService = require('./importCrossRefService');
const {
  scoreCandidate,
  HIGH_SCORE,
  MEDIUM_SCORE,
} = require('./metadataEnrichmentService');

const mbCache = new Map();
const MB_CACHE_LIMIT = 500;

function cacheKey(title, artist) {
  return `${String(artist || '').trim().toLowerCase()}::${String(title || '').trim().toLowerCase()}`;
}

function remember(key, value) {
  if (mbCache.size >= MB_CACHE_LIMIT) {
    const first = mbCache.keys().next().value;
    mbCache.delete(first);
  }
  mbCache.set(key, value);
  return value;
}

function youtubeScore(original, candidate) {
  const scored = scoreCandidate(original, candidate);
  const origDuration = Number(original.duration) || 0;
  const candDuration = Number(candidate.duration) || 0;
  const exactTitleArtist = /exact-title/.test(scored.matchType)
    && /exact-artist|compat-artist/.test(scored.matchType);

  if (exactTitleArtist && origDuration && candDuration) {
    const ratio = origDuration / candDuration;
    // Official videos are often longer than the recording; keep high if close enough.
    if (ratio >= 0.7 && ratio <= 1.55 && scored.score < HIGH_SCORE) {
      return { ...scored, score: Math.max(scored.score, HIGH_SCORE), matchType: `${scored.matchType}+yt-duration-ok` };
    }
    if (ratio > 2.1) {
      return {
        ...scored,
        score: Math.min(scored.score, MEDIUM_SCORE - 0.01),
        matchType: `${scored.matchType}+yt-too-long`,
      };
    }
  }
  return scored;
}

function confidenceFromYoutubeScore(score) {
  if (score >= HIGH_SCORE) return 'high';
  if (score >= MEDIUM_SCORE) return 'medium';
  return 'none';
}

async function searchMusicBrainz(title, artist) {
  const key = cacheKey(title, artist);
  if (mbCache.has(key)) return mbCache.get(key);

  const query = [artist, title].filter(Boolean).join(' ').slice(0, 200);
  if (!query) return remember(key, []);

  await importCrossRefService.throttleMusicBrainz();
  const { tracks } = await musicbrainzService.searchRecordings(query, 0, 5);
  return remember(key, tracks || []);
}

function applyMbTrackToImport(track, mbTrack, { identityConfidence, matchType, score }) {
  const mbid = mbTrack.id || mbTrack.externalIds?.musicbrainz;
  const isrc = mbTrack.isrc || mbTrack.externalIds?.isrc || null;
  return {
    ...track,
    title: mbTrack.title || track.title,
    artist: mbTrack.artist || track.artist,
    artists: mbTrack.artists || [mbTrack.artist || track.artist],
    album: mbTrack.album || track.album,
    duration: mbTrack.duration || track.duration,
    releaseDate: mbTrack.releaseDate || track.releaseDate,
    releaseYear: mbTrack.releaseYear || track.releaseYear,
    releaseDatePrecision: mbTrack.releaseDatePrecision || track.releaseDatePrecision,
    coverArt: track.coverArt || mbTrack.coverArt || null,
    externalIds: {
      ...(track.externalIds || {}),
      ...(mbid ? { musicbrainz: String(mbid) } : {}),
      ...(isrc ? { isrc } : {}),
    },
    sources: { ...(track.sources || {}) },
    crossRef: {
      status: identityConfidence === 'verified' ? 'musicbrainz_verified' : 'musicbrainz_likely',
      identityConfidence,
      sources: ['musicbrainz'],
      originalTitle: track.originalTitle || track.title,
      originalArtist: track.originalArtist || track.artist,
      titleChanged: Boolean(mbTrack.title && mbTrack.title !== track.title),
      artistChanged: Boolean(mbTrack.artist && mbTrack.artist !== track.artist),
      matchType,
      score,
    },
  };
}

/**
 * Cross-ref parsed YouTube tracks against MusicBrainz.
 * High-confidence hits become verified identities; medium stay as likely suggestions.
 */
async function enrichYouTubeTracksViaMusicBrainz(tracks, { onProgress } = {}) {
  const list = tracks || [];
  const out = [];
  const stats = {
    high: 0,
    medium: 0,
    none: 0,
  };
  const report = typeof onProgress === 'function' ? onProgress : () => {};

  for (let i = 0; i < list.length; i += 1) {
    const track = list[i];
    report({
      current: i,
      total: list.length,
      message: `Matching MusicBrainz (${i + 1}/${list.length})…`,
    });

    let candidates = [];
    try {
      candidates = await searchMusicBrainz(track.title, track.artist);
    } catch (err) {
      console.warn('YouTube MB lookup failed:', err.message);
    }

    const scored = (candidates || [])
      .map((candidate) => {
        const { score, matchType } = youtubeScore(track, candidate);
        return { candidate, score, matchType };
      })
      .sort((a, b) => b.score - a.score);

    const best = scored[0] || null;
    const confidence = best ? confidenceFromYoutubeScore(best.score) : 'none';

    if (confidence === 'high') {
      stats.high += 1;
      out.push(applyMbTrackToImport(track, best.candidate, {
        identityConfidence: 'verified',
        matchType: best.matchType,
        score: best.score,
      }));
    } else if (confidence === 'medium') {
      stats.medium += 1;
      const enriched = applyMbTrackToImport(track, best.candidate, {
        identityConfidence: 'likely',
        matchType: best.matchType,
        score: best.score,
      });
      enriched.suggestedTitle = best.candidate.title;
      enriched.suggestedArtist = best.candidate.artist;
      out.push(enriched);
    } else {
      stats.none += 1;
      out.push({
        ...track,
        crossRef: {
          status: 'none',
          identityConfidence: 'unverified',
          sources: [],
          originalTitle: track.originalTitle || track.title,
          originalArtist: track.originalArtist || track.artist,
        },
      });
    }
  }

  report({
    current: list.length,
    total: list.length,
    message: `MusicBrainz matched ${stats.high} confidently, ${stats.medium} to review`,
  });

  return { tracks: out, stats };
}

module.exports = {
  enrichYouTubeTracksViaMusicBrainz,
  youtubeScore,
  confidenceFromYoutubeScore,
};
