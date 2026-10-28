/**
 * Artist-chosen use of a tune, separate from rightsStatus (whether it may play at all).
 *
 * personalStreaming is always included once a choice is saved.
 * Public streaming, personal download, rework requests, and commercial requests
 * stay off until the artist turns them on.
 *
 * licence.chosen !== true means no choice has been saved. Those tunes keep the
 * previous behaviour: they may join a party, and copy access follows copySharePercent.
 */

const mongoose = require('mongoose');
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

  const publicStreaming = input.publicStreaming === true;
  const personalDownload = input.personalDownload === true;
  const floor = parsePence(input.publicStreamingFloorPence, 'Public streaming minimum tip');
  if (floor.error) return { error: floor.error };
  if (publicStreaming && floor.pence == null && input.publicStreamingFloorPence != null && input.publicStreamingFloorPence !== '') {
    return { error: 'Public streaming minimum tip must be a whole number of pence' };
  }

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
      publicStreaming,
      publicStreamingFloorPence: publicStreaming ? floor.pence : null,
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
    chosenBy: userId || null,
    chosenAt: new Date(),
  };
}

function formatPounds(pence) {
  return `£${(Number(pence) / 100).toFixed(2)}`;
}

function partyQueueBlock({ media, priorTipPence = 0, bidAmountPence = 0 }) {
  if (!media?.licence?.chosen) return { ok: true };
  const title = media.title || 'This tune';
  if (media.licence.publicStreaming !== true) {
    return {
      ok: false,
      status: 403,
      code: 'personal_only',
      error: `${title} is licensed for personal listening. It can't be added to a party.`,
    };
  }
  const floor = media.licence.publicStreamingFloorPence;
  if (!floor) return { ok: true };
  const yourTipPence = Math.max(0, Number(priorTipPence) || 0) + Math.max(0, Number(bidAmountPence) || 0);
  if (yourTipPence < floor) {
    return {
      ok: false,
      status: 400,
      code: 'public_floor',
      error: `${title} needs ${formatPounds(floor)} in tips from you before it can join a party. This tip brings you to ${formatPounds(yourTipPence)}.`,
      floorPence: floor,
      yourTipPence,
    };
  }
  return { ok: true };
}

async function userActiveTipPence(userId, mediaId) {
  const Bid = require('../models/Bid');
  const rows = await Bid.aggregate([
    {
      $match: {
        userId: new mongoose.Types.ObjectId(String(userId)),
        mediaId: new mongoose.Types.ObjectId(String(mediaId)),
        status: 'active',
      },
    },
    { $group: { _id: null, total: { $sum: '$amount' } } },
  ]);
  return rows[0]?.total || 0;
}

async function assertPartyQueueLicence({ media, userId, bidAmountPence }) {
  if (!media?.licence?.chosen || media.licence.publicStreaming !== true || !media.licence.publicStreamingFloorPence) {
    return partyQueueBlock({ media, priorTipPence: 0, bidAmountPence });
  }
  const priorTipPence = await userActiveTipPence(userId, media._id);
  return partyQueueBlock({ media, priorTipPence, bidAmountPence });
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
  formatPounds,
  partyQueueBlock,
  userActiveTipPence,
  assertPartyQueueLicence,
  replayFixedFloor,
  downloadDecision,
};
