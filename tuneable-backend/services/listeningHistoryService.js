const mongoose = require('mongoose');
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

class ListeningHistoryError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'ListeningHistoryError';
    this.status = status;
  }
}

function formatMediaArtist(media) {
  if (!media) return 'Unknown Artist';
  if (media.creatorDisplay) return media.creatorDisplay;
  if (Array.isArray(media.artist) && media.artist.length > 0) {
    return media.artist
      .map((artist) => (typeof artist === 'string' ? artist : artist?.name))
      .filter(Boolean)
      .join(', ');
  }
  if (typeof media.artist === 'string' && media.artist.trim()) {
    return media.artist;
  }
  return 'Unknown Artist';
}

async function resolveMediaByIdentifier(identifier) {
  if (!identifier) return null;
  if (mongoose.Types.ObjectId.isValid(identifier)) {
    const byId = await Media.findById(identifier);
    if (byId) return byId;
  }
  return Media.findOne({ uuid: identifier });
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

  const history = await ListeningHistory.findOneAndUpdate(
    { userId, sessionId },
    {
      $setOnInsert: {
        userId,
        mediaId: media._id,
        sessionId,
        startedAt: startedAt ? new Date(startedAt) : now,
        countedAsPlay: false,
      },
      $set: {
        mediaId: media._id,
        sourceType: normalizedSourceType,
        client: normalizedClient,
        mediaTitle: mediaTitle || media.title || '',
        mediaArtist: mediaArtist || formatMediaArtist(media),
        mediaCoverArt: mediaCoverArt || media.coverArt || '',
        mediaDuration: numericDuration,
        lastPlayedAt: now,
        lastPositionSeconds: numericPosition,
        listenDurationSeconds,
        completionPercent,
        status: derivedCompleted ? 'completed' : (listenDurationSeconds > 0 ? 'partial' : 'in_progress'),
        completedAt: derivedCompleted ? (existing?.completedAt || now) : existing?.completedAt || null,
      },
    },
    {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true,
    }
  );

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
