/**
 * Run: npx jest tests/artistInviteAffiliate.test.js
 */

const {
  AFFILIATE_SHARE_OF_ARTIST,
  AFFILIATE_SHARE_PERCENT,
  computeAffiliateSharePence,
  affiliateWindowInfo,
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
  it('is 3% of paid artist share', () => {
    expect(AFFILIATE_SHARE_OF_ARTIST).toBe(0.03);
    expect(computeAffiliateSharePence(140)).toBe(4);
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

describe('affiliateWindowInfo', () => {
  it('reports remaining days inside the first year', () => {
    const now = new Date('2026-06-01T00:00:00.000Z');
    const info = affiliateWindowInfo(new Date('2026-01-01T00:00:00.000Z'), now);
    expect(info.active).toBe(true);
    expect(info.daysRemaining).toBeGreaterThan(100);
    expect(AFFILIATE_SHARE_PERCENT).toBe(3);
  });

  it('is inactive after the first year', () => {
    const info = affiliateWindowInfo(
      new Date('2020-01-01T00:00:00.000Z'),
      new Date('2022-01-01T00:00:00.000Z')
    );
    expect(info.active).toBe(false);
    expect(info.daysRemaining).toBe(0);
  });
});

describe('ownerPaidSharePence', () => {
  it('scales by ownership percentage', () => {
    expect(ownerPaidSharePence(140, 100)).toBe(140);
    expect(ownerPaidSharePence(140, 50)).toBe(70);
  });
});
