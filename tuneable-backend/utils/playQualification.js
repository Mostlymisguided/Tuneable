/**
 * Shared rules for counting a listening session as a play.
 * Bias toward under-counting: 30s listened or 50% of duration.
 */

const QUALIFIED_LISTEN_SECONDS = 30;
const QUALIFIED_RATIO = 0.5;
const COMPLETED_RATIO = 0.9;

const VALID_SOURCE_TYPES = [
  'user_queue',
  'library',
  'party',
  'search',
  'profile',
  'direct',
  'unknown',
];

const VALID_CLIENTS = ['web', 'mobile', 'ios'];

function toNonNegativeNumber(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return 0;
  return numeric;
}

function normalizeSourceType(sourceType) {
  if (VALID_SOURCE_TYPES.includes(sourceType)) return sourceType;
  return 'unknown';
}

function normalizeClient(client) {
  if (VALID_CLIENTS.includes(client)) return client;
  return 'web';
}

function computeCompletionPercent(positionSeconds, durationSeconds) {
  const position = toNonNegativeNumber(positionSeconds);
  const duration = toNonNegativeNumber(durationSeconds);
  if (duration <= 0) return 0;
  return Math.min(100, Math.round((position / duration) * 1000) / 10);
}

function isCompletedPlay({ positionSeconds, durationSeconds, completed = false }) {
  if (completed === true) return true;
  const duration = toNonNegativeNumber(durationSeconds);
  if (duration <= 0) return false;
  return toNonNegativeNumber(positionSeconds) / duration >= COMPLETED_RATIO;
}

function isQualifiedPlay({ positionSeconds, durationSeconds, completed = false }) {
  if (isCompletedPlay({ positionSeconds, durationSeconds, completed })) {
    return true;
  }
  const position = toNonNegativeNumber(positionSeconds);
  const duration = toNonNegativeNumber(durationSeconds);
  if (position >= QUALIFIED_LISTEN_SECONDS) return true;
  if (duration > 0 && position / duration >= QUALIFIED_RATIO) return true;
  return false;
}

function shouldCountAsPlay({ alreadyCounted, qualified }) {
  return Boolean(qualified) && !alreadyCounted;
}

module.exports = {
  QUALIFIED_LISTEN_SECONDS,
  QUALIFIED_RATIO,
  COMPLETED_RATIO,
  VALID_SOURCE_TYPES,
  VALID_CLIENTS,
  toNonNegativeNumber,
  normalizeSourceType,
  normalizeClient,
  computeCompletionPercent,
  isCompletedPlay,
  isQualifiedPlay,
  shouldCountAsPlay,
};
