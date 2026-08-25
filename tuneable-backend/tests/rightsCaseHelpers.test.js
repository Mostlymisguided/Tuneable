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
  OPEN_STATUSES,
  TERMINAL_STATUSES,
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
      { displayName: 'A & B', role: 'artist', userId: null, collectiveId: null },
    ]);
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

describe('buildOutreachContent', () => {
  const media = { title: 'Around the World', uuid: 'abc', artist: [{ name: 'Daft Punk' }] };
  const party = { displayName: 'Thomas' };

  it('includes the tune URL in a keep invite', () => {
    const content = buildOutreachContent({
      template: 'claim_keep_invite',
      media,
      party,
      frontendUrl: 'https://tuneable.stream',
    });
    expect(content.subject).toContain('Around the World');
    expect(content.text).toContain('https://tuneable.stream/tune/abc');
    expect(content.text).toContain('escrow');
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
