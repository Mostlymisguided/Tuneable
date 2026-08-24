/**
 * Admin test-user factory and purge.
 *
 * Create: password user flagged isTestUser, joined to Global Party.
 * Purge: unwind active tips (escrow + metrics + party bid refs), then hard-delete
 * the user and their leftover rows. Media they uploaded is left in place.
 */

const crypto = require('crypto');
const User = require('../models/User');
const Bid = require('../models/Bid');
const Party = require('../models/Party');
const Media = require('../models/Media');
const Comment = require('../models/Comment');
const Notification = require('../models/Notification');
const ListeningHistory = require('../models/ListeningHistory');
const TuneableLedger = require('../models/TuneableLedger');
const WalletTransaction = require('../models/WalletTransaction');
const TuneBytesTransaction = require('../models/TuneBytesTransaction');
const RefundRequest = require('../models/RefundRequest');
const Claim = require('../models/Claim');
const PayoutRequest = require('../models/PayoutRequest');
const SpotifyImportRequest = require('../models/SpotifyImportRequest');
const MediaTagClaim = require('../models/MediaTagClaim');
const ArtistEscrowAllocation = require('../models/ArtistEscrowAllocation');
const Report = require('../models/Report');
const Label = require('../models/Label');
const Collective = require('../models/Collective');
const Conversation = require('../models/Conversation');
const { MIN_USERNAME_LENGTH, MAX_USERNAME_LENGTH } = require('../utils/oauthUsername');

const MEDIA_CREATOR_ARRAYS = [
  'artist',
  'producer',
  'featuring',
  'songwriter',
  'composer',
  'mixedBy',
  'masteredBy',
  'host',
  'guest',
  'narrator',
  'director',
  'cinematographer',
  'editor',
  'author',
];

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function generateInviteCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 5; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function generatePassword() {
  return crypto.randomBytes(9).toString('base64url');
}

function normalizeUsername(raw) {
  return String(raw || '').trim();
}

function assertUsernameShape(username) {
  if (username.length < MIN_USERNAME_LENGTH || username.length > MAX_USERNAME_LENGTH) {
    throw httpError(
      400,
      `Username must be ${MIN_USERNAME_LENGTH}–${MAX_USERNAME_LENGTH} characters`
    );
  }
  if (!/^[a-zA-Z0-9]+$/.test(username)) {
    throw httpError(400, 'Username must be letters and numbers only');
  }
}

function isAdminUser(user) {
  return Array.isArray(user?.role) && user.role.includes('admin');
}

function assertCanPurge(targetUser, actorUser) {
  if (!targetUser) {
    throw httpError(404, 'User not found');
  }
  if (!actorUser) {
    throw httpError(401, 'Authentication required');
  }
  if (String(targetUser._id) === String(actorUser._id)) {
    throw httpError(400, 'You cannot delete your own account from admin');
  }
  if (isAdminUser(targetUser)) {
    throw httpError(403, 'Admin accounts cannot be deleted');
  }
}

function poundsToPence(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n) || n < 0) {
    throw httpError(400, 'Balance must be a number of pounds 0 or greater');
  }
  return Math.round(n * 100);
}

async function createTestUser({ username, password, balancePounds = 0 } = {}) {
  const normalized = normalizeUsername(username);
  if (!normalized) {
    throw httpError(400, 'Username is required');
  }
  assertUsernameShape(normalized);

  const existing = await User.findOne({
    username: { $regex: new RegExp(`^${normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
  }).select('_id username');
  if (existing) {
    throw httpError(409, `Username "${existing.username}" is already taken`);
  }

  const plaintextPassword = password && String(password).trim()
    ? String(password).trim()
    : generatePassword();
  if (plaintextPassword.length < 6) {
    throw httpError(400, 'Password must be at least 6 characters');
  }

  const inviteCode = generateInviteCode();
  const balancePence = poundsToPence(balancePounds || 0);

  const user = new User({
    username: normalized,
    password: plaintextPassword,
    isActive: true,
    isTestUser: true,
    role: ['user'],
    balance: balancePence,
    emailVerified: true,
    personalInviteCode: inviteCode,
    personalInviteCodes: [
      {
        code: inviteCode,
        isActive: true,
        label: 'Primary',
        createdAt: new Date(),
        usageCount: 0,
      },
    ],
  });
  await user.save();

  try {
    await Party.joinUserToGlobalParty(user);
  } catch (err) {
    console.error('Failed to join test user to Global Party:', err);
  }

  const fresh = await User.findById(user._id).select('-password').lean();
  return {
    message: `Created test user ${normalized}`,
    password: plaintextPassword,
    passwordGenerated: !(password && String(password).trim()),
    user: fresh,
  };
}

async function previewPurge(userId) {
  const user = await User.findById(userId).select(
    'username email role isTestUser isActive deletedAt balance artistEscrowBalance'
  );
  if (!user) {
    throw httpError(404, 'User not found');
  }

  const [
    bidCount,
    activeBids,
    ledgerCount,
    commentCount,
    notificationCount,
    listeningCount,
    mediaAddedCount,
    mediaOwnedCount,
    partyCount,
  ] = await Promise.all([
    Bid.countDocuments({ userId: user._id }),
    Bid.aggregate([
      { $match: { userId: user._id, status: 'active' } },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          totalPence: { $sum: '$amount' },
        },
      },
    ]),
    TuneableLedger.countDocuments({ userId: user._id }),
    Comment.countDocuments({ userId: user._id }),
    Notification.countDocuments({ userId: user._id }),
    ListeningHistory.countDocuments({ userId: user._id }),
    Media.countDocuments({ addedBy: user._id }),
    Media.countDocuments({ 'mediaOwners.userId': user._id }),
    Party.countDocuments({ partiers: user._id }),
  ]);

  const active = activeBids[0] || { count: 0, totalPence: 0 };

  return {
    user: {
      _id: user._id,
      username: user.username,
      email: user.email || null,
      isTestUser: !!user.isTestUser,
      isAdmin: isAdminUser(user),
      isActive: user.isActive,
      balance: user.balance || 0,
      artistEscrowBalance: user.artistEscrowBalance || 0,
    },
    counts: {
      bids: bidCount,
      activeBids: active.count,
      activeBidPence: active.totalPence || 0,
      ledgerEntries: ledgerCount,
      comments: commentCount,
      notifications: notificationCount,
      listeningHistory: listeningCount,
      mediaAdded: mediaAddedCount,
      mediaOwned: mediaOwnedCount,
      parties: partyCount,
    },
  };
}

async function unwindActiveTips(user, actorId) {
  const artistEscrowService = require('./artistEscrowService');
  const bidMetricsEngine = require('./bidMetricsEngine');
  const tuneableLedgerService = require('./tuneableLedgerService');

  const activeBids = await Bid.find({ userId: user._id, status: 'active' });
  let refundedCount = 0;
  let refundedPence = 0;
  const touchedMediaIds = new Set();

  for (const bid of activeBids) {
    const media = bid.mediaId
      ? await Media.findById(bid.mediaId).select('_id uuid title globalMediaAggregate')
      : null;

    if (media) {
      touchedMediaIds.add(media._id.toString());
      const userBidsPre = await Bid.find({
        userId: user._id,
        status: 'active',
      }).select('amount').lean();
      const userAggregatePre = userBidsPre.reduce((sum, b) => sum + (b.amount || 0), 0);

      try {
        await tuneableLedgerService.createRefundEntry({
          userId: user._id,
          mediaId: media._id,
          partyId: bid.partyId || null,
          bidId: bid._id,
          amount: bid.amount,
          userBalancePre: user.balance || 0,
          userAggregatePre,
          mediaAggregatePre: media.globalMediaAggregate || 0,
          referenceTransactionId: null,
          metadata: {
            reason: 'Admin purged user',
            purgedBy: actorId?.toString(),
            purgedUsername: user.username,
          },
        });
      } catch (ledgerError) {
        console.error(`Failed to create refund ledger for bid ${bid._id}:`, ledgerError);
      }
    }

    try {
      await artistEscrowService.reverseEscrowForBid(bid, bid.amount);
    } catch (escrowError) {
      console.error(`Failed to reverse escrow for bid ${bid._id}:`, escrowError);
    }

    try {
      await bidMetricsEngine.updateMetricsForBidChange({
        _id: bid._id,
        userId: bid.userId,
        mediaId: bid.mediaId,
        partyId: bid.partyId,
        amount: bid.amount,
      }, 'delete');
    } catch (metricsError) {
      console.error(`Failed to update metrics for bid ${bid._id}:`, metricsError);
    }

    if (bid.partyId && bid.mediaId) {
      try {
        await Party.updateOne(
          { _id: bid.partyId, 'media.mediaId': bid.mediaId },
          {
            $pull: { 'media.$.partyBids': bid._id },
            $inc: { 'media.$.partyMediaAggregate': -Math.abs(bid.amount || 0) },
          }
        );
      } catch (partyError) {
        console.error(`Failed to pull bid ${bid._id} from party media:`, partyError);
      }
    }

    await Bid.updateOne(
      { _id: bid._id },
      {
        $set: {
          status: 'refunded',
          refundedAt: new Date(),
          refundedBy: actorId,
          refundReason: 'Admin purged user',
        },
      }
    );

    refundedCount += 1;
    refundedPence += bid.amount || 0;
  }

  return { refundedCount, refundedPence, touchedMediaIds };
}

async function refundConversationPledges(userId) {
  const conversations = await Conversation.find({
    'pledges.userId': userId,
    'pledges.status': 'active',
  });

  let refunded = 0;
  for (const conversation of conversations) {
    let changed = false;
    for (const pledge of conversation.pledges || []) {
      if (pledge.status === 'active' && pledge.userId && String(pledge.userId) === String(userId)) {
        pledge.status = 'refunded';
        pledge.refundedAt = new Date();
        changed = true;
        refunded += 1;
      }
    }
    if (changed) {
      conversation.recalculateTotalPledged();
      await conversation.save();
    }
  }
  return refunded;
}

async function detachReferences(userId) {
  await Party.updateMany({ partiers: userId }, { $pull: { partiers: userId } });
  await Party.updateMany(
    { 'kickedUsers.userId': userId },
    { $pull: { kickedUsers: { userId } } }
  );

  await Label.updateMany(
    { 'admins.userId': userId },
    { $pull: { admins: { userId } } }
  );
  await Collective.updateMany(
    { 'members.userId': userId },
    { $pull: { members: { userId } } }
  );

  await Media.updateMany(
    { 'mediaOwners.userId': userId },
    { $pull: { mediaOwners: { userId } } }
  );

  const bidIds = await Bid.find({ userId }).distinct('_id');
  if (bidIds.length > 0) {
    await Media.updateMany(
      { bids: { $in: bidIds } },
      { $pull: { bids: { $in: bidIds } } }
    );
  }

  for (const field of MEDIA_CREATOR_ARRAYS) {
    await Media.updateMany(
      { [`${field}.userId`]: userId },
      { $set: { [`${field}.$[elem].userId`]: null, [`${field}.$[elem].verified`]: false } },
      { arrayFilters: [{ 'elem.userId': userId }] }
    );
  }

  await Comment.updateMany(
    { likes: userId },
    { $pull: { likes: userId }, $inc: { likeCount: -1 } }
  );
}

async function deleteOwnedDocs(userId) {
  const bidIds = await Bid.find({ userId }).distinct('_id');

  const deletions = await Promise.all([
    Bid.deleteMany({ userId }),
    TuneableLedger.deleteMany({ userId }),
    WalletTransaction.deleteMany({ userId }),
    TuneBytesTransaction.deleteMany({ userId }),
    Comment.deleteMany({ userId }),
    Notification.deleteMany({ $or: [{ userId }, { relatedUserId: userId }] }),
    ListeningHistory.deleteMany({ userId }),
    RefundRequest.deleteMany({ userId }),
    Claim.deleteMany({ userId }),
    PayoutRequest.deleteMany({ userId }),
    SpotifyImportRequest.deleteMany({ userId }),
    MediaTagClaim.deleteMany({ userId }),
    ArtistEscrowAllocation.deleteMany({
      $or: [{ tipperUserId: userId }, { artistUserId: userId }, { bidId: { $in: bidIds } }],
    }),
    Report.deleteMany({ $or: [{ userId }, { reportedBy: userId }] }),
  ]);

  return {
    bids: deletions[0].deletedCount || 0,
    ledger: deletions[1].deletedCount || 0,
    walletTx: deletions[2].deletedCount || 0,
    tuneBytesTx: deletions[3].deletedCount || 0,
    comments: deletions[4].deletedCount || 0,
    notifications: deletions[5].deletedCount || 0,
    listeningHistory: deletions[6].deletedCount || 0,
  };
}

async function purgeUser(userId, { actor, confirmUsername, confirmNotTestUser } = {}) {
  const user = await User.findById(userId);
  assertCanPurge(user, actor);

  const expected = String(user.username || '').trim();
  const provided = String(confirmUsername || '').trim();
  if (!provided || provided.toLowerCase() !== expected.toLowerCase()) {
    throw httpError(400, 'Type the username to confirm deletion');
  }

  if (!user.isTestUser && confirmNotTestUser !== true) {
    throw httpError(
      400,
      'This is not a test account. Pass confirmNotTestUser: true to delete it anyway'
    );
  }

  const preview = await previewPurge(userId);
  const unwind = await unwindActiveTips(user, actor._id);
  const tuneBytesService = require('./tuneBytesService');
  for (const mediaId of unwind.touchedMediaIds || []) {
    try {
      await tuneBytesService.recalculateTuneBytesForMedia(mediaId, {
        skipLedgerEntry: true,
        notify: false,
      });
    } catch (tuneBytesError) {
      console.error(`Failed to recalculate TuneBytes after purging tips on ${mediaId}:`, tuneBytesError);
    }
  }
  await refundConversationPledges(user._id);
  await detachReferences(user._id);
  const deleted = await deleteOwnedDocs(user._id);

  const username = user.username;
  await User.findByIdAndDelete(user._id);

  console.log(`🗑️ Admin ${actor.username} purged user ${username} (${userId})`);

  return {
    message: `Deleted ${username} and their tips`,
    username,
    userId: String(userId),
    wasTestUser: !!user.isTestUser,
    tips: {
      refundedCount: unwind.refundedCount,
      refundedPence: unwind.refundedPence,
    },
    preview,
    deleted,
  };
}

module.exports = {
  createTestUser,
  previewPurge,
  purgeUser,
  assertCanPurge,
  assertUsernameShape,
  generateInviteCode,
  generatePassword,
};
