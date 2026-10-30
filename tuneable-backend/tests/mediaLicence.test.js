/**
 * Run: npx jest tests/mediaLicence.test.js
 */

const {
  parseLicenceChoice,
  replayFixedFloor,
  downloadDecision,
  musicTuneNeedsLicence,
} = require('../utils/mediaLicence');

describe('parseLicenceChoice', () => {
  it('includes streaming and leaves the other grants off', () => {
    const parsed = parseLicenceChoice({});
    expect(parsed.error).toBeUndefined();
    expect(parsed.licence).toMatchObject({
      chosen: true,
      personalStreaming: true,
      publicStreaming: true,
      publicStreamingFloorPence: null,
      personalDownload: false,
      personalDownloadUnlockPence: null,
      openToRework: false,
      openToCommercial: false,
    });
  });

  it('keeps a download unlock and ignores an old public-streaming floor', () => {
    const parsed = parseLicenceChoice({
      publicStreaming: false,
      publicStreamingFloorPence: 50,
      personalDownload: true,
      personalDownloadUnlockPence: 1,
      openToRework: true,
      openToCommercial: true,
    });
    expect(parsed.licence).toMatchObject({
      publicStreaming: true,
      publicStreamingFloorPence: null,
      personalDownload: true,
      personalDownloadUnlockPence: 1,
      openToRework: true,
      openToCommercial: true,
    });
  });

  it('defaults a blank download unlock to 1p', () => {
    const parsed = parseLicenceChoice({ personalDownload: true });
    expect(parsed.licence.personalDownloadUnlockPence).toBe(1);
  });

  it('rejects a fractional download price', () => {
    const parsed = parseLicenceChoice({
      personalDownload: true,
      personalDownloadUnlockPence: 1.5,
    });
    expect(parsed.error).toMatch(/whole number of pence/);
  });

  it('accepts a JSON string from a multipart form', () => {
    const parsed = parseLicenceChoice('{"openToRework":true}');
    expect(parsed.licence.publicStreaming).toBe(true);
    expect(parsed.licence.openToRework).toBe(true);
  });
});

describe('downloadDecision', () => {
  it('leaves unset licences on the generosity-share rules', () => {
    expect(downloadDecision({ explicit: false }).mode).toBe('share');
  });

  it('keeps an existing copy when download is turned off', () => {
    const decision = downloadDecision({
      explicit: true,
      personalDownload: false,
      existingUnlock: { thresholdAtGrant: 50 },
    });
    expect(decision.mode).toBe('closed');
    expect(decision.unlocked).toBe(true);
  });

  it('unlocks at the pence floor and grandfathers a cleared line', () => {
    expect(downloadDecision({
      explicit: true,
      personalDownload: true,
      unlockPence: 100,
      userTotalPence: 100,
    }).unlocked).toBe(true);

    expect(downloadDecision({
      explicit: true,
      personalDownload: true,
      unlockPence: 200,
      userTotalPence: 100,
      existingUnlock: { thresholdAtGrant: 100 },
    })).toMatchObject({ unlocked: true, grandfathered: true });
  });
});

describe('replayFixedFloor', () => {
  it('grants a copy when the running total clears the floor', () => {
    const unlocks = replayFixedFloor([
      { at: 1, type: 'tip', userId: 'a', amount: 1 },
      { at: 2, type: 'tip', userId: 'b', amount: 50 },
    ], 50);
    expect(unlocks.map((row) => row.userId)).toEqual(['b']);
  });
});

describe('musicTuneNeedsLicence', () => {
  it('asks for a licence on tunes and skips podcasts and books', () => {
    expect(musicTuneNeedsLicence({ contentForm: ['tune'], contentType: ['music'] })).toBe(true);
    expect(musicTuneNeedsLicence({ contentForm: ['episode'] })).toBe(false);
    expect(musicTuneNeedsLicence({ contentForm: ['book'], contentType: ['written'] })).toBe(false);
  });
});
