/**
 * Run: npx jest tests/artistInviteAffiliate.test.js
 */

const {
  AFFILIATE_SHARE_OF_ARTIST,
  computeAffiliateSharePence,
  isAffiliateEligible,
  ownerPaidSharePence,
} = require('../utils/artistInviteAffiliate');

const UPLOAD = 'https://uploads.tuneable.stream/media-uploads/example.mp3';
const originalMedia = {
  sources: { upload: UPLOAD },
  contentForm: ['tune'],
  rightsStatus: 'cleared',
  rightsCleared: true,
  mediaOwners: [{
    userId: 'artist1',
    percentage: 100,
    role: 'creator',
    verified: true,
    verificationMethod: 'Self-upload',
    verificationSource: 'upload',
  }],
};

describe('computeAffiliateSharePence', () => {
  it('is 10% of paid artist share', () => {
    expect(AFFILIATE_SHARE_OF_ARTIST).toBe(0.1);
    expect(computeAffiliateSharePence(140)).toBe(14);
  });

  it('is zero when the tip is promo-only', () => {
    expect(computeAffiliateSharePence(0)).toBe(0);
  });
});

describe('isAffiliateEligible', () => {
  const artistUser = { _id: 'artist1', createdAt: new Date() };
  const inviterUser = { _id: 'inviter1', createdAt: new Date('2020-01-01') };

  it('pays on original uploads inside the first year', () => {
    expect(isAffiliateEligible({
      media: originalMedia,
      artistUser,
      inviterUser,
    })).toBe(true);
  });

  it('skips claimed library imports', () => {
    expect(isAffiliateEligible({
      media: { ...originalMedia, importSource: 'rekordbox' },
      artistUser,
      inviterUser,
    })).toBe(false);
  });

  it('skips after the first year', () => {
    expect(isAffiliateEligible({
      media: originalMedia,
      artistUser: { ...artistUser, createdAt: new Date('2020-01-01') },
      inviterUser,
      now: new Date('2022-01-01'),
    })).toBe(false);
  });

  it('skips when the inviter is the tipper', () => {
    expect(isAffiliateEligible({
      media: originalMedia,
      artistUser,
      inviterUser,
      tipperUserId: 'inviter1',
    })).toBe(false);
  });

  it('skips self-invite', () => {
    expect(isAffiliateEligible({
      media: originalMedia,
      artistUser,
      inviterUser: artistUser,
    })).toBe(false);
  });
});

describe('ownerPaidSharePence', () => {
  it('scales by ownership percentage', () => {
    expect(ownerPaidSharePence(140, 100)).toBe(140);
    expect(ownerPaidSharePence(140, 50)).toBe(70);
  });
});
