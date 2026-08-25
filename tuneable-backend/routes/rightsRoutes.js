const express = require('express');
const router = express.Router();
const adminMiddleware = require('../middleware/adminMiddleware');
const { isValidObjectId } = require('../utils/validators');
const {
  CASE_STATUSES,
  PARTY_ROLES,
  CASE_SOURCES,
  OUTREACH_TEMPLATES,
} = require('../utils/rightsCaseHelpers');
const rightsCaseService = require('../services/rightsCaseService');

function handleServiceError(res, error) {
  const status = error.status || 500;
  if (status >= 500) {
    console.error('Rights case error:', error);
  }
  return res.status(status).json({ error: error.message || 'Rights case request failed' });
}

router.get('/admin/meta', adminMiddleware, (req, res) => {
  res.json({
    statuses: CASE_STATUSES,
    roles: PARTY_ROLES,
    sources: CASE_SOURCES,
    templates: OUTREACH_TEMPLATES,
    replyTo: process.env.EMAIL_REPLY_TO || 'hi@tuneable.stream',
  });
});

router.get('/admin/queues', adminMiddleware, async (req, res) => {
  try {
    const counts = await rightsCaseService.queueCounts();
    res.json({ counts });
  } catch (error) {
    handleServiceError(res, error);
  }
});

router.get('/admin/limbo', adminMiddleware, async (req, res) => {
  try {
    const result = await rightsCaseService.listLimbo(req.query);
    res.json(result);
  } catch (error) {
    handleServiceError(res, error);
  }
});

router.get('/admin/cases', adminMiddleware, async (req, res) => {
  try {
    const result = await rightsCaseService.listCases(req.query);
    res.json(result);
  } catch (error) {
    handleServiceError(res, error);
  }
});

router.post('/admin/cases', adminMiddleware, async (req, res) => {
  try {
    const { rightsCase, created } = await rightsCaseService.createCase({
      ...req.body,
      createdBy: req.user._id,
      assignedTo: req.body.assignedTo || req.user._id,
    });
    res.status(created ? 201 : 200).json({ case: rightsCase, created });
  } catch (error) {
    handleServiceError(res, error);
  }
});

router.get('/admin/cases/:id', adminMiddleware, async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: 'Invalid case id' });
    }
    const rightsCase = await rightsCaseService.getCase(req.params.id);
    res.json({ case: rightsCase });
  } catch (error) {
    handleServiceError(res, error);
  }
});

router.patch('/admin/cases/:id', adminMiddleware, async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: 'Invalid case id' });
    }
    const rightsCase = await rightsCaseService.updateCase(req.params.id, req.body, req.user._id);
    res.json({ case: rightsCase });
  } catch (error) {
    handleServiceError(res, error);
  }
});

router.post('/admin/cases/:id/outreach', adminMiddleware, async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: 'Invalid case id' });
    }
    const rightsCase = await rightsCaseService.addOutreach(req.params.id, req.body, req.user._id);
    res.status(201).json({ case: rightsCase });
  } catch (error) {
    handleServiceError(res, error);
  }
});

router.post('/admin/cases/:id/preview', adminMiddleware, async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: 'Invalid case id' });
    }
    const preview = await rightsCaseService.previewOutreach({
      caseId: req.params.id,
      template: req.body.template,
      customMessage: req.body.customMessage,
    });
    res.json(preview);
  } catch (error) {
    handleServiceError(res, error);
  }
});

module.exports = router;
