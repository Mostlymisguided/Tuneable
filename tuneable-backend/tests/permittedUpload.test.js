const { parsePermittedPermission, permittedHistoryEntry } = require('../utils/permittedUpload');
const { describePermittedPermission } = require('../utils/permittedAudit');

const VALID = {
  permissionFromName: 'Sam Friend',
  permissionNote: 'Sent me the WAVs on WhatsApp 1 Oct 2026 and said go ahead',
  permissionFromEmail: ' Sam@Example.com ',
  permissionFromInstagram: 'https://instagram.com/samfriend',
};

describe('parsePermittedPermission', () => {
  it('requires who gave permission', () => {
    expect(parsePermittedPermission({ ...VALID, permissionFromName: '  ' }).error).toMatch(/name/);
  });

  it('requires a descriptive note', () => {
    expect(parsePermittedPermission({ ...VALID, permissionNote: 'ok' }).error).toMatch(/note/);
  });

  it('rejects an invalid email', () => {
    expect(parsePermittedPermission({ ...VALID, permissionFromEmail: 'not-an-email' }).error).toMatch(/email/);
  });

  it('rejects notes the audit would treat as stock', () => {
    const result = parsePermittedPermission({ ...VALID, permissionNote: 'awaiting artist claim later' });
    expect(result.error).toMatch(/awaiting a claim/);
  });

  it('normalises contacts', () => {
    const { permission } = parsePermittedPermission(VALID);
    expect(permission.email).toBe('sam@example.com');
    expect(permission.instagram).toBe('samfriend');
    expect(permission.recordNote).toBe(
      'Off-platform permission from Sam Friend: Sent me the WAVs on WhatsApp 1 Oct 2026 and said go ahead'
    );
  });

  it('treats contacts as optional', () => {
    const { permission } = parsePermittedPermission({
      permissionFromName: VALID.permissionFromName,
      permissionNote: VALID.permissionNote,
    });
    expect(permission.email).toBeNull();
    expect(permission.instagram).toBeNull();
  });
});

describe('permitted upload history entry', () => {
  it('passes the permitted audit on its own', () => {
    const { permission } = parsePermittedPermission(VALID);
    const media = { mediaOwners: [], ownershipHistory: [permittedHistoryEntry(permission, 'admin1')] };
    expect(describePermittedPermission(media)).toEqual({
      documented: true,
      permissionNote: permission.recordNote,
    });
  });
});
