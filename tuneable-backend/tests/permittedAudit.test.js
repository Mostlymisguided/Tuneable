const { describePermittedPermission, isStockNote } = require('../utils/permittedAudit');

const STOCK = 'Admin attach with off-platform permission — awaiting artist claim';

describe('describePermittedPermission', () => {
  it('treats the stock attach stamp as uncertain', () => {
    expect(isStockNote(STOCK)).toBe(true);
    expect(describePermittedPermission({
      mediaOwners: [{ verificationNotes: STOCK }],
    })).toEqual({ documented: false, permissionNote: null });
  });

  it('treats a library-import pending stamp as uncertain', () => {
    const note = 'Library import — rights pending artist claim. Tips held in escrow until verified.';
    expect(describePermittedPermission({
      mediaOwners: [{ verificationNotes: note }],
    })).toEqual({ documented: false, permissionNote: null });
  });

  it('treats the verification-notes placeholder as uncertain', () => {
    expect(describePermittedPermission({
      mediaOwners: [{ verificationNotes: 'verification notes' }],
    })).toEqual({ documented: false, permissionNote: null });
  });

  it('ignores a note that does not describe a grant', () => {
    expect(describePermittedPermission({
      ownershipHistory: [{ note: 'testing onwership edits' }],
    })).toEqual({ documented: false, permissionNote: null });
  });

  it('keeps a custom owner note as the permission note', () => {
    const note = 'Artist agreed by email on 2 March 2026: permission for this MP3 to stay up until they claim.';
    expect(describePermittedPermission({
      mediaOwners: [{ verificationNotes: STOCK }],
      ownershipHistory: [{ note }],
    })).toEqual({ documented: true, permissionNote: note });
  });

  it('ignores outreach pitches and keeps an inbound permission note', () => {
    const inbound = 'Yes, you have my permission to host the file until I join.';
    const decision = describePermittedPermission({}, [{
      notes: 'Need to email the label',
      outreach: [
        { direction: 'outbound', body: 'We have permission-shaped tips waiting' },
        { direction: 'inbound', body: inbound },
      ],
    }]);
    expect(decision).toEqual({ documented: true, permissionNote: inbound });
  });

  it('does not treat an empty rights case as permission', () => {
    expect(describePermittedPermission({}, [{ status: 'cleared', notes: '', outreach: [] }]))
      .toEqual({ documented: false, permissionNote: null });
  });
});
