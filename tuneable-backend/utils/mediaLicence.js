/**
 * Artist-chosen use of a tune, separate from rightsStatus (whether it may play at all).
 *
 * Streaming is one included licence: a listener's library, parties, and public charts.
 * Personal download, rework requests, and commercial requests stay off until the artist
 * turns them on.
 *
 * licence.chosen !== true means no choice has been saved. Copy access then follows
 * copySharePercent. Streaming is not gated on that flag.
 */

const { isPodcastLike } = require('./mediaPlayability');
const { isWrittenMedia } = require('./mediaKinds');

const MAX_PENCE = 10000000;

function musicTuneNeedsLicence(media) {
  if (!media) return false;
  if (isPodcastLike(media) || isWrittenMedia(media)) return false;
  return true;
}

function parsePence(value, label) {
  if (value === null || value === undefined || value === '') {
    return { pence: null };
  }
  const n = typeof value === 'string' ? Number(value) : value;
  if (!Number.isInteger(n) || n < 1 || n > MAX_PENCE) {
    return { error: `${label} must be a whole number of pence from 1 to ${MAX_PENCE}` };
  }
  return { pence: n };
}

function parseLicenceChoice(raw) {
  let input = raw;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return { error: 'Choose a licence for this tune' };
    try {
      input = JSON.parse(trimmed);
    } catch (_error) {
      return { error: 'Licence choice is not valid' };
    }
  }
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { error: 'Choose a licence for this tune' };
  }

  const personalDownload = input.personalDownload === true;
  const unlockInput = personalDownload && (input.personalDownloadUnlockPence == null || input.personalDownloadUnlockPence === '')
    ? 1
    : input.personalDownloadUnlockPence;
  const unlock = parsePence(unlockInput, 'Download unlock tip');
  if (unlock.error) return { error: unlock.error };
  if (personalDownload && unlock.pence == null) {
    return { error: 'Set a download unlock of at least 1p' };
  }

  return {
    licence: {
      chosen: true,
      personalStreaming: true,
      publicStreaming: true,
      publicStreamingFloorPence: null,
      personalDownload,
      personalDownloadUnlockPence: personalDownload ? unlock.pence : null,
      openToRework: input.openToRework === true,
      openToCommercial: input.openToCommercial === true,
    },
  };
}

function stampLicence(licence, userId) {
  return {
    ...licence,
    chosen: true,
    personalStreaming: true,
    publicStreaming: true,
    publicStreamingFloorPence: null,
    chosenBy: userId || null,
    chosenAt: new Date(),
  };
}

/**
 * Fixed-pence download unlock, walked in time order.
 * A listener who clears the floor keeps the copy if a later change raises it,
 * until their own remaining total falls under the floor they cleared.
 */
function replayFixedFloor(events, floorPence) {
  const floor = Math.max(1, Number(floorPence) || 1);
  const sorted = [...events].sort((a, b) => {
    if (a.at !== b.at) return a.at - b.at;
    if (a.type === b.type) return 0;
    return a.type === 'tip' ? -1 : 1;
  });
  const totals = new Map();
  const unlocks = new Map();

  for (const event of sorted) {
    const prev = totals.get(event.userId) || 0;
    const next = event.type === 'tip' ? prev + event.amount : prev - event.amount;
    if (next > 0) totals.set(event.userId, next);
    else totals.delete(event.userId);

    const total = totals.get(event.userId) || 0;
    if (total >= floor && !unlocks.has(event.userId)) {
      unlocks.set(event.userId, {
        userId: event.userId,
        thresholdAtGrant: floor,
        totalAtGrant: total,
        unlockedAt: event.at,
      });
    }

    for (const [userId, unlock] of unlocks) {
      const running = totals.get(userId) || 0;
      if (running < unlock.thresholdAtGrant && running < floor) unlocks.delete(userId);
    }
  }

  return [...unlocks.values()];
}

function downloadDecision({
  explicit = false,
  personalDownload = false,
  unlockPence = null,
  userTotalPence = 0,
  existingUnlock = null,
}) {
  if (!explicit) return { mode: 'share' };
  if (!personalDownload) {
    return {
      mode: 'closed',
      unlocked: Boolean(existingUnlock),
      grandfathered: Boolean(existingUnlock),
      thresholdPence: null,
    };
  }
  const floor = unlockPence || 1;
  const qualified = userTotalPence >= floor;
  const grandfathered = Boolean(existingUnlock)
    && !qualified
    && userTotalPence >= (existingUnlock.thresholdAtGrant || 0);
  return {
    mode: 'pence',
    thresholdPence: floor,
    unlocked: qualified || grandfathered,
    grandfathered,
  };
}

module.exports = {
  MAX_PENCE,
  musicTuneNeedsLicence,
  parseLicenceChoice,
  stampLicence,
  replayFixedFloor,
  downloadDecision,
};
