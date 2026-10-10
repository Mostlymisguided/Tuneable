const express = require('express');
const router = express.Router();
const Collective = require('../models/Collective');
const User = require('../models/User');
const Media = require('../models/Media');
const Notification = require('../models/Notification');
const Bid = require('../models/Bid');
const TuneBytesTransaction = require('../models/TuneBytesTransaction');
const authMiddleware = require('../middleware/authMiddleware');
const adminMiddleware = require('../middleware/adminMiddleware');
const { createLabelProfilePictureUpload, processAndUploadLabelImage, getPublicUrl } = require('../utils/r2Upload');
const { createNotification } = require('../services/notificationService');
const { isBlockedBetween } = require('../utils/userBlocks');
const { founderTipWindows, founderTuneByteAwards } = require('../utils/collectiveFounderTips');
const {
  normalizeCollectiveType,
  resolvedVenueKind,
  normalizeCollectiveLocation,
  venueLocationError,
  collectiveSaveErrorResponse,
} = require('../utils/collectiveVenue');

const COLLECTIVE_LIST_FIELDS = 'name slug profilePicture description genres type venueKind location stats.globalCollectiveAggregate stats.founderTipAggregate stats.rankingAggregate stats.globalRank stats.memberCount stats.releaseCount';

function scheduleCollectiveRankingRefresh(collectiveId) {
  if (!collectiveId) return;
  setImmediate(() => {
    const { refreshCollectiveFounderRanking } = require('../services/collectiveRankingService');
    refreshCollectiveFounderRanking(collectiveId).catch((error) => {
      console.error('Error refreshing collective founder ranking:', error);
    });
  });
}

async function tuneBytesTotalsForCollectives(collectives) {
  const totals = new Map();
  if (!collectives.length) return totals;

  const windowsByCollective = new Map();
  const userIds = new Set();
  for (const collective of collectives) {
    const windows = founderTipWindows(collective);
    windowsByCollective.set(String(collective._id), windows);
    for (const window of windows) userIds.add(window.userId);
  }

  const bids = userIds.size
    ? await Bid.find({ status: 'active', userId: { $in: [...userIds] } })
      .select('_id userId createdAt status')
      .lean()
    : [];
  const bidIds = bids.map((bid) => bid._id);
  const founderTransactions = bidIds.length
    ? await TuneBytesTransaction.find({ bidId: { $in: bidIds } })
      .select('bidId tuneBytesEarned')
      .lean()
    : [];
  const earnedByBid = new Map(
    founderTransactions.map((row) => [String(row.bidId), Number(row.tuneBytesEarned) || 0])
  );
  const tips = bids.map((bid) => ({
    ...bid,
    tuneBytesEarned: earnedByBid.get(String(bid._id)) || 0,
  }));

  const collectiveIds = collectives.map((collective) => collective._id);
  const media = await Media.find({
    $or: [
      { 'artist.collectiveId': { $in: collectiveIds } },
      { 'producer.collectiveId': { $in: collectiveIds } },
      { 'featuring.collectiveId': { $in: collectiveIds } },
    ],
  })
    .select('_id artist.collectiveId producer.collectiveId featuring.collectiveId')
    .lean();

  const mediaIds = [];
  const ownersByMedia = new Map();
  for (const item of media) {
    const owners = new Set();
    for (const field of ['artist', 'producer', 'featuring']) {
      const people = Array.isArray(item[field]) ? item[field] : [];
      for (const person of people) {
        if (person && person.collectiveId) owners.add(String(person.collectiveId));
      }
    }
    if (!owners.size) continue;
    mediaIds.push(item._id);
    ownersByMedia.set(String(item._id), owners);
  }

  const mediaTransactions = mediaIds.length
    ? await TuneBytesTransaction.find({ mediaId: { $in: mediaIds } })
      .select('bidId mediaId tuneBytesEarned')
      .lean()
    : [];

  for (const collective of collectives) {
    const id = String(collective._id);
    const seenBids = new Set();
    let total = 0;
    for (const award of founderTuneByteAwards(windowsByCollective.get(id), tips)) {
      if (!award.bidId || seenBids.has(award.bidId)) continue;
      seenBids.add(award.bidId);
      total += award.earned;
    }
    for (const row of mediaTransactions) {
      const owners = ownersByMedia.get(String(row.mediaId));
      if (!owners || !owners.has(id)) continue;
      const bidId = row.bidId ? String(row.bidId) : '';
      if (!bidId || seenBids.has(bidId)) continue;
      seenBids.add(bidId);
      total += Number(row.tuneBytesEarned) || 0;
    }
    totals.set(id, total);
  }
  return totals;
}

async function prepareCollectiveRankings() {
  try {
    const { ensureCollectiveFounderRankings } = require('../services/collectiveRankingService');
    await ensureCollectiveFounderRankings();
  } catch (error) {
    console.error('Error preparing collective founder rankings:', error);
  }
}

// Configure upload for collective profile pictures (reuse label upload config)
const profilePictureUpload = createLabelProfilePictureUpload();

function uploadCollectivePicture(req, res, next) {
  profilePictureUpload.single('profilePicture')(req, res, async (err) => {
    if (err) {
      console.error('Collective profile picture upload failed:', err);
      const tooLarge = err.code === 'LIMIT_FILE_SIZE';
      const rejectedType = /only image files/i.test(err.message || '');
      return res.status(tooLarge || rejectedType ? 400 : 500).json({
        error: tooLarge ? 'Image must be smaller than 20MB' : (err.message || 'Failed to upload profile picture'),
      });
    }
    
    // Process and upload the image (handles HEIC conversion)
    if (req.file) {
      return processAndUploadLabelImage(req, res, next);
    }
    
    next();
  });
}

// ========================================
// PUBLIC ROUTES
// ========================================

// Get all collectives (public)
router.get('/', async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      genre, 
      type,
      placeId,
      sortBy = 'totalBidAmount',
      sortOrder = 'desc',
      search 
    } = req.query;

    await prepareCollectiveRankings();

    const query = { isActive: true };
    
    // Filter by genre
    if (genre) {
      query.genres = genre;
    }
    
    if (type) {
      query.type = type;
    }

    if (placeId && typeof placeId === 'string' && placeId.trim()) {
      query['location.ancestorIds'] = placeId.trim();
    }
    
    // Search by name or slug
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { slug: { $regex: search, $options: 'i' } }
      ];
    }

    if (sortBy === 'tuneBytes') {
      const matched = await Collective.find(query)
        .select(`${COLLECTIVE_LIST_FIELDS} members createdAt`)
        .lean();
      const totals = await tuneBytesTotalsForCollectives(matched);
      const direction = sortOrder === 'asc' ? 1 : -1;
      matched.forEach((collective) => {
        collective.stats = collective.stats || {};
        collective.stats.tuneBytesAggregate = totals.get(String(collective._id)) || 0;
        delete collective.members;
        delete collective.createdAt;
      });
      matched.sort((a, b) => {
        const delta = (a.stats.tuneBytesAggregate || 0) - (b.stats.tuneBytesAggregate || 0);
        if (delta !== 0) return delta * direction;
        return String(a.name || '').localeCompare(String(b.name || ''));
      });
      const pageNum = Math.max(1, parseInt(page, 10) || 1);
      const limitNum = Math.max(1, parseInt(limit, 10) || 20);
      const start = (pageNum - 1) * limitNum;
      return res.json({
        collectives: matched.slice(start, start + limitNum),
        totalPages: Math.ceil(matched.length / limitNum) || 1,
        currentPage: pageNum,
        total: matched.length,
      });
    }

    // Build sort object
    const sort = {};
    if (sortBy === 'totalBidAmount' || sortBy === 'globalCollectiveAggregate' || sortBy === 'rankingAggregate') {
      sort['stats.rankingAggregate'] = sortOrder === 'desc' ? -1 : 1;
    } else if (sortBy === 'memberCount') {
      sort['stats.memberCount'] = sortOrder === 'desc' ? -1 : 1;
    } else if (sortBy === 'name') {
      sort.name = sortOrder === 'desc' ? -1 : 1;
    }

    const collectives = await Collective.find(query)
      .select(COLLECTIVE_LIST_FIELDS)
      .sort(sort)
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Collective.countDocuments(query);

    res.json({
      collectives,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    });
  } catch (error) {
    console.error('Error fetching collectives:', error);
    res.status(500).json({ error: 'Failed to fetch collectives' });
  }
});

// Get collective team (collective admins only)
router.get('/:slug/team', authMiddleware, async (req, res) => {
  try {
    const collective = await Collective.findBySlug(req.params.slug)
      .populate('members.userId', 'username profilePic email uuid')
      .lean();

    if (!collective) {
      return res.status(404).json({ error: 'Collective not found' });
    }

    const isPlatformAdmin = req.user?.role?.includes('admin');
    if (!isPlatformAdmin) {
      const viewerId = req.user?._id?.toString() || req.user?.id?.toString() || req.user?.uuid?.toString();
      const isCollectiveEditor = (collective.members || []).some((member) => {
        if (!member || !member.userId || member.leftAt) return false;
        const memberId =
          typeof member.userId === 'object'
            ? (member.userId._id?.toString() || member.userId.uuid?.toString() || member.userId.toString())
            : member.userId.toString();
        return (
          memberId === viewerId &&
          (member.role === 'founder' || member.role === 'admin')
        );
      });

      if (!isCollectiveEditor) {
        return res.status(403).json({ error: 'Not authorized to view collective ownership' });
      }
    }

    const activeMembers = (collective.members || []).filter((member) => !member.leftAt);

    const team = activeMembers.map((member) => {
      const user = member.userId || {};
      const userId = typeof user === 'object' ? (user._id || user.uuid || user.toString()) : member.userId;
      return {
        userId: user,
        username: user.username,
        profilePic: user.profilePic,
        email: user.email,
        role: member.role,
        joinedAt: member.joinedAt,
        addedBy: member.addedBy,
        instrument: member.instrument,
        _id: userId
      };
    });

    const pendingUsers = await User.find({
      'pendingCollectiveInvites.collectiveId': collective._id,
      deletedAt: null,
    }).select('username profilePic email uuid pendingCollectiveInvites');

    const activeIds = new Set(team.map((member) => String(member._id)));
    const invited = pendingUsers.flatMap((person) => {
      if (activeIds.has(person._id.toString())) return [];
      const pending = (person.pendingCollectiveInvites || []).find(
        (invite) => invite.collectiveId && invite.collectiveId.toString() === collective._id.toString()
      );
      if (!pending) return [];
      return [{
        userId: {
          _id: person._id,
          uuid: person.uuid,
          username: person.username,
          profilePic: person.profilePic,
        },
        username: person.username,
        profilePic: person.profilePic,
        email: person.email,
        role: pending.role,
        membershipStatus: 'invited',
        joinedAt: pending.invitedAt,
        instrument: pending.instrument,
        _id: person._id,
      }];
    });

    res.json({
      team: team.concat(invited),
      founders: team.filter((member) => member.role === 'founder'),
      admins: team.filter((member) => member.role === 'admin'),
      members: team.filter((member) => member.role === 'member'),
      invited,
    });
  } catch (error) {
    console.error('Error fetching collective team:', error);
    res.status(500).json({ error: 'Failed to fetch collective team', details: error.message });
  }
});

function pendingCollectiveInvite(user, collectiveId) {
  return (user?.pendingCollectiveInvites || []).find(
    (invite) => invite.collectiveId && invite.collectiveId.toString() === collectiveId.toString()
  );
}

function dropPendingCollectiveInvite(user, collectiveId) {
  user.pendingCollectiveInvites = (user.pendingCollectiveInvites || []).filter(
    (invite) => !invite.collectiveId || invite.collectiveId.toString() !== collectiveId.toString()
  );
}

async function clearCollectiveInviteNotifications(userId, collectiveId) {
  await Notification.deleteMany({
    userId,
    type: 'collective_invite',
    relatedCollectiveId: collectiveId,
  });
}

async function queueCollectiveInvite({ collective, targetUser, role, instrument, inviterId }) {
  if (!['admin', 'member'].includes(role)) {
    const error = new Error('Invalid role. Must be member or admin');
    error.status = 400;
    throw error;
  }
  if (collective.isMember(targetUser._id)) {
    const error = new Error('This person is already in the collective. Change their role from the roster.');
    error.status = 400;
    throw error;
  }
  if (pendingCollectiveInvite(targetUser, collective._id)) {
    const error = new Error('This person already has a pending invitation.');
    error.status = 400;
    throw error;
  }

  if (!targetUser.pendingCollectiveInvites) targetUser.pendingCollectiveInvites = [];
  targetUser.pendingCollectiveInvites.push({
    collectiveId: collective._id,
    role,
    instrument: instrument || undefined,
    invitedAt: new Date(),
    invitedBy: inviterId,
  });
  await targetUser.save();

  const inviter = await User.findById(inviterId).select('username');
  const inviterName = inviter?.username || 'Someone';
  const rolePhrase = role === 'admin' ? 'an admin' : 'a member';
  const instrumentNote = instrument ? ` (${instrument})` : '';

  try {
    await createNotification({
      userId: targetUser._id,
      type: 'collective_invite',
      title: 'Collective Invitation',
      message: `${inviterName} invited you to join "${collective.name}" as ${rolePhrase}${instrumentNote}`,
      link: '/dashboard',
      linkText: 'Review invitation',
      relatedUserId: inviterId,
      relatedCollectiveId: collective._id,
      inviteType: role === 'admin' ? 'admin' : 'member',
      inviteRole: role,
    });
  } catch (notifError) {
    console.error('Error creating collective invite notification:', notifError);
  }

  try {
    const { sendCollectiveInviteEmail } = require('../utils/emailService');
    await sendCollectiveInviteEmail({
      to: targetUser.email,
      recipientName: targetUser.username,
      inviterName,
      collectiveName: collective.name,
      rolePhrase,
    });
  } catch (emailError) {
    console.error('Error sending collective invite email:', emailError);
  }
}

// Invite admin to collective (founders and admins). They join after they accept.
router.post('/:slug/invite-admin', authMiddleware, async (req, res) => {
  try {
    const { slug } = req.params;
    const { userId, email } = req.body;
    const inviterId = req.user._id;
    
    const collective = await Collective.findBySlug(slug);
    if (!collective) {
      return res.status(404).json({ error: 'Collective not found' });
    }
    
    // Check if inviter is founder or admin
    const isCollectiveEditor = collective.isAdmin(inviterId);
    if (!isCollectiveEditor) {
      return res.status(403).json({ error: 'Only collective founders and admins can invite admins' });
    }
    
    let targetUser;
    if (userId) {
      targetUser = await User.findById(userId);
    } else if (email) {
      targetUser = await User.findOne({ email: email.toLowerCase().trim() });
    } else {
      return res.status(400).json({ error: 'Either userId or email is required' });
    }
    
    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (await isBlockedBetween(inviterId, targetUser._id)) {
      return res.status(403).json({ error: 'You cannot invite this user', code: 'USER_BLOCKED' });
    }

    await queueCollectiveInvite({
      collective,
      targetUser,
      role: 'admin',
      inviterId,
    });
    
    res.json({ success: true, message: 'Invitation sent. They will join after they accept.' });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('Error inviting admin:', error);
    res.status(500).json({ error: 'Failed to invite admin', details: error.message });
  }
});

// Invite member to collective (founders and admins)
router.post('/:slug/invite-member', authMiddleware, async (req, res) => {
  try {
    const { slug } = req.params;
    const { userId, email, role = 'member', instrument } = req.body;
    const inviterId = req.user._id;
    
    if (!['member', 'admin'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role. Must be member or admin' });
    }
    
    const collective = await Collective.findBySlug(slug);
    if (!collective) {
      return res.status(404).json({ error: 'Collective not found' });
    }
    
    // Check if inviter is founder or admin
    const isCollectiveEditor = collective.isAdmin(inviterId);
    if (!isCollectiveEditor) {
      return res.status(403).json({ error: 'Only collective founders and admins can invite members' });
    }
    
    let targetUser;
    if (userId) {
      targetUser = await User.findById(userId);
    } else if (email) {
      targetUser = await User.findOne({ email: email.toLowerCase().trim() });
    } else {
      return res.status(400).json({ error: 'Either userId or email is required' });
    }
    
    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (await isBlockedBetween(inviterId, targetUser._id)) {
      return res.status(403).json({ error: 'You cannot invite this user', code: 'USER_BLOCKED' });
    }

    await queueCollectiveInvite({
      collective,
      targetUser,
      role,
      instrument: instrument || null,
      inviterId,
    });
    
    res.json({ success: true, message: 'Invitation sent. They will join after they accept.' });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('Error inviting member:', error);
    res.status(500).json({ error: 'Failed to invite member', details: error.message });
  }
});

// Pending collective invitations for the signed-in user.
router.get('/me/invites', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .populate('pendingCollectiveInvites.collectiveId', 'name slug profilePicture isActive')
      .populate('pendingCollectiveInvites.invitedBy', 'username');

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const invites = (user.pendingCollectiveInvites || [])
      .filter((invite) => invite.collectiveId && invite.collectiveId.isActive !== false)
      .map((invite) => ({
        id: invite._id,
        role: invite.role,
        instrument: invite.instrument || null,
        invitedAt: invite.invitedAt,
        collective: {
          _id: invite.collectiveId._id,
          name: invite.collectiveId.name,
          slug: invite.collectiveId.slug,
          profilePicture: invite.collectiveId.profilePicture || null,
        },
        invitedBy: invite.invitedBy ? {
          _id: invite.invitedBy._id,
          username: invite.invitedBy.username,
        } : null,
      }));

    res.json({ invites });
  } catch (error) {
    console.error('Error fetching collective invites:', error);
    res.status(500).json({ error: 'Failed to fetch collective invites' });
  }
});

router.post('/:slug/accept-invite', authMiddleware, async (req, res) => {
  try {
    const collective = await Collective.findBySlug(req.params.slug);
    if (!collective) return res.status(404).json({ error: 'Collective not found' });

    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const pending = pendingCollectiveInvite(user, collective._id);
    if (!pending) {
      return res.status(400).json({ error: 'No pending invitation found for this collective' });
    }

    if (!collective.isMember(user._id)) {
      await collective.addMember(user._id, pending.role, pending.invitedBy, pending.instrument || null);
      scheduleCollectiveRankingRefresh(collective._id);
    }

    dropPendingCollectiveInvite(user, collective._id);
    await user.save();
    await clearCollectiveInviteNotifications(user._id, collective._id);

    res.json({ success: true, message: 'Invitation accepted' });
  } catch (error) {
    console.error('Error accepting collective invitation:', error);
    res.status(500).json({ error: 'Failed to accept invitation' });
  }
});

router.post('/:slug/decline-invite', authMiddleware, async (req, res) => {
  try {
    const collective = await Collective.findBySlug(req.params.slug);
    if (!collective) return res.status(404).json({ error: 'Collective not found' });

    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (!pendingCollectiveInvite(user, collective._id)) {
      return res.status(400).json({ error: 'No pending invitation found for this collective' });
    }

    dropPendingCollectiveInvite(user, collective._id);
    await user.save();
    await clearCollectiveInviteNotifications(user._id, collective._id);

    res.json({ success: true, message: 'Invitation declined' });
  } catch (error) {
    console.error('Error declining collective invitation:', error);
    res.status(500).json({ error: 'Failed to decline invitation' });
  }
});

router.delete('/:slug/invites/:userId', authMiddleware, async (req, res) => {
  try {
    const collective = await Collective.findBySlug(req.params.slug);
    if (!collective) return res.status(404).json({ error: 'Collective not found' });

    const isPlatformAdmin = req.user.role && req.user.role.includes('admin');
    if (!isPlatformAdmin && !collective.isAdmin(req.user._id)) {
      return res.status(403).json({ error: 'Only collective founders and admins can cancel invitations' });
    }

    const targetUser = await User.findById(req.params.userId);
    if (!targetUser || !pendingCollectiveInvite(targetUser, collective._id)) {
      return res.status(404).json({ error: 'No pending invitation found for this person' });
    }

    dropPendingCollectiveInvite(targetUser, collective._id);
    await targetUser.save();
    await clearCollectiveInviteNotifications(targetUser._id, collective._id);

    res.json({ success: true, message: 'Invitation cancelled' });
  } catch (error) {
    console.error('Error cancelling collective invitation:', error);
    res.status(500).json({ error: 'Failed to cancel invitation' });
  }
});

// Get collective by slug (public)
router.get('/:slug', async (req, res) => {
  try {
    const { refresh = false } = req.query;
    // TODO: Create collectiveStatsService similar to labelStatsService
    // const collectiveStatsService = require('../services/collectiveStatsService');
    
    const collective = await Collective.findBySlug(req.params.slug);
    
    if (!collective) {
      return res.status(404).json({ error: 'Collective not found' });
    }

    try {
      const {
        ensureCollectiveFounderRankings,
        refreshCollectiveFounderRanking,
      } = require('../services/collectiveRankingService');
      await ensureCollectiveFounderRankings();
      await refreshCollectiveFounderRanking(collective._id);
    } catch (rankingError) {
      console.error('Error refreshing collective founder ranking:', rankingError);
    }

    // Get recent releases (media where collective is credited)
    const recentReleases = await Media.find({ 
      $or: [
        { 'artist.collectiveId': collective._id },
        { 'producer.collectiveId': collective._id },
        { 'featuring.collectiveId': collective._id }
      ]
    })
    .select('title artist coverArt releaseDate globalMediaAggregate uuid slug _id')
    .sort({ releaseDate: -1 })
    .limit(10)
    .lean();

    // Get top performing media
    const topMedia = await Media.find({ 
      $or: [
        { 'artist.collectiveId': collective._id },
        { 'producer.collectiveId': collective._id },
        { 'featuring.collectiveId': collective._id }
      ]
    })
    .select('title artist coverArt globalMediaAggregate uuid slug _id')
    .sort({ globalMediaAggregate: -1 })
    .limit(5)
    .lean();

    // Get bid counts for recent releases
    const recentReleaseIds = recentReleases.map(r => r._id);
    let bidCounts = [];
    if (recentReleaseIds.length > 0) {
      bidCounts = await Bid.aggregate([
        {
          $match: {
            mediaId: { $in: recentReleaseIds },
            status: 'active'
          }
        },
        {
          $group: {
            _id: '$mediaId',
            count: { $sum: 1 }
          }
        }
      ]);
    }

    // Create bid count lookup for recent releases
    const bidCountLookup = {};
    bidCounts.forEach(item => {
      bidCountLookup[item._id.toString()] = item.count;
    });

    // Get bid counts for top media
    const topMediaIds = topMedia.map(m => m._id);
    let topBidCounts = [];
    if (topMediaIds.length > 0) {
      topBidCounts = await Bid.aggregate([
        {
          $match: {
            mediaId: { $in: topMediaIds },
            status: 'active'
          }
        },
        {
          $group: {
            _id: '$mediaId',
            count: { $sum: 1 }
          }
        }
      ]);
    }

    // Create bid count lookup for top media
    const topBidCountLookup = {};
    topBidCounts.forEach(item => {
      topBidCountLookup[item._id.toString()] = item.count;
    });

    // Format media for response
    const formattedRecentReleases = recentReleases.map(m => ({
      _id: m._id,
      uuid: m.uuid,
      title: m.title,
      artist: Array.isArray(m.artist) && m.artist.length > 0 ? m.artist[0].name : 'Unknown Artist',
      coverArt: m.coverArt,
      releaseDate: m.releaseDate,
      stats: {
        totalBidAmount: m.globalMediaAggregate || 0,
        bidCount: bidCountLookup[m._id.toString()] || 0
      }
    }));

    const formattedTopMedia = topMedia.map(m => ({
      _id: m._id,
      uuid: m.uuid,
      title: m.title,
      artist: Array.isArray(m.artist) && m.artist.length > 0 ? m.artist[0].name : 'Unknown Artist',
      coverArt: m.coverArt,
      stats: {
        totalBidAmount: m.globalMediaAggregate || 0,
        bidCount: topBidCountLookup[m._id.toString()] || 0
      }
    }));

    // Populate members
    const populatedCollective = await Collective.findById(collective._id)
      .populate('members.userId', 'username profilePic uuid');

    // Ensure socialMedia and stats have default values if undefined
    const collectiveResponse = populatedCollective.toObject ? populatedCollective.toObject() : populatedCollective;
    if (!collectiveResponse.socialMedia) {
      collectiveResponse.socialMedia = {};
    }
    if (!collectiveResponse.stats) {
      collectiveResponse.stats = {
        memberCount: 0,
        releaseCount: 0,
        globalCollectiveAggregate: 0,
        founderTipAggregate: 0,
        rankingAggregate: 0,
        globalCollectiveBidAvg: 0,
        globalCollectiveBidTop: 0,
        globalCollectiveBidCount: 0
      };
    }

    res.json({
      collective: collectiveResponse,
      recentReleases: formattedRecentReleases,
      topMedia: formattedTopMedia
    });
  } catch (error) {
    console.error('Error fetching collective:', error);
    res.status(500).json({ error: 'Failed to fetch collective', details: error.message });
  }
});

// Get collective's members
router.get('/:slug/members', async (req, res) => {
  try {
    const collective = await Collective.findBySlug(req.params.slug);
    
    if (!collective) {
      return res.status(404).json({ error: 'Collective not found' });
    }

    const populatedCollective = await Collective.findById(collective._id)
      .populate('members.userId', 'username profilePic uuid creatorProfile.artistName creatorProfile.genres');

    // Filter out former members (those with leftAt date)
    const activeMembers = populatedCollective.members.filter(member => !member.leftAt);

    res.json({ members: activeMembers });
  } catch (error) {
    console.error('Error fetching collective members:', error);
    res.status(500).json({ error: 'Failed to fetch collective members' });
  }
});

// Get collective's media
router.get('/:slug/media', async (req, res) => {
  try {
    const { page = 1, limit = 20, sortBy = 'releaseDate', sortOrder = 'desc' } = req.query;
    
    const collective = await Collective.findBySlug(req.params.slug);
    
    if (!collective) {
      return res.status(404).json({ error: 'Collective not found' });
    }

    const sort = {};
    if (sortBy === 'releaseDate') {
      sort.releaseDate = sortOrder === 'desc' ? -1 : 1;
    } else if (sortBy === 'totalBidAmount') {
      sort.globalMediaAggregate = sortOrder === 'desc' ? -1 : 1;
    }

    const media = await Media.find({ 
      $or: [
        { 'artist.collectiveId': collective._id },
        { 'producer.collectiveId': collective._id },
        { 'featuring.collectiveId': collective._id }
      ]
    })
    .select('title artist coverArt releaseDate globalMediaAggregate uuid slug _id')
    .sort(sort)
    .limit(limit * 1)
    .skip((page - 1) * limit);

    const total = await Media.countDocuments({ 
      $or: [
        { 'artist.collectiveId': collective._id },
        { 'producer.collectiveId': collective._id },
        { 'featuring.collectiveId': collective._id }
      ]
    });

    res.json({
      media,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    });
  } catch (error) {
    console.error('Error fetching collective media:', error);
    res.status(500).json({ error: 'Failed to fetch collective media' });
  }
});

// ========================================
// AUTHENTICATED ROUTES
// ========================================

// Create collective (with optional profile picture upload)
router.post('/', authMiddleware, uploadCollectivePicture, async (req, res) => {
  try {
    const { name, description, email, website, genres, foundedYear, type, venueKind, location } = req.body;

    // Validate required fields
    if (!name || !email) {
      return res.status(400).json({ error: 'Collective name and email are required' });
    }

    const collectiveType = normalizeCollectiveType(type);
    const processedLocation = normalizeCollectiveLocation(location);
    const locationError = venueLocationError(collectiveType, processedLocation);
    if (locationError) {
      return res.status(400).json({ error: locationError });
    }

    // Check if collective name already exists
    const existingCollective = await Collective.findOne({ name, isActive: { $ne: false } });
    if (existingCollective) {
      return res.status(400).json({ error: 'Collective name already exists' });
    }

    // Generate slug from name (before creating collective)
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');

    // Check if slug already exists
    const existingSlug = await Collective.findOne({ slug, isActive: { $ne: false } });
    if (existingSlug) {
      return res.status(400).json({ error: 'A collective with a similar name already exists' });
    }

    // Handle profile picture upload if provided
    let profilePictureUrl = null;
    if (req.file) {
      profilePictureUrl = req.file.key ? getPublicUrl(req.file.key) : (req.file.location || getPublicUrl(`profile-pictures/${req.file.filename}`));
      console.log(`📸 Saving collective profile picture: ${profilePictureUrl} for collective ${name}`);
    }

    const collective = new Collective({
      name,
      slug, // Explicitly set slug
      description,
      email,
      website,
      genres: genres || [],
      foundedYear,
      type: collectiveType,
      venueKind: collectiveType === 'venue' ? resolvedVenueKind(venueKind) : undefined,
      profilePicture: profilePictureUrl,
      location: processedLocation,
      members: [{
        userId: req.user.id,
        role: 'founder',
        joinedAt: new Date(),
        founderSince: new Date(),
        founderTipScope: 'all',
        addedBy: req.user.id,
        verified: true
      }]
    });

    await collective.save();
    scheduleCollectiveRankingRefresh(collective._id);

    res.status(201).json({ collective });
  } catch (error) {
    console.error('Error creating collective:', error);
    const failure = collectiveSaveErrorResponse(error, 'create');
    res.status(failure.status).json(failure.body);
  }
});

// Update collective (founder/admin only)
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const collective = await Collective.findById(req.params.id);
    
    if (!collective || collective.isActive === false) {
      return res.status(404).json({ error: 'Collective not found' });
    }

    // Check if user is admin
    if (!collective.isAdmin(req.user.id)) {
      return res.status(403).json({ error: 'Not authorized to update this collective' });
    }

    const updates = { ...req.body };
    delete updates.isActive;
    delete updates.members;
    delete updates.uuid;
    delete updates.stats;
    
    // Handle location separately to safely merge Mapbox fields
    let locationUpdate = undefined;
    if (updates.location !== undefined) {
      locationUpdate = updates.location === null
        ? null
        : normalizeCollectiveLocation(updates.location);
      delete updates.location;
    }

    if (updates.type !== undefined) {
      updates.type = normalizeCollectiveType(updates.type);
    }
    if (updates.venueKind !== undefined) {
      updates.venueKind = updates.type === 'venue' || collective.type === 'venue'
        ? resolvedVenueKind(updates.venueKind)
        : undefined;
    }
    
    // Apply all other updates
    Object.assign(collective, updates);
    
    // Apply location update separately if provided
    if (locationUpdate !== undefined) {
      collective.location = locationUpdate;
    }

    const nextType = collective.type;
    if (nextType !== 'venue') {
      collective.venueKind = undefined;
    }

    const locationError = venueLocationError(nextType, collective.location);
    if (locationError) {
      return res.status(400).json({ error: locationError });
    }
    
    await collective.save();

    res.json({ collective });
  } catch (error) {
    console.error('Error updating collective:', error);
    const failure = collectiveSaveErrorResponse(error, 'update');
    res.status(failure.status).json(failure.body);
  }
});

// Delete collective (founder or platform admin). Soft-delete so tune credits keep their id.
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    if (!/^[a-fA-F0-9]{24}$/.test(req.params.id)) {
      return res.status(404).json({ error: 'Collective not found' });
    }

    const collective = await Collective.findById(req.params.id);
    if (!collective || collective.isActive === false) {
      return res.status(404).json({ error: 'Collective not found' });
    }

    const isPlatformAdmin = req.user.role && req.user.role.includes('admin');
    if (!isPlatformAdmin && !collective.isFounder(req.user.id)) {
      return res.status(403).json({ error: 'Only the founder can delete this collective' });
    }

    collective.isActive = false;
    await collective.save();

    await Collective.updateMany(
      { parentCollective: collective._id },
      { $unset: { parentCollective: 1 } }
    );
    await Collective.updateMany(
      { subCollectives: collective._id },
      { $pull: { subCollectives: collective._id } }
    );

    res.json({ message: 'Collective deleted', collectiveId: collective._id });
  } catch (error) {
    console.error('Error deleting collective:', error);
    res.status(500).json({ error: 'Failed to delete collective', details: error.message });
  }
});

// Upload collective profile picture (authenticated, collective admin/founder only)
router.put('/:id/profile-picture', authMiddleware, profilePictureUpload.single('profilePicture'), processAndUploadLabelImage, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const collective = await Collective.findById(req.params.id);
    
    if (!collective || collective.isActive === false) {
      return res.status(404).json({ error: 'Collective not found' });
    }

    // Check if user can edit this collective (admin or collective admin/founder)
    const isPlatformAdmin = req.user.role && req.user.role.includes('admin');
    const canEdit = isPlatformAdmin || collective.isAdmin(req.user.id);
    
    if (!canEdit) {
      return res.status(403).json({ error: 'Not authorized to update this collective' });
    }

    // Use custom domain URL via getPublicUrl
    const profilePicturePath = req.file.key ? getPublicUrl(req.file.key) : (req.file.location || getPublicUrl(`profile-pictures/${req.file.filename}`));

    console.log(`📸 Saving collective profile picture: ${profilePicturePath} for collective ${collective.name}`);

    collective.profilePicture = profilePicturePath;
    await collective.save();

    console.log('✅ Collective profile picture updated:', collective.profilePicture);
    res.json({ message: 'Collective profile picture updated successfully', collective });
  } catch (error) {
    console.error('Error updating collective profile picture:', error.message);
    res.status(500).json({ error: 'Error updating collective profile picture', details: error.message });
  }
});

// Add member to collective (founder/admin only)
router.post('/:id/members', authMiddleware, async (req, res) => {
  try {
    const { userId, role, instrument } = req.body;
    const collective = await Collective.findById(req.params.id);
    
    if (!collective || collective.isActive === false) {
      return res.status(404).json({ error: 'Collective not found' });
    }

    // Check if user is admin
    if (!collective.isAdmin(req.user.id)) {
      return res.status(403).json({ error: 'Only collective founders/admins can add members' });
    }

    // Check if user exists
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    await collective.addMember(userId, role || 'member', req.user.id, instrument);
    scheduleCollectiveRankingRefresh(collective._id);

    res.json({ message: 'Member added successfully' });
  } catch (error) {
    console.error('Error adding member:', error);
    res.status(500).json({ error: 'Failed to add member' });
  }
});

// Remove member from collective (founder/admin only, or self-removal)
router.delete('/:slug/members/:userId', authMiddleware, async (req, res) => {
  try {
    const { slug, userId } = req.params;
    const requesterId = req.user._id;
    
    const collective = await Collective.findBySlug(slug);
    
    if (!collective) {
      return res.status(404).json({ error: 'Collective not found' });
    }

    const isSelfRemoval = userId === requesterId.toString();
    const isAdmin = collective.isAdmin(requesterId);

    // Allow self-removal OR founder/admin removing others
    if (!isSelfRemoval && !isAdmin) {
      return res.status(403).json({ error: 'Only collective founders and admins can remove other members' });
    }

    // Prevent removing the last founder
    if (!isSelfRemoval) {
      const targetMember = collective.members.find(m => m.userId.toString() === userId && !m.leftAt);
      if (targetMember && targetMember.role === 'founder') {
        const founderCount = collective.members.filter(m => m.role === 'founder' && !m.leftAt).length;
        if (founderCount <= 1) {
          return res.status(400).json({ error: 'Cannot remove the last founder' });
        }
      }
    }

    await collective.removeMember(userId);
    scheduleCollectiveRankingRefresh(collective._id);

    res.json({ message: 'Member removed successfully' });
  } catch (error) {
    console.error('Error removing member:', error);
    res.status(500).json({ error: 'Failed to remove member' });
  }
});

// Change member role.
// Founders and platform admins can set founder, admin, or member.
// Collective admins can switch people between admin and member.
router.patch('/:slug/members/:userId/role', authMiddleware, async (req, res) => {
  try {
    const { slug, userId } = req.params;
    const { role } = req.body;
    const requesterId = req.user._id;
    
    const collective = await Collective.findBySlug(slug);
    
    if (!collective) {
      return res.status(404).json({ error: 'Collective not found' });
    }

    if (!['founder', 'admin', 'member'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role. Must be founder, admin, or member' });
    }

    const isPlatformAdmin = req.user.role && req.user.role.includes('admin');
    const isFounder = collective.isFounder(requesterId);
    if (!isPlatformAdmin && !collective.isAdmin(requesterId)) {
      return res.status(403).json({ error: 'Only collective founders and admins can change member roles' });
    }

    const targetMember = collective.members.find(m => m.userId.toString() === userId && !m.leftAt);
    if (!targetMember) {
      return res.status(404).json({ error: 'Member not found' });
    }

    const touchesFounder = role === 'founder' || targetMember.role === 'founder';
    if (touchesFounder && !isPlatformAdmin && !isFounder) {
      return res.status(403).json({ error: 'Only founders can assign or change the founder role' });
    }

    // Prevent changing the last founder's role
    if (role !== 'founder' && targetMember.role === 'founder') {
      const founderCount = collective.members.filter(m => m.role === 'founder' && !m.leftAt).length;
      if (founderCount <= 1) {
        return res.status(400).json({ error: 'Cannot change the last founder\'s role' });
      }
    }

    await collective.setMemberRole(userId, role);
    scheduleCollectiveRankingRefresh(collective._id);

    res.json({ message: 'Member role updated successfully', role });
  } catch (error) {
    if (error.status === 404) {
      return res.status(404).json({ error: error.message });
    }
    console.error('Error changing member role:', error);
    res.status(500).json({ error: 'Failed to change member role' });
  }
});

// ========================================
// ADMIN ROUTES
// ========================================

// Get all collectives (admin only)
router.get('/admin/all', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { 
      verificationStatus, 
      genre,
      type,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      page = 1, 
      limit = 20 
    } = req.query;
    
    await prepareCollectiveRankings();

    const query = { isActive: { $ne: false } };
    if (verificationStatus) {
      query.verificationStatus = verificationStatus;
    }
    if (genre) {
      query.genres = genre;
    }
    if (type) {
      query.type = type;
    }
    if (search) {
      query.name = { $regex: search, $options: 'i' };
    }

    // Build sort object
    const sort = {};
    if (sortBy === 'name') {
      sort.name = sortOrder === 'desc' ? -1 : 1;
    } else if (sortBy === 'verificationStatus') {
      sort.verificationStatus = sortOrder === 'desc' ? -1 : 1;
    } else if (sortBy === 'totalBidAmount' || sortBy === 'globalCollectiveAggregate' || sortBy === 'rankingAggregate') {
      sort['stats.rankingAggregate'] = sortOrder === 'desc' ? -1 : 1;
    } else if (sortBy === 'memberCount') {
      sort['stats.memberCount'] = sortOrder === 'desc' ? -1 : 1;
    } else if (sortBy === 'releaseCount') {
      sort['stats.releaseCount'] = sortOrder === 'desc' ? -1 : 1;
    } else if (sortBy === 'lastBidAt') {
      sort['stats.lastBidAt'] = sortOrder === 'desc' ? -1 : 1;
    } else {
      sort.createdAt = sortOrder === 'desc' ? -1 : 1;
    }

    const collectives = await Collective.find(query)
      .select('name slug email profilePicture verificationStatus verificationMethod verifiedAt verifiedBy stats.globalCollectiveAggregate stats.founderTipAggregate stats.rankingAggregate stats.globalRank stats.memberCount stats.releaseCount stats.lastBidAt genres type createdAt updatedAt')
      .populate('members.userId', 'username email uuid profilePic')
      .populate('verifiedBy', 'username')
      .sort(sort)
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .lean();

    // Format collectives to include founder/admin info
    const formattedCollectives = collectives.map(collective => {
      const founders = (collective.members || [])
        .filter(member => member.role === 'founder' && !member.leftAt)
        .map(member => ({
          username: member.userId?.username || 'Unknown',
          email: member.userId?.email || '',
          uuid: member.userId?.uuid || '',
          profilePic: member.userId?.profilePic || null
        }));

      const admins = (collective.members || [])
        .filter(member => member.role === 'admin' && !member.leftAt)
        .map(member => ({
          username: member.userId?.username || 'Unknown',
          email: member.userId?.email || '',
          uuid: member.userId?.uuid || '',
          profilePic: member.userId?.profilePic || null
        }));

      return {
        ...collective,
        founders,
        admins,
        ownerCount: founders.length
      };
    });

    const total = await Collective.countDocuments(query);

    res.json({
      collectives: formattedCollectives,
      totalPages: Math.ceil(total / limit),
      currentPage: parseInt(page),
      total
    });
  } catch (error) {
    console.error('Error fetching admin collectives:', error);
    res.status(500).json({ error: 'Failed to fetch collectives', details: error.message });
  }
});

// Verify collective (admin only)
router.post('/:id/verify', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const collective = await Collective.findById(req.params.id);
    
    if (!collective || collective.isActive === false) {
      return res.status(404).json({ error: 'Collective not found' });
    }

    collective.verificationStatus = 'verified';
    collective.verifiedAt = new Date();
    collective.verifiedBy = req.user.id;
    collective.verificationMethod = 'admin';

    await collective.save();

    res.json({ message: 'Collective verified successfully', collective });
  } catch (error) {
    console.error('Error verifying collective:', error);
    res.status(500).json({ error: 'Failed to verify collective' });
  }
});

module.exports = router;

