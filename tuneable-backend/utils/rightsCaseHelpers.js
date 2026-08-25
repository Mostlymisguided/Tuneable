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
  'publisher',
  'label',
  'collective',
  'reporter',
  'other',
];

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

function suggestedPartiesFromMedia(media) {
  const roleMap = {
    artist: 'artist',
    featuring: 'artist',
    songwriter: 'songwriter',
    composer: 'composer',
    producer: 'producer',
  };
  const seen = new Set();
  const parties = [];

  for (const [field, role] of Object.entries(roleMap)) {
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
      });
    }
  }

  if (parties.length === 0 && media?.creatorDisplay) {
    parties.push({
      displayName: media.creatorDisplay,
      role: 'artist',
      userId: null,
      collectiveId: null,
    });
  }

  return parties;
}

function primaryEmailFromParty(party) {
  const contacts = party?.contacts || [];
  const email = contacts.find((c) => c.type === 'email' && c.value);
  return email?.value?.trim() || '';
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

function buildOutreachContent({
  template = 'claim_keep_invite',
  media,
  party,
  customMessage = '',
  frontendUrl = 'https://tuneable.stream',
}) {
  const title = media?.title || 'your work';
  const greetName = party?.displayName || 'there';
  const artistLine = artistLineFromMedia(media);
  const tuneUrl = media?.uuid ? `${frontendUrl.replace(/\/$/, '')}/tune/${media.uuid}` : frontendUrl;
  const claimHint = `You can review the listing and file a keep or takedown claim here: ${tuneUrl}`;
  const note = customMessage?.trim() || '';

  const templates = {
    claim_keep_invite: {
      subject: `Your work on Tuneable: ${title}`,
      intro:
        `Hi ${greetName},\n\n` +
        `"${title}" (${artistLine}) is on Tuneable awaiting rights clearance. ` +
        `Tips for this listing are held in escrow until a rights holder claims it.\n\n` +
        `If this is your work, create a Tuneable account and file a keep claim with proof of ownership. ` +
        `Approved claims assign ownership and release held tips to you.\n\n` +
        `${claimHint}`,
    },
    takedown_option: {
      subject: `Take-down option for "${title}" on Tuneable`,
      intro:
        `Hi ${greetName},\n\n` +
        `"${title}" (${artistLine}) is listed on Tuneable in rights-pending limbo. ` +
        `If you do not want it live, you can request a takedown. We will remove the listing and refund tippers.\n\n` +
        `${claimHint}`,
    },
    follow_up: {
      subject: `Following up: ${title} on Tuneable`,
      intro:
        `Hi ${greetName},\n\n` +
        `Checking in about "${title}" on Tuneable. We have not heard back and wanted to make sure our last note reached you.\n\n` +
        `${claimHint}`,
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
      subject: `Regarding "${title}" on Tuneable`,
      intro: `Hi ${greetName},\n\n`,
    },
  };

  const chosen = templates[template] || templates.custom;
  const body = [chosen.intro, note].filter(Boolean).join('\n\n').trim();

  return {
    template: templates[template] ? template : 'custom',
    subject: chosen.subject,
    text: body,
  };
}

module.exports = {
  CASE_STATUSES,
  TERMINAL_STATUSES,
  OPEN_STATUSES,
  FOLLOW_UP_STATUSES,
  PARTY_ROLES,
  CASE_SOURCES,
  OUTREACH_TEMPLATES,
  DEFAULT_FOLLOW_UP_DAYS,
  normalizePartyKey,
  suggestedPartiesFromMedia,
  primaryEmailFromParty,
  statusAfterContactAdded,
  statusAfterOutboundEmail,
  statusAfterInboundReply,
  defaultFollowUpAt,
  artistLineFromMedia,
  buildOutreachContent,
};
