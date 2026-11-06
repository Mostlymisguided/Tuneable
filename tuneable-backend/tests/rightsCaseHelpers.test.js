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
  parseArtistCsv,
  parseContactDate,
  partyNameRegex,
  pickFlagshipMedia,
  rollupArtistStatus,
  artistMatchesFilter,
  preferDisplayName,
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

  it('uses the tipped hook and two CTAs in a keep invite', () => {
    const content = buildOutreachContent({
      template: 'claim_keep_invite',
      media,
      party,
      frontendUrl: 'https://tuneable.stream',
    });
    expect(content.subject).toMatch(/tipped on Tuneable/i);
    expect(content.text).toContain('has been tipped on Tuneable');
    expect(content.text).toContain('Reply YES to this email, or click the link, to choose a licence.');
    expect(content.text).toContain('Or reply NO to have "Around the World" removed from the charts.');
    expect(content.text).toContain('https://tuneable.stream/creator/register?from=rights&tune=abc');
    expect(content.text).toContain('https://tuneable.stream/tune/abc');
    expect(content.text).toContain('Become a founding creator here:');
    expect(content.text).toContain('reply NO');
    expect(content.text).toContain('✨Your Rights✨');
    expect(content.text).toContain('✌️🎶🖤');
    expect(content.text).toContain('escrow');
    expect(content.tuneUrl).toBe('https://tuneable.stream/tune/abc');
    expect(content.registerUrl).toContain('/creator/register');
  });

  it('builds a short Instagram DM with both CTAs', () => {
    const content = buildOutreachContent({
      template: 'claim_keep_invite',
      media,
      party,
      format: 'instagram',
    });
    expect(content.format).toBe('instagram');
    expect(content.subject).toBe('');
    expect(content.text).toContain('has been tipped on Tuneable');
    expect(content.text).toContain('Reply YES, or click the link, to choose a licence.');
    expect(content.text).toContain('Become a founding creator here:');
    expect(content.text).toContain('Or reply NO to have "Around the World" removed from the charts.');
    expect(content.text).toContain('✨Your Rights✨');
    expect(content.text).toContain('✌️🎶🖤');
    expect(content.text).toContain('https://tuneable.stream/creator/register?from=rights&tune=abc');
    expect(content.text).toContain('https://tuneable.stream/tune/abc');
    expect(content.text.startsWith('Hey Thomas')).toBe(true);
  });

  it('puts the sender invite code on the founding link', () => {
    const content = buildOutreachContent({
      template: 'claim_keep_invite',
      media,
      party,
      format: 'link',
      inviteCode: 'ab12c',
    });
    expect(content.registerUrl).toBe(
      'https://tuneable.stream/creator/register?from=rights&tune=abc&invite=AB12C'
    );
    expect(content.text).toContain('invite=AB12C');
  });

  it('omits an invite param when the code is not five characters', () => {
    const content = buildOutreachContent({
      template: 'claim_keep_invite',
      media,
      party,
      format: 'instagram',
      inviteCode: 'nope',
    });
    expect(content.registerUrl).not.toContain('invite=');
  });

  it('builds a copy-link message with both CTAs', () => {
    const content = buildOutreachContent({
      template: 'claim_keep_invite',
      media,
      party,
      format: 'link',
    });
    expect(content.format).toBe('link');
    expect(content.text).toContain('Your tune "Around the World" has been tipped on Tuneable.');
    expect(content.text).toContain('Reply YES, or click the link, to choose a licence.');
    expect(content.text).toContain('Become a founding creator here: https://tuneable.stream/creator/register?from=rights&tune=abc');
    expect(content.text).toContain('Or reply NO to have "Around the World" removed from the charts.');
    expect(content.text).toContain('✨Your Rights✨');
    expect(content.text).toContain('✌️🎶🖤');
    expect(content.text).toContain('https://tuneable.stream/tune/abc');
  });

  it('appends a custom note', () => {
    const content = buildOutreachContent({
      template: 'follow_up',
      media,
      party,
      customMessage: 'Tried IG last week.',
    });
    expect(content.text).toContain('Tried IG last week.');
    expect(content.text).toContain('Reply YES to this email, or click the link, to choose a licence.');
    expect(content.text).toContain('Or reply NO to have "Around the World" removed from the charts.');
  });

  it('uses the short licence and charts lines on Instagram and link follow-ups', () => {
    const instagram = buildOutreachContent({
      template: 'follow_up',
      media,
      party,
      format: 'instagram',
    });
    const link = buildOutreachContent({
      template: 'follow_up',
      media,
      party,
      format: 'link',
    });
    for (const content of [instagram, link]) {
      expect(content.text).toContain('Reply YES, or click the link, to choose a licence.');
      expect(content.text).toContain('Or reply NO to have "Around the World" removed from the charts.');
      expect(content.text).not.toContain('to this email');
    }
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

describe('founding catalog invite', () => {
  const party = { displayName: 'Thomas' };
  const media = { title: 'Around the World', uuid: 'abc', artist: [{ name: 'Daft Punk' }] };

  it('invites a single catalog entry without assuming a tip', () => {
    const content = buildOutreachContent({
      template: 'founding_catalog_invite',
      media,
      party,
      frontendUrl: 'https://tuneable.stream',
    });
    expect(content.subject).toBe('You are invited to become a founding creator on Tuneable — Around the World');
    expect(content.text).toContain('You are invited to become a founding creator on Tuneable.');
    expect(content.text).toContain('"Around the World" is on Tuneable as a catalog entry.');
    expect(content.text).toContain('Reply YES to this email, or click the invite link below, to make it playable and start earning tips.');
    expect(content.text).toContain('Reply NO to have your entry removed from the charts.');
    expect(content.text).toContain('https://tuneable.stream/creator/register?from=rights&tune=abc');
    expect(content.text).not.toContain('has been tipped');
    expect(content.text).not.toContain('escrow');
  });

  it('names several tunes in one invite and counts the rest', () => {
    const content = buildOutreachContent({
      template: 'founding_catalog_invite',
      media,
      party,
      catalog: [
        { title: 'Around the World' },
        { title: 'One More Time' },
        { title: 'Digital Love' },
      ],
      catalogTotal: 6,
      format: 'instagram',
    });
    expect(content.text).toContain('"Around the World", "One More Time", and "Digital Love", plus 3 more, are on Tuneable as catalog entries.');
    expect(content.text).toContain('Reply YES, or click the invite link, to make it playable and start earning tips.');
    expect(content.text).toContain('Reply NO to have these entries removed from the charts.');
    expect(content.text.startsWith('Hey Thomas')).toBe(true);
  });

  it('keeps a claim-keep invite on the tipped hook when a catalog is also passed', () => {
    const content = buildOutreachContent({
      template: 'claim_keep_invite',
      media,
      party,
      catalog: [{ title: 'One More Time' }],
      catalogTotal: 4,
    });
    expect(content.text).toContain('has been tipped on Tuneable');
    expect(content.text).not.toContain('One More Time');
  });
});

describe('artist directory helpers', () => {
  it('matches a catalog name with flexible spacing', () => {
    const pattern = partyNameRegex('daft punk');
    expect(pattern.test('Daft  Punk')).toBe(true);
    expect(pattern.test('Daft Punk Trio')).toBe(false);
  });

  it('picks a pending tune ahead of a higher-bid cleared one', () => {
    const flagship = pickFlagshipMedia([
      { title: 'Live', rightsStatus: 'cleared', globalMediaAggregate: 90 },
      { title: 'Demo', rightsStatus: 'pending', globalMediaAggregate: 2 },
    ]);
    expect(flagship.title).toBe('Demo');
  });

  it('rolls an open identified case ahead of a later status', () => {
    expect(rollupArtistStatus(['awaiting_reply', 'identified'])).toBe('identified');
    expect(rollupArtistStatus(['cleared', 'declined'])).toBe('declined');
    expect(rollupArtistStatus([])).toBe('none');
  });

  it('filters contact and outreach queues', () => {
    const now = new Date('2026-03-01T00:00:00.000Z');
    const row = {
      email: 'a@b.com',
      instagram: '',
      status: 'awaiting_reply',
      lastOutboundAt: '2026-01-01T00:00:00.000Z',
    };
    expect(artistMatchesFilter(row, 'has_email')).toBe(true);
    expect(artistMatchesFilter(row, 'instagram_only')).toBe(false);
    expect(artistMatchesFilter(row, 'never')).toBe(false);
    expect(artistMatchesFilter(row, 'stale', { staleDays: 14, now })).toBe(true);
    expect(artistMatchesFilter({ email: '', instagram: 'ig', lastOutboundAt: null }, 'no_contact')).toBe(false);
    expect(artistMatchesFilter({ email: '', instagram: '', lastOutboundAt: null }, 'never')).toBe(true);
    expect(artistMatchesFilter({ status: 'declined' }, 'declined')).toBe(true);
  });

  it('prefers a cased display name', () => {
    expect(preferDisplayName('daft punk', 'Daft Punk')).toBe('Daft Punk');
    expect(preferDisplayName('Daft Punk', 'daft punk')).toBe('Daft Punk');
  });

  it('parses a numbers-style contact sheet', () => {
    const parsed = parseArtistCsv([
      'Artist,Email,Instagram,Last contact,Notes',
      'Daft Punk,thomas@example.com,@daft,15/01/2026,"Tried DM"',
      'Unknown,,ig.me/m/nope,,',
    ].join('\n'));
    expect(parsed.error).toBeUndefined();
    expect(parsed.rows).toEqual([
      {
        artist: 'Daft Punk',
        email: 'thomas@example.com',
        instagram: '@daft',
        lastContact: '15/01/2026',
        notes: 'Tried DM',
      },
      {
        artist: 'Unknown',
        email: '',
        instagram: 'ig.me/m/nope',
        lastContact: '',
        notes: '',
      },
    ]);
    expect(parseContactDate('15/01/2026').toISOString().slice(0, 10)).toBe('2026-01-15');
    expect(parseContactDate('2026-02-02').toISOString().slice(0, 10)).toBe('2026-02-02');
  });

  it('rejects a sheet with no artist column', () => {
    expect(parseArtistCsv('Email,Notes\na@b.com,hi').error).toMatch(/Artist or Name/);
  });
});

