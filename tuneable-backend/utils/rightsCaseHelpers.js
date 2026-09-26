/**
 * Pure helpers for rights-ops cases (no DB).
 * Playability stays on Media.rightsStatus; these statuses are the CRM.
 */

const CASE_STATUSES = [
  'identified',
  'contact_found',
  'outreach_sent',
  'awaiting_reply',
  'in_conversation',
  'claim_filed',
  'no_response',
  'declined',
  'cleared',
  'takedown',
];

const TERMINAL_STATUSES = ['declined', 'cleared', 'takedown'];
const OPEN_STATUSES = CASE_STATUSES.filter((status) => !TERMINAL_STATUSES.includes(status));
const FOLLOW_UP_STATUSES = ['outreach_sent', 'awaiting_reply', 'in_conversation'];

const PARTY_ROLES = [
  'artist',
  'songwriter',
  'composer',
  'producer',
  'host',
  'guest',
  'narrator',
  'director',
  'cinematographer',
  'editor',
  'author',
  'publisher',
  'label',
  'collective',
  'reporter',
  'other',
];

/** Media credit fields → rights-case counterpart role. featuring stays artist. */
const MEDIA_CREDIT_ROLE_FIELDS = {
  artist: 'artist',
  featuring: 'artist',
  songwriter: 'songwriter',
  composer: 'composer',
  producer: 'producer',
  host: 'host',
  guest: 'guest',
  narrator: 'narrator',
  director: 'director',
  cinematographer: 'cinematographer',
  editor: 'editor',
  author: 'author',
};

const CONTACT_SOURCES = [
  'manual',
  'user',
  'label',
  'collective',
  'prior_case',
  'media_owner',
  'media_credit',
  'media_label',
];

const CONTACT_CONFIDENCES = ['verified', 'reused', 'likely', 'weak', 'manual'];
const CONFIDENCE_RANK = {
  verified: 0,
  reused: 1,
  likely: 2,
  weak: 3,
  manual: 4,
};

const CASE_SOURCES = ['import', 'report', 'claim', 'manual'];

const OUTREACH_TEMPLATES = [
  'claim_keep_invite',
  'takedown_option',
  'follow_up',
  'copyright_reporter',
  'custom',
];

const DEFAULT_FOLLOW_UP_DAYS = 7;

function normalizePartyKey(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function emptyPartyLinks() {
  return { userId: null, collectiveId: null, labelId: null };
}

function suggestedPartiesFromMedia(media) {
  const seen = new Set();
  const parties = [];

  for (const [field, role] of Object.entries(MEDIA_CREDIT_ROLE_FIELDS)) {
    for (const person of media?.[field] || []) {
      const displayName = person?.name;
      if (!displayName) continue;
      const key = `${role}:${normalizePartyKey(displayName)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      parties.push({
        displayName,
        role,
        userId: person.userId || null,
        collectiveId: person.collectiveId || null,
        labelId: null,
      });
    }
  }

  for (const label of media?.label || []) {
    const displayName = label?.name;
    if (!displayName) continue;
    const key = `label:${normalizePartyKey(displayName)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    parties.push({
      displayName,
      role: 'label',
      userId: null,
      collectiveId: null,
      labelId: label.labelId || null,
    });
  }

  if (parties.length === 0 && media?.creatorDisplay) {
    parties.push({
      displayName: media.creatorDisplay,
      role: 'artist',
      ...emptyPartyLinks(),
    });
  }

  return parties;
}

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function namesMatch(a, b) {
  const left = normalizePartyKey(a);
  const right = normalizePartyKey(b);
  return Boolean(left) && left === right;
}

function primaryEmailFromContacts(contacts) {
  const email = (contacts || []).find((c) => c.type === 'email' && c.value);
  return email?.value?.trim() || '';
}

function candidateDedupeKey(candidate) {
  if (candidate?.userId) return `user:${candidate.userId}`;
  if (candidate?.labelId) return `label:${candidate.labelId}`;
  if (candidate?.collectiveId) return `collective:${candidate.collectiveId}`;
  const email = String(candidate?.email || '').trim().toLowerCase();
  if (email) return `email:${email}`;
  return candidate?.id || `name:${normalizePartyKey(candidate?.displayName)}`;
}

function rankAndDedupeContactCandidates(candidates) {
  const merged = new Map();
  for (const candidate of candidates || []) {
    if (!candidate) continue;
    const key = candidateDedupeKey(candidate);
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, { ...candidate, usedOnCases: candidate.usedOnCases || 0 });
      continue;
    }
    const nextRank = CONFIDENCE_RANK[candidate.confidence] ?? 99;
    const prevRank = CONFIDENCE_RANK[existing.confidence] ?? 99;
    const winner = nextRank < prevRank ? { ...candidate } : { ...existing };
    winner.usedOnCases = (existing.usedOnCases || 0) + (candidate.usedOnCases || 0);
    if (!winner.email) winner.email = candidate.email || existing.email;
    if (!winner.evidence) winner.evidence = candidate.evidence || existing.evidence;
    winner.contacts = [...(existing.contacts || [])];
    for (const contact of candidate.contacts || []) {
      const already = winner.contacts.some(
        (c) => c.type === contact.type && String(c.value).toLowerCase() === String(contact.value || '').toLowerCase()
      );
      if (!already && contact.value) winner.contacts.push(contact);
    }
    merged.set(key, winner);
  }

  return [...merged.values()].sort((a, b) => {
    const rank = (CONFIDENCE_RANK[a.confidence] ?? 99) - (CONFIDENCE_RANK[b.confidence] ?? 99);
    if (rank !== 0) return rank;
    if ((b.usedOnCases || 0) !== (a.usedOnCases || 0)) return (b.usedOnCases || 0) - (a.usedOnCases || 0);
    return String(a.displayName || '').localeCompare(String(b.displayName || ''));
  });
}

function primaryEmailFromParty(party) {
  return primaryEmailFromContacts(party?.contacts);
}

function statusAfterContactAdded(current) {
  if (!current || current === 'identified') return 'contact_found';
  return current;
}

function statusAfterOutboundEmail(current) {
  if (TERMINAL_STATUSES.includes(current) || current === 'claim_filed') return current;
  return 'awaiting_reply';
}

function statusAfterInboundReply(current) {
  if (TERMINAL_STATUSES.includes(current) || current === 'claim_filed') return current;
  return 'in_conversation';
}

function defaultFollowUpAt(from = new Date(), days = DEFAULT_FOLLOW_UP_DAYS) {
  const start = from instanceof Date ? from : new Date(from);
  return new Date(start.getTime() + days * 24 * 60 * 60 * 1000);
}

function artistLineFromMedia(media) {
  if (media?.creatorDisplay) return media.creatorDisplay;
  const names = (media?.artist || []).map((a) => a?.name).filter(Boolean);
  return names.join(', ') || 'Unknown artist';
}

const OUTREACH_FORMATS = ['email', 'instagram', 'link'];

function normalizeInstagramHandle(value) {
  let raw = String(value || '').trim();
  if (!raw) return '';
  raw = raw.replace(/^@+/, '');
  const fromUrl = raw.match(/(?:instagram\.com|instagr\.am)\/(?:[a-z]{2}\/)?([^/?#]+)/i)
    || raw.match(/ig\.me\/m\/([^/?#]+)/i);
  if (fromUrl) raw = fromUrl[1];
  try {
    raw = decodeURIComponent(raw);
  } catch {
    // keep raw if it isn't a valid URI sequence
  }
  raw = raw.replace(/\/+$/, '').trim();
  const reserved = new Set(['p', 'reel', 'reels', 'stories', 'explore', 'accounts', 'direct', 'legal']);
  if (!raw || reserved.has(raw.toLowerCase())) return '';
  return raw.replace(/^@+/, '');
}

function instagramDmUrl(handle) {
  const normalized = normalizeInstagramHandle(handle);
  return normalized ? `https://ig.me/m/${encodeURIComponent(normalized)}` : 'https://www.instagram.com/';
}

function primaryInstagramFromContacts(contacts) {
  const row = (contacts || []).find((c) => c.type === 'instagram' && c.value);
  return normalizeInstagramHandle(row?.value);
}

function primaryInstagramFromParty(party) {
  return primaryInstagramFromContacts(party?.contacts);
}

function frontendBase(frontendUrl = 'https://tuneable.stream') {
  return String(frontendUrl || 'https://tuneable.stream').replace(/\/$/, '');
}

function tuneUrlFromMedia(media, frontendUrl = 'https://tuneable.stream') {
  const base = frontendBase(frontendUrl);
  return media?.uuid ? `${base}/tune/${media.uuid}` : base;
}

function creatorRegisterUrl(media, frontendUrl = 'https://tuneable.stream') {
  const base = frontendBase(frontendUrl);
  const params = new URLSearchParams({ from: 'rights' });
  if (media?.uuid) params.set('tune', String(media.uuid));
  return `${base}/creator/register?${params.toString()}`;
}

function buildOutreachContent({
  template = 'claim_keep_invite',
  media,
  party,
  customMessage = '',
  frontendUrl = 'https://tuneable.stream',
  format = 'email',
}) {
  const title = media?.title || 'your work';
  const greetName = party?.displayName || 'there';
  const artistLine = artistLineFromMedia(media);
  const tuneUrl = tuneUrlFromMedia(media, frontendUrl);
  const registerUrl = creatorRegisterUrl(media, frontendUrl);
  const yesCta = 'Reply YES to this email and we will make it playable so you can start receiving those tips.';
  const founderCta = `Or become a founding artist here: ${registerUrl}`;
  const listingLine = `Check it out: ${tuneUrl}`;
  const takedownLine = 'If this is not your work or you want it taken down, just say so.';
  const note = customMessage?.trim() || '';
  const chosenFormat = OUTREACH_FORMATS.includes(format) ? format : 'email';
  const resolvedTemplate = OUTREACH_TEMPLATES.includes(template) ? template : 'custom';

  const emailTemplates = {
    claim_keep_invite: {
      subject: `Your tune has been tipped on Tuneable: ${title}`,
      intro:
        `Hi ${greetName},\n\n` +
        `Your tune "${title}" (${artistLine}) has been tipped on Tuneable. ` +
        `Tips for this listing are waiting in escrow.\n\n` +
        `${yesCta}\n\n` +
        `${founderCta}\n\n` +
        `${listingLine}\n\n` +
        takedownLine,
    },
    takedown_option: {
      subject: `Take-down option for "${title}" on Tuneable`,
      intro:
        `Hi ${greetName},\n\n` +
        `"${title}" (${artistLine}) is listed on Tuneable in rights-pending limbo. ` +
        `If you do not want it live, reply and we will take it down and refund tippers.\n\n` +
        `${listingLine}`,
    },
    follow_up: {
      subject: `Following up: ${title} on Tuneable`,
      intro:
        `Hi ${greetName},\n\n` +
        `Checking in — your tune "${title}" has been tipped on Tuneable and we have not heard back.\n\n` +
        `${yesCta}\n\n` +
        `${founderCta}\n\n` +
        `${listingLine}`,
    },
    copyright_reporter: {
      subject: `We received your rights report for "${title}"`,
      intro:
        `Hi ${greetName},\n\n` +
        `Thanks for reporting a rights issue for "${title}" on Tuneable. ` +
        `We have opened a case and will follow up from this address. ` +
        `If you can share any extra proof or a preferred resolution (keep with credit, or takedown), reply to this email.\n\n` +
        `Listing: ${tuneUrl}`,
    },
    custom: {
      subject: `Your tune has been tipped on Tuneable: ${title}`,
      intro: `Hi ${greetName},\n\n`,
    },
  };

  const instagramTemplates = {
    claim_keep_invite:
      `Hey ${greetName} — your tune "${title}" has been tipped on Tuneable.\n\n` +
      `Reply YES and we'll make it playable so you can start receiving those tips.\n\n` +
      `Become a founding artist: ${registerUrl}\n\n${tuneUrl}`,
    takedown_option:
      `Hey ${greetName} — "${title}" is on Tuneable in rights-pending limbo. ` +
      `If you want it taken down, just reply.\n\n${tuneUrl}`,
    follow_up:
      `Hey ${greetName} — following up: your tune "${title}" has been tipped on Tuneable.\n\n` +
      `Reply YES and we'll make it playable so you can start receiving those tips.\n\n` +
      `Become a founding artist: ${registerUrl}\n\n${tuneUrl}`,
    copyright_reporter:
      `Thanks for the rights report on "${title}". We have a case open — extra proof or preferred resolution welcome.\n\n${tuneUrl}`,
    custom:
      `Hey ${greetName} — your tune "${title}" has been tipped on Tuneable.\n\n` +
      `Become a founding artist: ${registerUrl}\n\n${tuneUrl}`,
  };

  const linkTemplates = {
    claim_keep_invite:
      `Your tune "${title}" has been tipped on Tuneable.\n\n` +
      `Reply YES and we'll make it playable so you can start receiving those tips.\n` +
      `Become a founding artist: ${registerUrl}\n\n${tuneUrl}`,
    takedown_option: `Take-down option for "${title}" on Tuneable.\n\n${tuneUrl}`,
    follow_up:
      `Following up: your tune "${title}" has been tipped on Tuneable.\n\n` +
      `Reply YES and we'll make it playable so you can start receiving those tips.\n` +
      `Become a founding artist: ${registerUrl}\n\n${tuneUrl}`,
    copyright_reporter: `We received your rights report for "${title}".\n\n${tuneUrl}`,
    custom:
      `Your tune "${title}" has been tipped on Tuneable.\n\n` +
      `Become a founding artist: ${registerUrl}\n\n${tuneUrl}`,
  };

  if (chosenFormat === 'link') {
    const text = [linkTemplates[resolvedTemplate], note].filter(Boolean).join('\n\n').trim();
    return {
      template: resolvedTemplate,
      format: 'link',
      subject: '',
      text,
      tuneUrl,
      registerUrl,
    };
  }

  if (chosenFormat === 'instagram') {
    const text = [instagramTemplates[resolvedTemplate], note].filter(Boolean).join('\n\n').trim();
    return {
      template: resolvedTemplate,
      format: 'instagram',
      subject: '',
      text,
      tuneUrl,
      registerUrl,
    };
  }

  const chosen = emailTemplates[resolvedTemplate] || emailTemplates.custom;
  const body = [chosen.intro, note].filter(Boolean).join('\n\n').trim();

  return {
    template: resolvedTemplate,
    format: 'email',
    subject: chosen.subject,
    text: body,
    tuneUrl,
    registerUrl,
  };
}

module.exports = {
  CASE_STATUSES,
  TERMINAL_STATUSES,
  OPEN_STATUSES,
  FOLLOW_UP_STATUSES,
  PARTY_ROLES,
  MEDIA_CREDIT_ROLE_FIELDS,
  CONTACT_SOURCES,
  CONTACT_CONFIDENCES,
  CASE_SOURCES,
  OUTREACH_TEMPLATES,
  OUTREACH_FORMATS,
  DEFAULT_FOLLOW_UP_DAYS,
  normalizePartyKey,
  suggestedPartiesFromMedia,
  primaryEmailFromParty,
  primaryEmailFromContacts,
  primaryInstagramFromParty,
  primaryInstagramFromContacts,
  normalizeInstagramHandle,
  instagramDmUrl,
  statusAfterContactAdded,
  statusAfterOutboundEmail,
  statusAfterInboundReply,
  defaultFollowUpAt,
  artistLineFromMedia,
  tuneUrlFromMedia,
  creatorRegisterUrl,
  buildOutreachContent,
  escapeRegex,
  namesMatch,
  candidateDedupeKey,
  rankAndDedupeContactCandidates,
};
