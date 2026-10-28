/**
 * Run: npx jest tests/mediaLicence.test.js
 */

const {
  parseLicenceChoice,
  partyQueueBlock,
  replayFixedFloor,
  downloadDecision,
  musicTuneNeedsLicence,
} = require('../utils/mediaLicence');

describe('parseLicenceChoice', () => {
  it('includes personal streaming and leaves the other grants off', () => {
    const parsed = parseLicenceChoice({});
    expect(parsed.error).toBeUndefined();
    expect(parsed.licence).toMatchObject({
      chosen: true,
      personalStreaming: true,
      publicStreaming: false,
      publicStreamingFloorPence: null,
      personalDownload: false,
      personalDownloadUnlockPence: null,
      openToRework: false,
      openToCommercial: false,
    });
  });

  it('keeps a public-streaming floor and a download unlock', () => {
    const parsed = parseLicenceChoice({
      publicStreaming: true,
      publicStreamingFloorPence: 50,
      personalDownload: true,
      personalDownloadUnlockPence: 1,
      openToRework: true,
      openToCommercial: true,
    });
    expect(parsed.licence).toMatchObject({
      publicStreaming: true,
      publicStreamingFloorPence: 50,
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

  it('drops a public floor when public streaming is off', () => {
    const parsed = parseLicenceChoice({
      publicStreaming: false,
      publicStreamingFloorPence: 50,
    });
    expect(parsed.licence.publicStreamingFloorPence).toBeNull();
  });

  it('rejects a fractional tip', () => {
    const parsed = parseLicenceChoice({
      publicStreaming: true,
      publicStreamingFloorPence: 1.5,
    });
    expect(parsed.error).toMatch(/whole number of pence/);
  });

  it('accepts a JSON string from a multipart form', () => {
    const parsed = parseLicenceChoice('{"publicStreaming":true,"openToRework":true}');
    expect(parsed.licence.publicStreaming).toBe(true);
    expect(parsed.licence.openToRework).toBe(true);
  });
});

describe('partyQueueBlock', () => {
  it('allows a tune with no saved choice', () => {
    expect(partyQueueBlock({ media: { title: 'Old', licence: { chosen: false } } }).ok).toBe(true);
    expect(partyQueueBlock({ media: { title: 'Older' } }).ok).toBe(true);
  });

  it('blocks party play when only personal streaming is on', () => {
    const result = partyQueueBlock({
      media: { title: 'Quiet', licence: { chosen: true, publicStreaming: false } },
    });
    expect(result.ok).toBe(false);
    expect(result.status).toBe(403);
    expect(result.error).toMatch(/personal listening/);
  });

  it('blocks a party add that does not meet the tip floor', () => {
    const result = partyQueueBlock({
      media: {
        title: 'Floor',
        licence: { chosen: true, publicStreaming: true, publicStreamingFloorPence: 100 },
      },
      priorTipPence: 20,
      bidAmountPence: 30,
    });
    expect(result.ok).toBe(false);
    expect(result.code).toBe('public_floor');
    expect(result.yourTipPence).toBe(50);
  });

  it('allows a party add once the tip floor is met', () => {
    const result = partyQueueBlock({
      media: {
        title: 'Floor',
        licence: { chosen: true, publicStreaming: true, publicStreamingFloorPence: 100 },
      },
      priorTipPence: 80,
      bidAmountPence: 20,
    });
    expect(result.ok).toBe(true);
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
