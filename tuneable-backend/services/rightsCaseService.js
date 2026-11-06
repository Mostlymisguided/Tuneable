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
  CONTACT_SOURCES,
  CONTACT_CONFIDENCES,
  OUTREACH_TEMPLATES,
  OUTREACH_FORMATS,
  normalizePartyKey,
  suggestedPartiesFromMedia,
  primaryEmailFromParty,
  primaryInstagramFromParty,
  normalizeInstagramHandle,
  statusAfterContactAdded,
  statusAfterOutboundEmail,
  statusAfterInboundReply,
  defaultFollowUpAt,
  buildOutreachContent,
  escapeRegex,
  ARTIST_FILTERS,
  ARTIST_SORTS,
  preferDisplayName,
  partyNameRegex,
  pickFlagshipMedia,
  rollupArtistStatus,
  artistMatchesFilter,
  compareArtists,
  parseContactDate,
  parseArtistCsv,
} = require('../utils/rightsCaseHelpers');
const { findContactCandidates } = require('./rightsContactLookupService');
const { RIGHTS_STATUSES, isValidRightsStatus } = require('../utils/mediaRights');

const MEDIA_SELECT = 'title artist featuring songwriter composer producer host guest narrator director cinematographer editor author label creatorDisplay coverArt uuid rightsStatus rightsCleared importSource importedBy globalMediaAggregate isrc status';

function normalizeContact(contact) {
  const source = CONTACT_SOURCES.includes(contact.source) ? contact.source : 'manual';
  const confidence = CONTACT_CONFIDENCES.includes(contact.confidence) ? contact.confidence : 'manual';
  return {
    type: contact.type || 'email',
    value: String(contact.value).trim(),
    notes: contact.notes || '',
    source,
    confidence,
  };
}

const CASE_POPULATE = [
  { path: 'mediaId', select: MEDIA_SELECT },
  { path: 'assignedTo', select: 'username email' },
  { path: 'createdBy', select: 'username' },
  { path: 'linkedClaimId', select: 'intent status submittedAt userId' },
  { path: 'linkedReportId', select: 'category status contactEmail createdAt' },
  { path: 'party.userId', select: 'username email' },
  { path: 'party.labelId', select: 'name email' },
  { path: 'party.collectiveId', select: 'name email' },
  { path: 'outreach.sentBy', select: 'username' },
];

function parsePage(query) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 25));
  return { page, limit, skip: (page - 1) * limit };
}

function searchRegex(query) {
  const search = String(query || '').trim();
  if (!search) return null;
  return new RegExp(escapeRegex(search), 'i');
}

function mediaSearchClause(rx) {
  return {
    $or: [
      { title: rx },
      { creatorDisplay: rx },
      { creatorNames: rx },
      { isrc: rx },
      { 'artist.name': rx },
      { 'featuring.name': rx },
      { 'songwriter.name': rx },
      { 'composer.name': rx },
      { 'producer.name': rx },
      { 'host.name': rx },
      { 'guest.name': rx },
      { 'narrator.name': rx },
      { 'director.name': rx },
      { 'author.name': rx },
      { 'label.name': rx },
    ],
  };
}

async function mediaIdsMatchingSearch(rx, cap = 200) {
  const rows = await Media.find(mediaSearchClause(rx)).select('_id').limit(cap).lean();
  return rows.map((row) => row._id);
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

  const contacts = Array.isArray(party.contacts)
    ? party.contacts.filter((c) => c?.value).map(normalizeContact)
    : [];

  const existing = await findOpenCase(media._id, displayName);
  if (existing) {
    let changed = false;
    if (party.userId && !existing.party.userId) {
      existing.party.userId = party.userId;
      changed = true;
    }
    if (party.labelId && !existing.party.labelId) {
      existing.party.labelId = party.labelId;
      changed = true;
    }
    if (party.collectiveId && !existing.party.collectiveId) {
      existing.party.collectiveId = party.collectiveId;
      changed = true;
    }
    for (const contact of contacts) {
      const already = (existing.party.contacts || []).some(
        (c) => c.type === contact.type && String(c.value).toLowerCase() === contact.value.toLowerCase()
      );
      if (!already) {
        existing.party.contacts.push(contact);
        changed = true;
      }
    }
    if (changed && primaryEmailFromParty(existing.party)) {
      existing.status = statusAfterContactAdded(existing.status);
    }
    if (changed) await existing.save();
    await existing.populate(CASE_POPULATE);
    return { rightsCase: existing, created: false };
  }

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
  } else if (queue === 'all') {
    // Every case, including cleared, declined, and takedown.
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
  const rx = searchRegex(query.search);
  if (rx) {
    const mediaIds = await mediaIdsMatchingSearch(rx);
    filter.$or = [
      { 'party.displayName': rx },
      { 'party.contacts.value': rx },
      { notes: rx },
      ...(mediaIds.length ? [{ mediaId: { $in: mediaIds } }] : []),
    ];
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
  const rx = searchRegex(query.search);
  if (rx) Object.assign(match, mediaSearchClause(rx));

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
              host: 1,
              guest: 1,
              narrator: 1,
              director: 1,
              cinematographer: 1,
              editor: 1,
              author: 1,
              label: 1,
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

function emptyMediaStatuses() {
  return { pending: 0, permitted: 0, cleared: 0, disputed: 0 };
}

function summarizeOutreach(rows) {
  const summary = {
    total: 0,
    outbound: 0,
    inbound: 0,
    notes: 0,
    byChannel: {},
    lastAt: null,
  };
  for (const row of rows) {
    const count = row.count || 0;
    const channel = row._id?.channel || 'other';
    const direction = row._id?.direction || 'outbound';
    summary.total += count;
    summary.byChannel[channel] = (summary.byChannel[channel] || 0) + count;
    if (direction === 'inbound') summary.inbound += count;
    else if (direction === 'note') summary.notes += count;
    else summary.outbound += count;
    if (row.lastAt && (!summary.lastAt || new Date(row.lastAt) > new Date(summary.lastAt))) {
      summary.lastAt = row.lastAt;
    }
  }
  return summary;
}

const LIVE_MEDIA = { status: { $nin: ['deleted', 'vetoed'] } };

async function ownershipSnapshot() {
  const now = new Date();
  const [open, followUps, stalled, inbound, limbo, all, statusRows, outreachRows] = await Promise.all([
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
    RightsCase.countDocuments({}),
    Media.aggregate([
      { $match: LIVE_MEDIA },
      { $group: { _id: '$rightsStatus', count: { $sum: 1 } } },
    ]),
    RightsCase.aggregate([
      { $unwind: '$outreach' },
      {
        $group: {
          _id: { channel: '$outreach.channel', direction: '$outreach.direction' },
          count: { $sum: 1 },
          lastAt: { $max: '$outreach.sentAt' },
        },
      },
    ]),
  ]);

  const mediaStatuses = emptyMediaStatuses();
  for (const row of statusRows) {
    const key = RIGHTS_STATUSES.includes(row._id) ? row._id : 'pending';
    mediaStatuses[key] += row.count || 0;
  }

  return {
    counts: {
      limbo,
      followUps,
      open,
      inbound,
      stalled,
      all,
    },
    mediaStatuses,
    outreach: summarizeOutreach(outreachRows),
  };
}

async function listCatalogue(query = {}) {
  const { page, limit, skip } = parsePage(query);
  const rightsStatus = String(query.rightsStatus || '').trim();
  const match = { ...LIVE_MEDIA };
  if (rightsStatus) {
    if (!isValidRightsStatus(rightsStatus)) {
      const error = new Error('Invalid rights status');
      error.status = 400;
      throw error;
    }
    match.rightsStatus = rightsStatus;
  }

  const rx = searchRegex(query.search);
  if (rx) Object.assign(match, mediaSearchClause(rx));

  const [items, total] = await Promise.all([
    Media.find(match)
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limit)
      .select('title artist featuring songwriter composer producer host guest narrator director cinematographer editor author label creatorDisplay coverArt uuid rightsStatus rightsCleared importSource globalMediaAggregate isrc updatedAt')
      .lean(),
    Media.countDocuments(match),
  ]);

  const ids = items.map((item) => item._id);
  const cases = ids.length
    ? await RightsCase.find({ mediaId: { $in: ids } })
      .select('mediaId status party.displayName outreach.channel outreach.direction outreach.sentAt outreach.template')
      .lean()
    : [];

  const byMedia = new Map();
  for (const rightsCase of cases) {
    const key = String(rightsCase.mediaId);
    if (!byMedia.has(key)) byMedia.set(key, []);
    byMedia.get(key).push(rightsCase);
  }

  const media = items.map((item) => {
    const related = byMedia.get(String(item._id)) || [];
    let lastOutreach = null;
    let outreachCount = 0;
    for (const rightsCase of related) {
      for (const event of rightsCase.outreach || []) {
        outreachCount += 1;
        const sentAt = event.sentAt ? new Date(event.sentAt).getTime() : 0;
        const previous = lastOutreach ? new Date(lastOutreach.sentAt).getTime() : -1;
        if (!lastOutreach || sentAt >= previous) {
          lastOutreach = {
            channel: event.channel,
            direction: event.direction,
            template: event.template,
            sentAt: event.sentAt,
            partyName: rightsCase.party?.displayName || '',
            caseStatus: rightsCase.status,
          };
        }
      }
    }
    const publicItem = { ...item };
    for (const field of [
      'featuring', 'songwriter', 'composer', 'producer', 'host', 'guest',
      'narrator', 'director', 'cinematographer', 'editor', 'author', 'label',
    ]) {
      delete publicItem[field];
    }
    return {
      ...publicItem,
      suggestedParties: suggestedPartiesFromMedia(item),
      caseCount: related.length,
      outreachCount,
      lastOutreach,
    };
  });

  return { media, total, page, limit };
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
        .map(normalizeContact);
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

async function inviteCodeForActor(actorId) {
  if (!actorId) return null;
  const User = require('../models/User');
  const actor = await User.findById(actorId).select('personalInviteCode personalInviteCodes');
  if (!actor || typeof actor.getPrimaryInviteCode !== 'function') return null;
  const code = actor.getPrimaryInviteCode();
  if (!code || String(code).trim().length !== 5) return null;
  return String(code).trim().toUpperCase();
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
  const frontendUrl = process.env.FRONTEND_URL || 'https://tuneable.stream';
  const customMessage = payload.customMessage || payload.body || '';
  const inviteCode = await inviteCodeForActor(actorId);

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
      catalog: payload.catalog,
      catalogTotal: payload.catalogTotal,
      customMessage,
      frontendUrl,
      format: 'email',
      inviteCode,
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
  } else if ((channel === 'instagram' || channel === 'link') && direction === 'outbound') {
    const format = channel === 'instagram' ? 'instagram' : 'link';
    const content = buildOutreachContent({
      template,
      media: rightsCase.mediaId,
      party: rightsCase.party,
      catalog: payload.catalog,
      catalogTotal: payload.catalogTotal,
      customMessage,
      frontendUrl,
      format,
      inviteCode,
    });
    const body = (payload.body || content.text || '').trim();
    if (!body) {
      const error = new Error('A message body is required');
      error.status = 400;
      throw error;
    }
    const to = channel === 'instagram'
      ? (normalizeInstagramHandle(payload.to) || primaryInstagramFromParty(rightsCase.party))
      : (payload.to || content.tuneUrl || '').trim();

    if (channel === 'instagram' && to) {
      const already = rightsCase.party.contacts.some(
        (c) => c.type === 'instagram' && normalizeInstagramHandle(c.value).toLowerCase() === to.toLowerCase()
      );
      if (!already) {
        rightsCase.party.contacts.push({ type: 'instagram', value: to });
      }
    }

    rightsCase.outreach.push({
      channel,
      direction: 'outbound',
      template,
      to,
      subject: payload.subject || content.subject || '',
      body,
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

async function previewOutreach({
  caseId,
  template,
  customMessage,
  format = 'email',
  actorId = null,
  catalog,
  catalogTotal,
}) {
  const rightsCase = await RightsCase.findById(caseId).populate('mediaId', MEDIA_SELECT);
  if (!rightsCase) {
    const error = new Error('Rights case not found');
    error.status = 404;
    throw error;
  }
  const chosenFormat = OUTREACH_FORMATS.includes(format) ? format : 'email';
  const inviteCode = await inviteCodeForActor(actorId);
  return {
    ...buildOutreachContent({
      template,
      media: rightsCase.mediaId,
      party: rightsCase.party,
      catalog,
      catalogTotal,
      customMessage,
      frontendUrl: process.env.FRONTEND_URL || 'https://tuneable.stream',
      format: chosenFormat,
      inviteCode,
    }),
    instagramHandle: primaryInstagramFromParty(rightsCase.party) || null,
  };
}

const ARTIST_MEDIA_SELECT = 'title uuid rightsStatus globalMediaAggregate coverArt artist creatorDisplay';
const ARTIST_IMPORT_LIMIT = 2000;
const ARTIST_SEND_CHANNELS = ['email', 'instagram', 'link'];
const IMPORTED_CONTACT_PREFIX = 'Imported from spreadsheet.';

function httpError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function emptyTuneCounts() {
  return { total: 0, pending: 0, permitted: 0, cleared: 0, disputed: 0 };
}

function addTuneCounts(target, row) {
  target.total += row.total || 0;
  target.pending += row.pending || 0;
  target.permitted += row.permitted || 0;
  target.cleared += row.cleared || 0;
  target.disputed += row.disputed || 0;
}

function mostCommonContact(contactLists, type, normalize) {
  const counts = new Map();
  const display = new Map();
  for (const list of contactLists) {
    const seen = new Set();
    for (const contact of list || []) {
      if (contact?.type !== type || !contact.value) continue;
      const raw = String(contact.value).trim();
      const normalized = normalize ? normalize(raw) : raw;
      const key = String(normalized || '').trim().toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      counts.set(key, (counts.get(key) || 0) + 1);
      if (!display.has(key)) display.set(key, normalize ? normalized : raw);
    }
  }
  let best = '';
  let bestCount = -1;
  for (const [key, count] of counts) {
    if (count > bestCount) {
      bestCount = count;
      best = display.get(key) || '';
    }
  }
  return best;
}

function preferContact(party, type, value) {
  const wanted = String(value || '').trim();
  if (!wanted) return false;
  if (!Array.isArray(party.contacts)) party.contacts = [];
  const contacts = party.contacts;
  const idx = contacts.findIndex(
    (contact) => contact.type === type && String(contact.value).toLowerCase() === wanted.toLowerCase()
  );
  if (idx === -1) {
    contacts.unshift({
      type,
      value: wanted,
      source: 'manual',
      confidence: 'manual',
      notes: '',
    });
    return true;
  }
  const firstOfType = contacts.findIndex((contact) => contact.type === type);
  if (idx === firstOfType) return false;
  const [row] = contacts.splice(idx, 1);
  contacts.splice(Math.max(firstOfType, 0), 0, row);
  return true;
}

function summarizeCases(rows) {
  const statuses = [];
  const contactLists = [];
  let lastOutboundAt = null;
  let lastInboundAt = null;
  let nextFollowUpAt = null;
  for (const row of rows) {
    if (row.status) statuses.push(row.status);
    if (row.contacts?.length) contactLists.push(row.contacts);
    if (row.nextFollowUpAt && OPEN_STATUSES.includes(row.status)) {
      const followUp = new Date(row.nextFollowUpAt);
      if (!Number.isNaN(followUp.getTime()) && (!nextFollowUpAt || followUp < nextFollowUpAt)) {
        nextFollowUpAt = followUp;
      }
    }
    for (const event of row.outreach || []) {
      if (!event?.sentAt) continue;
      const sentAt = new Date(event.sentAt);
      if (Number.isNaN(sentAt.getTime())) continue;
      if (event.direction === 'inbound') {
        if (!lastInboundAt || sentAt > lastInboundAt) lastInboundAt = sentAt;
      } else if (event.direction !== 'note') {
        if (!lastOutboundAt || sentAt > lastOutboundAt) lastOutboundAt = sentAt;
      }
    }
  }
  return {
    statuses,
    email: mostCommonContact(contactLists, 'email'),
    instagram: mostCommonContact(contactLists, 'instagram', normalizeInstagramHandle),
    lastOutboundAt,
    lastInboundAt,
    nextFollowUpAt,
    caseCount: rows.length,
  };
}

async function aggregateCatalogArtists() {
  return Media.aggregate([
    { $match: { ...LIVE_MEDIA, 'artist.name': { $exists: true, $nin: ['', null] } } },
    { $unwind: '$artist' },
    { $match: { 'artist.name': { $type: 'string', $nin: ['', null] } } },
    {
      $group: {
        _id: {
          key: { $toLower: { $trim: { input: '$artist.name' } } },
          media: '$_id',
        },
        displayName: { $first: '$artist.name' },
        rightsStatus: { $first: { $ifNull: ['$rightsStatus', 'pending'] } },
      },
    },
    {
      $group: {
        _id: '$_id.key',
        displayName: { $first: '$displayName' },
        total: { $sum: 1 },
        pending: { $sum: { $cond: [{ $eq: ['$rightsStatus', 'pending'] }, 1, 0] } },
        permitted: { $sum: { $cond: [{ $eq: ['$rightsStatus', 'permitted'] }, 1, 0] } },
        cleared: { $sum: { $cond: [{ $eq: ['$rightsStatus', 'cleared'] }, 1, 0] } },
        disputed: { $sum: { $cond: [{ $eq: ['$rightsStatus', 'disputed'] }, 1, 0] } },
      },
    },
  ]);
}

async function aggregateCaseArtists() {
  return RightsCase.aggregate([
    {
      $project: {
        partyKey: 1,
        displayName: '$party.displayName',
        status: 1,
        contacts: '$party.contacts',
        nextFollowUpAt: 1,
        outreach: {
          $map: {
            input: { $ifNull: ['$outreach', []] },
            as: 'event',
            in: { sentAt: '$$event.sentAt', direction: '$$event.direction' },
          },
        },
      },
    },
  ]);
}

function foldArtists(catalogRows, caseRows) {
  const byKey = new Map();
  const ensure = (key) => {
    const partyKey = normalizePartyKey(key);
    if (!partyKey) return null;
    if (!byKey.has(partyKey)) {
      byKey.set(partyKey, {
        partyKey,
        displayName: '',
        email: '',
        instagram: '',
        status: 'none',
        tunes: emptyTuneCounts(),
        lastOutboundAt: null,
        lastInboundAt: null,
        nextFollowUpAt: null,
        caseCount: 0,
      });
    }
    return byKey.get(partyKey);
  };

  for (const row of catalogRows) {
    const artist = ensure(row._id);
    if (!artist) continue;
    artist.displayName = preferDisplayName(artist.displayName, row.displayName);
    addTuneCounts(artist.tunes, row);
  }

  const casesByKey = new Map();
  for (const row of caseRows) {
    const key = normalizePartyKey(row.partyKey);
    if (!key) continue;
    if (!casesByKey.has(key)) casesByKey.set(key, []);
    casesByKey.get(key).push(row);
    const artist = ensure(key);
    artist.displayName = preferDisplayName(artist.displayName, row.displayName);
  }

  for (const [key, rows] of casesByKey) {
    const artist = byKey.get(key);
    const summary = summarizeCases(rows);
    artist.email = summary.email;
    artist.instagram = summary.instagram;
    artist.status = rollupArtistStatus(summary.statuses);
    artist.lastOutboundAt = summary.lastOutboundAt;
    artist.lastInboundAt = summary.lastInboundAt;
    artist.nextFollowUpAt = summary.nextFollowUpAt;
    artist.caseCount = summary.caseCount;
  }

  for (const artist of byKey.values()) {
    if (!artist.displayName) artist.displayName = artist.partyKey;
  }
  return [...byKey.values()];
}

async function titlePartyKeys(rx) {
  const hits = await Media.find({ ...LIVE_MEDIA, title: rx }).select('artist.name').limit(200).lean();
  const keys = new Set();
  for (const hit of hits) {
    for (const person of hit.artist || []) {
      const key = normalizePartyKey(person?.name);
      if (key) keys.add(key);
    }
  }
  return keys;
}

function countArtistFilters(artists, staleDays, now) {
  const counts = {};
  for (const filter of ARTIST_FILTERS) {
    counts[filter] = artists.filter((artist) => artistMatchesFilter(artist, filter, { staleDays, now })).length;
  }
  return counts;
}

function isoOrNull(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function presentArtist(artist) {
  return {
    ...artist,
    lastOutboundAt: isoOrNull(artist.lastOutboundAt),
    lastInboundAt: isoOrNull(artist.lastInboundAt),
    nextFollowUpAt: isoOrNull(artist.nextFollowUpAt),
  };
}

async function listArtists(query = {}) {
  const { page, limit, skip } = parsePage({ ...query, limit: query.limit || 50 });
  const filter = ARTIST_FILTERS.includes(query.filter) ? query.filter : 'all';
  const sort = ARTIST_SORTS.includes(query.sort) ? query.sort : 'pending';
  const staleDays = Math.min(365, Math.max(1, parseInt(query.staleDays, 10) || 14));
  const now = new Date();
  const [catalogRows, caseRows] = await Promise.all([
    aggregateCatalogArtists(),
    aggregateCaseArtists(),
  ]);
  let artists = foldArtists(catalogRows, caseRows);
  const rx = searchRegex(query.search);
  if (rx) {
    const titleKeys = await titlePartyKeys(rx);
    artists = artists.filter((artist) => (
      rx.test(artist.displayName)
      || rx.test(artist.email || '')
      || rx.test(artist.instagram || '')
      || titleKeys.has(artist.partyKey)
    ));
  }
  const counts = countArtistFilters(artists, staleDays, now);
  const filtered = artists.filter((artist) => artistMatchesFilter(artist, filter, { staleDays, now }));
  filtered.sort((a, b) => compareArtists(a, b, sort));
  return {
    artists: filtered.slice(skip, skip + limit).map(presentArtist),
    total: filtered.length,
    page,
    limit,
    filter,
    sort,
    staleDays,
    counts,
  };
}

function dedupeMedia(lists) {
  const seen = new Set();
  const items = [];
  for (const list of lists) {
    for (const item of list || []) {
      const id = String(item._id);
      if (seen.has(id)) continue;
      seen.add(id);
      items.push(item);
    }
  }
  return items;
}

async function loadArtist(partyKey) {
  const key = normalizePartyKey(partyKey);
  if (!key) throw httpError('Artist name is required', 400);
  const nameRx = partyNameRegex(key);
  const mediaQuery = { ...LIVE_MEDIA, 'artist.name': nameRx };
  const [pendingMedia, popularMedia, total, statusRows, cases] = await Promise.all([
    Media.find({ ...mediaQuery, rightsStatus: 'pending' })
      .select(ARTIST_MEDIA_SELECT)
      .sort({ globalMediaAggregate: -1 })
      .limit(20)
      .lean(),
    Media.find(mediaQuery)
      .select(ARTIST_MEDIA_SELECT)
      .sort({ globalMediaAggregate: -1 })
      .limit(20)
      .lean(),
    Media.countDocuments(mediaQuery),
    Media.aggregate([
      { $match: mediaQuery },
      { $group: { _id: { $ifNull: ['$rightsStatus', 'pending'] }, count: { $sum: 1 } } },
    ]),
    RightsCase.find({ partyKey: key }).populate(CASE_POPULATE).sort({ updatedAt: -1 }).limit(50),
  ]);
  if (!total && cases.length === 0) throw httpError('Artist not found', 404);

  const media = dedupeMedia([pendingMedia, popularMedia]);
  const tunes = emptyTuneCounts();
  tunes.total = total;
  for (const row of statusRows) {
    if (Object.prototype.hasOwnProperty.call(tunes, row._id)) tunes[row._id] = row.count || 0;
  }

  const summary = summarizeCases(cases.map((doc) => ({
    status: doc.status,
    contacts: doc.party?.contacts,
    nextFollowUpAt: doc.nextFollowUpAt,
    outreach: doc.outreach,
  })));

  let displayName = '';
  for (const item of media) {
    for (const person of item.artist || []) {
      if (normalizePartyKey(person?.name) === key) displayName = preferDisplayName(displayName, person.name);
    }
  }
  for (const doc of cases) displayName = preferDisplayName(displayName, doc.party?.displayName);
  if (!displayName) displayName = key;

  const flagship = pickFlagshipMedia(media);
  const outreach = [];
  for (const rightsCase of cases) {
    const mediaDoc = rightsCase.mediaId && typeof rightsCase.mediaId === 'object' ? rightsCase.mediaId : null;
    for (const event of rightsCase.outreach || []) {
      outreach.push({
        _id: event._id,
        sentAt: event.sentAt,
        channel: event.channel,
        direction: event.direction,
        template: event.template,
        subject: event.subject || '',
        body: event.body || '',
        to: event.to || '',
        caseId: rightsCase._id,
        mediaTitle: mediaDoc?.title || '',
      });
    }
  }
  outreach.sort((a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime());

  const openCases = cases.filter((item) => OPEN_STATUSES.includes(item.status));
  const flagshipCase = (
    flagship && openCases.find((item) => String(item.mediaId?._id || item.mediaId) === String(flagship._id))
  ) || openCases[0] || cases[0] || null;

  return {
    partyKey: key,
    displayName,
    email: summary.email,
    instagram: summary.instagram,
    status: rollupArtistStatus(summary.statuses),
    tunes,
    lastOutboundAt: isoOrNull(summary.lastOutboundAt),
    lastInboundAt: isoOrNull(summary.lastInboundAt),
    nextFollowUpAt: isoOrNull(summary.nextFollowUpAt),
    caseCount: cases.length,
    flagshipMediaId: flagship?._id || null,
    flagshipCaseId: flagshipCase?._id || null,
    media: media.map((item) => ({
      _id: item._id,
      title: item.title,
      uuid: item.uuid,
      rightsStatus: item.rightsStatus || 'pending',
      coverArt: item.coverArt || null,
      globalMediaAggregate: item.globalMediaAggregate || 0,
    })),
    outreach: outreach.slice(0, 40),
  };
}

function catalogPayload(artist) {
  const flagship = pickFlagshipMedia(artist.media);
  return {
    flagship,
    catalog: artist.media.map((item) => ({ title: item.title, uuid: item.uuid })),
    catalogTotal: artist.tunes?.total || artist.media.length,
  };
}

async function previewArtistOutreach({
  partyKey,
  template,
  customMessage,
  format = 'email',
  actorId = null,
}) {
  const artist = await loadArtist(partyKey);
  if (!artist.media.length) throw httpError('No catalog entry for this artist', 400);
  const { flagship, catalog, catalogTotal } = catalogPayload(artist);
  const chosenFormat = OUTREACH_FORMATS.includes(format) ? format : 'email';
  const inviteCode = await inviteCodeForActor(actorId);
  return {
    ...buildOutreachContent({
      template: template || 'founding_catalog_invite',
      media: flagship,
      catalog,
      catalogTotal,
      party: { displayName: artist.displayName },
      customMessage,
      frontendUrl: process.env.FRONTEND_URL || 'https://tuneable.stream',
      format: chosenFormat,
      inviteCode,
    }),
    instagramHandle: artist.instagram || null,
    email: artist.email || null,
    partyKey: artist.partyKey,
    flagshipMediaId: flagship._id,
  };
}

async function annotateSiblingCases({ partyKey, flagshipCaseId, actorId, title, channel }) {
  const siblings = await RightsCase.find({
    partyKey,
    _id: { $ne: flagshipCaseId },
    status: { $in: OPEN_STATUSES },
  });
  const body = `Included in a catalog invite (${channel}) for this artist. Flagship listing: "${title}".`;
  await Promise.all(siblings.map(async (sibling) => {
    sibling.outreach.push({
      channel: 'note',
      direction: 'note',
      template: 'founding_catalog_invite',
      body,
      sentBy: actorId,
      sentAt: new Date(),
    });
    sibling.status = statusAfterOutboundEmail(sibling.status);
    sibling.nextFollowUpAt = defaultFollowUpAt();
    await sibling.save();
  }));
}

async function sendArtistOutreach({
  partyKey,
  channel = 'email',
  template,
  customMessage,
  to,
  body,
  actorId,
}) {
  const artist = await loadArtist(partyKey);
  if (!artist.media.length) throw httpError('No catalog entry for this artist', 400);
  if (!ARTIST_SEND_CHANNELS.includes(channel)) {
    throw httpError('Channel must be email, instagram, or link', 400);
  }
  const { flagship, catalog, catalogTotal } = catalogPayload(artist);
  const email = String((channel === 'email' ? to : null) || artist.email || '').trim();
  const instagram = normalizeInstagramHandle(channel === 'instagram' ? (to || artist.instagram) : artist.instagram);
  if (channel === 'email' && !email) throw httpError('An email address is required to send outreach', 400);
  if (channel === 'email' && !email.includes('@')) throw httpError('Email address is not valid', 400);

  const contacts = [];
  if (email) contacts.push({ type: 'email', value: email, source: 'manual', confidence: 'manual' });
  if (instagram) contacts.push({ type: 'instagram', value: instagram, source: 'manual', confidence: 'manual' });

  const { rightsCase } = await createCase({
    mediaId: flagship._id,
    party: {
      displayName: artist.displayName,
      role: 'artist',
      contacts,
    },
    source: 'manual',
    createdBy: actorId,
    assignedTo: actorId,
  });
  if (email) preferContact(rightsCase.party, 'email', email);
  if (instagram) preferContact(rightsCase.party, 'instagram', instagram);
  rightsCase.markModified('party.contacts');
  await rightsCase.save();

  await addOutreach(rightsCase._id, {
    channel,
    direction: 'outbound',
    template: template || 'founding_catalog_invite',
    customMessage,
    to: channel === 'instagram' ? instagram : (channel === 'email' ? email : undefined),
    body,
    catalog,
    catalogTotal,
  }, actorId);

  try {
    await annotateSiblingCases({
      partyKey: artist.partyKey,
      flagshipCaseId: rightsCase._id,
      actorId,
      title: flagship.title,
      channel,
    });
  } catch (error) {
    console.error('Failed to annotate sibling rights cases', error);
  }
  return loadArtist(artist.partyKey);
}

async function saveArtistContacts({ partyKey, email, instagram, actorId }) {
  const artist = await loadArtist(partyKey);
  if (!artist.media.length) throw httpError('No catalog entry to attach this contact to', 400);
  const trimmedEmail = String(email ?? '').trim();
  const handle = normalizeInstagramHandle(instagram);
  if (trimmedEmail && !trimmedEmail.includes('@')) throw httpError('Email address is not valid', 400);
  if (String(instagram || '').trim() && !handle) throw httpError('Instagram handle is not valid', 400);
  if (!trimmedEmail && !handle) throw httpError('Add an email or an Instagram handle', 400);

  const flagship = pickFlagshipMedia(artist.media);
  const contacts = [];
  if (trimmedEmail) contacts.push({ type: 'email', value: trimmedEmail, source: 'manual', confidence: 'manual' });
  if (handle) contacts.push({ type: 'instagram', value: handle, source: 'manual', confidence: 'manual' });

  const { rightsCase } = await createCase({
    mediaId: flagship._id,
    party: {
      displayName: artist.displayName,
      role: 'artist',
      contacts,
    },
    source: 'manual',
    createdBy: actorId,
    assignedTo: actorId,
  });
  if (trimmedEmail) preferContact(rightsCase.party, 'email', trimmedEmail);
  if (handle) preferContact(rightsCase.party, 'instagram', handle);
  if (trimmedEmail) rightsCase.status = statusAfterContactAdded(rightsCase.status);
  rightsCase.markModified('party.contacts');
  await rightsCase.save();
  return loadArtist(artist.partyKey);
}

async function importArtistContacts({ csv, actorId }) {
  const parsed = parseArtistCsv(csv);
  if (parsed.error) throw httpError(parsed.error, 400);
  if (parsed.rows.length > ARTIST_IMPORT_LIMIT) {
    throw httpError(`Import is limited to ${ARTIST_IMPORT_LIMIT} rows`, 400);
  }

  const result = {
    imported: 0,
    updated: 0,
    unchanged: 0,
    unmatched: [],
    warnings: [],
  };

  for (const row of parsed.rows) {
    const key = normalizePartyKey(row.artist);
    const nameRx = partyNameRegex(key);
    if (!nameRx) {
      result.unmatched.push({
        artist: row.artist,
        email: row.email,
        instagram: row.instagram,
        reason: 'Artist name is empty',
      });
      continue;
    }

    const media = await Media.find({ ...LIVE_MEDIA, 'artist.name': nameRx })
      .select('_id title rightsStatus globalMediaAggregate')
      .limit(40)
      .lean();
    if (!media.length) {
      result.unmatched.push({
        artist: row.artist,
        email: row.email,
        instagram: row.instagram,
        reason: 'No catalog entry with this artist name',
      });
      continue;
    }

    const flagship = pickFlagshipMedia(media);
    const email = String(row.email || '').trim();
    const instagram = normalizeInstagramHandle(row.instagram);
    const usableEmail = email.includes('@') ? email : '';
    if (email && !usableEmail) {
      result.warnings.push({ artist: row.artist, message: `Skipped invalid email "${email}"` });
    }

    const contacts = [];
    if (usableEmail) contacts.push({ type: 'email', value: usableEmail, source: 'manual', confidence: 'manual' });
    if (instagram) contacts.push({ type: 'instagram', value: instagram, source: 'manual', confidence: 'manual' });

    const { rightsCase, created } = await createCase({
      mediaId: flagship._id,
      party: { displayName: row.artist.trim(), role: 'artist', contacts },
      source: 'import',
      createdBy: actorId,
      notes: row.notes || '',
    });

    let changed = false;
    if (usableEmail && preferContact(rightsCase.party, 'email', usableEmail)) changed = true;
    if (instagram && preferContact(rightsCase.party, 'instagram', instagram)) changed = true;
    if (!created && row.notes && !(rightsCase.notes || '').includes(row.notes)) {
      rightsCase.notes = [rightsCase.notes, row.notes].filter(Boolean).join('\n');
      changed = true;
    }
    const statusBefore = rightsCase.status;
    if (usableEmail) rightsCase.status = statusAfterContactAdded(rightsCase.status);
    if (rightsCase.status !== statusBefore) changed = true;

    const contactDate = parseContactDate(row.lastContact);
    if (row.lastContact && !contactDate) {
      result.warnings.push({ artist: row.artist, message: `Could not read last contact date "${row.lastContact}"` });
    }
    if (contactDate) {
      const related = await RightsCase.find({ partyKey: rightsCase.partyKey })
        .select('outreach.sentAt outreach.direction outreach.body outreach.channel');
      let latest = null;
      for (const item of related) {
        for (const event of item.outreach || []) {
          if (!event.sentAt || event.direction === 'note') continue;
          const sentAt = new Date(event.sentAt);
          if (!latest || sentAt > latest) latest = sentAt;
        }
      }
      const sameDay = contactDate.toISOString().slice(0, 10);
      const sameImport = (rightsCase.outreach || []).some((event) => (
        event.channel === 'manual'
        && String(event.body || '').startsWith(IMPORTED_CONTACT_PREFIX)
        && event.sentAt
        && new Date(event.sentAt).toISOString().slice(0, 10) === sameDay
      ));
      if (!sameImport && (!latest || contactDate > latest)) {
        rightsCase.outreach.push({
          channel: 'manual',
          direction: 'outbound',
          template: 'none',
          body: [
            `${IMPORTED_CONTACT_PREFIX} Last contact recorded as ${sameDay}.`,
            row.notes,
          ].filter(Boolean).join(' '),
          sentBy: actorId || null,
          sentAt: contactDate,
        });
        changed = true;
      }
    }

    if (changed || created) {
      rightsCase.markModified('party.contacts');
      await rightsCase.save();
    }

    if (contacts.length) {
      const others = await RightsCase.find({
        partyKey: rightsCase.partyKey,
        _id: { $ne: rightsCase._id },
        status: { $in: OPEN_STATUSES },
      });
      for (const other of others) {
        let otherChanged = false;
        if (usableEmail && preferContact(other.party, 'email', usableEmail)) otherChanged = true;
        if (instagram && preferContact(other.party, 'instagram', instagram)) otherChanged = true;
        if (!otherChanged) continue;
        if (usableEmail) other.status = statusAfterContactAdded(other.status);
        other.markModified('party.contacts');
        await other.save();
      }
    }

    if (created) result.imported += 1;
    else if (changed) result.updated += 1;
    else result.unchanged += 1;
  }

  return result;
}

module.exports = {
  createCase,
  getCase,
  listCases,
  listLimbo,
  listCatalogue,
  listArtists,
  getArtist: loadArtist,
  previewArtistOutreach,
  sendArtistOutreach,
  saveArtistContacts,
  importArtistContacts,
  ownershipSnapshot,
  updateCase,
  addOutreach,
  attachClaim,
  syncFromClaimReview,
  openFromCopyrightReport,
  previewOutreach,
  findContactCandidates,
};
