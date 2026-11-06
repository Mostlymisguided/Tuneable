const mongoose = require('mongoose');
const Bid = require('../models/Bid');
const TimelineMark = require('../models/TimelineMark');

const NOTE_MAX = 140;
const MAX_MARK_SECONDS = 60 * 60 * 6;

function httpError(status, message, code) {
  const error = new Error(message);
  error.status = status;
  if (code) error.code = code;
  return error;
}

function normalizeNote(note) {
  if (note == null) return '';
  const trimmed = String(note).trim();
  if (trimmed.length > NOTE_MAX) {
    throw httpError(400, `Note must be ${NOTE_MAX} characters or less`);
  }
  return trimmed;
}

function clampTimestamp(seconds, duration) {
  const value = Number(seconds);
  if (!Number.isFinite(value) || value < 0) {
    throw httpError(400, 'Pick a moment on the tune');
  }
  const rounded = Math.round(value * 10) / 10;
  if (rounded > MAX_MARK_SECONDS) {
    throw httpError(400, 'That moment is past the end of the tune');
  }
  const cap = Number(duration);
  if (Number.isFinite(cap) && cap > 0 && rounded > cap + 1.5) {
    throw httpError(400, 'That moment is past the end of the tune');
  }
  return rounded;
}

function presentMark(mark) {
  const user = mark.userId && typeof mark.userId === 'object' ? mark.userId : null;
  const bid = mark.bidId && typeof mark.bidId === 'object' ? mark.bidId : null;
  return {
    _id: mark._id,
    timestampSeconds: mark.timestampSeconds,
    note: mark.note || '',
    amountPence: typeof bid?.amount === 'number' ? bid.amount : mark.amountPence,
    createdAt: mark.createdAt,
    user: user ? {
      _id: user._id,
      username: user.username,
      profilePic: user.profilePic || null,
      uuid: user.uuid || null,
    } : null,
  };
}

function isActiveBid(mark) {
  const bid = mark.bidId;
  return Boolean(bid && typeof bid === 'object' && bid.status === 'active');
}

async function listTimelineMarks(mediaId, { viewerId = null, blockedUserIds = [] } = {}) {
  const query = {
    mediaId,
    isDeleted: false,
    ...(blockedUserIds.length ? { userId: { $nin: blockedUserIds } } : {}),
  };

  const marks = await TimelineMark.find(query)
    .populate('userId', 'username profilePic uuid')
    .populate('bidId', 'status amount')
    .sort({ timestampSeconds: 1, createdAt: 1 })
    .lean();

  const visible = marks.filter(isActiveBid).map(presentMark).filter((mark) => mark.user);

  let viewer = null;
  if (viewerId) {
    const usedBidIds = await TimelineMark.find({
      mediaId,
      userId: viewerId,
      isDeleted: false,
    }).distinct('bidId');
    const unusedBidCount = await Bid.countDocuments({
      mediaId,
      userId: viewerId,
      status: 'active',
      _id: { $nin: usedBidIds },
    });
    viewer = {
      unusedBidCount,
      canMark: unusedBidCount > 0,
    };
  }

  return { marks: visible, viewer };
}

async function loadOwnedMark(mark) {
  await mark.populate('userId', 'username profilePic uuid');
  await mark.populate('bidId', 'status amount');
  return presentMark(mark.toObject());
}

async function createTimelineMark({ media, userId, timestampSeconds, note, bidId }) {
  const timestamp = clampTimestamp(timestampSeconds, media.duration);
  const cleanNote = normalizeNote(note);

  let bid = null;
  if (bidId) {
    if (!mongoose.Types.ObjectId.isValid(bidId)) {
      throw httpError(400, 'That tip cannot hold a mark');
    }
    bid = await Bid.findOne({
      _id: bidId,
      mediaId: media._id,
      userId,
      status: 'active',
    });
    if (!bid) {
      throw httpError(400, 'That tip cannot hold a mark');
    }
  } else {
    const usedBidIds = await TimelineMark.find({
      mediaId: media._id,
      userId,
      isDeleted: false,
    }).distinct('bidId');
    bid = await Bid.findOne({
      mediaId: media._id,
      userId,
      status: 'active',
      _id: { $nin: usedBidIds },
    }).sort({ createdAt: 1 });
  }

  if (!bid) {
    throw httpError(403, 'Tip this tune to mark a moment', 'TIP_REQUIRED');
  }

  const existing = await TimelineMark.findOne({ bidId: bid._id, isDeleted: false }).select('_id');
  if (existing) {
    throw httpError(409, 'That tip already has a mark');
  }

  const mark = new TimelineMark({
    mediaId: media._id,
    userId,
    bidId: bid._id,
    timestampSeconds: timestamp,
    note: cleanNote,
    amountPence: bid.amount,
  });

  try {
    await mark.save();
  } catch (error) {
    if (error && error.code === 11000) {
      throw httpError(409, 'That tip already has a mark');
    }
    throw error;
  }

  return loadOwnedMark(mark);
}

async function attachTipMoment({ media, userId, bid, moment }) {
  if (!moment || moment.timestampSeconds == null || !bid || !media) return null;
  try {
    return await createTimelineMark({
      media,
      userId,
      bidId: bid._id,
      timestampSeconds: moment.timestampSeconds,
      note: moment.note,
    });
  } catch (error) {
    console.warn('Timeline mark skipped:', error.message);
    return null;
  }
}

async function deleteTimelineMark({ mediaId, markId, userId }) {
  const mark = await TimelineMark.findOne({ _id: markId, mediaId, isDeleted: false });
  if (!mark) {
    throw httpError(404, 'Mark not found');
  }
  if (mark.userId.toString() !== userId.toString()) {
    throw httpError(403, 'You can only remove your own mark');
  }
  mark.isDeleted = true;
  mark.deletedAt = new Date();
  await mark.save();
  return { deleted: true };
}

module.exports = {
  NOTE_MAX,
  normalizeNote,
  clampTimestamp,
  listTimelineMarks,
  createTimelineMark,
  deleteTimelineMark,
  attachTipMoment,
};
