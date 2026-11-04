/**
 * Shared rules for counting a listening session as a play.
 * Bias toward under-counting: 30s of credible listen time, or 50% of duration.
 * A client "completed" flag or a seek forward does not qualify on its own.
 * At most one qualified play per listener per tune per day.
 */

const QUALIFIED_LISTEN_SECONDS = 30;
const QUALIFIED_RATIO = 0.5;
const COMPLETED_RATIO = 0.9;
const HEARTBEAT_SLACK_SECONDS = 2;
const FIRST_SAMPLE_MAX_SECONDS = 5;
const MAX_CREDIT_SECONDS = 20;
const PLAY_REPEAT_WINDOW_MS = 24 * 60 * 60 * 1000;

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

function isQualifiedPlay({ positionSeconds, durationSeconds }) {
  const listened = toNonNegativeNumber(positionSeconds);
  const duration = toNonNegativeNumber(durationSeconds);
  if (listened >= QUALIFIED_LISTEN_SECONDS) return true;
  if (duration > 0 && listened / duration >= QUALIFIED_RATIO) return true;
  return false;
}

/**
 * Seconds of listening to credit for one progress report.
 * Forward seeks are capped by the wall-clock time since the previous report.
 * The first report in a session can credit only a few seconds.
 */
function credibleListenDelta({ previousPosition = 0, nextPosition = 0, elapsedSeconds = null }) {
  const previous = toNonNegativeNumber(previousPosition);
  const next = toNonNegativeNumber(nextPosition);
  const movedForward = next - previous;
  if (movedForward <= 0) return 0;

  if (elapsedSeconds == null || !Number.isFinite(Number(elapsedSeconds))) {
    return Math.min(movedForward, FIRST_SAMPLE_MAX_SECONDS);
  }

  const elapsed = Math.max(0, Number(elapsedSeconds));
  return Math.min(movedForward, elapsed + HEARTBEAT_SLACK_SECONDS, MAX_CREDIT_SECONDS);
}

function shouldCountAsPlay({ alreadyCounted, qualified }) {
  return Boolean(qualified) && !alreadyCounted;
}

module.exports = {
  QUALIFIED_LISTEN_SECONDS,
  QUALIFIED_RATIO,
  COMPLETED_RATIO,
  HEARTBEAT_SLACK_SECONDS,
  FIRST_SAMPLE_MAX_SECONDS,
  MAX_CREDIT_SECONDS,
  PLAY_REPEAT_WINDOW_MS,
  VALID_SOURCE_TYPES,
  VALID_CLIENTS,
  toNonNegativeNumber,
  normalizeSourceType,
  normalizeClient,
  computeCompletionPercent,
  isCompletedPlay,
  isQualifiedPlay,
  credibleListenDelta,
  shouldCountAsPlay,
};
