const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const optionalAuthMiddleware = require('../middleware/optionalAuthMiddleware');
const conversationService = require('../services/conversationService');

function handleError(res, error, fallback = 'Request failed') {
  const status = error.status || 500;
  if (status >= 500) {
    console.error('Conversation route error:', error);
  }
  return res.status(status).json({ error: error.message || fallback });
}

// List public conversations
router.get('/', optionalAuthMiddleware, async (req, res) => {
  try {
    const { status, search, page, limit, mine } = req.query;
    const result = await conversationService.listConversations({
      status,
      search,
      page,
      limit,
      userId: mine === 'true' && req.user ? req.user._id : undefined,
    });
    res.json(result);
  } catch (error) {
    handleError(res, error, 'Failed to list conversations');
  }
});

// Create conversation
router.post('/', authMiddleware, async (req, res) => {
  try {
    const {
      title,
      description,
      topic,
      goalAmount,
      participants,
      requireAcceptance,
      privacy,
      minimumPledge,
    } = req.body;

    const conversation = await conversationService.createConversation({
      proposer: req.user,
      title,
      description,
      topic,
      goalAmountPounds: goalAmount,
      participants,
      requireAcceptance,
      privacy,
      minimumPledgePounds: minimumPledge,
    });

    res.status(201).json({ conversation });
  } catch (error) {
    handleError(res, error, 'Failed to create conversation');
  }
});

// Get one
router.get('/:id', optionalAuthMiddleware, async (req, res) => {
  try {
    const conversation = await conversationService.getConversation(req.params.id);
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }
    if (
      conversation.privacy === 'private' &&
      (!req.user ||
        (conversation.proposedBy?._id || conversation.proposedBy)?.toString() !== req.user._id.toString())
    ) {
      const isParticipant = (conversation.participants || []).some(
        (p) => p.userId && (p.userId._id || p.userId).toString() === req.user?._id?.toString()
      );
      if (!isParticipant && !(req.user?.role || []).includes('admin')) {
        return res.status(403).json({ error: 'Private conversation' });
      }
    }
    res.json({ conversation });
  } catch (error) {
    handleError(res, error, 'Failed to load conversation');
  }
});

// Pledge
router.post('/:id/pledge', authMiddleware, async (req, res) => {
  try {
    const { amount, message } = req.body;
    const result = await conversationService.placePledge({
      conversationId: req.params.id,
      user: req.user,
      amountPounds: amount,
      message,
    });
    res.json(result);
  } catch (error) {
    handleError(res, error, 'Failed to place pledge');
  }
});

// Withdraw own pledges (open only)
router.post('/:id/withdraw-pledge', authMiddleware, async (req, res) => {
  try {
    const result = await conversationService.withdrawPledge({
      conversationId: req.params.id,
      user: req.user,
    });
    res.json(result);
  } catch (error) {
    handleError(res, error, 'Failed to withdraw pledge');
  }
});

// Accept / decline as participant
router.post('/:id/respond', authMiddleware, async (req, res) => {
  try {
    const { response } = req.body;
    const conversation = await conversationService.respondAsParticipant({
      conversationId: req.params.id,
      user: req.user,
      response,
    });
    res.json({ conversation });
  } catch (error) {
    handleError(res, error, 'Failed to respond');
  }
});

// Schedule
router.post('/:id/schedule', authMiddleware, async (req, res) => {
  try {
    const { scheduledAt, livestreamUrl } = req.body;
    const conversation = await conversationService.scheduleConversation({
      conversationId: req.params.id,
      user: req.user,
      scheduledAt,
      livestreamUrl,
    });
    res.json({ conversation });
  } catch (error) {
    handleError(res, error, 'Failed to schedule conversation');
  }
});

// Complete
router.post('/:id/complete', authMiddleware, async (req, res) => {
  try {
    const { recordingUrl, resultingMediaId } = req.body;
    const conversation = await conversationService.completeConversation({
      conversationId: req.params.id,
      user: req.user,
      recordingUrl,
      resultingMediaId,
    });
    res.json({ conversation });
  } catch (error) {
    handleError(res, error, 'Failed to complete conversation');
  }
});

// Cancel
router.post('/:id/cancel', authMiddleware, async (req, res) => {
  try {
    const conversation = await conversationService.cancelConversation({
      conversationId: req.params.id,
      user: req.user,
      reason: req.body?.reason,
    });
    res.json({ conversation });
  } catch (error) {
    handleError(res, error, 'Failed to cancel conversation');
  }
});

// Suggest topic
router.post('/:id/topics', authMiddleware, async (req, res) => {
  try {
    const conversation = await conversationService.suggestTopic({
      conversationId: req.params.id,
      user: req.user,
      text: req.body?.text,
    });
    res.json({ conversation });
  } catch (error) {
    handleError(res, error, 'Failed to suggest topic');
  }
});

// Vote on topic
router.post('/:id/topics/:topicId/vote', authMiddleware, async (req, res) => {
  try {
    const conversation = await conversationService.voteTopic({
      conversationId: req.params.id,
      user: req.user,
      topicId: req.params.topicId,
    });
    res.json({ conversation });
  } catch (error) {
    handleError(res, error, 'Failed to vote on topic');
  }
});

module.exports = router;
