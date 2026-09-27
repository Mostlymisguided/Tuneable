/**
 * Run: npx jest tests/foundingCreators.test.js
 */

const {
  FOUNDING_CREATOR_CAP,
  FOUNDING_UPLOAD_QUOTA_MB,
  FOUNDING_UPLOAD_QUOTA_BYTES,
  bytesToMb,
  isFoundingCreator,
  isFoundingSeatEligible,
  getUploadQuotaBytes,
} = require('../utils/foundingCreators');

describe('foundingCreators config', () => {
  it('defaults to 1111 seats and a positive MB allowance', () => {
    expect(FOUNDING_CREATOR_CAP).toBe(1111);
    expect(FOUNDING_UPLOAD_QUOTA_MB).toBeGreaterThan(0);
    expect(FOUNDING_UPLOAD_QUOTA_BYTES).toBe(FOUNDING_UPLOAD_QUOTA_MB * 1024 * 1024);
  });

  it('converts bytes to MB with one decimal', () => {
    expect(bytesToMb(1024 * 1024)).toBe(1);
    expect(bytesToMb(1.5 * 1024 * 1024)).toBe(1.5);
  });
});

describe('isFoundingSeatEligible', () => {
  it('accepts an invite or an approved request', () => {
    expect(isFoundingSeatEligible({ parentInviteCode: 'ABCDE' })).toBe(true);
    expect(isFoundingSeatEligible({ invitedByUserId: 'u1' })).toBe(true);
    expect(isFoundingSeatEligible({ foundingEligible: true })).toBe(true);
    expect(isFoundingSeatEligible({ foundingRequestStatus: 'approved' })).toBe(true);
  });

  it('rejects a pending request and an empty account', () => {
    expect(isFoundingSeatEligible({ foundingRequestStatus: 'pending' })).toBe(false);
    expect(isFoundingSeatEligible({})).toBe(false);
    expect(isFoundingSeatEligible(null)).toBe(false);
  });

  it('does not treat someone who already has a seat as still eligible to claim', () => {
    expect(isFoundingSeatEligible({
      isFoundingCreator: true,
      foundingEligible: true,
    })).toBe(false);
  });
});

describe('isFoundingCreator / quota', () => {
  it('recognizes founding flag', () => {
    expect(isFoundingCreator({ isFoundingCreator: true })).toBe(true);
    expect(isFoundingCreator({ isFoundingCreator: false })).toBe(false);
    expect(isFoundingCreator(null)).toBe(false);
  });

  it('gives founding users their allowance and others unlimited', () => {
    expect(getUploadQuotaBytes({ isFoundingCreator: true })).toBe(FOUNDING_UPLOAD_QUOTA_BYTES);
    expect(getUploadQuotaBytes({
      isFoundingCreator: true,
      foundingUploadQuotaBytes: 1000,
    })).toBe(1000);
    expect(getUploadQuotaBytes({ isFoundingCreator: false })).toBeNull();
  });
});
