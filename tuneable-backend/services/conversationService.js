const mongoose = require('mongoose');
const { uuidv7 } = require('uuidv7');
const Conversation = require('../models/Conversation');
const User = require('../models/User');
const Media = require('../models/Media');
const WalletTransaction = require('../models/WalletTransaction');
const { createNotification } = require('./notificationService');

const OPEN_STATUSES = ['open'];
const PLEDGEABLE_STATUSES = ['open', 'funded', 'scheduled'];

function resolveIdQuery(id) {
  if (!id) return null;
  if (typeof id === 'string' && id.includes('-')) {
    return { uuid: id };
  }
  if (mongoose.Types.ObjectId.isValid(id)) {
    return { _id: id };
  }
  return null;
}

async function findConversation(id) {
  const query = resolveIdQuery(id);
  if (!query) return null;
  return Conversation.findOne(query);
}

async function resolveParticipantInput(raw) {
  const kind = raw.kind === 'podcast' ? 'podcast' : 'person';
  const role = ['participant', 'moderator', 'host'].includes(raw.role) ? raw.role : 'participant';
  const participant = {
    kind,
    role,
    displayName: (raw.displayName || '').trim(),
    response: 'pending',
  };

  if (!participant.displayName && !raw.userId && !raw.mediaId) {
    throw new Error('Each participant needs a display name, user, or podcast');
  }

  if (raw.userId) {
    const userQuery = resolveIdQuery(raw.userId);
    const user = userQuery ? await User.findOne(userQuery).select('_id uuid username profilePic') : null;
    if (!user) throw new Error(`User not found: ${raw.userId}`);
    participant.userId = user._id;
    participant.user_uuid = user.uuid;
    participant.displayName = participant.displayName || user.username;
    participant.profilePic = user.profilePic;
  }

  if (kind === 'podcast' && raw.mediaId) {
    const mediaQuery = resolveIdQuery(raw.mediaId);
    const media = mediaQuery
      ? await Media.findOne(mediaQuery).select('_id uuid title coverArt artist')
      : null;
    if (!media) throw new Error(`Podcast/media not found: ${raw.mediaId}`);
    participant.mediaId = media._id;
    participant.media_uuid = media.uuid;
    participant.displayName = participant.displayName || media.title || media.artist || 'Podcast';
    participant.profilePic = media.coverArt;
  }

  if (!participant.displayName) {
    throw new Error('Participant display name is required');
  }

  return participant;
}

async function createWalletTx({ user, amountPence, type, description, metadata, balanceBefore }) {
  const balanceAfter = type === 'pledge_refund' || type === 'refund'
    ? balanceBefore + amountPence
    : balanceBefore - amountPence;

  const tx = new WalletTransaction({
    userId: user._id,
    user_uuid: user.uuid,
    username: user.username,
    amount: amountPence,
    type,
    status: 'completed',
    paymentMethod: 'manual',
    balanceBefore,
    balanceAfter,
    description,
    metadata,
  });
  await tx.save();
  return tx;
}

async function notifyParticipants(conversation, { type, title, message, excludeUserId }) {
  const link = `/conversations/${conversation.uuid || conversation._id}`;
  const userIds = new Set();

  if (conversation.proposedBy) {
    userIds.add(conversation.proposedBy.toString());
  }
  for (const p of conversation.participants || []) {
    if (p.userId) userIds.add(p.userId.toString());
  }

  const exclude = excludeUserId?.toString();
  await Promise.all(
    [...userIds]
      .filter((id) => id !== exclude)
      .map((userId) =>
        createNotification({
          userId,
          type,
          title,
          message,
          link,
          linkText: 'View conversation',
          relatedUserId: excludeUserId || null,
          relatedConversationId: conversation._id,
        }).catch((err) => console.error('Conversation notification failed:', err.message))
      )
  );
}

async function maybePromoteToFunded(conversation) {
  if (!conversation.canBecomeFunded()) return conversation;
  conversation.status = 'funded';
  conversation.fundedAt = new Date();
  await conversation.save();
  await notifyParticipants(conversation, {
    type: 'conversation_funded',
    title: 'Conversation funded!',
    message: `"${conversation.title}" reached its pledge goal.`,
  });
  return conversation;
}

async function createConversation({ proposer, title, description, topic, goalAmountPounds, participants, requireAcceptance, privacy, minimumPledgePounds }) {
  if (!title || title.trim().length < 3) {
    throw Object.assign(new Error('Title must be at least 3 characters'), { status: 400 });
  }
  if (!Array.isArray(participants) || participants.length < 2) {
    throw Object.assign(new Error('Add at least 2 participants'), { status: 400 });
  }

  const goalAmount = Math.round(Number(goalAmountPounds) * 100);
  if (!Number.isFinite(goalAmount) || goalAmount < 100) {
    throw Object.assign(new Error('Goal must be at least £1.00'), { status: 400 });
  }

  const minimumPledge = Math.max(1, Math.round(Number(minimumPledgePounds || 0.01) * 100));

  const resolved = [];
  for (const raw of participants) {
    resolved.push(await resolveParticipantInput(raw));
  }

  const conversation = new Conversation({
    title: title.trim(),
    description: description?.trim() || '',
    topic: topic?.trim() || '',
    proposedBy: proposer._id,
    proposedBy_uuid: proposer.uuid,
    proposedByUsername: proposer.username,
    participants: resolved,
    goalAmount,
    minimumPledge,
    requireAcceptance: requireAcceptance !== false,
    privacy: privacy === 'private' ? 'private' : 'public',
    status: 'open',
  });

  if (topic?.trim()) {
    conversation.topicSuggestions.push({
      text: topic.trim(),
      suggestedBy: proposer._id,
      suggestedByUsername: proposer.username,
      voteCount: 1,
      voters: [proposer._id],
    });
  }

  await conversation.save();

  await notifyParticipants(conversation, {
    type: 'conversation_invite',
    title: 'You were invited to a Conversation',
    message: `${proposer.username} proposed "${conversation.title}" and invited you to take part.`,
    excludeUserId: proposer._id,
  });

  return conversation;
}

async function placePledge({ conversationId, user, amountPounds, message }) {
  const conversation = await findConversation(conversationId);
  if (!conversation) {
    throw Object.assign(new Error('Conversation not found'), { status: 404 });
  }
  if (!PLEDGEABLE_STATUSES.includes(conversation.status)) {
    throw Object.assign(new Error('This conversation is no longer accepting pledges'), { status: 400 });
  }

  const amountPence = Math.round(Number(amountPounds) * 100);
  if (!Number.isFinite(amountPence) || amountPence < conversation.minimumPledge) {
    throw Object.assign(
      new Error(`Minimum pledge is £${(conversation.minimumPledge / 100).toFixed(2)}`),
      { status: 400 }
    );
  }

  const freshUser = await User.findById(user._id);
  if (!freshUser) {
    throw Object.assign(new Error('User not found'), { status: 404 });
  }
  if (freshUser.balance < amountPence) {
    throw Object.assign(new Error('Insufficient wallet balance'), { status: 400 });
  }

  const balanceBefore = freshUser.balance;
  const { applyWalletSpend } = require('../utils/welcomeCreditHelper');
  const { welcomeCreditAppliedPence } = applyWalletSpend(freshUser, amountPence);
  await freshUser.save();

  await createWalletTx({
    user: freshUser,
    amountPence,
    type: 'pledge',
    description: `Pledge to conversation: ${conversation.title}`,
    metadata: {
      conversationId: conversation._id.toString(),
      conversationUuid: conversation.uuid,
      welcomeCreditAppliedPence,
    },
    balanceBefore,
  });

  conversation.pledges.push({
    uuid: uuidv7(),
    userId: freshUser._id,
    user_uuid: freshUser.uuid,
    username: freshUser.username,
    amount: amountPence,
    welcomeCreditAppliedPence,
    status: 'active',
    message: message?.trim()?.slice(0, 500) || undefined,
  });
  conversation.recalculateTotalPledged();
  await conversation.save();

  await maybePromoteToFunded(conversation);

  await notifyParticipants(conversation, {
    type: 'conversation_pledge',
    title: 'New conversation pledge',
    message: `${freshUser.username} pledged £${(amountPence / 100).toFixed(2)} toward "${conversation.title}".`,
    excludeUserId: freshUser._id,
  });

  return { conversation, userBalance: freshUser.balance };
}

async function withdrawPledge({ conversationId, user }) {
  const conversation = await findConversation(conversationId);
  if (!conversation) {
    throw Object.assign(new Error('Conversation not found'), { status: 404 });
  }
  if (conversation.status !== 'open') {
    throw Object.assign(new Error('Pledges can only be withdrawn while the conversation is open'), { status: 400 });
  }

  const active = (conversation.pledges || []).filter(
    (p) => p.status === 'active' && p.userId.toString() === user._id.toString()
  );
  if (active.length === 0) {
    throw Object.assign(new Error('No active pledges to withdraw'), { status: 400 });
  }

  const freshUser = await User.findById(user._id);
  let refunded = 0;
  const { restoreWelcomeCredit } = require('../utils/welcomeCreditHelper');
  for (const pledge of active) {
    const balanceBefore = freshUser.balance;
    restoreWelcomeCredit(freshUser, pledge.welcomeCreditAppliedPence || 0);
    freshUser.balance += pledge.amount;
    refunded += pledge.amount;
    pledge.status = 'refunded';
    pledge.refundedAt = new Date();
    await createWalletTx({
      user: freshUser,
      amountPence: pledge.amount,
      type: 'pledge_refund',
      description: `Pledge withdrawn: ${conversation.title}`,
      metadata: {
        conversationId: conversation._id.toString(),
        pledgeId: pledge._id.toString(),
        welcomeCreditRestoredPence: pledge.welcomeCreditAppliedPence || 0,
      },
      balanceBefore,
    });
  }
  await freshUser.save();
  conversation.recalculateTotalPledged();
  await conversation.save();

  return { conversation, refunded, userBalance: freshUser.balance };
}

async function respondAsParticipant({ conversationId, user, response }) {
  if (!['accepted', 'declined'].includes(response)) {
    throw Object.assign(new Error('Response must be accepted or declined'), { status: 400 });
  }

  const conversation = await findConversation(conversationId);
  if (!conversation) {
    throw Object.assign(new Error('Conversation not found'), { status: 404 });
  }
  if (!OPEN_STATUSES.includes(conversation.status) && conversation.status !== 'funded') {
    throw Object.assign(new Error('This conversation can no longer be accepted or declined'), { status: 400 });
  }

  const participant = (conversation.participants || []).find(
    (p) => p.userId && p.userId.toString() === user._id.toString()
  );
  if (!participant) {
    throw Object.assign(new Error('You are not a linked participant on this conversation'), { status: 403 });
  }

  participant.response = response;
  participant.respondedAt = new Date();

  if (response === 'declined') {
    const linked = conversation.linkedParticipants();
    const allDeclined = linked.length > 0 && linked.every((p) => p.response === 'declined');
    if (allDeclined) {
      await cancelConversationInternal(conversation, user, 'All linked participants declined');
      return conversation;
    }
  }

  await conversation.save();

  if (response === 'accepted') {
    await maybePromoteToFunded(conversation);
    await notifyParticipants(conversation, {
      type: 'conversation_accepted',
      title: 'Participant accepted',
      message: `${user.username} accepted "${conversation.title}".`,
      excludeUserId: user._id,
    });
  } else {
    await notifyParticipants(conversation, {
      type: 'conversation_declined',
      title: 'Participant declined',
      message: `${user.username} declined "${conversation.title}".`,
      excludeUserId: user._id,
    });
  }

  return conversation;
}

async function refundAllActivePledges(conversation) {
  const active = (conversation.pledges || []).filter((p) => p.status === 'active');
  const { restoreWelcomeCredit } = require('../utils/welcomeCreditHelper');
  for (const pledge of active) {
    const pledger = await User.findById(pledge.userId);
    if (!pledger) continue;
    const balanceBefore = pledger.balance;
    restoreWelcomeCredit(pledger, pledge.welcomeCreditAppliedPence || 0);
    pledger.balance += pledge.amount;
    await pledger.save();
    pledge.status = 'refunded';
    pledge.refundedAt = new Date();
    await createWalletTx({
      user: pledger,
      amountPence: pledge.amount,
      type: 'pledge_refund',
      description: `Conversation cancelled refund: ${conversation.title}`,
      metadata: {
        conversationId: conversation._id.toString(),
        pledgeId: pledge._id.toString(),
        welcomeCreditRestoredPence: pledge.welcomeCreditAppliedPence || 0,
      },
      balanceBefore,
    });
  }
  conversation.recalculateTotalPledged();
}

async function cancelConversationInternal(conversation, actor, reason) {
  if (['completed', 'cancelled'].includes(conversation.status)) {
    throw Object.assign(new Error('Conversation already closed'), { status: 400 });
  }

  await refundAllActivePledges(conversation);
  conversation.status = 'cancelled';
  conversation.cancelledAt = new Date();
  conversation.cancelReason = reason || 'Cancelled';
  await conversation.save();

  await notifyParticipants(conversation, {
    type: 'conversation_cancelled',
    title: 'Conversation cancelled',
    message: `"${conversation.title}" was cancelled. Active pledges were refunded.`,
    excludeUserId: actor?._id,
  });

  return conversation;
}

async function cancelConversation({ conversationId, user, reason }) {
  const conversation = await findConversation(conversationId);
  if (!conversation) {
    throw Object.assign(new Error('Conversation not found'), { status: 404 });
  }

  const isProposer = conversation.proposedBy.toString() === user._id.toString();
  const isAdmin = Array.isArray(user.role) && user.role.includes('admin');
  if (!isProposer && !isAdmin) {
    throw Object.assign(new Error('Only the proposer or an admin can cancel'), { status: 403 });
  }

  return cancelConversationInternal(conversation, user, reason);
}

async function scheduleConversation({ conversationId, user, scheduledAt, livestreamUrl }) {
  const conversation = await findConversation(conversationId);
  if (!conversation) {
    throw Object.assign(new Error('Conversation not found'), { status: 404 });
  }
  if (!['funded', 'scheduled'].includes(conversation.status)) {
    throw Object.assign(new Error('Conversation must be funded before scheduling'), { status: 400 });
  }

  const isProposer = conversation.proposedBy.toString() === user._id.toString();
  const isParticipant = (conversation.participants || []).some(
    (p) => p.userId && p.userId.toString() === user._id.toString() && p.response === 'accepted'
  );
  const isAdmin = Array.isArray(user.role) && user.role.includes('admin');
  if (!isProposer && !isParticipant && !isAdmin) {
    throw Object.assign(new Error('Not authorized to schedule this conversation'), { status: 403 });
  }

  if (scheduledAt) {
    const when = new Date(scheduledAt);
    if (Number.isNaN(when.getTime())) {
      throw Object.assign(new Error('Invalid scheduledAt'), { status: 400 });
    }
    conversation.scheduledAt = when;
  }
  if (livestreamUrl !== undefined) {
    conversation.livestreamUrl = String(livestreamUrl).slice(0, 500);
  }
  conversation.status = 'scheduled';
  await conversation.save();

  await notifyParticipants(conversation, {
    type: 'conversation_scheduled',
    title: 'Conversation scheduled',
    message: `"${conversation.title}" has been scheduled.`,
    excludeUserId: user._id,
  });

  return conversation;
}

async function completeConversation({ conversationId, user, recordingUrl, resultingMediaId }) {
  const conversation = await findConversation(conversationId);
  if (!conversation) {
    throw Object.assign(new Error('Conversation not found'), { status: 404 });
  }
  if (!['funded', 'scheduled'].includes(conversation.status)) {
    throw Object.assign(new Error('Only funded or scheduled conversations can be completed'), { status: 400 });
  }

  const isProposer = conversation.proposedBy.toString() === user._id.toString();
  const isAdmin = Array.isArray(user.role) && user.role.includes('admin');
  if (!isProposer && !isAdmin) {
    throw Object.assign(new Error('Only the proposer or an admin can complete'), { status: 403 });
  }

  // Release active pledges equally to accepted linked participants (artist escrow).
  // If nobody accepted, refund pledgers instead of burning the pool.
  const activePledges = (conversation.pledges || []).filter((p) => p.status === 'active');
  const pool = activePledges.reduce((sum, p) => sum + p.amount, 0);
  const payees = (conversation.participants || []).filter(
    (p) => p.userId && p.response === 'accepted'
  );

  if (pool > 0 && payees.length === 0) {
    await refundAllActivePledges(conversation);
  } else if (pool > 0 && payees.length > 0) {
    const share = Math.floor(pool / payees.length);
    let remainder = pool - share * payees.length;

    for (const payee of payees) {
      const amount = share + (remainder > 0 ? 1 : 0);
      if (remainder > 0) remainder -= 1;
      if (amount <= 0) continue;

      const creator = await User.findById(payee.userId);
      if (!creator) continue;
      creator.artistEscrowBalance = (creator.artistEscrowBalance || 0) + amount;
      creator.totalEscrowEarned = (creator.totalEscrowEarned || 0) + amount;
      creator.artistEscrowHistory = creator.artistEscrowHistory || [];
      creator.artistEscrowHistory.push({
        amount,
        allocatedAt: new Date(),
        status: 'pending',
      });
      await creator.save();

      await createNotification({
        userId: creator._id,
        type: 'escrow_allocated',
        title: 'Conversation earnings',
        message: `£${(amount / 100).toFixed(2)} from "${conversation.title}" was added to your creator escrow.`,
        link: `/conversations/${conversation.uuid || conversation._id}`,
        linkText: 'View conversation',
        relatedConversationId: conversation._id,
      }).catch(() => {});
    }

    for (const pledge of activePledges) {
      pledge.status = 'released';
    }
  }

  if (recordingUrl) conversation.recordingUrl = String(recordingUrl).slice(0, 500);
  if (resultingMediaId) {
    const mediaQuery = resolveIdQuery(resultingMediaId);
    const media = mediaQuery ? await Media.findOne(mediaQuery).select('_id') : null;
    if (media) conversation.resultingMediaId = media._id;
  }

  conversation.status = 'completed';
  conversation.completedAt = new Date();
  conversation.recalculateTotalPledged();
  await conversation.save();

  await notifyParticipants(conversation, {
    type: 'conversation_completed',
    title: 'Conversation completed',
    message: `"${conversation.title}" is complete. Thanks for pledging and taking part.`,
    excludeUserId: user._id,
  });

  return conversation;
}

async function suggestTopic({ conversationId, user, text }) {
  const conversation = await findConversation(conversationId);
  if (!conversation) {
    throw Object.assign(new Error('Conversation not found'), { status: 404 });
  }
  if (!['open', 'funded', 'scheduled'].includes(conversation.status)) {
    throw Object.assign(new Error('Topics can no longer be suggested'), { status: 400 });
  }

  const cleaned = (text || '').trim();
  if (cleaned.length < 3) {
    throw Object.assign(new Error('Topic must be at least 3 characters'), { status: 400 });
  }

  conversation.topicSuggestions.push({
    text: cleaned.slice(0, 200),
    suggestedBy: user._id,
    suggestedByUsername: user.username,
    voteCount: 1,
    voters: [user._id],
  });
  await conversation.save();
  return conversation;
}

async function voteTopic({ conversationId, user, topicId }) {
  const conversation = await findConversation(conversationId);
  if (!conversation) {
    throw Object.assign(new Error('Conversation not found'), { status: 404 });
  }

  const suggestion = (conversation.topicSuggestions || []).id(topicId);
  if (!suggestion) {
    throw Object.assign(new Error('Topic suggestion not found'), { status: 404 });
  }

  const already = (suggestion.voters || []).some((v) => v.toString() === user._id.toString());
  if (already) {
    throw Object.assign(new Error('You already voted for this topic'), { status: 400 });
  }

  suggestion.voters.push(user._id);
  suggestion.voteCount = (suggestion.voteCount || 0) + 1;
  await conversation.save();
  return conversation;
}

async function listConversations({ status, search, page = 1, limit = 20, userId }) {
  const query = {};
  const and = [{ privacy: 'public' }];

  if (status) and.push({ status });

  if (search) {
    and.push({
      $or: [
        { title: { $regex: search, $options: 'i' } },
        { topic: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { 'participants.displayName': { $regex: search, $options: 'i' } },
      ],
    });
  }

  if (userId) {
    const q = resolveIdQuery(userId);
    const u = q ? await User.findOne(q).select('_id') : null;
    if (u) {
      // Mine: ignore privacy filter; show anything the user proposed, joined, or pledged to
      and.length = 0;
      if (status) and.push({ status });
      and.push({
        $or: [
          { proposedBy: u._id },
          { 'participants.userId': u._id },
          { 'pledges.userId': u._id },
        ],
      });
    }
  }

  if (and.length) query.$and = and;

  const skip = (Math.max(1, Number(page)) - 1) * Math.min(50, Number(limit) || 20);
  const take = Math.min(50, Number(limit) || 20);

  const [conversations, total] = await Promise.all([
    Conversation.find(query)
      .sort({ totalPledged: -1, createdAt: -1 })
      .skip(skip)
      .limit(take)
      .populate('proposedBy', 'username profilePic uuid')
      .populate('participants.userId', 'username profilePic uuid')
      .lean(),
    Conversation.countDocuments(query),
  ]);

  return {
    conversations,
    total,
    page: Number(page) || 1,
    totalPages: Math.ceil(total / take) || 1,
  };
}

async function getConversation(id) {
  const conversation = await findConversation(id);
  if (!conversation) return null;

  await conversation.populate([
    { path: 'proposedBy', select: 'username profilePic uuid' },
    { path: 'participants.userId', select: 'username profilePic uuid' },
    { path: 'resultingMediaId', select: 'title uuid coverArt' },
  ]);
  return conversation;
}

module.exports = {
  createConversation,
  placePledge,
  withdrawPledge,
  respondAsParticipant,
  cancelConversation,
  scheduleConversation,
  completeConversation,
  suggestTopic,
  voteTopic,
  listConversations,
  getConversation,
  findConversation,
};
