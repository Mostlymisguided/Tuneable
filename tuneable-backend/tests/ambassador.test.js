/**
 * Run: npx jest tests/ambassador.test.js
 */

const {
  isActiveAmbassador,
  hasUnlimitedInvites,
  summarizeAmbassadorInvitees,
  summarizeAssignments,
  assignmentMatchesContext,
  stampAssignmentIds,
  canonicalAssignmentTag,
  applyAmbassadorStatus,
  ambassadorClientFields,
} = require('../utils/ambassador');
const { inviteAttributionFields } = require('../utils/inviteSignup');

const verifiedProfile = {
  artistName: 'Ada',
  roles: ['artist'],
  genres: ['House'],
  verificationStatus: 'verified',
  verifiedAt: new Date(),
};

describe('ambassador status', () => {
  it('treats only active ambassadors as unlimited inviters', () => {
    expect(isActiveAmbassador({ ambassador: { status: 'active' } })).toBe(true);
    expect(isActiveAmbassador({ ambassador: { status: 'paused' } })).toBe(false);
    expect(isActiveAmbassador({})).toBe(false);
    expect(hasUnlimitedInvites({ role: ['user'], ambassador: { status: 'active' } })).toBe(true);
    expect(hasUnlimitedInvites({ role: ['admin'], ambassador: { status: 'none' } })).toBe(true);
    expect(hasUnlimitedInvites({ role: ['user'], ambassador: { status: 'paused' } })).toBe(false);
  });

  it('stamps invitedByAmbassador only while the inviter is active', () => {
    const active = inviteAttributionFields({
      ok: true,
      code: 'ABCDE',
      inviter: { _id: 'inviter1', ambassador: { status: 'active' } },
      inviteCodeObj: null,
    });
    const paused = inviteAttributionFields({
      ok: true,
      code: 'ABCDE',
      inviter: { _id: 'inviter1', ambassador: { status: 'paused' } },
      inviteCodeObj: null,
    });
    expect(active.invitedByAmbassador).toBe(true);
    expect(active.invitedByUserId).toBe('inviter1');
    expect(paused.invitedByAmbassador).toBe(false);
  });

  it('keeps assignedAt when an ambassador is paused and reactivated', () => {
    const user = { ambassador: { status: 'none' } };
    const assignedAt = new Date('2026-01-01T00:00:00Z');
    const granted = applyAmbassadorStatus(user, {
      status: 'active',
      note: 'London shows',
      adminId: 'admin1',
      now: assignedAt,
    });
    expect(granted.ok).toBe(true);
    expect(user.ambassador.assignedAt).toEqual(assignedAt);

    applyAmbassadorStatus(user, { status: 'paused', adminId: 'admin1', now: new Date('2026-02-01') });
    expect(user.ambassador.status).toBe('paused');
    expect(user.ambassador.assignedAt).toEqual(assignedAt);
    expect(user.ambassador.note).toBe('London shows');

    applyAmbassadorStatus(user, { status: 'active', adminId: 'admin2', now: new Date('2026-03-01') });
    expect(user.ambassador.status).toBe('active');
    expect(user.ambassador.assignedAt).toEqual(assignedAt);
    expect(user.ambassador.pausedAt).toBeNull();
    expect(user.ambassador.assignedBy).toBe('admin2');
  });

  it('rejects an unknown status and an oversized note', () => {
    const user = {};
    expect(applyAmbassadorStatus(user, { status: 'owner' }).ok).toBe(false);
    expect(applyAmbassadorStatus(user, { status: 'active', note: 'x'.repeat(501) }).ok).toBe(false);
    expect(user.ambassador).toBeUndefined();
  });
});

describe('ambassador beats', () => {
  const england = 'england';
  const manchester = 'manchester';
  const context = {
    tag: 'House',
    placeId: manchester,
    ancestorIds: [manchester, england],
  };

  it('stores a canonical tag', () => {
    expect(canonicalAssignmentTag('dnb')).toBe('DnB');
    expect(canonicalAssignmentTag('  ')).toBeNull();
  });

  it('matches a tag anywhere, a place through its ancestors, and a pair only when both fit', () => {
    expect(assignmentMatchesContext({ tag: 'House' }, context)).toBe(true);
    expect(assignmentMatchesContext({ tag: 'dnb' }, context)).toBe(false);
    expect(assignmentMatchesContext({ placeId: england }, context)).toBe(true);
    expect(assignmentMatchesContext({ placeId: manchester }, context)).toBe(true);
    expect(assignmentMatchesContext({ placeId: manchester }, { placeId: england, ancestorIds: [england] })).toBe(false);
    expect(assignmentMatchesContext({ tag: 'House', placeId: england }, context)).toBe(true);
    expect(assignmentMatchesContext({ tag: 'House', placeId: 'bristol' }, context)).toBe(false);
  });

  it('stamps only active beats on an active ambassador', () => {
    const inviter = {
      ambassador: {
        status: 'active',
        assignments: [
          { _id: 'house', tag: 'House', status: 'active' },
          { _id: 'paused', tag: 'Techno', status: 'paused' },
          { _id: 'pair', tag: 'House', placeId: england, status: 'active' },
        ],
      },
    };
    const stamped = stampAssignmentIds(inviter, { ...context, tag: 'House' });
    expect(stamped.assignmentIds).toEqual(['house', 'pair']);

    inviter.ambassador.status = 'paused';
    expect(stampAssignmentIds(inviter, context).assignmentIds).toEqual([]);
  });

  it('counts signups on the beat they were stamped to, and scene membership separately', () => {
    const assignment = { _id: 'house', tag: 'House', placeId: null, status: 'active' };
    const invitees = [
      {
        _id: 'a',
        invitedByAmbassador: true,
        inviteContext: { assignmentIds: ['house'] },
        creatorProfile: verifiedProfile,
        originalUploadCount: 1,
        affiliateWindowActive: true,
        commissionPence: 20,
        homeLocation: { placeId: manchester, ancestorIds: [manchester, england] },
      },
      {
        _id: 'b',
        invitedByAmbassador: true,
        inviteContext: { assignmentIds: [] },
        creatorProfile: { ...verifiedProfile, genres: ['House'] },
        homeLocation: { placeId: 'bristol' },
      },
    ];
    const tags = new Map([['a', ['House']], ['b', ['House']]]);
    const [summary] = summarizeAssignments([assignment], invitees, tags);
    expect(summary.signupCount).toBe(1);
    expect(summary.verifiedCreatorCount).toBe(1);
    expect(summary.commissionPence).toBe(20);
    expect(summary.sceneCount).toBe(2);
  });
});

describe('summarizeAmbassadorInvitees', () => {
  it('counts flagged signups, verified original creators, the open window, and existing commission', () => {
    const summary = summarizeAmbassadorInvitees([
      { invitedByAmbassador: false, originalUploadCount: 3, commissionPence: 999, creatorProfile: verifiedProfile },
      { invitedByAmbassador: true, creatorProfile: { verificationStatus: 'unverified' }, commissionPence: 0 },
      {
        invitedByAmbassador: true,
        originalUploadCount: 2,
        affiliateWindowActive: true,
        commissionPence: 40,
        creatorProfile: verifiedProfile,
      },
      {
        invitedByAmbassador: true,
        originalUploadCount: 1,
        affiliateWindowActive: false,
        commissionPence: 15,
        creatorProfile: { ...verifiedProfile, artistName: 'Bea', verifiedAt: new Date('2020-01-01') },
      },
      {
        invitedByAmbassador: true,
        originalUploadCount: 0,
        hasOriginalUpload: false,
        creatorProfile: verifiedProfile,
        commissionPence: 10,
      },
    ]);

    expect(summary).toEqual({
      signupCount: 4,
      verifiedCreatorCount: 2,
      activeWindowCount: 1,
      commissionPence: 65,
    });
  });

  it('hides the summary unless the user is in the program', () => {
    expect(ambassadorClientFields({ ambassador: { status: 'none' } })).toBeNull();
    expect(ambassadorClientFields(
      { ambassador: { status: 'paused', note: 'hold' } },
      { signupCount: 2, verifiedCreatorCount: 1, activeWindowCount: 0, commissionPence: 0 }
    ).status).toBe('paused');
  });
});
