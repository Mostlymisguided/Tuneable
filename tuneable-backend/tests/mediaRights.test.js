/**
 * Run: npx jest tests/mediaRights.test.js
 */

const {
  isVerifiedOriginalUpload,
  shouldClearRightsOnAttach,
  shouldGateHostedMusic,
  applyRightsStatus,
  isEscrowUntilClaim,
  permittedRightsFields,
} = require('../utils/mediaRights');

const UPLOAD = 'https://uploads.tuneable.stream/media-uploads/example.mp3';

const selfUploadOwner = {
  userId: 'user1',
  percentage: 100,
  role: 'creator',
  verified: true,
  verificationMethod: 'Self-upload',
  verificationSource: 'upload',
};

const claimOwner = {
  userId: 'artist1',
  percentage: 100,
  role: 'primary',
  verified: true,
  verificationMethod: 'Claim approval',
  verificationSource: 'claim_approval',
};

describe('isVerifiedOriginalUpload', () => {
  it('keeps artist self-uploads', () => {
    expect(isVerifiedOriginalUpload({
      sources: { upload: UPLOAD },
      contentForm: ['tune'],
      mediaOwners: [selfUploadOwner],
    })).toBe(true);
  });

  it('does not treat claim-approved library as an original upload', () => {
    expect(isVerifiedOriginalUpload({
      sources: { upload: UPLOAD },
      contentForm: ['tune'],
      mediaOwners: [claimOwner],
    })).toBe(false);
  });

  it('rejects rekordbox imports even with a self-upload-shaped owner', () => {
    expect(isVerifiedOriginalUpload({
      sources: { upload: UPLOAD },
      contentForm: ['tune'],
      importSource: 'rekordbox',
      mediaOwners: [selfUploadOwner],
    })).toBe(false);
  });

  it('rejects library curator owners', () => {
    expect(isVerifiedOriginalUpload({
      sources: { upload: UPLOAD },
      contentForm: ['tune'],
      mediaOwners: [{
        userId: 'admin1',
        percentage: 0,
        role: 'aux',
        verified: false,
        verificationMethod: 'library_import_curator',
        verificationSource: 'rekordbox',
      }],
    })).toBe(false);
  });
});

describe('shouldGateHostedMusic', () => {
  it('gates cleared library files', () => {
    expect(shouldGateHostedMusic({
      sources: { upload: UPLOAD },
      contentForm: ['tune'],
      importSource: 'rekordbox',
      rightsStatus: 'cleared',
      rightsCleared: true,
      mediaOwners: [{
        userId: 'admin1',
        percentage: 100,
        role: 'creator',
        verified: true,
        verificationMethod: 'bulk_library_import',
        verificationSource: 'rekordbox',
      }],
    })).toBe(true);
  });

  it('does not re-gate already pending files', () => {
    expect(shouldGateHostedMusic({
      sources: { upload: UPLOAD },
      contentForm: ['tune'],
      rightsStatus: 'pending',
      rightsCleared: false,
    })).toBe(false);
  });

  it('gates operator attach_upload rows that were stamped as creators', () => {
    expect(shouldGateHostedMusic({
      sources: { upload: UPLOAD },
      contentForm: ['tune'],
      rightsStatus: 'cleared',
      rightsCleared: true,
      mediaOwners: [{
        userId: 'admin1',
        percentage: 100,
        role: 'creator',
        verified: true,
        verificationMethod: 'attach_upload',
        verificationSource: 'attach_upload',
      }],
    })).toBe(true);
  });

  it('does not gate claim-approved listings', () => {
    expect(shouldGateHostedMusic({
      sources: { upload: UPLOAD },
      contentForm: ['tune'],
      importSource: 'rekordbox',
      rightsStatus: 'cleared',
      rightsCleared: true,
      mediaOwners: [claimOwner],
    })).toBe(false);
  });

  it('leaves verified original uploads playable', () => {
    expect(shouldGateHostedMusic({
      sources: { upload: UPLOAD },
      contentForm: ['tune'],
      rightsStatus: 'cleared',
      rightsCleared: true,
      mediaOwners: [selfUploadOwner],
    })).toBe(false);
  });

  it('does not gate permitted admin uploads', () => {
    expect(shouldGateHostedMusic({
      sources: { upload: UPLOAD },
      contentForm: ['tune'],
      rightsStatus: 'permitted',
      rightsCleared: false,
      mediaOwners: [],
    })).toBe(false);
  });

  it('ignores podcasts', () => {
    expect(shouldGateHostedMusic({
      sources: { upload: UPLOAD, enclosure: 'https://cdn.example/ep.mp3' },
      contentForm: ['podcastepisode'],
      rightsStatus: 'cleared',
      rightsCleared: true,
    })).toBe(false);
  });
});

describe('shouldClearRightsOnAttach', () => {
  it('does not clear third-party attaches', () => {
    expect(shouldClearRightsOnAttach({
      uploaderRole: 'third_party',
      isAdminUser: false,
    })).toBe(false);
  });

  it('clears a non-admin owner attach', () => {
    expect(shouldClearRightsOnAttach({
      uploaderRole: 'owner',
      isAdminUser: false,
    })).toBe(true);
  });

  it('does not clear an admin operator attach', () => {
    expect(shouldClearRightsOnAttach({
      uploaderRole: 'owner',
      isAdminUser: true,
    })).toBe(false);
  });

  it('clears when the admin is already a verified original owner', () => {
    expect(shouldClearRightsOnAttach({
      uploaderRole: 'owner',
      isAdminUser: true,
      existingOwner: {
        verified: true,
        percentage: 100,
        role: 'creator',
        verificationMethod: 'Self-upload',
        verificationSource: 'upload',
      },
    })).toBe(true);
  });
});

describe('applyRightsStatus', () => {
  it('stamps permitted without clearing rights', () => {
    const media = { rightsStatus: 'pending', rightsCleared: false };
    const result = applyRightsStatus(media, 'permitted', 'admin1');
    expect(result.changed).toBe(true);
    expect(media.rightsStatus).toBe('permitted');
    expect(media.rightsCleared).toBe(false);
    expect(isEscrowUntilClaim(media)).toBe(true);
  });

  it('demotes self-upload owners when marking permitted', () => {
    const media = {
      rightsStatus: 'cleared',
      rightsCleared: true,
      mediaOwners: [{
        userId: 'admin1',
        percentage: 100,
        role: 'creator',
        verified: true,
        verificationMethod: 'Self-upload',
        verificationSource: 'upload',
      }],
    };
    applyRightsStatus(media, 'permitted', 'admin1');
    expect(media.mediaOwners[0].percentage).toBe(0);
    expect(media.mediaOwners[0].role).toBe('aux');
    expect(media.mediaOwners[0].verified).toBe(false);
  });

  it('clears permitted when moving to cleared', () => {
    const media = { ...permittedRightsFields('admin1') };
    applyRightsStatus(media, 'cleared', 'artist1');
    expect(media.rightsStatus).toBe('cleared');
    expect(media.rightsCleared).toBe(true);
    expect(isEscrowUntilClaim(media)).toBe(false);
  });

  it('rejects unknown statuses', () => {
    expect(applyRightsStatus({}, 'licensed', 'admin1').error).toMatch(/Invalid/);
  });
});
