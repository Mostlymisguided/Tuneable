/**
 * BPM rounding for storage and display (no DB).
 * Run: npx jest tests/bpm.test.js
 */

const { roundBpm } = require('../utils/bpm');
const { parseOptionalBpm, parseRekordboxXmlContent } = require('../utils/libraryXml');
const { convertRekordboxTrack } = require('../services/libraryImportService');

describe('roundBpm', () => {
  it('rounds to the nearest integer', () => {
    expect(roundBpm(173.9)).toBe(174);
    expect(roundBpm(128.4)).toBe(128);
    expect(roundBpm(128.5)).toBe(129);
    expect(roundBpm('122.00')).toBe(122);
  });

  it('returns null for missing or non-positive values', () => {
    expect(roundBpm(null)).toBeNull();
    expect(roundBpm(undefined)).toBeNull();
    expect(roundBpm('')).toBeNull();
    expect(roundBpm(0)).toBeNull();
    expect(roundBpm(0.4)).toBeNull();
    expect(roundBpm(-12)).toBeNull();
    expect(roundBpm('n/a')).toBeNull();
  });
});

describe('parseOptionalBpm', () => {
  it('rounds fractional values from body / XML / ID3', () => {
    expect(parseOptionalBpm(173.9)).toBe(174);
    expect(parseOptionalBpm('173.9')).toBe(174);
    expect(parseOptionalBpm('')).toBeNull();
  });
});

describe('Rekordbox AverageBpm rounding', () => {
  it('stores whole-number BPM from a decimal AverageBpm', async () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<DJ_PLAYLISTS Version="1.0.0">
  <COLLECTION Entries="1">
    <TRACK TrackID="1" Name="Decimal BPM" Artist="Artist" AverageBpm="173.90"
           Location="file://localhost/tmp/decimal-bpm.mp3"/>
  </COLLECTION>
</DJ_PLAYLISTS>`;
    const tracks = await parseRekordboxXmlContent(xml);
    expect(tracks).toHaveLength(1);
    expect(tracks[0].bpm).toBe(174);
  });
});

describe('convertRekordboxTrack BPM', () => {
  it('rounds fractional BPM on catalog import', () => {
    const converted = convertRekordboxTrack({
      trackId: '1',
      title: 'Decimal BPM',
      artist: 'Artist',
      bpm: 173.9,
    });
    expect(converted.bpm).toBe(174);
  });
});
