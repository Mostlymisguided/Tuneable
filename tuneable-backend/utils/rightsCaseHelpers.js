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
  'founding_catalog_invite',
  'takedown_option',
  'follow_up',
  'copyright_reporter',
  'custom',
];

const ARTIST_FILTERS = [
  'all',
  'no_contact',
  'has_email',
  'instagram_only',
  'never',
  'stale',
  'declined',
];

const ARTIST_SORTS = ['pending', 'name', 'lastOutbound', 'followUp'];

/** Least-progressed open case wins, so a sibling still marked identified stays visible. */
const OPEN_STATUS_RANK = {
  identified: 0,
  contact_found: 1,
  no_response: 2,
  outreach_sent: 3,
  awaiting_reply: 4,
  in_conversation: 5,
  claim_filed: 6,
};

const FLAGSHIP_RIGHTS_PRIORITY = {
  pending: 0,
  disputed: 1,
  permitted: 2,
  cleared: 3,
};

const CSV_HEADER_ALIASES = {
  artist: 'artist',
  artists: 'artist',
  name: 'artist',
  'artist name': 'artist',
  displayname: 'artist',
  'display name': 'artist',
  email: 'email',
  'e-mail': 'email',
  'email address': 'email',
  instagram: 'instagram',
  ig: 'instagram',
  'instagram handle': 'instagram',
  'ig handle': 'instagram',
  'last contact': 'lastContact',
  'last contacted': 'lastContact',
  'last contact date': 'lastContact',
  lastcontact: 'lastContact',
  'last contacted at': 'lastContact',
  notes: 'notes',
  note: 'notes',
};

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

function normalizeInviteCode(inviteCode) {
  const code = typeof inviteCode === 'string' ? inviteCode.trim().toUpperCase() : '';
  return /^[A-Z0-9]{5}$/.test(code) ? code : '';
}

function preferDisplayName(current, next) {
  const existing = String(current || '').trim();
  const incoming = String(next || '').trim();
  if (!existing) return incoming;
  if (!incoming) return existing;
  const existingHasCase = /[A-Z]/.test(existing);
  const incomingHasCase = /[A-Z]/.test(incoming);
  if (incomingHasCase && !existingHasCase) return incoming;
  return existing;
}

function partyNameRegex(partyKey) {
  const parts = normalizePartyKey(partyKey).split(' ').filter(Boolean).map(escapeRegex);
  if (!parts.length) return null;
  return new RegExp(`^\\s*${parts.join('\\s+')}\\s*$`, 'i');
}

function pickFlagshipMedia(mediaList) {
  const items = Array.isArray(mediaList) ? mediaList.filter(Boolean) : [];
  if (!items.length) return null;
  return [...items].sort((a, b) => {
    const rankA = FLAGSHIP_RIGHTS_PRIORITY[a.rightsStatus] ?? 9;
    const rankB = FLAGSHIP_RIGHTS_PRIORITY[b.rightsStatus] ?? 9;
    if (rankA !== rankB) return rankA - rankB;
    return (b.globalMediaAggregate || 0) - (a.globalMediaAggregate || 0);
  })[0];
}

function rollupArtistStatus(statuses) {
  const list = (statuses || []).filter(Boolean);
  const open = list.filter((status) => OPEN_STATUSES.includes(status));
  if (open.length) {
    return open.reduce((worst, status) => (
      (OPEN_STATUS_RANK[status] ?? 99) < (OPEN_STATUS_RANK[worst] ?? 99) ? status : worst
    ));
  }
  if (list.includes('declined')) return 'declined';
  if (list.includes('takedown')) return 'takedown';
  if (list.includes('cleared')) return 'cleared';
  return 'none';
}

function artistMatchesFilter(artist, filter, { staleDays = 14, now = new Date() } = {}) {
  const chosen = ARTIST_FILTERS.includes(filter) ? filter : 'all';
  const hasEmail = Boolean(String(artist?.email || '').trim());
  const hasInstagram = Boolean(String(artist?.instagram || '').trim());
  const lastOutbound = artist?.lastOutboundAt ? new Date(artist.lastOutboundAt) : null;
  const lastOutboundValid = lastOutbound && !Number.isNaN(lastOutbound.getTime());
  if (chosen === 'no_contact') return !hasEmail && !hasInstagram;
  if (chosen === 'has_email') return hasEmail;
  if (chosen === 'instagram_only') return hasInstagram && !hasEmail;
  if (chosen === 'never') return !lastOutboundValid;
  if (chosen === 'stale') {
    if (!lastOutboundValid) return false;
    const days = (now.getTime() - lastOutbound.getTime()) / (24 * 60 * 60 * 1000);
    return days >= Math.max(1, Number(staleDays) || 14);
  }
  if (chosen === 'declined') return artist?.status === 'declined';
  return true;
}

function compareArtists(a, b, sort) {
  const chosen = ARTIST_SORTS.includes(sort) ? sort : 'pending';
  const byName = () => String(a.displayName || '').localeCompare(String(b.displayName || ''));
  if (chosen === 'name') return byName();
  if (chosen === 'lastOutbound') {
    const aTime = a.lastOutboundAt ? new Date(a.lastOutboundAt).getTime() : null;
    const bTime = b.lastOutboundAt ? new Date(b.lastOutboundAt).getTime() : null;
    const aValid = Number.isFinite(aTime);
    const bValid = Number.isFinite(bTime);
    if (!aValid && !bValid) return byName();
    if (!aValid) return -1;
    if (!bValid) return 1;
    if (aTime !== bTime) return aTime - bTime;
    return byName();
  }
  if (chosen === 'followUp') {
    const aTime = a.nextFollowUpAt ? new Date(a.nextFollowUpAt).getTime() : null;
    const bTime = b.nextFollowUpAt ? new Date(b.nextFollowUpAt).getTime() : null;
    const aValid = Number.isFinite(aTime);
    const bValid = Number.isFinite(bTime);
    if (!aValid && !bValid) return (b.tunes?.pending || 0) - (a.tunes?.pending || 0);
    if (!aValid) return 1;
    if (!bValid) return -1;
    if (aTime !== bTime) return aTime - bTime;
    return byName();
  }
  const pending = (b.tunes?.pending || 0) - (a.tunes?.pending || 0);
  if (pending !== 0) return pending;
  const total = (b.tunes?.total || 0) - (a.tunes?.total || 0);
  if (total !== 0) return total;
  return byName();
}

function parseContactDate(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  const match = raw.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
  if (match) {
    let day = Number(match[1]);
    let month = Number(match[2]);
    let year = Number(match[3]);
    if (year < 100) year += 2000;
    if (month > 12 && day <= 12) {
      const swap = day;
      day = month;
      month = swap;
    }
    const parsed = new Date(Date.UTC(year, month - 1, day));
    if (
      parsed.getUTCFullYear() !== year
      || parsed.getUTCMonth() !== month - 1
      || parsed.getUTCDate() !== day
    ) {
      return null;
    }
    return parsed;
  }
  const fallback = new Date(raw);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

function detectCsvDelimiter(text) {
  const firstLine = String(text || '').split(/\r?\n/, 1)[0] || '';
  const commas = (firstLine.match(/,/g) || []).length;
  const semis = (firstLine.match(/;/g) || []).length;
  const tabs = (firstLine.match(/\t/g) || []).length;
  if (tabs > commas && tabs >= semis) return '\t';
  if (semis > commas) return ';';
  return ',';
}

function parseCsvTable(text, delimiter = ',') {
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;
  const source = String(text || '').replace(/^\uFEFF/, '');
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    if (inQuotes) {
      if (ch === '"') {
        if (source[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else if (ch !== '\r') {
      cell += ch;
    }
  }
  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((line) => line.some((value) => String(value || '').trim()));
}

function parseArtistCsv(text) {
  const source = String(text || '').replace(/^\uFEFF/, '').trim();
  if (!source) return { rows: [], error: 'The file is empty' };
  const table = parseCsvTable(source, detectCsvDelimiter(source));
  if (!table.length) return { rows: [], error: 'The file is empty' };
  const header = table[0].map((cell) => String(cell || '').trim().toLowerCase());
  const index = {};
  header.forEach((cell, i) => {
    const key = CSV_HEADER_ALIASES[cell];
    if (key && index[key] === undefined) index[key] = i;
  });
  if (index.artist === undefined) {
    return { rows: [], error: 'A header row with an Artist or Name column is required' };
  }
  const rows = [];
  for (const line of table.slice(1)) {
    const artist = String(line[index.artist] || '').trim();
    if (!artist) continue;
    rows.push({
      artist,
      email: index.email === undefined ? '' : String(line[index.email] || '').trim(),
      instagram: index.instagram === undefined ? '' : String(line[index.instagram] || '').trim(),
      lastContact: index.lastContact === undefined ? '' : String(line[index.lastContact] || '').trim(),
      notes: index.notes === undefined ? '' : String(line[index.notes] || '').trim(),
    });
  }
  return { rows };
}

function joinQuotedTitles(titles) {
  const quoted = titles.map((title) => `"${title}"`);
  if (quoted.length <= 1) return quoted[0] || '';
  if (quoted.length === 2) return `${quoted[0]} and ${quoted[1]}`;
  return `${quoted.slice(0, -1).join(', ')}, and ${quoted[quoted.length - 1]}`;
}

/**
 * One founding invite for an artist's catalog. `catalogTotal` counts tunes
 * that were not included in `catalog` (the message only names a few).
 */
function catalogInviteCopy({ media, catalog, catalogTotal, format = 'email' } = {}) {
  const limit = format === 'instagram' ? 3 : 8;
  const titles = [];
  const seen = new Set();
  const add = (title) => {
    const value = String(title || '').trim();
    if (!value) return;
    const key = value.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    titles.push(value);
  };
  add(media?.title);
  for (const item of catalog || []) add(item?.title || item);
  const shown = titles.slice(0, limit);
  const knownTotal = Math.max(Number(catalogTotal) || 0, titles.length);
  const extra = Math.max(0, knownTotal - shown.length);
  const lead = shown[0] || 'your work';
  let catalogSentence;
  if (shown.length === 0) {
    catalogSentence = 'Your music is on Tuneable as a catalog entry.';
  } else if (shown.length === 1 && extra === 0) {
    catalogSentence = `"${lead}" is on Tuneable as a catalog entry.`;
  } else if (extra > 0) {
    catalogSentence = `${joinQuotedTitles(shown)}, plus ${extra} more, are on Tuneable as catalog entries.`;
  } else {
    catalogSentence = `${joinQuotedTitles(shown)} are on Tuneable as catalog entries.`;
  }
  const many = shown.length + extra > 1;
  const noLine = many
    ? 'Reply NO to have these entries removed from the charts.'
    : 'Reply NO to have your entry removed from the charts.';
  return { lead, catalogSentence, noLine, shown, extra, total: shown.length + extra };
}

function creatorRegisterUrl(media, frontendUrl = 'https://tuneable.stream', inviteCode = null) {
  const base = frontendBase(frontendUrl);
  const params = new URLSearchParams({ from: 'rights' });
  if (media?.uuid) params.set('tune', String(media.uuid));
  const code = normalizeInviteCode(inviteCode);
  if (code) params.set('invite', code);
  return `${base}/creator/register?${params.toString()}`;
}

function buildOutreachContent({
  template = 'claim_keep_invite',
  media,
  party,
  catalog,
  catalogTotal,
  customMessage = '',
  frontendUrl = 'https://tuneable.stream',
  format = 'email',
  inviteCode = null,
}) {
  const title = media?.title || 'your work';
  const greetName = party?.displayName || 'there';
  const artistLine = artistLineFromMedia(media);
  const tuneUrl = tuneUrlFromMedia(media, frontendUrl);
  const registerUrl = creatorRegisterUrl(media, frontendUrl, inviteCode);
  const yesPlayable = "We'll make it playable so you can start receiving those tips.";
  const yesCta = `Reply YES to this email, or click the link, to choose a licence. ${yesPlayable}`;
  const yesCtaShort = `Reply YES, or click the link, to choose a licence. ${yesPlayable}`;
  const founderCta = `Or become a founding artist here: ${registerUrl}`;
  const founderCreatorCta = `Become a founding creator here: ${registerUrl}`;
  const listingLine = `Check it out: ${tuneUrl}`;
  const chartsLine = `Or reply NO to have "${title}" removed from the charts.`;
  const rightsLine =
    '✨Your Rights✨ You retain full rights over your works. You may revoke any rights granted to Tuneable at any time by removing your works from the platform.';
  const signOff = '✌️🎶🖤';
  const note = customMessage?.trim() || '';
  const chosenFormat = OUTREACH_FORMATS.includes(format) ? format : 'email';
  const resolvedTemplate = OUTREACH_TEMPLATES.includes(template) ? template : 'custom';
  const invite = catalogInviteCopy({ media, catalog, catalogTotal, format: chosenFormat });
  const yesCatalogEmail = 'Reply YES to this email, or click the invite link below, to make it playable and start earning tips.';
  const yesCatalogShort = 'Reply YES, or click the invite link, to make it playable and start earning tips.';
  const catalogEmailIntro =
    `Hi ${greetName},\n\n` +
    `You are invited to become a founding creator on Tuneable. ${invite.catalogSentence}\n\n` +
    `${yesCatalogEmail}\n\n` +
    `${invite.noLine}\n\n` +
    `${registerUrl}\n\n` +
    `${rightsLine}\n\n` +
    `${listingLine}\n\n` +
    signOff;
  const catalogShortIntro =
    `Hey ${greetName} — you are invited to become a founding creator on Tuneable. ${invite.catalogSentence}\n\n` +
    `${yesCatalogShort}\n\n` +
    `${invite.noLine}\n\n` +
    `${registerUrl}\n\n` +
    `${rightsLine}\n\n` +
    `${tuneUrl}\n\n` +
    signOff;
  const catalogLinkIntro =
    `You are invited to become a founding creator on Tuneable. ${invite.catalogSentence}\n\n` +
    `${yesCatalogShort}\n\n` +
    `${invite.noLine}\n\n` +
    `${registerUrl}\n\n` +
    `${rightsLine}\n\n` +
    `${tuneUrl}\n\n` +
    signOff;

  const emailTemplates = {
    claim_keep_invite: {
      subject: `Your tune has been tipped on Tuneable: ${title}`,
      intro:
        `Hi ${greetName},\n\n` +
        `Your tune "${title}" (${artistLine}) has been tipped on Tuneable. ` +
        `Tips for this listing are waiting in escrow.\n\n` +
        `${yesCta}\n\n` +
        `${chartsLine}\n\n` +
        `${founderCreatorCta}\n\n` +
        `${rightsLine}\n\n` +
        `${listingLine}\n\n` +
        signOff,
    },
    founding_catalog_invite: {
      subject: `You are invited to become a founding creator on Tuneable — ${invite.lead}`,
      intro: catalogEmailIntro,
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
        `${chartsLine}\n\n` +
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
      `${yesCtaShort}\n\n` +
      `${chartsLine}\n\n` +
      `${founderCreatorCta}\n\n` +
      `${rightsLine}\n\n` +
      `${tuneUrl}\n\n` +
      signOff,
    founding_catalog_invite: catalogShortIntro,
    takedown_option:
      `Hey ${greetName} — "${title}" is on Tuneable in rights-pending limbo. ` +
      `If you want it taken down, just reply.\n\n${tuneUrl}`,
    follow_up:
      `Hey ${greetName} — following up: your tune "${title}" has been tipped on Tuneable.\n\n` +
      `${yesCtaShort}\n\n` +
      `${chartsLine}\n\n` +
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
      `${yesCtaShort}\n\n` +
      `${chartsLine}\n\n` +
      `${founderCreatorCta}\n\n` +
      `${rightsLine}\n\n` +
      `${tuneUrl}\n\n` +
      signOff,
    founding_catalog_invite: catalogLinkIntro,
    takedown_option: `Take-down option for "${title}" on Tuneable.\n\n${tuneUrl}`,
    follow_up:
      `Following up: your tune "${title}" has been tipped on Tuneable.\n\n` +
      `${yesCtaShort}\n\n` +
      `${chartsLine}\n\n` +
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
  ARTIST_FILTERS,
  ARTIST_SORTS,
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
  catalogInviteCopy,
  preferDisplayName,
  partyNameRegex,
  pickFlagshipMedia,
  rollupArtistStatus,
  artistMatchesFilter,
  compareArtists,
  parseContactDate,
  parseArtistCsv,
  escapeRegex,
  namesMatch,
  candidateDedupeKey,
  rankAndDedupeContactCandidates,
};
