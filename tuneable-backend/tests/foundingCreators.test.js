/**
 * Run: npx jest tests/foundingCreators.test.js
 */

const {
  FOUNDING_CREATOR_CAP,
  FOUNDING_UPLOAD_QUOTA_MB,
  FOUNDING_UPLOAD_QUOTA_BYTES,
  bytesToMb,
  isFoundingCreator,
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
