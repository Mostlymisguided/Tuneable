/**
 * Musical key normalization to long-form standard notation (no DB).
 * Run: npx jest tests/keyNormalizer.test.js
 */

const {
  camelotToStandard,
  classicalToLongForm,
  normalizeKey,
  toLongFormKey,
} = require('../utils/keyNormalizer');
const { parseOptionalKey, parseRekordboxXmlContent } = require('../utils/libraryXml');
const { convertRekordboxTrack } = require('../services/libraryImportService');

describe('camelotToStandard', () => {
  it('converts Camelot and Open Key tokens', () => {
    expect(camelotToStandard('8A')).toBe('A Minor');
    expect(camelotToStandard('8a')).toBe('A Minor');
    expect(camelotToStandard('08B')).toBe('C Major');
    expect(camelotToStandard('8m')).toBe('A Minor');
    expect(camelotToStandard('8d')).toBe('C Major');
    expect(camelotToStandard('12A')).toBe('D-flat Minor');
  });

  it('returns null for classical keys', () => {
    expect(camelotToStandard('Am')).toBeNull();
    expect(camelotToStandard('C Major')).toBeNull();
  });
});

describe('classicalToLongForm', () => {
  it('expands short and messy classical keys', () => {
    expect(classicalToLongForm('Am')).toBe('A Minor');
    expect(classicalToLongForm('C')).toBe('C Major');
    expect(classicalToLongForm('F#m')).toBe('F-sharp Minor');
    expect(classicalToLongForm('Bb')).toBe('B-flat Major');
    expect(classicalToLongForm('a minor')).toBe('A Minor');
    expect(classicalToLongForm('F sharp maj')).toBe('F-sharp Major');
  });
});

describe('toLongFormKey / normalizeKey', () => {
  it('prefers Camelot then classical', () => {
    expect(toLongFormKey('5A')).toBe('C Minor');
    expect(toLongFormKey('Gm')).toBe('G Minor');
    expect(toLongFormKey('  C Major ')).toBe('C Major');
  });

  it('leaves unrecognized values as trimmed original', () => {
    expect(toLongFormKey('not a key')).toBeNull();
    expect(normalizeKey('not a key')).toBe('not a key');
    expect(normalizeKey('')).toBeNull();
    expect(normalizeKey(null)).toBeNull();
  });
});

describe('parseOptionalKey', () => {
  it('normalizes body / XML / ID3 values', () => {
    expect(parseOptionalKey('8A')).toBe('A Minor');
    expect(parseOptionalKey('Am')).toBe('A Minor');
    expect(parseOptionalKey('')).toBeNull();
  });
});

describe('Rekordbox Tonality normalization', () => {
  it('stores long-form keys from Camelot Tonality', async () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<DJ_PLAYLISTS Version="1.0.0">
  <COLLECTION Entries="1">
    <TRACK TrackID="1" Name="Camelot Key" Artist="Artist" Tonality="8A"
           Location="file://localhost/tmp/camelot-key.mp3"/>
  </COLLECTION>
</DJ_PLAYLISTS>`;
    const tracks = await parseRekordboxXmlContent(xml);
    expect(tracks).toHaveLength(1);
    expect(tracks[0].key).toBe('A Minor');
  });
});

describe('convertRekordboxTrack key', () => {
  it('normalizes Camelot keys on catalog import', () => {
    const converted = convertRekordboxTrack({
      trackId: '1',
      title: 'Camelot Key',
      artist: 'Artist',
      key: '5A',
    });
    expect(converted.key).toBe('C Minor');
  });
});
