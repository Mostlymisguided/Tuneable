const mongoose = require('mongoose');
const { uuidv7 } = require('uuidv7');
const Media = require('../models/Media');
const ListeningHistory = require('../models/ListeningHistory');
const {
  computeCompletionPercent,
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

/**
 * Upsert a listening session. The first time a session crosses the
 * qualified-play threshold, increment Media.playCount exactly once.
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
  const qualified = isQualifiedPlay({
    positionSeconds: numericPosition,
    durationSeconds: numericDuration,
    completed: derivedCompleted,
  });
  const normalizedSourceType = normalizeSourceType(sourceType);
  const normalizedClient = normalizeClient(client);

  const existing = await ListeningHistory.findOne({ userId, sessionId });
  const listenDurationSeconds = Math.max(
    numericPosition,
    existing?.listenDurationSeconds || 0
  );

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

module.exports = {
  ListeningHistoryError,
  formatMediaArtist,
  resolveMediaByIdentifier,
  trackListeningSession,
};
