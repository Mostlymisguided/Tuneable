const mongoose = require('mongoose');
const { uuidv7 } = require('uuidv7');
const Media = require('../models/Media');
const ListeningHistory = require('../models/ListeningHistory');
const {
  PLAY_REPEAT_WINDOW_MS,
  computeCompletionPercent,
  credibleListenDelta,
  isCompletedPlay,
  isQualifiedPlay,
  normalizeClient,
  normalizeSourceType,
  toNonNegativeNumber,
} = require('../utils/playQualification');
const { resolveCreatorDisplay } = require('../utils/creatorHelpers');

class ListeningHistoryError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'ListeningHistoryError';
    this.status = status;
  }
}

function formatMediaArtist(media) {
  try {
    return asPlainString(resolveCreatorDisplay(media), 'Unknown Artist');
  } catch (error) {
    console.error('Failed to format media artist for listening history:', error);
    return 'Unknown Artist';
  }
}

function asPlainString(value, fallback = '') {
  if (value == null || value === '') return fallback;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (Array.isArray(value)) {
    const names = value
      .map((entry) => {
        if (typeof entry === 'string') return entry.trim();
        if (entry && typeof entry === 'object' && entry.name) return String(entry.name).trim();
        return '';
      })
      .filter(Boolean);
    return names.join(' & ') || fallback;
  }
  if (typeof value === 'object' && value.name) return String(value.name);
  return fallback;
}

async function resolveMediaByIdentifier(identifier) {
  if (!identifier) return null;
  try {
    return Media.findByIdentifier(identifier);
  } catch (error) {
    console.error('Failed to resolve media for listening history:', error);
    return null;
  }
}

function elapsedSince(date, now) {
  if (!date) return null;
  const then = new Date(date).getTime();
  if (!Number.isFinite(then)) return null;
  return Math.max(0, (now.getTime() - then) / 1000);
}

function formatPlaySession(entry) {
  const user = entry.userId && typeof entry.userId === 'object' ? entry.userId : null;
  return {
    _id: entry._id,
    uuid: entry.uuid,
    sessionId: entry.sessionId,
    sourceType: entry.sourceType,
    client: entry.client || 'web',
    status: entry.status,
    startedAt: entry.startedAt,
    lastPlayedAt: entry.lastPlayedAt,
    qualifiedAt: entry.qualifiedAt || null,
    listenDurationSeconds: entry.listenDurationSeconds || 0,
    completionPercent: entry.completionPercent || 0,
    countedAsPlay: Boolean(entry.countedAsPlay),
    mediaTitle: entry.mediaTitle || '',
    user: user ? {
      _id: user._id,
      uuid: user.uuid || null,
      username: user.username || 'Unknown',
      profilePic: user.profilePic || '',
    } : null,
  };
}

/**
 * Upsert a listening session. The first time a session crosses the
 * qualified-play threshold, increment Media.playCount exactly once,
 * and at most once per listener per tune per day.
 * Listen time follows playback, so a seek ahead does not count.
 */
async function trackListeningSession({
  userId,
  mediaId,
  sessionId,
  sourceType = 'unknown',
  startedAt,
  currentTime = 0,
  duration = 0,
  completed = false,
  mediaTitle,
  mediaArtist,
  mediaCoverArt,
  client = 'web',
}) {
  if (!userId) {
    throw new ListeningHistoryError(401, 'Authentication required');
  }
  if (!mediaId || !sessionId) {
    throw new ListeningHistoryError(400, 'mediaId and sessionId are required');
  }

  const media = await resolveMediaByIdentifier(mediaId);
  if (!media) {
    throw new ListeningHistoryError(404, 'Media not found');
  }

  const now = new Date();
  const numericPosition = toNonNegativeNumber(currentTime);
  const numericDuration = toNonNegativeNumber(duration) || toNonNegativeNumber(media.duration);
  const completionPercent = computeCompletionPercent(numericPosition, numericDuration);
  const derivedCompleted = isCompletedPlay({
    positionSeconds: numericPosition,
    durationSeconds: numericDuration,
    completed,
  });
  const normalizedSourceType = normalizeSourceType(sourceType);
  const normalizedClient = normalizeClient(client);

  const existing = await ListeningHistory.findOne({ userId, sessionId });
  const listenDelta = credibleListenDelta({
    previousPosition: existing?.lastPositionSeconds || 0,
    nextPosition: numericPosition,
    elapsedSeconds: elapsedSince(existing?.lastPlayedAt, now),
  });
  const listenDurationSeconds = toNonNegativeNumber(existing?.listenDurationSeconds) + listenDelta;
  const qualified = isQualifiedPlay({
    positionSeconds: listenDurationSeconds,
    durationSeconds: numericDuration,
  });

  const setFields = {
    mediaId: media._id,
    sourceType: normalizedSourceType,
    client: normalizedClient,
    mediaTitle: asPlainString(mediaTitle, media.title || ''),
    mediaArtist: asPlainString(mediaArtist, formatMediaArtist(media)),
    mediaCoverArt: asPlainString(mediaCoverArt, media.coverArt || ''),
    mediaDuration: numericDuration,
    lastPlayedAt: now,
    lastPositionSeconds: numericPosition,
    listenDurationSeconds,
    completionPercent,
    status: derivedCompleted ? 'completed' : (listenDurationSeconds > 0 ? 'partial' : 'in_progress'),
    completedAt: derivedCompleted ? (existing?.completedAt || now) : existing?.completedAt || null,
  };

  let history;
  try {
    history = await ListeningHistory.findOneAndUpdate(
      { userId, sessionId },
      {
        $setOnInsert: {
          userId,
          mediaId: media._id,
          sessionId,
          uuid: uuidv7(),
          startedAt: startedAt ? new Date(startedAt) : now,
          countedAsPlay: false,
        },
        $set: setFields,
      },
      {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true,
      }
    );
  } catch (error) {
    if (error?.code === 11000) {
      history = await ListeningHistory.findOneAndUpdate(
        { userId, sessionId },
        { $set: setFields },
        { new: true }
      );
    }
    if (!history) {
      if (error?.name === 'ValidationError' || error?.name === 'CastError') {
        throw new ListeningHistoryError(400, error.message);
      }
      throw error;
    }
  }

  let playCounted = false;
  if (qualified && !history.countedAsPlay) {
    const windowStart = new Date(now.getTime() - PLAY_REPEAT_WINDOW_MS);
    const alreadyCountedToday = await ListeningHistory.findOne({
      userId,
      mediaId: media._id,
      countedAsPlay: true,
      qualifiedAt: { $gte: windowStart },
      _id: { $ne: history._id },
    });

    if (alreadyCountedToday) {
      return { history, playCounted: false };
    }

    const claimed = await ListeningHistory.findOneAndUpdate(
      { _id: history._id, countedAsPlay: { $ne: true } },
      {
        $set: {
          countedAsPlay: true,
          qualifiedAt: now,
        },
      },
      { new: true }
    );

    if (claimed) {
      await Media.updateOne({ _id: media._id }, { $inc: { playCount: 1 } });
      playCounted = true;
      history.countedAsPlay = true;
      history.qualifiedAt = now;
    }
  }

  return { history, playCounted };
}

async function getPlayOverview(now = new Date()) {
  const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const countedSince = (since) => ({ countedAsPlay: true, qualifiedAt: { $gte: since } });

  const [playsToday, playsThisWeek, listenerIds] = await Promise.all([
    ListeningHistory.countDocuments(countedSince(startOfToday)),
    ListeningHistory.countDocuments(countedSince(weekAgo)),
    ListeningHistory.distinct('userId', countedSince(weekAgo)),
  ]);

  return {
    playsToday,
    playsThisWeek,
    uniqueListenersThisWeek: listenerIds.length,
  };
}

async function listMediaPlaySessions(mediaIdentifier, {
  page = 1,
  limit = 25,
  countedOnly = true,
} = {}) {
  const media = await resolveMediaByIdentifier(mediaIdentifier);
  if (!media) {
    throw new ListeningHistoryError(404, 'Media not found');
  }

  const pageNumber = Math.max(1, parseInt(page, 10) || 1);
  const limitNumber = Math.min(100, Math.max(1, parseInt(limit, 10) || 25));
  const skip = (pageNumber - 1) * limitNumber;
  const query = { mediaId: media._id };
  if (countedOnly) query.countedAsPlay = true;

  const [total, items, qualifiedPlays, listenerIds] = await Promise.all([
    ListeningHistory.countDocuments(query),
    ListeningHistory.find(query)
      .sort({ lastPlayedAt: -1 })
      .skip(skip)
      .limit(limitNumber)
      .populate('userId', 'username profilePic uuid')
      .lean(),
    ListeningHistory.countDocuments({ mediaId: media._id, countedAsPlay: true }),
    ListeningHistory.distinct('userId', { mediaId: media._id, countedAsPlay: true }),
  ]);

  return {
    media: {
      _id: media._id,
      title: media.title || '',
      playCount: media.playCount || 0,
      creatorDisplay: formatMediaArtist(media),
    },
    summary: {
      qualifiedPlays,
      uniqueListeners: listenerIds.length,
    },
    sessions: items.map(formatPlaySession),
    pagination: {
      page: pageNumber,
      limit: limitNumber,
      total,
      totalPages: Math.ceil(total / limitNumber),
    },
  };
}

module.exports = {
  ListeningHistoryError,
  formatMediaArtist,
  resolveMediaByIdentifier,
  trackListeningSession,
  getPlayOverview,
  listMediaPlaySessions,
};
