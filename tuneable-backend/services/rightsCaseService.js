const RightsCase = require('../models/RightsCase');
const Media = require('../models/Media');
const ArtistEscrowAllocation = require('../models/ArtistEscrowAllocation');
const { sendRightsOutreachEmail } = require('../utils/emailService');
const {
  CASE_STATUSES,
  TERMINAL_STATUSES,
  OPEN_STATUSES,
  FOLLOW_UP_STATUSES,
  PARTY_ROLES,
  CASE_SOURCES,
  OUTREACH_TEMPLATES,
  normalizePartyKey,
  suggestedPartiesFromMedia,
  primaryEmailFromParty,
  statusAfterContactAdded,
  statusAfterOutboundEmail,
  statusAfterInboundReply,
  defaultFollowUpAt,
  buildOutreachContent,
} = require('../utils/rightsCaseHelpers');

const MEDIA_SELECT = 'title artist featuring songwriter composer producer creatorDisplay coverArt uuid rightsStatus rightsCleared importSource importedBy globalMediaAggregate isrc status';

const CASE_POPULATE = [
  { path: 'mediaId', select: MEDIA_SELECT },
  { path: 'assignedTo', select: 'username email' },
  { path: 'createdBy', select: 'username' },
  { path: 'linkedClaimId', select: 'intent status submittedAt userId' },
  { path: 'linkedReportId', select: 'category status contactEmail createdAt' },
  { path: 'party.userId', select: 'username email' },
  { path: 'outreach.sentBy', select: 'username' },
];

function parsePage(query) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 25));
  return { page, limit, skip: (page - 1) * limit };
}

async function findOpenCase(mediaId, displayName) {
  return RightsCase.findOne({
    mediaId,
    partyKey: normalizePartyKey(displayName),
    status: { $in: OPEN_STATUSES },
  });
}

async function escrowPenceForMediaIds(mediaIds) {
  if (!mediaIds.length) return new Map();
  const rows = await ArtistEscrowAllocation.aggregate([
    { $match: { mediaId: { $in: mediaIds }, claimed: false } },
    { $group: { _id: '$mediaId', escrowPence: { $sum: '$allocatedAmount' } } },
  ]);
  return new Map(rows.map((row) => [String(row._id), row.escrowPence || 0]));
}

function serializeCase(doc, extras = {}) {
  const json = doc.toObject ? doc.toObject() : doc;
  return { ...json, ...extras };
}

async function withEscrow(cases) {
  const ids = cases
    .map((item) => item.mediaId?._id || item.mediaId)
    .filter(Boolean);
  const escrow = await escrowPenceForMediaIds(ids);
  return cases.map((item) => {
    const mediaId = item.mediaId?._id || item.mediaId;
    return serializeCase(item, { escrowPence: escrow.get(String(mediaId)) || 0 });
  });
}

async function createCase({
  mediaId,
  party,
  source = 'manual',
  status,
  notes = '',
  assignedTo,
  createdBy,
  linkedClaimId = null,
  linkedReportId = null,
  nextFollowUpAt = null,
}) {
  const media = await Media.findById(mediaId).select(MEDIA_SELECT);
  if (!media) {
    const error = new Error('Media not found');
    error.status = 404;
    throw error;
  }
  if (media.status === 'deleted') {
    const error = new Error('Media not found');
    error.status = 404;
    throw error;
  }

  const displayName = party?.displayName?.trim();
  if (!displayName) {
    const error = new Error('Party displayName is required');
    error.status = 400;
    throw error;
  }
  if (party.role && !PARTY_ROLES.includes(party.role)) {
    const error = new Error('Invalid party role');
    error.status = 400;
    throw error;
  }
  if (source && !CASE_SOURCES.includes(source)) {
    const error = new Error('Invalid case source');
    error.status = 400;
    throw error;
  }

  const existing = await findOpenCase(media._id, displayName);
  if (existing) {
    await existing.populate(CASE_POPULATE);
    return { rightsCase: existing, created: false };
  }

  const contacts = Array.isArray(party.contacts)
    ? party.contacts.filter((c) => c?.value).map((c) => ({
      type: c.type || 'email',
      value: String(c.value).trim(),
      notes: c.notes || '',
    }))
    : [];

  const hasEmail = contacts.some((c) => c.type === 'email');
  const initialStatus = status && CASE_STATUSES.includes(status)
    ? status
    : (hasEmail ? 'contact_found' : 'identified');

  const rightsCase = await RightsCase.create({
    mediaId: media._id,
    party: {
      displayName,
      role: party.role || 'artist',
      userId: party.userId || null,
      labelId: party.labelId || null,
      collectiveId: party.collectiveId || null,
      contacts,
    },
    status: initialStatus,
    source: source || 'manual',
    notes,
    assignedTo: assignedTo || createdBy || null,
    createdBy: createdBy || null,
    linkedClaimId,
    linkedReportId,
    nextFollowUpAt,
  });

  await rightsCase.populate(CASE_POPULATE);
  return { rightsCase, created: true };
}

async function getCase(id) {
  const rightsCase = await RightsCase.findById(id).populate(CASE_POPULATE);
  if (!rightsCase) {
    const error = new Error('Rights case not found');
    error.status = 404;
    throw error;
  }
  const [withMoney] = await withEscrow([rightsCase]);
  return withMoney;
}

async function listCases(query = {}) {
  const { page, limit, skip } = parsePage(query);
  const filter = {};
  const queue = query.queue || 'open';

  if (query.status && CASE_STATUSES.includes(query.status)) {
    filter.status = query.status;
  } else if (queue === 'open') {
    filter.status = { $in: OPEN_STATUSES };
  } else if (queue === 'follow_ups') {
    filter.status = { $in: FOLLOW_UP_STATUSES };
    filter.nextFollowUpAt = { $lte: new Date() };
  } else if (queue === 'stalled') {
    filter.status = 'no_response';
  } else if (queue === 'inbound') {
    filter.source = { $in: ['report', 'claim'] };
    filter.status = { $in: OPEN_STATUSES };
  } else if (queue === 'closed') {
    filter.status = { $in: TERMINAL_STATUSES };
  }

  if (query.source && CASE_SOURCES.includes(query.source)) {
    filter.source = query.source;
  }
  if (query.assignedTo) filter.assignedTo = query.assignedTo;
  if (query.mediaId) filter.mediaId = query.mediaId;
  if (query.search) {
    const search = String(query.search).trim();
    if (search) {
      filter.$or = [
        { 'party.displayName': { $regex: search, $options: 'i' } },
        { notes: { $regex: search, $options: 'i' } },
      ];
    }
  }

  const sort = queue === 'follow_ups'
    ? { nextFollowUpAt: 1 }
    : { updatedAt: -1 };

  const [docs, total] = await Promise.all([
    RightsCase.find(filter).sort(sort).skip(skip).limit(limit).populate(CASE_POPULATE),
    RightsCase.countDocuments(filter),
  ]);

  return {
    cases: await withEscrow(docs),
    total,
    page,
    limit,
  };
}

async function listLimbo(query = {}) {
  const { page, limit, skip } = parsePage(query);
  const uncontacted = query.uncontacted !== 'false' && query.uncontacted !== false;

  const match = {
    rightsStatus: 'pending',
    rightsCleared: { $ne: true },
    status: { $nin: ['deleted', 'vetoed'] },
  };

  const pipeline = [{ $match: match }];

  pipeline.push({
    $lookup: {
      from: RightsCase.collection.name,
      localField: '_id',
      foreignField: 'mediaId',
      as: 'cases',
    },
  });

  if (uncontacted) {
    pipeline.push({ $match: { cases: { $size: 0 } } });
  }

  pipeline.push(
    {
      $lookup: {
        from: ArtistEscrowAllocation.collection.name,
        let: { mid: '$_id' },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ['$mediaId', '$$mid'] },
                  { $eq: ['$claimed', false] },
                ],
              },
            },
          },
          { $group: { _id: null, escrowPence: { $sum: '$allocatedAmount' } } },
        ],
        as: 'escrow',
      },
    },
    {
      $addFields: {
        escrowPence: { $ifNull: [{ $arrayElemAt: ['$escrow.escrowPence', 0] }, 0] },
        openCaseCount: {
          $size: {
            $filter: {
              input: '$cases',
              as: 'c',
              cond: { $in: ['$$c.status', OPEN_STATUSES] },
            },
          },
        },
      },
    },
    { $sort: { escrowPence: -1, globalMediaAggregate: -1, uploadedAt: -1 } },
    {
      $facet: {
        items: [
          { $skip: skip },
          { $limit: limit },
          {
            $project: {
              title: 1,
              artist: 1,
              featuring: 1,
              songwriter: 1,
              composer: 1,
              producer: 1,
              creatorDisplay: 1,
              coverArt: 1,
              uuid: 1,
              rightsStatus: 1,
              rightsCleared: 1,
              importSource: 1,
              globalMediaAggregate: 1,
              isrc: 1,
              escrowPence: 1,
              openCaseCount: 1,
            },
          },
        ],
        total: [{ $count: 'count' }],
      },
    }
  );

  const [result] = await Media.aggregate(pipeline);
  const items = (result?.items || []).map((media) => ({
    ...media,
    suggestedParties: suggestedPartiesFromMedia(media),
  }));

  return {
    media: items,
    total: result?.total?.[0]?.count || 0,
    page,
    limit,
  };
}

async function queueCounts() {
  const now = new Date();
  const [open, followUps, stalled, inbound, limbo] = await Promise.all([
    RightsCase.countDocuments({ status: { $in: OPEN_STATUSES } }),
    RightsCase.countDocuments({
      status: { $in: FOLLOW_UP_STATUSES },
      nextFollowUpAt: { $lte: now },
    }),
    RightsCase.countDocuments({ status: 'no_response' }),
    RightsCase.countDocuments({
      source: { $in: ['report', 'claim'] },
      status: { $in: OPEN_STATUSES },
    }),
    listLimbo({ page: 1, limit: 1, uncontacted: 'true' }).then((r) => r.total),
  ]);

  return {
    limbo,
    followUps,
    open,
    inbound,
    stalled,
  };
}

async function updateCase(id, patch, actorId) {
  const rightsCase = await RightsCase.findById(id);
  if (!rightsCase) {
    const error = new Error('Rights case not found');
    error.status = 404;
    throw error;
  }

  if (patch.status) {
    if (!CASE_STATUSES.includes(patch.status)) {
      const error = new Error('Invalid status');
      error.status = 400;
      throw error;
    }
    rightsCase.status = patch.status;
  }
  if (patch.assignedTo !== undefined) {
    rightsCase.assignedTo = patch.assignedTo || null;
  }
  if (patch.nextFollowUpAt !== undefined) {
    rightsCase.nextFollowUpAt = patch.nextFollowUpAt ? new Date(patch.nextFollowUpAt) : null;
  }
  if (patch.notes !== undefined) {
    rightsCase.notes = patch.notes;
  }
  if (patch.linkedClaimId !== undefined) {
    rightsCase.linkedClaimId = patch.linkedClaimId || null;
  }
  if (patch.linkedReportId !== undefined) {
    rightsCase.linkedReportId = patch.linkedReportId || null;
  }
  if (patch.party) {
    if (patch.party.displayName) {
      rightsCase.party.displayName = patch.party.displayName.trim();
    }
    if (patch.party.role) {
      if (!PARTY_ROLES.includes(patch.party.role)) {
        const error = new Error('Invalid party role');
        error.status = 400;
        throw error;
      }
      rightsCase.party.role = patch.party.role;
    }
    if (patch.party.userId !== undefined) rightsCase.party.userId = patch.party.userId || null;
    if (patch.party.labelId !== undefined) rightsCase.party.labelId = patch.party.labelId || null;
    if (patch.party.collectiveId !== undefined) {
      rightsCase.party.collectiveId = patch.party.collectiveId || null;
    }
    if (Array.isArray(patch.party.contacts)) {
      rightsCase.party.contacts = patch.party.contacts
        .filter((c) => c?.value)
        .map((c) => ({
          type: c.type || 'email',
          value: String(c.value).trim(),
          notes: c.notes || '',
        }));
      if (primaryEmailFromParty(rightsCase.party)) {
        rightsCase.status = statusAfterContactAdded(rightsCase.status);
      }
    }
  }

  if (actorId && patch.note) {
    rightsCase.outreach.push({
      channel: 'note',
      direction: 'note',
      template: 'none',
      body: String(patch.note),
      sentBy: actorId,
      sentAt: new Date(),
    });
  }

  await rightsCase.save();
  return getCase(rightsCase._id);
}

async function addOutreach(id, payload, actorId) {
  const rightsCase = await RightsCase.findById(id).populate('mediaId', MEDIA_SELECT);
  if (!rightsCase) {
    const error = new Error('Rights case not found');
    error.status = 404;
    throw error;
  }

  const channel = payload.channel || 'email';
  const direction = payload.direction || (channel === 'note' ? 'note' : 'outbound');
  const template = OUTREACH_TEMPLATES.includes(payload.template) ? payload.template : 'custom';

  if (channel === 'email' && direction === 'outbound') {
    const to = (payload.to || primaryEmailFromParty(rightsCase.party) || '').trim();
    if (!to) {
      const error = new Error('An email address is required to send outreach');
      error.status = 400;
      throw error;
    }

    const content = buildOutreachContent({
      template,
      media: rightsCase.mediaId,
      party: rightsCase.party,
      customMessage: payload.customMessage || payload.body || '',
      frontendUrl: process.env.FRONTEND_URL || 'https://tuneable.stream',
    });
    const subject = payload.subject || content.subject;

    const sent = await sendRightsOutreachEmail({
      to,
      subject,
      text: content.text,
      caseId: String(rightsCase._id),
    });

    if (!rightsCase.party.contacts.some((c) => c.type === 'email' && c.value.toLowerCase() === to.toLowerCase())) {
      rightsCase.party.contacts.push({ type: 'email', value: to });
    }

    rightsCase.outreach.push({
      channel: 'email',
      direction: 'outbound',
      template,
      to,
      subject,
      body: content.text,
      resendId: sent?.id || null,
      sentBy: actorId,
      sentAt: new Date(),
    });
    rightsCase.status = statusAfterOutboundEmail(rightsCase.status);
    rightsCase.nextFollowUpAt = payload.nextFollowUpAt
      ? new Date(payload.nextFollowUpAt)
      : defaultFollowUpAt();
  } else {
    const body = (payload.body || payload.customMessage || '').trim();
    if (!body) {
      const error = new Error('A message body is required');
      error.status = 400;
      throw error;
    }
    rightsCase.outreach.push({
      channel: channel === 'note' ? 'note' : 'manual',
      direction,
      template: template || 'none',
      to: payload.to || '',
      subject: payload.subject || '',
      body,
      sentBy: actorId,
      sentAt: new Date(),
    });
    if (direction === 'inbound') {
      rightsCase.status = statusAfterInboundReply(rightsCase.status);
    }
  }

  await rightsCase.save();
  return getCase(rightsCase._id);
}

async function attachClaim(claim) {
  if (!claim?.mediaId) return;
  const open = await RightsCase.find({
    mediaId: claim.mediaId,
    status: { $nin: TERMINAL_STATUSES },
  });

  if (open.length === 0) {
    const media = await Media.findById(claim.mediaId).select(MEDIA_SELECT);
    const party = suggestedPartiesFromMedia(media)[0] || {
      displayName: 'Claimant',
      role: 'artist',
    };
    const { rightsCase: created } = await createCase({
      mediaId: claim.mediaId,
      party,
      source: 'claim',
      status: 'claim_filed',
      linkedClaimId: claim._id,
      createdBy: claim.userId,
    });
    created.outreach.push({
      channel: 'note',
      direction: 'note',
      template: 'none',
      body: `Claim ${claim.intent || 'claim_keep'} submitted`,
      sentBy: claim.userId,
      sentAt: new Date(),
    });
    await created.save();
    return;
  }

  await Promise.all(open.map(async (rightsCase) => {
    rightsCase.status = 'claim_filed';
    rightsCase.linkedClaimId = claim._id;
    rightsCase.outreach.push({
      channel: 'note',
      direction: 'note',
      template: 'none',
      body: `Claim ${claim.intent || 'claim_keep'} submitted`,
      sentBy: claim.userId,
      sentAt: new Date(),
    });
    await rightsCase.save();
  }));
}

async function syncFromClaimReview(claim) {
  if (!claim?.mediaId) return;
  const nextStatus = claim.status !== 'approved'
    ? null
    : (claim.intent === 'takedown' ? 'takedown' : 'cleared');
  if (!nextStatus) return;

  await RightsCase.updateMany(
    {
      mediaId: claim.mediaId,
      status: { $nin: TERMINAL_STATUSES },
    },
    {
      $set: {
        status: nextStatus,
        linkedClaimId: claim._id,
      },
    }
  );
}

async function openFromCopyrightReport(report, media) {
  if (!report || report.category !== 'copyright' || report.reportType !== 'media') return null;
  const displayName = report.contactEmail || 'Copyright reporter';
  const contacts = report.contactEmail
    ? [{ type: 'email', value: report.contactEmail }]
    : [];

  return createCase({
    mediaId: media._id,
    party: {
      displayName,
      role: 'reporter',
      contacts,
    },
    source: 'report',
    linkedReportId: report._id,
    createdBy: report.reportedBy,
    notes: report.description || '',
  });
}

async function previewOutreach({ caseId, template, customMessage }) {
  const rightsCase = await RightsCase.findById(caseId).populate('mediaId', MEDIA_SELECT);
  if (!rightsCase) {
    const error = new Error('Rights case not found');
    error.status = 404;
    throw error;
  }
  return buildOutreachContent({
    template,
    media: rightsCase.mediaId,
    party: rightsCase.party,
    customMessage,
    frontendUrl: process.env.FRONTEND_URL || 'https://tuneable.stream',
  });
}

module.exports = {
  createCase,
  getCase,
  listCases,
  listLimbo,
  queueCounts,
  updateCase,
  addOutreach,
  attachClaim,
  syncFromClaimReview,
  openFromCopyrightReport,
  previewOutreach,
};
