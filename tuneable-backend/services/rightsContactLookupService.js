const User = require('../models/User');
const Label = require('../models/Label');
const Collective = require('../models/Collective');
const Media = require('../models/Media');
const RightsCase = require('../models/RightsCase');
const {
  MEDIA_CREDIT_ROLE_FIELDS,
  normalizePartyKey,
  escapeRegex,
  namesMatch,
  primaryEmailFromContacts,
  rankAndDedupeContactCandidates,
} = require('../utils/rightsCaseHelpers');

const USER_SELECT = [
  'username',
  'email',
  'creatorProfile.artistName',
  'creatorProfile.website',
  'creatorProfile.verificationStatus',
  'socialMedia',
  'oauthVerified',
  'soundcloudUsername',
  'instagramUsername',
].join(' ');

const ORG_SELECT = 'name email website socialMedia verificationStatus';

const MEDIA_LOOKUP_SELECT = [
  ...Object.keys(MEDIA_CREDIT_ROLE_FIELDS),
  'label',
  'mediaOwners',
  'creatorDisplay',
].join(' ');

function idString(value) {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (value._id) return String(value._id);
  return String(value);
}

function pushContact(contacts, type, value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return;
  const already = contacts.some(
    (c) => c.type === type && String(c.value).toLowerCase() === trimmed.toLowerCase()
  );
  if (!already) contacts.push({ type, value: trimmed });
}

function contactsFromUser(user) {
  const contacts = [];
  pushContact(contacts, 'email', user?.email);
  pushContact(contacts, 'website', user?.creatorProfile?.website);
  pushContact(contacts, 'instagram', user?.socialMedia?.instagram || user?.instagramUsername);
  pushContact(contacts, 'soundcloud', user?.socialMedia?.soundcloud || user?.soundcloudUsername);
  return contacts;
}

function contactsFromOrg(org) {
  const contacts = [];
  pushContact(contacts, 'email', org?.email);
  pushContact(contacts, 'website', org?.website);
  pushContact(contacts, 'instagram', org?.socialMedia?.instagram);
  pushContact(contacts, 'soundcloud', org?.socialMedia?.soundcloud);
  return contacts;
}

function userIsVerified(user) {
  if (user?.creatorProfile?.verificationStatus === 'verified') return true;
  return Object.values(user?.oauthVerified || {}).some(Boolean);
}

function bumpIfVerified(confidence, verified) {
  if (verified && (confidence === 'likely' || confidence === 'verified')) return 'verified';
  return confidence;
}

function buildCandidate({
  id,
  displayName,
  role = null,
  contacts = [],
  userId = null,
  labelId = null,
  collectiveId = null,
  source,
  confidence,
  evidence,
  usedOnCases = 0,
}) {
  const email = primaryEmailFromContacts(contacts);
  return {
    id,
    displayName,
    role,
    email: email || null,
    contacts,
    userId,
    labelId,
    collectiveId,
    source,
    confidence,
    evidence,
    usedOnCases,
    allowSend: Boolean(email) && confidence === 'verified',
  };
}

function ownerRoleToPartyRole(role) {
  if (role === 'label') return 'label';
  if (role === 'collective') return 'collective';
  if (role === 'publisher') return 'publisher';
  return 'artist';
}

async function usersByIds(ids) {
  const unique = [...new Set(ids.filter(Boolean).map(idString))];
  if (unique.length === 0) return new Map();
  const users = await User.find({ _id: { $in: unique } }).select(USER_SELECT).lean();
  return new Map(users.map((user) => [String(user._id), user]));
}

async function orgsByIds(Model, ids) {
  const unique = [...new Set(ids.filter(Boolean).map(idString))];
  if (unique.length === 0) return new Map();
  const rows = await Model.find({ _id: { $in: unique } }).select(ORG_SELECT).lean();
  return new Map(rows.map((row) => [String(row._id), row]));
}

function candidatesFromListing(media, usersById, labelsById, collectivesById) {
  if (!media) return [];
  const candidates = [];

  for (const [field, role] of Object.entries(MEDIA_CREDIT_ROLE_FIELDS)) {
    for (const person of media[field] || []) {
      const userId = idString(person?.userId);
      const collectiveId = idString(person?.collectiveId);
      if (userId) {
        const user = usersById.get(userId);
        if (user) {
          const contacts = contactsFromUser(user);
          const confidence = userIsVerified(user) && primaryEmailFromContacts(contacts)
            ? 'verified'
            : (primaryEmailFromContacts(contacts) ? 'likely' : 'weak');
          candidates.push(buildCandidate({
            id: `media_credit:${userId}`,
            displayName: person.name || user.creatorProfile?.artistName || user.username,
            role,
            contacts,
            userId,
            source: 'media_credit',
            confidence,
            evidence: `Linked ${role} credit on this listing (${user.username})`,
          }));
        }
      }
      if (collectiveId) {
        const org = collectivesById.get(collectiveId);
        if (org) {
          const contacts = contactsFromOrg(org);
          const confidence = org.verificationStatus === 'verified' && primaryEmailFromContacts(contacts)
            ? 'verified'
            : (primaryEmailFromContacts(contacts) ? 'likely' : 'weak');
          candidates.push(buildCandidate({
            id: `media_credit_collective:${collectiveId}`,
            displayName: person.name || org.name,
            role: role === 'artist' ? 'collective' : role,
            contacts,
            collectiveId,
            source: 'media_credit',
            confidence,
            evidence: `Linked collective credit on this listing (${org.name})`,
          }));
        }
      }
    }
  }

  for (const label of media.label || []) {
    const labelId = idString(label?.labelId);
    if (!labelId) continue;
    const org = labelsById.get(labelId);
    if (!org) continue;
    const contacts = contactsFromOrg(org);
    const confidence = org.verificationStatus === 'verified' && primaryEmailFromContacts(contacts)
      ? 'verified'
      : (primaryEmailFromContacts(contacts) ? 'likely' : 'weak');
    candidates.push(buildCandidate({
      id: `media_label:${labelId}`,
      displayName: label.name || org.name,
      role: 'label',
      contacts,
      labelId,
      source: 'media_label',
      confidence,
      evidence: `Label on this listing${org.email ? '' : ' (no email on file)'}`,
    }));
  }

  for (const owner of media.mediaOwners || []) {
    const userId = idString(owner?.userId);
    if (!userId) continue;
    const user = usersById.get(userId);
    if (!user) continue;
    const contacts = contactsFromUser(user);
    const email = primaryEmailFromContacts(contacts);
    const confidence = (owner.verified || userIsVerified(user)) && email
      ? 'verified'
      : (email ? 'likely' : 'weak');
    candidates.push(buildCandidate({
      id: `media_owner:${userId}`,
      displayName: user.creatorProfile?.artistName || user.username,
      role: ownerRoleToPartyRole(owner.role),
      contacts,
      userId,
      source: 'media_owner',
      confidence,
      evidence: `${owner.verified ? 'Verified' : 'Listed'} owner on this listing (${owner.percentage ?? 0}%)`,
    }));
  }

  return candidates;
}

function nameQuery(queryName) {
  const escaped = escapeRegex(queryName.trim());
  const exact = new RegExp(`^${escaped}$`, 'i');
  const fuzzy = queryName.trim().length >= 4 ? new RegExp(escaped, 'i') : exact;
  return { exact, fuzzy };
}

async function findContactCandidates({ displayName, role, mediaId } = {}) {
  const queryName = String(displayName || '').trim();
  if (queryName.length < 2 && !mediaId) return [];

  const partyKey = normalizePartyKey(queryName);
  const queries = queryName.length >= 2 ? nameQuery(queryName) : null;

  const media = mediaId
    ? await Media.findById(mediaId).select(MEDIA_LOOKUP_SELECT).lean()
    : null;

  const listingUserIds = [];
  const listingLabelIds = [];
  const listingCollectiveIds = [];
  if (media) {
    for (const field of Object.keys(MEDIA_CREDIT_ROLE_FIELDS)) {
      for (const person of media[field] || []) {
        if (person?.userId) listingUserIds.push(person.userId);
        if (person?.collectiveId) listingCollectiveIds.push(person.collectiveId);
      }
    }
    for (const label of media.label || []) {
      if (label?.labelId) listingLabelIds.push(label.labelId);
    }
    for (const owner of media.mediaOwners || []) {
      if (owner?.userId) listingUserIds.push(owner.userId);
    }
  }

  const userFilter = queries
    ? {
      isActive: { $ne: false },
      $or: [
        { username: queries.fuzzy },
        { 'creatorProfile.artistName': queries.fuzzy },
      ],
    }
    : null;

  const orgNameFilter = queries
    ? { isActive: { $ne: false }, name: queries.fuzzy }
    : null;

  const [
    priorCases,
    namedUsers,
    labels,
    collectives,
    listingUsers,
    listingLabels,
    listingCollectives,
  ] = await Promise.all([
    partyKey
      ? RightsCase.find({
        partyKey,
        'party.contacts.value': { $exists: true, $ne: '' },
      })
        .select('party status mediaId')
        .limit(40)
        .lean()
      : [],
    userFilter ? User.find(userFilter).select(USER_SELECT).limit(15).lean() : [],
    orgNameFilter ? Label.find(orgNameFilter).select(ORG_SELECT).limit(10).lean() : [],
    orgNameFilter ? Collective.find(orgNameFilter).select(ORG_SELECT).limit(10).lean() : [],
    usersByIds(listingUserIds),
    orgsByIds(Label, listingLabelIds),
    orgsByIds(Collective, listingCollectiveIds),
  ]);

  const candidates = candidatesFromListing(media, listingUsers, listingLabels, listingCollectives);

  for (const user of namedUsers) {
    const contacts = contactsFromUser(user);
    const exact = namesMatch(queryName, user.username)
      || namesMatch(queryName, user.creatorProfile?.artistName);
    const confidence = bumpIfVerified(
      exact ? 'likely' : 'weak',
      userIsVerified(user) && Boolean(primaryEmailFromContacts(contacts))
    );
    candidates.push(buildCandidate({
      id: `user:${user._id}`,
      displayName: user.creatorProfile?.artistName || user.username,
      role: role && role !== 'label' && role !== 'collective' ? role : 'artist',
      contacts,
      userId: String(user._id),
      source: 'user',
      confidence,
      evidence: exact
        ? `Tuneable user ${user.username}${userIsVerified(user) ? ' (verified)' : ''}`
        : `Partial name match: ${user.username}`,
    }));
  }

  for (const label of labels) {
    const contacts = contactsFromOrg(label);
    const exact = namesMatch(queryName, label.name);
    const confidence = bumpIfVerified(
      exact ? 'likely' : 'weak',
      label.verificationStatus === 'verified' && Boolean(primaryEmailFromContacts(contacts))
    );
    candidates.push(buildCandidate({
      id: `label:${label._id}`,
      displayName: label.name,
      role: 'label',
      contacts,
      labelId: String(label._id),
      source: 'label',
      confidence,
      evidence: exact
        ? `Tuneable label${label.verificationStatus === 'verified' ? ' (verified)' : ''}`
        : `Partial label name match`,
    }));
  }

  for (const collective of collectives) {
    const contacts = contactsFromOrg(collective);
    const exact = namesMatch(queryName, collective.name);
    const confidence = bumpIfVerified(
      exact ? 'likely' : 'weak',
      collective.verificationStatus === 'verified' && Boolean(primaryEmailFromContacts(contacts))
    );
    candidates.push(buildCandidate({
      id: `collective:${collective._id}`,
      displayName: collective.name,
      role: 'collective',
      contacts,
      collectiveId: String(collective._id),
      source: 'collective',
      confidence,
      evidence: exact
        ? `Tuneable collective${collective.verificationStatus === 'verified' ? ' (verified)' : ''}`
        : `Partial collective name match`,
    }));
  }

  const casesByEmail = new Map();
  for (const rightsCase of priorCases) {
    if (rightsCase.party?.role === 'reporter') continue;
    const contacts = (rightsCase.party?.contacts || []).filter((c) => c?.value);
    const email = primaryEmailFromContacts(contacts);
    if (!email && contacts.length === 0) continue;
    const mergeKey = email ? email.toLowerCase() : `case:${rightsCase._id}`;
    const existing = casesByEmail.get(mergeKey);
    if (existing) {
      existing.usedOnCases += 1;
      continue;
    }
    casesByEmail.set(mergeKey, buildCandidate({
      id: `prior_case:${rightsCase._id}`,
      displayName: rightsCase.party?.displayName || queryName,
      role: rightsCase.party?.role || role || 'artist',
      contacts,
      userId: idString(rightsCase.party?.userId),
      labelId: idString(rightsCase.party?.labelId),
      collectiveId: idString(rightsCase.party?.collectiveId),
      source: 'prior_case',
      confidence: 'reused',
      evidence: `Previously used for ${rightsCase.party?.displayName || 'this name'}`,
      usedOnCases: 1,
    }));
  }
  candidates.push(...casesByEmail.values());

  return rankAndDedupeContactCandidates(candidates);
}

module.exports = {
  findContactCandidates,
};
