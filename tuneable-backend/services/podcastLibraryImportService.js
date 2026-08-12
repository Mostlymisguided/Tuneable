/**
 * Podcast library import: Spotify saved shows → resolve RSS → import playable episodes.
 * Mirrors music libraryImportService preview/execute pattern (no tipping required).
 */

const User = require('../models/User');
const Media = require('../models/Media');
const spotifyService = require('./spotifyService');
const podcastIndexService = require('./podcastIndexService');
const podcastAdapter = require('./podcastAdapter');
const { resolveShowToFeed } = require('./podcastImportResolveService');

const DEFAULT_EPISODES_PER_SHOW = 10;
const MAX_EPISODES_PER_SHOW = 50;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withSpotifyToken(userId, fn) {
  const user = await User.findById(userId).select(
    'spotifyAccessToken spotifyRefreshToken spotifyId'
  );
  if (!user?.spotifyAccessToken && !user?.spotifyRefreshToken) {
    const err = new Error('Spotify not connected. Please connect your Spotify account first.');
    err.code = 'SPOTIFY_REAUTH';
    throw err;
  }

  let token = user.spotifyAccessToken;
  if (!token && user.spotifyRefreshToken) {
    token = await spotifyService.refreshUserAccessToken(user);
  }

  try {
    return await fn(token, user);
  } catch (error) {
    if (error.response?.status === 401 || error.code === 'SPOTIFY_REAUTH') {
      token = await spotifyService.refreshUserAccessToken(user);
      return fn(token, user);
    }
    throw error;
  }
}

async function findExistingSeriesForShow(show) {
  const or = [];
  if (show?.id) or.push({ 'externalIds.spotify': String(show.id) });
  if (!or.length) return null;
  return Media.findOne({
    contentForm: { $in: ['podcastseries'] },
    $or: or,
  }).lean();
}

/**
 * Preview Spotify saved shows with RSS/Podcast Index resolve status.
 */
async function previewSpotifyPodcastImport(userId, limit = 50, opts = {}) {
  const onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : null;
  const maxShows = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 100);

  onProgress?.({ stage: 'fetching', current: 0, total: maxShows, message: 'Fetching Spotify saved shows…' });

  const shows = await withSpotifyToken(userId, (token) =>
    spotifyService.getSavedShows(token, maxShows)
  );

  const items = [];
  let resolvedPlayable = 0;
  let unresolved = 0;
  let inLibrary = 0;

  for (let i = 0; i < shows.length; i++) {
    const show = shows[i];
    if (!show?.id) continue;

    onProgress?.({
      stage: 'resolving',
      current: i + 1,
      total: shows.length,
      message: `Matching “${show.name || 'show'}” to RSS…`,
    });

    const existing = await findExistingSeriesForShow(show);
    const seriesData = spotifyService.convertShowToSeriesFormat(show);

    let resolve = {
      status: 'unresolved',
      rssUrl: null,
      podcastIndexId: null,
      iTunesId: null,
      matchedTitle: null,
      confidence: 0,
      playable: false,
    };

    // If already in library with RSS, treat as playable in-library
    if (existing) {
      const sources = existing.sources instanceof Map
        ? Object.fromEntries(existing.sources)
        : (existing.sources || {});
      const rssUrl = sources.rss || sources.rss_podcastindex || sources.rss_apple || sources.rss_opml || null;
      const piId = existing.externalIds?.podcastIndex || existing.externalIds?.get?.('podcastIndex');
      inLibrary += 1;
      resolve = {
        status: rssUrl || piId ? 'in_library_playable' : 'in_library',
        rssUrl: rssUrl || null,
        podcastIndexId: piId ? String(piId) : null,
        iTunesId: existing.externalIds?.iTunes
          ? String(existing.externalIds.iTunes)
          : (existing.externalIds?.get?.('iTunes') || null),
        matchedTitle: existing.title,
        confidence: 1,
        playable: !!(rssUrl || piId),
      };
    } else {
      try {
        resolve = await resolveShowToFeed({
          title: seriesData.title,
          publisher: seriesData.author,
        });
        // Soft pacing for Podcast Index / Apple
        await sleep(150);
      } catch (err) {
        console.warn('Show resolve failed:', seriesData.title, err.message);
      }

      if (resolve.playable) resolvedPlayable += 1;
      else unresolved += 1;
    }

    const resolveStatus =
      existing
        ? (resolve.playable ? 'in_library' : 'in_library')
        : resolve.playable
          ? 'rss_matched'
          : 'unresolved';

    items.push({
      key: `spotify:${show.id}`,
      spotifyId: show.id,
      title: seriesData.title,
      publisher: seriesData.author || '',
      coverArt: seriesData.image,
      description: seriesData.description || '',
      language: seriesData.language || 'en',
      explicit: !!seriesData.explicit,
      resolveStatus,
      resolveSource: resolve.status === 'unresolved' || String(resolve.status).startsWith('in_library')
        ? (resolve.podcastIndexId ? 'podcastindex' : resolve.rssUrl ? 'apple' : null)
        : resolve.status,
      rssUrl: resolve.rssUrl,
      podcastIndexId: resolve.podcastIndexId,
      iTunesId: resolve.iTunesId,
      matchedTitle: resolve.matchedTitle,
      confidence: resolve.confidence,
      playable: !!resolve.playable,
      existingSeriesId: existing?._id ? String(existing._id) : null,
      selected: !existing && !!resolve.playable,
      spotifyUrl: seriesData.spotifyUrl || `https://open.spotify.com/show/${show.id}`,
    });
  }

  const selectable = items.filter((i) => i.resolveStatus !== 'in_library');

  return {
    source: 'spotify',
    items,
    summary: {
      total: items.length,
      inLibrary,
      rssMatched: items.filter((i) => i.resolveStatus === 'rss_matched').length,
      unresolved,
      resolvedPlayable,
      selectedCount: items.filter((i) => i.selected).length,
      selectableCount: selectable.length,
      scanned: shows.length,
    },
  };
}

function buildSeriesDataFromItem(item) {
  return {
    title: item.matchedTitle || item.title,
    description: item.description || '',
    author: item.publisher || '',
    image: item.coverArt || null,
    categories: [],
    language: item.language || 'en',
    explicit: !!item.explicit,
    rssUrl: item.rssUrl || null,
    podcastIndexId: item.podcastIndexId || null,
    iTunesId: item.iTunesId || null,
    spotifyId: item.spotifyId,
    spotifyUrl: item.spotifyUrl || `https://open.spotify.com/show/${item.spotifyId}`,
  };
}

/**
 * Import selected Spotify shows using resolved RSS / Podcast Index for playable episodes.
 */
async function executeSpotifyPodcastImport(userId, { items, episodesPerShow, onProgress } = {}) {
  const progress = typeof onProgress === 'function' ? onProgress : null;
  const selected = Array.isArray(items) ? items.filter((i) => i && i.spotifyId && i.selected !== false) : [];
  const epLimit = Math.min(
    Math.max(parseInt(episodesPerShow, 10) || DEFAULT_EPISODES_PER_SHOW, 1),
    MAX_EPISODES_PER_SHOW
  );

  if (!selected.length) {
    const err = new Error('No shows selected to import');
    err.code = 'NO_ITEMS';
    throw err;
  }

  const results = {
    seriesImported: 0,
    seriesUpdated: 0,
    episodesImported: 0,
    skipped: 0,
    failed: 0,
    items: [],
  };

  for (let i = 0; i < selected.length; i++) {
    const item = selected[i];
    progress?.({
      stage: 'importing',
      current: i + 1,
      total: selected.length,
      message: `Importing “${item.title}”…`,
      partial: {
        seriesImported: results.seriesImported,
        episodesImported: results.episodesImported,
        failed: results.failed,
      },
    });

    try {
      // Re-resolve if preview didn't find a feed (or stale)
      let rssUrl = item.rssUrl || null;
      let podcastIndexId = item.podcastIndexId || null;
      let iTunesId = item.iTunesId || null;
      let matchedTitle = item.matchedTitle || null;

      if (!rssUrl && !podcastIndexId) {
        const resolved = await resolveShowToFeed({
          title: item.title,
          publisher: item.publisher,
          iTunesId: item.iTunesId,
        });
        rssUrl = resolved.rssUrl;
        podcastIndexId = resolved.podcastIndexId;
        iTunesId = resolved.iTunesId || iTunesId;
        matchedTitle = resolved.matchedTitle;
      }

      const seriesData = buildSeriesDataFromItem({
        ...item,
        rssUrl,
        podcastIndexId,
        iTunesId,
        matchedTitle,
      });

      const before = await Media.findOne({ 'externalIds.spotify': String(item.spotifyId) });
      const series = await podcastAdapter.createOrFindSeries(seriesData, userId, 'spotify');

      // Merge Spotify + PI/Apple IDs onto series if we found a different existing series
      if (series) {
        const ids = series.externalIds instanceof Map
          ? series.externalIds
          : new Map(Object.entries(series.externalIds || {}));
        let dirty = false;
        if (item.spotifyId && !ids.get('spotify')) {
          ids.set('spotify', String(item.spotifyId));
          dirty = true;
        }
        if (podcastIndexId && !ids.get('podcastIndex')) {
          ids.set('podcastIndex', String(podcastIndexId));
          dirty = true;
        }
        if (iTunesId && !ids.get('iTunes')) {
          ids.set('iTunes', String(iTunesId));
          dirty = true;
        }
        if (dirty) {
          series.externalIds = ids;
          const sources = series.sources instanceof Map
            ? series.sources
            : new Map(Object.entries(series.sources || {}));
          if (item.spotifyUrl || item.spotifyId) {
            sources.set('spotify', item.spotifyUrl || `https://open.spotify.com/show/${item.spotifyId}`);
          }
          if (rssUrl) {
            sources.set('rss', rssUrl);
            sources.set('rss_spotify_resolve', rssUrl);
          }
          series.sources = sources;
          await series.save();
        }
      }

      if (before) results.seriesUpdated += 1;
      else results.seriesImported += 1;

      let episodeCount = 0;

      if (podcastIndexId) {
        const epResult = await podcastIndexService.getPodcastEpisodes(podcastIndexId, epLimit);
        const podcastResult = await podcastIndexService.getPodcastById(podcastIndexId);
        const podcastData = podcastResult.podcast
          ? podcastIndexService.convertPodcastToOurFormat(podcastResult.podcast)
          : {
            title: seriesData.title,
            author: seriesData.author,
            image: seriesData.image,
            rssUrl: seriesData.rssUrl,
            podcastIndexId,
          };

        // Keep Spotify identity on series payload used for linkage
        podcastData.spotifyId = item.spotifyId;
        podcastData.spotifyUrl = seriesData.spotifyUrl;
        podcastData.iTunesId = iTunesId || podcastData.iTunesId;

        for (const piEpisode of (epResult.episodes || []).slice(0, epLimit)) {
          try {
            const episodeData = podcastIndexService.convertEpisodeToOurFormat(piEpisode, podcastData);
            await podcastAdapter.importEpisodeWithSeries(
              'podcastIndex',
              episodeData,
              podcastData,
              userId
            );
            episodeCount += 1;
          } catch (epErr) {
            console.warn('Episode import failed:', epErr.message);
          }
        }
      } else if (rssUrl) {
        // Fallback: adapter expects RSS-shaped items — use apple import path via feed when possible
        // Defer to podcast routes' parseRSSFeed pattern via a light inline fetch
        const axios = require('axios');
        const xml2js = require('xml2js');
        const response = await axios.get(rssUrl, {
          timeout: 20000,
          headers: { 'User-Agent': 'Tuneable Podcast Importer' },
        });
        const parsed = await xml2js.parseStringPromise(response.data, { explicitArray: false });
        const channel = parsed?.rss?.channel || parsed?.feed || {};
        const rawItems = channel.item
          ? (Array.isArray(channel.item) ? channel.item : [channel.item])
          : [];

        for (const raw of rawItems.slice(0, epLimit)) {
          try {
            const enclosure = raw.enclosure?.$ || raw.enclosure || {};
            const itunes = raw['itunes:'] || {};
            const item = {
              title: raw.title,
              contentSnippet: typeof raw.description === 'string' ? raw.description : '',
              content: typeof raw.description === 'string' ? raw.description : '',
              guid: typeof raw.guid === 'object' ? raw.guid._ || raw.guid : raw.guid,
              pubDate: raw.pubDate,
              duration: raw['itunes:duration'] || itunes.duration,
              explicit: raw['itunes:explicit'] || itunes.explicit,
              enclosure: {
                url: enclosure.url || enclosure,
                length: enclosure.length,
              },
              feedUrl: rssUrl,
              image: channel['itunes:image']?.href || channel.image?.url || null,
            };
            await podcastAdapter.importEpisodeWithSeries('rss', item, seriesData, userId);
            episodeCount += 1;
          } catch (epErr) {
            console.warn('RSS episode import failed:', epErr.message);
          }
        }
      } else {
        // Unresolved: store series only (no fake playable preview as full audio)
        results.items.push({
          key: item.key,
          title: item.title,
          status: 'series_only',
          reason: 'No RSS/Podcast Index match — series saved without playable episodes',
          seriesId: series?._id ? String(series._id) : null,
          episodesImported: 0,
        });
        results.skipped += 1;
        continue;
      }

      results.episodesImported += episodeCount;
      results.items.push({
        key: item.key,
        title: item.title,
        status: 'imported',
        seriesId: series?._id ? String(series._id) : null,
        episodesImported: episodeCount,
        playable: episodeCount > 0,
        resolveSource: podcastIndexId ? 'podcastindex' : 'rss',
      });
    } catch (err) {
      results.failed += 1;
      results.items.push({
        key: item.key,
        title: item.title,
        status: 'error',
        reason: err.message || 'Import failed',
      });
    }
  }

  return results;
}

module.exports = {
  previewSpotifyPodcastImport,
  executeSpotifyPodcastImport,
};
