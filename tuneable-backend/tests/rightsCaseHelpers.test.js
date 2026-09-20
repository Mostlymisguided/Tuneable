/**
 * Unit tests for rights-ops case helpers (no DB).
 * Run: npx jest tests/rightsCaseHelpers.test.js
 */

const {
  normalizePartyKey,
  suggestedPartiesFromMedia,
  primaryEmailFromParty,
  statusAfterContactAdded,
  statusAfterOutboundEmail,
  statusAfterInboundReply,
  defaultFollowUpAt,
  buildOutreachContent,
  normalizeInstagramHandle,
  instagramDmUrl,
  OPEN_STATUSES,
  TERMINAL_STATUSES,
  PARTY_ROLES,
  rankAndDedupeContactCandidates,
} = require('../utils/rightsCaseHelpers');

describe('normalizePartyKey', () => {
  it('trims and lowercases names', () => {
    expect(normalizePartyKey('  Daft  Punk ')).toBe('daft punk');
  });
});

describe('suggestedPartiesFromMedia', () => {
  it('dedupes featuring against headline artists by role+name', () => {
    const parties = suggestedPartiesFromMedia({
      artist: [{ name: 'Daft Punk', userId: null }],
      featuring: [{ name: 'Daft Punk' }, { name: 'Pharrell' }],
      songwriter: [{ name: 'Pharrell' }],
    });
    expect(parties.map((p) => `${p.role}:${p.displayName}`)).toEqual([
      'artist:Daft Punk',
      'artist:Pharrell',
      'songwriter:Pharrell',
    ]);
  });

  it('falls back to creatorDisplay', () => {
    expect(suggestedPartiesFromMedia({ creatorDisplay: 'A & B' })).toEqual([
      { displayName: 'A & B', role: 'artist', userId: null, collectiveId: null, labelId: null },
    ]);
  });

  it('includes media credit roles and labels', () => {
    const parties = suggestedPartiesFromMedia({
      host: [{ name: 'Jane Host' }],
      author: [{ name: 'Ada' }],
      director: [{ name: 'Jane Host' }],
      label: [{ name: 'Warp', labelId: 'lab1' }],
    });
    expect(parties.map((p) => `${p.role}:${p.displayName}`)).toEqual([
      'host:Jane Host',
      'director:Jane Host',
      'author:Ada',
      'label:Warp',
    ]);
    expect(parties.find((p) => p.role === 'label')?.labelId).toBe('lab1');
  });
});

describe('primaryEmailFromParty', () => {
  it('returns the first email contact', () => {
    expect(primaryEmailFromParty({
      contacts: [
        { type: 'instagram', value: '@x' },
        { type: 'email', value: ' a@b.com ' },
      ],
    })).toBe('a@b.com');
  });
});

describe('status transitions', () => {
  it('promotes identified to contact_found', () => {
    expect(statusAfterContactAdded('identified')).toBe('contact_found');
    expect(statusAfterContactAdded('awaiting_reply')).toBe('awaiting_reply');
  });

  it('sets awaiting_reply after outbound email unless terminal or claim filed', () => {
    expect(statusAfterOutboundEmail('identified')).toBe('awaiting_reply');
    expect(statusAfterOutboundEmail('claim_filed')).toBe('claim_filed');
    expect(statusAfterOutboundEmail('cleared')).toBe('cleared');
  });

  it('sets in_conversation after inbound reply', () => {
    expect(statusAfterInboundReply('awaiting_reply')).toBe('in_conversation');
    expect(statusAfterInboundReply('takedown')).toBe('takedown');
  });

  it('keeps claim_filed out of the terminal list', () => {
    expect(OPEN_STATUSES).toContain('claim_filed');
    expect(TERMINAL_STATUSES).not.toContain('claim_filed');
  });
});

describe('defaultFollowUpAt', () => {
  it('adds seven days', () => {
    const from = new Date('2026-01-01T00:00:00.000Z');
    expect(defaultFollowUpAt(from).toISOString()).toBe('2026-01-08T00:00:00.000Z');
  });
});

describe('normalizeInstagramHandle', () => {
  it('strips @ and profile/DM urls', () => {
    expect(normalizeInstagramHandle('@foo')).toBe('foo');
    expect(normalizeInstagramHandle('https://www.instagram.com/foo/')).toBe('foo');
    expect(normalizeInstagramHandle('https://ig.me/m/foo')).toBe('foo');
  });

  it('builds an Instagram DM url', () => {
    expect(instagramDmUrl('@foo')).toBe('https://ig.me/m/foo');
  });
});

describe('buildOutreachContent', () => {
  const media = { title: 'Around the World', uuid: 'abc', artist: [{ name: 'Daft Punk' }] };
  const party = { displayName: 'Thomas' };

  it('uses the tipped hook and tune URL in a keep invite', () => {
    const content = buildOutreachContent({
      template: 'claim_keep_invite',
      media,
      party,
      frontendUrl: 'https://tuneable.stream',
    });
    expect(content.subject).toMatch(/tipped on Tuneable/i);
    expect(content.text).toContain('has been tipped on Tuneable');
    expect(content.text).toContain('https://tuneable.stream/tune/abc');
    expect(content.text).toContain('escrow');
    expect(content.tuneUrl).toBe('https://tuneable.stream/tune/abc');
  });

  it('builds a short Instagram DM', () => {
    const content = buildOutreachContent({
      template: 'claim_keep_invite',
      media,
      party,
      format: 'instagram',
    });
    expect(content.format).toBe('instagram');
    expect(content.subject).toBe('');
    expect(content.text).toContain('has been tipped on Tuneable');
    expect(content.text).toContain('https://tuneable.stream/tune/abc');
    expect(content.text.startsWith('Hey Thomas')).toBe(true);
  });

  it('builds a copy-link message', () => {
    const content = buildOutreachContent({
      template: 'claim_keep_invite',
      media,
      party,
      format: 'link',
    });
    expect(content.format).toBe('link');
    expect(content.text).toBe(
      'Your tune "Around the World" has been tipped on Tuneable.\n\nhttps://tuneable.stream/tune/abc'
    );
  });

  it('appends a custom note', () => {
    const content = buildOutreachContent({
      template: 'follow_up',
      media,
      party,
      customMessage: 'Tried IG last week.',
    });
    expect(content.text).toContain('Tried IG last week.');
  });
});

describe('PARTY_ROLES', () => {
  it('includes media credit roles without duplicates', () => {
    const expected = [
      'songwriter', 'composer', 'host', 'guest', 'narrator',
      'director', 'cinematographer', 'editor', 'author',
    ];
    expect(new Set(PARTY_ROLES).size).toBe(PARTY_ROLES.length);
    expected.forEach((role) => expect(PARTY_ROLES).toContain(role));
  });
});

describe('rankAndDedupeContactCandidates', () => {
  it('prefers verified over reused and merges same user', () => {
    const ranked = rankAndDedupeContactCandidates([
      {
        id: 'prior_case:1',
        displayName: 'Jane',
        email: 'jane@example.com',
        userId: 'u1',
        source: 'prior_case',
        confidence: 'reused',
        usedOnCases: 2,
        contacts: [{ type: 'email', value: 'jane@example.com' }],
      },
      {
        id: 'user:u1',
        displayName: 'Jane Doe',
        email: 'jane@example.com',
        userId: 'u1',
        source: 'user',
        confidence: 'verified',
        usedOnCases: 0,
        contacts: [{ type: 'website', value: 'https://jane.example' }],
      },
    ]);
    expect(ranked).toHaveLength(1);
    expect(ranked[0].confidence).toBe('verified');
    expect(ranked[0].usedOnCases).toBe(2);
    expect(ranked[0].contacts.map((c) => c.type).sort()).toEqual(['email', 'website']);
  });
});

