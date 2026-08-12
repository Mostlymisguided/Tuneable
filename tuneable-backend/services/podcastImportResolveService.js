/**
 * Resolve podcast shows (esp. Spotify) to playable RSS / Podcast Index feeds.
 * Spotify is treated as library identity; playback comes from RSS when matched.
 */

const podcastIndexService = require('./podcastIndexService');
const applePodcastsService = require('./applePodcastsService');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function titleSimilarity(a, b) {
  const na = normalizeText(a);
  const nb = normalizeText(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) {
    const shorter = Math.min(na.length, nb.length);
    const longer = Math.max(na.length, nb.length);
    return 0.7 + (0.25 * shorter) / longer;
  }
  const ta = new Set(na.split(' ').filter((w) => w.length > 2));
  const tb = new Set(nb.split(' ').filter((w) => w.length > 2));
  if (!ta.size || !tb.size) return 0;
  let overlap = 0;
  for (const t of ta) if (tb.has(t)) overlap += 1;
  return overlap / Math.max(ta.size, tb.size);
}

function scorePodcastIndexFeed(feed, title, publisher) {
  const titleScore = titleSimilarity(feed?.title, title);
  const authorScore = Math.max(
    titleSimilarity(feed?.author, publisher),
    titleSimilarity(feed?.ownerName, publisher),
    titleSimilarity(feed?.publisher, publisher)
  );
  let score = titleScore * 100;
  if (authorScore > 0.5) score += authorScore * 25;
  if (feed?.url || feed?.originalUrl) score += 5;
  if (feed?.dead === 1 || feed?.dead === true) score -= 50;
  return score;
}

function scoreApplePodcast(podcast, title, publisher) {
  const titleScore = titleSimilarity(podcast?.collectionName || podcast?.trackName, title);
  const authorScore = titleSimilarity(podcast?.artistName, publisher);
  let score = titleScore * 100;
  if (authorScore > 0.5) score += authorScore * 25;
  if (podcast?.feedUrl) score += 5;
  return score;
}

/**
 * @typedef {object} ResolveResult
 * @property {'podcastindex'|'apple'|'unresolved'} status
 * @property {string|null} rssUrl
 * @property {string|null} podcastIndexId
 * @property {string|null} iTunesId
 * @property {string|null} matchedTitle
 * @property {number} confidence
 * @property {boolean} playable
 */

/**
 * Resolve a show title/publisher to a playable feed.
 * @param {{ title: string, publisher?: string, iTunesId?: string|null }} input
 * @returns {Promise<ResolveResult>}
 */
async function resolveShowToFeed(input) {
  const title = String(input?.title || '').trim();
  const publisher = String(input?.publisher || '').trim();
  const iTunesId = input?.iTunesId ? String(input.iTunesId) : null;

  const empty = {
    status: 'unresolved',
    rssUrl: null,
    podcastIndexId: null,
    iTunesId: iTunesId || null,
    matchedTitle: null,
    confidence: 0,
    playable: false,
  };

  if (!title && !iTunesId) return empty;

  // 1) Direct Podcast Index lookup by Apple ID when we have one
  if (iTunesId) {
    const byItunes = await podcastIndexService.getPodcastByItunesId(iTunesId);
    if (byItunes.success && byItunes.podcast?.url) {
      return {
        status: 'podcastindex',
        rssUrl: byItunes.podcast.url,
        podcastIndexId: byItunes.podcast.id != null ? String(byItunes.podcast.id) : null,
        iTunesId: String(byItunes.podcast.itunesId || iTunesId),
        matchedTitle: byItunes.podcast.title || title,
        confidence: 0.98,
        playable: true,
      };
    }
  }

  // 2) Podcast Index title search
  if (title) {
    const search = await podcastIndexService.searchPodcasts(title, 8);
    if (search.success && Array.isArray(search.podcasts) && search.podcasts.length) {
      const ranked = search.podcasts
        .map((feed) => ({ feed, score: scorePodcastIndexFeed(feed, title, publisher) }))
        .sort((a, b) => b.score - a.score);
      const best = ranked[0];
      if (best && best.score >= 70 && (best.feed.url || best.feed.originalUrl)) {
        return {
          status: 'podcastindex',
          rssUrl: best.feed.url || best.feed.originalUrl,
          podcastIndexId: best.feed.id != null ? String(best.feed.id) : null,
          iTunesId: best.feed.itunesId ? String(best.feed.itunesId) : iTunesId,
          matchedTitle: best.feed.title || title,
          confidence: Math.min(0.99, best.score / 100),
          playable: true,
        };
      }
    }
  }

  // 3) Apple Podcasts search → feedUrl (often includes enclosure-ready RSS)
  if (title) {
    try {
      await sleep(200); // soft throttle vs Apple ~20/min
      const apple = await applePodcastsService.searchPodcasts(title, 8);
      if (apple.success && Array.isArray(apple.podcasts) && apple.podcasts.length) {
        const ranked = apple.podcasts
          .map((p) => ({ podcast: p, score: scoreApplePodcast(p, title, publisher) }))
          .sort((a, b) => b.score - a.score);
        const best = ranked[0];
        if (best && best.score >= 70 && best.podcast.feedUrl) {
          const appleId = best.podcast.collectionId
            ? String(best.podcast.collectionId)
            : iTunesId;

          // Prefer Podcast Index enrichment when Apple gives us an ID/URL
          let podcastIndexId = null;
          if (appleId) {
            const byItunes = await podcastIndexService.getPodcastByItunesId(appleId);
            if (byItunes.success && byItunes.podcast?.id) {
              podcastIndexId = String(byItunes.podcast.id);
            }
          }
          if (!podcastIndexId && best.podcast.feedUrl) {
            const byFeed = await podcastIndexService.getPodcastByFeedUrl(best.podcast.feedUrl);
            if (byFeed.success && byFeed.podcast?.id) {
              podcastIndexId = String(byFeed.podcast.id);
            }
          }

          return {
            status: podcastIndexId ? 'podcastindex' : 'apple',
            rssUrl: best.podcast.feedUrl,
            podcastIndexId,
            iTunesId: appleId,
            matchedTitle: best.podcast.collectionName || best.podcast.trackName || title,
            confidence: Math.min(0.95, best.score / 100),
            playable: true,
          };
        }
      }
    } catch (err) {
      console.warn('Apple resolve fallback failed:', err.message);
    }
  }

  return empty;
}

/**
 * Match a Spotify/episode title against Podcast Index episode list.
 */
function findBestEpisodeMatch(piEpisodes, episodeTitle, releaseDate) {
  if (!Array.isArray(piEpisodes) || !piEpisodes.length) return null;
  const targetDate = releaseDate ? new Date(releaseDate).getTime() : null;

  let best = null;
  let bestScore = 0;
  for (const ep of piEpisodes) {
    let score = titleSimilarity(ep.title, episodeTitle) * 100;
    if (targetDate && ep.datePublished) {
      const diffDays = Math.abs(ep.datePublished * 1000 - targetDate) / (1000 * 60 * 60 * 24);
      if (diffDays < 1) score += 20;
      else if (diffDays < 3) score += 10;
      else if (diffDays > 30) score -= 15;
    }
    if (score > bestScore) {
      bestScore = score;
      best = ep;
    }
  }
  if (bestScore < 65) return null;
  return { episode: best, confidence: Math.min(0.99, bestScore / 100) };
}

module.exports = {
  normalizeText,
  titleSimilarity,
  resolveShowToFeed,
  findBestEpisodeMatch,
};
